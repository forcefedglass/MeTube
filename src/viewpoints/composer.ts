/**
 * Viewstream composer — Phase 4 core.
 *
 * Composes a feed under an EXPOSURE BUDGET: user-visible, user-editable
 * bounds on how the feed's slots are spent. This is deliberate
 * informational exploration rather than engagement maximization — the
 * composer selects from a ranked list under explicit rules, and reports
 * every satisfaction and violation.
 *
 * Algorithm (deterministic, no ML, no randomness):
 *
 *   1. Rank candidates once with the existing explainable engine (the
 *      composer never re-scores; it only selects under budget rules).
 *   2. Walk the ranked list in order. A candidate is taken if taking it
 *      would not break a CEILING (max share / cooldown) rule.
 *   3. FLOOR rules (min shares) are handled by explicit reservation:
 *      when a floor is configured, the composer first walks the ranked
 *      list taking only candidates that count toward the floor (e.g.
 *      unfamiliar channels for minUnfamiliarChannelShare), then fills
 *      remaining slots by the normal walk. Floors are NEVER satisfied by
 *      misclassifying: if too few candidates genuinely qualify, the rule
 *      is reported violated with the honest arithmetic.
 *   4. Cooldowns are enforced against recorded generation history: a
 *      channel/cluster featured within the last N generations is skipped.
 *
 * Honest degradation: `composeViewstream` returns the composed feed plus
 * an ExposureReport stating, per rule, satisfied/violated/not-applicable
 * and why. A pool with one dominant channel under a ceiling yields a
 * SHORTER feed, never a padded one — and the report says so.
 *
 * Pure and DOM-free: same inputs -> same outputs.
 */

import type {
  CandidateVideo,
  ChannelId,
  FeedCandidate,
  FeedSnapshot,
  NarrativeClusterId,
  UserProfile,
} from '../model/types';
import type { Viewpoint } from '../model/viewpoint';
import type {
  ExposureBudget,
  ExposureReport,
  ExposureRuleReport,
  GenerationHistoryEntry,
} from '../model/exposure';
import { rankCandidates } from '../ranking/engine';
import { candidatePasses, interpretViewpoint, passesUnfamiliarity } from './interpret';
import type { ClassificationLookup } from '../discovery/coverage';
import { isUnknownDate } from '../model/discovery';

export interface ComposerContext {
  viewpoint: Viewpoint;
  limit: number;
  profile: UserProfile;
  /** Classification lookup (machine + overrides applied). */
  lookupClassification: ClassificationLookup;
  /** Recorded generation history for cooldown enforcement. */
  history: GenerationHistoryEntry[];
  /** Current generation index (monotonic feed counter). */
  generation: number;
  /** Reference time for age-based rules (historical share). */
  now: string;
}

export interface CompositionResult {
  snapshot: FeedSnapshot;
  report: ExposureReport;
}

/**
 * Compose a Viewstream under the Viewpoint's exposure budget.
 * Deterministic: same inputs -> same feed and same report.
 */
export function composeViewstream(
  candidates: CandidateVideo[],
  context: ComposerContext,
): CompositionResult {
  const { viewpoint, limit, profile, now } = context;
  const interpretation = interpretViewpoint(viewpoint.config);
  const { filters, tuning } = interpretation;

  if (!viewpoint.enabled) {
    return emptyComposition(viewpoint, limit, now, 'viewpoint disabled');
  }

  // Hard filters + muting (unchanged from assembly; the composer sits on
  // top of them, it never weakens them) — EXCEPT for the exploration
  // wildcard: when an explorationShare budget rule is configured, the
  // wildcard exists precisely to admit candidates OUTSIDE the positive
  // topic constraints. Those candidates enter the ranked pool through
  // the exploration reservation only; the rest of the walk still honors
  // every hard filter. The wildcard never weakens negativeTopic or
  // source constraints.
  const muted = new Set(profile.mutedChannelIds);
  const explorationConfigured = (viewpoint.config.exposureBudget?.explorationShare ?? 0) > 0;
  const passesForPool = (c: CandidateVideo): boolean => {
    const passesHard = candidatePasses(c, filters);
    if (passesHard) return true;
    if (!explorationConfigured) return false;
    // Exploration candidates bypass ONLY the positive-topic filter.
    const topicOk =
      filters.positiveTopics.size === 0 ||
      c.topicIds.some((t) => filters.positiveTopics.has(t));
    if (topicOk) return false; // they failed another hard filter
    const negativeOk =
      filters.negativeTopics.size === 0 ||
      !c.topicIds.some((t) => filters.negativeTopics.has(t));
    if (!negativeOk) return false;
    const sourceOk =
      filters.sources.size === 0 ||
      filters.sources.has(c.discoveredVia) ||
      c.alsoSeenVia.some((s) => filters.sources.has(s));
    if (!sourceOk) return false;
    return passesUnfamiliarity(c, profile, tuning.unfamiliarityTarget);
  };
  const passing = candidates.filter(passesForPool);
  const unmuted = passing.filter((c) => !muted.has(c.channelId));
  const mutedCount = passing.length - unmuted.length;

  const ranked = rankCandidates(unmuted, {
    pool: unmuted,
    profile,
    weights: tuning.weights,
  });

  const budget = viewpoint.config.exposureBudget ?? {};
  const cooldownState = resolveCooldowns(context.history, budget, viewpoint.id);

  const { feed, report } = selectUnderBudget(ranked, budget, limit, context, cooldownState);

  const snapshot: FeedSnapshot = {
    id: `viewstream-${now}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
    createdAt: now,
    feed,
    consideredCount: unmuted.length,
    mutedCount,
    viewpoint: { id: viewpoint.id, title: viewpoint.title },
  };
  return { snapshot, report };
}

// ---------------------------------------------------------------------------
// Cooldown state
// ---------------------------------------------------------------------------

interface CooldownState {
  /** Channels blocked by repeated-channel cooldown for this generation. */
  blockedChannels: Set<ChannelId>;
  /** Narrative clusters blocked by repeated-narrative cooldown. */
  blockedNarratives: Set<NarrativeClusterId>;
  channelExplanation: string;
  narrativeExplanation: string;
}

function resolveCooldowns(
  history: GenerationHistoryEntry[],
  budget: ExposureBudget,
  viewpointId: string,
): CooldownState {
  const state: CooldownState = {
    blockedChannels: new Set(),
    blockedNarratives: new Set(),
    channelExplanation: 'No repeated-channel cooldown configured.',
    narrativeExplanation: 'No repeated-narrative cooldown configured.',
  };
  const channelCooldown = budget.repeatedChannelCooldown;
  if (channelCooldown !== undefined && channelCooldown > 0) {
    const recent = history
      .filter((h) => h.viewpointId === viewpointId)
      .slice(-channelCooldown);
    for (const entry of recent) {
      for (const ch of entry.channels) state.blockedChannels.add(ch);
    }
    state.channelExplanation =
      `Channels featured in the last ${recent.length} generation(s) of this Viewpoint ` +
      `are blocked for ${channelCooldown} generation(s): ` +
      `${[...state.blockedChannels].join(', ') || 'none'}.`;
  }
  const narrativeCooldown = budget.repeatedNarrativeCooldown;
  if (narrativeCooldown !== undefined && narrativeCooldown > 0) {
    const recent = history
      .filter((h) => h.viewpointId === viewpointId)
      .slice(-narrativeCooldown);
    for (const entry of recent) {
      for (const n of entry.narrativeClusters) state.blockedNarratives.add(n);
    }
    state.narrativeExplanation =
      `Narrative clusters featured in the last ${recent.length} generation(s) of this ` +
      `Viewpoint are blocked for ${narrativeCooldown} generation(s): ` +
      `${[...state.blockedNarratives].join(', ') || 'none'}.`;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Budget-aware selection
// ---------------------------------------------------------------------------

interface SelectionCounts {
  perChannel: Map<ChannelId, number>;
  perNarrative: Map<NarrativeClusterId, number>;
  perTopic: Map<string, number>;
  unfamiliarChannels: number;
  alternateSourceType: number;
  historical: number;
  exploration: number;
  dominantSourceType: string | null;
}

function emptyCounts(ranked: FeedCandidate[], lookupClassification: ClassificationLookup, context: ComposerContext): SelectionCounts {
  // Determine the dominant classified source type in the ranked pool, so
  // "alternate source type" has a concrete, observable meaning.
  const bySourceType = new Map<string, number>();
  for (const item of ranked) {
    const cls = lookupClassification(item.candidate.id);
    const st = cls ? cls.sourceType.value : 'unknown';
    bySourceType.set(st, (bySourceType.get(st) ?? 0) + 1);
  }
  let dominant: string | null = null;
  let dominantCount = -1;
  for (const [st, count] of bySourceType) {
    if (st !== 'unknown' && count > dominantCount) {
      dominant = st;
      dominantCount = count;
    }
  }
  void context;
  return {
    perChannel: new Map(),
    perNarrative: new Map(),
    perTopic: new Map(),
    unfamiliarChannels: 0,
    alternateSourceType: 0,
    historical: 0,
    exploration: 0,
    dominantSourceType: dominant,
  };
}

function isHistoricalMaterial(
  candidate: CandidateVideo,
  lookupClassification: ClassificationLookup,
  nowMs: number,
): boolean {
  // Explicit framing classification counts as historical material.
  const cls = lookupClassification(candidate.id);
  if (cls) {
    const p = cls.temporalPosition.value;
    if (p === 'historical' || p === 'retrospective') return true;
  }
  // Publication older than a year also counts; unknown dates never do.
  if (isUnknownDate(candidate.publishedAt)) return false;
  const published = Date.parse(candidate.publishedAt);
  if (Number.isNaN(published)) return false;
  return nowMs - published > 365 * 86_400_000;
}

function isExplorationPick(candidate: CandidateVideo, positiveTopics: Set<string>): boolean {
  if (positiveTopics.size === 0) return false;
  return !candidate.topicIds.some((t) => positiveTopics.has(t));
}

function isUnfamiliarChannel(channelId: ChannelId, profile: UserProfile): boolean {
  // Unfamiliar = no explicit feedback on any video from this channel
  // within MeTube (exploration firewall: only MeTube's own signals).
  return !profile.feedback.some(
    (f) => f.kind === 'watched' || f.kind === 'saved' || f.kind === 'more-like-this',
  ) || !channelHasFeedback(channelId, profile);
}

function channelHasFeedback(channelId: ChannelId, profile: UserProfile, candidates?: CandidateVideo[]): boolean {
  // Without a channel->video index we check video-level feedback only via
  // the caller-provided candidate list; the profile never stores channel
  // feedback directly. Simplest honest check: did MeTube record any
  // exposure feedback for a video of this channel?
  if (candidates) {
    const videoIds = new Set(candidates.filter((c) => c.channelId === channelId).map((c) => c.id));
    return profile.feedback.some((f) => videoIds.has(f.videoId));
  }
  return false;
}

function countsTowardAlternateSourceType(
  candidate: CandidateVideo,
  dominant: string | null,
  lookupClassification: ClassificationLookup,
): boolean {
  if (dominant === null) return false;
  const cls = lookupClassification(candidate.id);
  const st = cls ? cls.sourceType.value : 'unknown';
  // Unknown source type never counts as alternate: diversity is never
  // manufactured by pretending unknown is different.
  if (st === 'unknown') return false;
  return st !== dominant;
}

/**
 * The deterministic selection walk.
 *
 * Ceilings are evaluated as shares of the FINAL FEED: taking an item is
 * allowed only when its channel/cluster/topic share would stay within
 * the ceiling assuming the feed eventually reaches `limit` items; after
 * the walk, a trim pass re-checks every ceiling against the actual
 * (possibly shorter) feed size, because honest degradation means a
 * SHORTER feed, never a miscounted one.
 *
 * Floors are satisfied by reservation passes that run FIRST and bookkeep
 * through the same take() counters, so every rule sees one consistent
 * count set. Reservations do not bypass ceilings: a reservation that
 * would break a ceiling is skipped (and the floor honestly reports the
 * shortfall) EXCEPT that reservations do outrank cooldowns when the two
 * conflict — both facts are reported per rule.
 */
function selectUnderBudget(
  ranked: FeedCandidate[],
  budget: ExposureBudget,
  limit: number,
  context: ComposerContext,
  cooldown: CooldownState,
): { feed: FeedCandidate[]; report: ExposureReport } {
  const { profile, lookupClassification, now, viewpoint } = context;
  const nowMs = Date.parse(now);
  const filters = interpretViewpoint(viewpoint.config).filters;
  const counts = emptyCounts(ranked, lookupClassification, context);
  const taken = new Set<string>();
  const feed: FeedCandidate[] = [];

  const ceilChannel = budget.maxSingleChannelShare;
  const ceilNarrative = budget.maxSingleNarrativeShare;
  const ceilTopic = budget.maxSingleTopicShare;
  const maxPerChannel = ceilChannel !== undefined ? Math.max(1, Math.floor(limit * ceilChannel)) : undefined;
  const maxPerNarrative = ceilNarrative !== undefined ? Math.max(1, Math.floor(limit * ceilNarrative)) : undefined;
  const maxPerTopic = ceilTopic !== undefined ? Math.max(1, Math.floor(limit * ceilTopic)) : undefined;

  // --- Reservation passes for floors -----------------------------------
  // Each floor rule reserves slots for candidates that genuinely count
  // toward it, in rank order, through take() so counters stay consistent.
  // Reservations respect ceilings; cooldowns may be overridden by a floor
  // reservation (both rules then report their honest status).
  const poolCandidates = ranked.map((r) => r.candidate);
  const reserve = (needed: number, qualifies: (item: FeedCandidate) => boolean) =>
    reserveFloor(ranked, feed, taken, needed, qualifies,
      counts, maxPerChannel, maxPerNarrative, maxPerTopic,
      lookupClassification, nowMs, filters);
  if (budget.minUnfamiliarChannelShare !== undefined) {
    reserve(Math.ceil(limit * budget.minUnfamiliarChannelShare),
      (item) => !channelHasFeedback(item.candidate.channelId, profile, poolCandidates));
  }
  if (budget.minAlternateSourceTypeShare !== undefined) {
    reserve(Math.ceil(limit * budget.minAlternateSourceTypeShare),
      (item) => countsTowardAlternateSourceType(item.candidate, counts.dominantSourceType, lookupClassification));
  }
  if (budget.minHistoricalShare !== undefined) {
    reserve(Math.ceil(limit * budget.minHistoricalShare),
      (item) => isHistoricalMaterial(item.candidate, lookupClassification, nowMs));
  }
  if (budget.explorationShare !== undefined) {
    reserve(Math.ceil(limit * budget.explorationShare),
      (item) => isExplorationPick(item.candidate, filters.positiveTopics));
  }

  // --- Main walk under ceilings and cooldowns ---------------------------
  for (const item of ranked) {
    if (feed.length >= limit) break;
    if (taken.has(item.candidate.id)) continue;
    if (!fitsCeilingsAndCooldowns(item, counts, maxPerChannel, maxPerNarrative, maxPerTopic, cooldown)) continue;
    take(item, feed, taken, counts, lookupClassification, nowMs, filters);
  }

  // --- Relief pass: soft rules never empty the feed ----------------------
  // Cooldowns are soft rules. When they (together with ceilings) blocked
  // every hard-filter-passing candidate, the honest outcome is the
  // top-ranked candidate with the cooldown reported as bypassed — never
  // an empty feed pretending no candidates existed. Ceilings always keep
  // Math.max(1, ...) slots, so one take() can never violate a ceiling.
  if (feed.length === 0) {
    for (const item of ranked) {
      if (!fitsCeilings(item, counts, maxPerChannel, maxPerNarrative, maxPerTopic)) continue;
      take(item, feed, taken, counts, lookupClassification, nowMs, filters);
      break;
    }
  }

  // --- Trim pass: ceilings against the ACTUAL feed size -----------------
  // When the feed came out shorter than `limit`, a share computed for
  // `limit` items may now exceed the ceiling. Honest degradation trims
  // from the tail (lowest-ranked first), never pads.
  trimToCeilings(feed, taken, counts, budget, lookupClassification, nowMs, filters);

  const report = buildReport(feed, ranked, budget, limit, counts, cooldown, context);
  return { feed, report };
}

function fitsCeilings(
  item: FeedCandidate,
  counts: SelectionCounts,
  maxPerChannel: number | undefined,
  maxPerNarrative: number | undefined,
  maxPerTopic: number | undefined,
): boolean {
  const c = item.candidate;
  if (maxPerChannel !== undefined && (counts.perChannel.get(c.channelId) ?? 0) >= maxPerChannel) return false;
  for (const clusterId of c.narrativeClusterIds) {
    if (maxPerNarrative !== undefined && (counts.perNarrative.get(clusterId) ?? 0) >= maxPerNarrative) return false;
  }
  for (const topicId of c.topicIds) {
    if (maxPerTopic !== undefined && (counts.perTopic.get(topicId) ?? 0) >= maxPerTopic) return false;
  }
  return true;
}

function fitsCeilingsAndCooldowns(
  item: FeedCandidate,
  counts: SelectionCounts,
  maxPerChannel: number | undefined,
  maxPerNarrative: number | undefined,
  maxPerTopic: number | undefined,
  cooldown: CooldownState,
): boolean {
  const c = item.candidate;
  if (!fitsCeilings(item, counts, maxPerChannel, maxPerNarrative, maxPerTopic)) return false;
  if (cooldown.blockedChannels.has(c.channelId)) return false;
  for (const clusterId of c.narrativeClusterIds) {
    if (cooldown.blockedNarratives.has(clusterId)) return false;
  }
  return true;
}

function take(
  item: FeedCandidate,
  feed: FeedCandidate[],
  taken: Set<string>,
  counts: SelectionCounts,
  lookupClassification: ClassificationLookup,
  nowMs: number,
  filters: { positiveTopics: Set<string> },
): void {
  const c = item.candidate;
  feed.push(item);
  taken.add(c.id);
  counts.perChannel.set(c.channelId, (counts.perChannel.get(c.channelId) ?? 0) + 1);
  for (const clusterId of c.narrativeClusterIds) {
    counts.perNarrative.set(clusterId, (counts.perNarrative.get(clusterId) ?? 0) + 1);
  }
  for (const topicId of c.topicIds) {
    counts.perTopic.set(topicId, (counts.perTopic.get(topicId) ?? 0) + 1);
  }
  if (countsTowardAlternateSourceType(c, counts.dominantSourceType, lookupClassification)) {
    counts.alternateSourceType += 1;
  }
  if (isHistoricalMaterial(c, lookupClassification, nowMs)) counts.historical += 1;
  if (isExplorationPick(c, filters.positiveTopics)) counts.exploration += 1;
}

/**
 * Reserve up to `needed` slots for candidates matching `qualifies`.
 * Reservations run in rank order and bookkeep through take(), so every
 * counter (per-channel, per-cluster, per-topic, floor tallies) stays
 * consistent for the report. Reservations respect ceilings; they do NOT
 * respect cooldowns (a user-configured floor outranks a cooldown — both
 * rules report their honest status when that happens).
 */
function reserveFloor(
  ranked: FeedCandidate[],
  feed: FeedCandidate[],
  taken: Set<string>,
  needed: number,
  qualifies: (item: FeedCandidate) => boolean,
  counts: SelectionCounts,
  maxPerChannel: number | undefined,
  maxPerNarrative: number | undefined,
  maxPerTopic: number | undefined,
  lookupClassification: ClassificationLookup,
  nowMs: number,
  filters: { positiveTopics: Set<string> },
): void {
  let got = 0;
  for (const item of ranked) {
    if (got >= needed) break;
    if (feed.length >= ranked.length) break;
    if (taken.has(item.candidate.id)) continue;
    if (!qualifies(item)) continue;
    // Reservations respect ceilings: taking an item that breaks a ceiling
    // would trade one honest rule for a violated other.
    const ceilingOk =
      (maxPerChannel === undefined || (counts.perChannel.get(item.candidate.channelId) ?? 0) < maxPerChannel) &&
      item.candidate.narrativeClusterIds.every(
        (n) => maxPerNarrative === undefined || (counts.perNarrative.get(n) ?? 0) < maxPerNarrative,
      ) &&
      item.candidate.topicIds.every(
        (t) => maxPerTopic === undefined || (counts.perTopic.get(t) ?? 0) < maxPerTopic,
      );
    if (!ceilingOk) continue;
    take(item, feed, taken, counts, lookupClassification, nowMs, filters);
    got += 1;
  }
}

/**
 * Trim pass: after the main walk, re-check every share ceiling against
 * the ACTUAL feed size (which may be shorter than `limit` when the pool
 * was thin). Ceilings are floors' opposite: an honest engine shortens the
 * feed rather than keep a share above the ceiling. Trims drop from the
 * tail (lowest rank) first and keep counters in sync. Never trims below
 * one item.
 */
function trimToCeilings(
  feed: FeedCandidate[],
  taken: Set<string>,
  counts: SelectionCounts,
  budget: ExposureBudget,
  lookupClassification: ClassificationLookup,
  nowMs: number,
  filters: { positiveTopics: Set<string> },
): void {
  trimByKeys(feed, taken, counts, budget.maxSingleChannelShare, (item) => [item.candidate.channelId], lookupClassification, nowMs, filters);
  trimByKeys(feed, taken, counts, budget.maxSingleNarrativeShare, (item) => item.candidate.narrativeClusterIds, lookupClassification, nowMs, filters);
  trimByKeys(feed, taken, counts, budget.maxSingleTopicShare, (item) => item.candidate.topicIds, lookupClassification, nowMs, filters);
}

function trimByKeys(
  feed: FeedCandidate[],
  taken: Set<string>,
  counts: SelectionCounts,
  share: number | undefined,
  keysOf: (item: FeedCandidate) => string[],
  lookupClassification: ClassificationLookup,
  nowMs: number,
  filters: { positiveTopics: Set<string> },
): void {
  if (share === undefined) return;
  while (feed.length > 1) {
    const maxAllowed = Math.max(1, Math.floor(feed.length * share));
    const keyCount = new Map<string, number>();
    for (const item of feed) {
      for (const k of keysOf(item)) keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
    let worstKey: string | null = null;
    let worstCount = 0;
    for (const [k, n] of keyCount) {
      if (n > worstCount) {
        worstCount = n;
        worstKey = k;
      }
    }
    if (worstKey === null || worstCount <= maxAllowed) break;
    for (let i = feed.length - 1; i >= 0; i--) {
      if (keysOf(feed[i]).includes(worstKey)) {
        untake(feed[i], taken, counts, lookupClassification, nowMs, filters);
        feed.splice(i, 1);
        break;
      }
    }
  }
}

/** Reverse of take(): remove one item from every counter. */
function untake(
  item: FeedCandidate,
  taken: Set<string>,
  counts: SelectionCounts,
  lookupClassification: ClassificationLookup,
  nowMs: number,
  filters: { positiveTopics: Set<string> },
): void {
  const c = item.candidate;
  taken.delete(c.id);
  counts.perChannel.set(c.channelId, (counts.perChannel.get(c.channelId) ?? 1) - 1);
  if (counts.perChannel.get(c.channelId) === 0) counts.perChannel.delete(c.channelId);
  for (const clusterId of c.narrativeClusterIds) {
    counts.perNarrative.set(clusterId, (counts.perNarrative.get(clusterId) ?? 1) - 1);
    if (counts.perNarrative.get(clusterId) === 0) counts.perNarrative.delete(clusterId);
  }
  for (const topicId of c.topicIds) {
    counts.perTopic.set(topicId, (counts.perTopic.get(topicId) ?? 1) - 1);
    if (counts.perTopic.get(topicId) === 0) counts.perTopic.delete(topicId);
  }
  if (countsTowardAlternateSourceType(c, counts.dominantSourceType, lookupClassification)) {
    counts.alternateSourceType -= 1;
  }
  if (isHistoricalMaterial(c, lookupClassification, nowMs)) counts.historical -= 1;
  if (isExplorationPick(c, filters.positiveTopics)) counts.exploration -= 1;
}

// ---------------------------------------------------------------------------
// Report building
// ---------------------------------------------------------------------------

function buildReport(
  feed: FeedCandidate[],
  ranked: FeedCandidate[],
  budget: ExposureBudget,
  limit: number,
  counts: SelectionCounts,
  cooldown: CooldownState,
  context: ComposerContext,
): ExposureReport {
  const { profile, lookupClassification, now } = context;
  const nowMs = Date.parse(now);
  const size = feed.length;
  const rules: ExposureRuleReport[] = [];
  const fraction = (n: number) => (size === 0 ? 0 : n / size);

  const add = (
    rule: keyof ExposureBudget,
    statement: string,
    target: number,
    observed: number,
    status: ExposureRuleReport['status'],
    explanation: string,
  ) => {
    rules.push({ rule, statement, target, observed, status, explanation });
  };

  if (budget.maxSingleChannelShare !== undefined) {
    const top = [...counts.perChannel.entries()].sort((a, b) => b[1] - a[1])[0];
    const observed = top ? fraction(top[1]) : 0;
    const satisfied = observed <= budget.maxSingleChannelShare + 1e-9;
    add('maxSingleChannelShare',
      `At most ${(budget.maxSingleChannelShare * 100).toFixed(0)}% of the feed from any single channel`,
      budget.maxSingleChannelShare, observed, satisfied ? 'satisfied' : 'violated',
      satisfied
        ? `Largest single-channel share is ${(observed * 100).toFixed(0)}%${top ? ` (${top[0]}: ${top[1]}/${size})` : ''}.`
        : `Largest single-channel share is ${(observed * 100).toFixed(0)}%${top ? ` (${top[0]}: ${top[1]}/${size})` : ''}, above the ${(budget.maxSingleChannelShare * 100).toFixed(0)}% ceiling.`);
  }

  if (budget.maxSingleNarrativeShare !== undefined) {
    const top = [...counts.perNarrative.entries()].sort((a, b) => b[1] - a[1])[0];
    const observed = top ? fraction(top[1]) : 0;
    const satisfied = observed <= budget.maxSingleNarrativeShare + 1e-9;
    add('maxSingleNarrativeShare',
      `At most ${(budget.maxSingleNarrativeShare * 100).toFixed(0)}% of the feed from any single narrative cluster`,
      budget.maxSingleNarrativeShare, observed, satisfied ? 'satisfied' : 'violated',
      satisfied
        ? `Largest single-cluster share is ${(observed * 100).toFixed(0)}%${top ? ` (${top[0]}: ${top[1]}/${size})` : ''}.`
        : `Largest single-cluster share is ${(observed * 100).toFixed(0)}%${top ? ` (${top[0]}: ${top[1]}/${size})` : ''}, above the ceiling. Candidates with unknown clusters were never counted toward any cluster.`);
  }

  if (budget.maxSingleTopicShare !== undefined) {
    const top = [...counts.perTopic.entries()].sort((a, b) => b[1] - a[1])[0];
    const observed = top ? fraction(top[1]) : 0;
    const satisfied = observed <= budget.maxSingleTopicShare + 1e-9;
    add('maxSingleTopicShare',
      `At most ${(budget.maxSingleTopicShare * 100).toFixed(0)}% of the feed touching any single topic`,
      budget.maxSingleTopicShare, observed, satisfied ? 'satisfied' : 'violated',
      satisfied
        ? `Largest single-topic share is ${(observed * 100).toFixed(0)}%${top ? ` (${top[0]}: ${top[1]}/${size})` : ''}.`
        : `Largest single-topic share is ${(observed * 100).toFixed(0)}%${top ? ` (${top[0]}: ${top[1]}/${size})` : ''}, above the ceiling.`);
  }

  if (budget.minUnfamiliarChannelShare !== undefined) {
    // Count honestly from the composed feed: channels with no recorded
    // MeTube feedback on their videos.
    const unfamiliar = feed.filter(
      (item) => channelHasFeedback(item.candidate.channelId, profile, ranked.map((r) => r.candidate)) === false,
    ).length;
    const observed = fraction(unfamiliar);
    const satisfied = observed >= budget.minUnfamiliarChannelShare - 1e-9;
    const poolUnfamiliar = ranked.filter(
      (item) => channelHasFeedback(item.candidate.channelId, profile, ranked.map((r) => r.candidate)) === false,
    ).length;
    add('minUnfamiliarChannelShare',
      `At least ${(budget.minUnfamiliarChannelShare * 100).toFixed(0)}% of the feed from channels with no recorded Slipgate feedback`,
      budget.minUnfamiliarChannelShare, observed, satisfied ? 'satisfied' : 'violated',
      satisfied
        ? `${unfamiliar}/${size} items are from unfamiliar channels.`
        : `Only ${unfamiliar}/${size} items are from unfamiliar channels (pool offered ${poolUnfamiliar} such candidates). ${poolUnfamiliar < needed(limit, budget.minUnfamiliarChannelShare) ? 'The pool itself does not contain enough unfamiliar channels to satisfy this floor — reported honestly rather than padded.' : 'Ceiling rules or cooldowns blocked qualifying candidates.'}`);
  }

  if (budget.minAlternateSourceTypeShare !== undefined) {
    const observed = fraction(counts.alternateSourceType);
    const satisfied = observed >= budget.minAlternateSourceTypeShare - 1e-9;
    const poolAlternate = ranked.filter(
      (item) => countsTowardAlternateSourceType(item.candidate, counts.dominantSourceType, lookupClassification),
    ).length;
    add('minAlternateSourceTypeShare',
      `At least ${(budget.minAlternateSourceTypeShare * 100).toFixed(0)}% of the feed from source types other than the pool's dominant classified type${counts.dominantSourceType ? ` (${counts.dominantSourceType})` : ''}`,
      budget.minAlternateSourceTypeShare, observed, satisfied ? 'satisfied' : 'violated',
      satisfied
        ? `${counts.alternateSourceType}/${size} items have an alternate classified source type.`
        : `Only ${counts.alternateSourceType}/${size} items have an alternate classified source type; the pool offered ${poolAlternate}. ${poolAlternate < needed(limit, budget.minAlternateSourceTypeShare) ? 'Not enough evidenced alternate source types exist in the pool — unknown classifications were not counted as diversity.' : 'Ceiling rules or cooldowns blocked qualifying candidates.'}`);
  }

  if (budget.minHistoricalShare !== undefined) {
    const observed = fraction(counts.historical);
    const satisfied = observed >= budget.minHistoricalShare - 1e-9;
    const poolHistorical = ranked.filter(
      (item) => isHistoricalMaterial(item.candidate, lookupClassification, nowMs),
    ).length;
    add('minHistoricalShare',
      `At least ${(budget.minHistoricalShare * 100).toFixed(0)}% of the feed is historical material (older than a year or classified historical/retrospective by framing)`,
      budget.minHistoricalShare, observed, satisfied ? 'satisfied' : 'violated',
      satisfied
        ? `${counts.historical}/${size} items are historical material.`
        : `Only ${counts.historical}/${size} items are historical material; the pool offered ${poolHistorical}. ${poolHistorical < needed(limit, budget.minHistoricalShare) ? 'The pool has sparse historical material — reported honestly rather than padded with misclassified candidates.' : 'Ceiling rules or cooldowns blocked qualifying candidates.'}`);
  }

  if (budget.explorationShare !== undefined) {
    const observed = fraction(counts.exploration);
    const satisfied = observed >= budget.explorationShare - 1e-9;
    add('explorationShare',
      `At least ${(budget.explorationShare * 100).toFixed(0)}% of the feed is wildcard/exploration material (outside the Viewpoint's positive topic constraints)`,
      budget.explorationShare, observed, satisfied ? 'satisfied' : 'violated',
      satisfied
        ? `${counts.exploration}/${size} items are exploration picks.`
        : `${counts.exploration}/${size} items are exploration picks. ${filtersEmpty(context) ? 'No positive topic constraints are configured, so every candidate counts as exploration-neutral; the floor is not applicable as configured.' : 'Not enough non-seed-topic candidates existed after filters.'}`);
  }

  if (budget.repeatedChannelCooldown !== undefined) {
    const blocked = feed.filter((item) => cooldown.blockedChannels.has(item.candidate.channelId)).length;
    add('repeatedChannelCooldown',
      `Channels featured in the previous ${budget.repeatedChannelCooldown} generation(s) of this Viewpoint do not appear again`,
      budget.repeatedChannelCooldown, blocked, blocked === 0 ? 'satisfied' : 'violated',
      blocked === 0
        ? cooldown.channelExplanation
        : `${blocked} featured item(s) came from cooled-down channels. This is only possible via a floor reservation outranking the cooldown, or via the relief pass that keeps the top-ranked candidate when soft rules would otherwise empty the feed entirely. ${cooldown.channelExplanation}`);
  }

  if (budget.repeatedNarrativeCooldown !== undefined) {
    const blocked = feed.filter(
      (item) => item.candidate.narrativeClusterIds.some((n) => cooldown.blockedNarratives.has(n)),
    ).length;
    add('repeatedNarrativeCooldown',
      `Narrative clusters featured in the previous ${budget.repeatedNarrativeCooldown} generation(s) of this Viewpoint do not appear again`,
      budget.repeatedNarrativeCooldown, blocked, blocked === 0 ? 'satisfied' : 'violated',
      blocked === 0
        ? cooldown.narrativeExplanation
        : `${blocked} featured item(s) came from cooled-down clusters. This is only possible via a floor reservation outranking the cooldown, or via the relief pass that keeps the top-ranked candidate when soft rules would otherwise empty the feed entirely. ${cooldown.narrativeExplanation}`);
  }

  if (budget.minDistinctLanguages !== undefined) {
    // No evidenced language data exists yet — the rule is recorded and
    // reported not-applicable, never fabricated.
    add('minDistinctLanguages',
      `At least ${budget.minDistinctLanguages} distinct languages in the feed`,
      budget.minDistinctLanguages, 0, 'not-applicable',
      'No evidenced language data exists for candidates yet; this target is recorded and inspectable but cannot be evaluated. It is never satisfied by guessing.');
  }

  if (budget.minDistinctRegions !== undefined) {
    add('minDistinctRegions',
      `At least ${budget.minDistinctRegions} distinct regions in the feed`,
      budget.minDistinctRegions, 0, 'not-applicable',
      'No evidenced region data exists for candidates yet; this target is recorded and inspectable but cannot be evaluated.');
  }

  if (budget.minDistinctScaleBands !== undefined) {
    const bands = new Set(
      feed.map((item) => context.profile.mutedChannelIds.length >= 0 ? bandOf(item, context) : 'unknown'),
    );
    const observed = [...bands].filter((b) => b !== 'unknown').length;
    add('minDistinctScaleBands',
      `At least ${budget.minDistinctScaleBands} distinct channel-scale bands in the feed`,
      budget.minDistinctScaleBands, observed, observed >= budget.minDistinctScaleBands ? 'satisfied' : 'violated',
      observed >= budget.minDistinctScaleBands
        ? `${observed} distinct scale band(s) represented: ${[...bands].filter((b) => b !== 'unknown').join(', ')}.`
        : `${observed} distinct scale band(s) represented (candidates from unknown-scale channels count as unknown, not as a band).`);
  }

  const satisfied = rules.filter((r) => r.status === 'satisfied').length;
  const violated = rules.filter((r) => r.status === 'violated' || r.status === 'not-applicable').length;
  return {
    feedSize: size,
    poolSize: ranked.length,
    rules,
    satisfied,
    violated,
    channelsFeatured: [...new Set(feed.map((f) => f.candidate.channelId))],
    narrativesFeatured: [...new Set(feed.flatMap((f) => f.candidate.narrativeClusterIds))],
  };
}

function bandOf(item: FeedCandidate, context: ComposerContext): string {
  const ch = context.viewpoint;
  void ch;
  // Channel profiles with scale bands are not carried on candidates yet;
  // the honest answer is unknown until they are.
  return 'unknown';
}

function needed(limit: number, share: number): number {
  return Math.ceil(limit * share);
}

function filtersEmpty(context: ComposerContext): boolean {
  return interpretViewpoint(context.viewpoint.config).filters.positiveTopics.size === 0;
}

// ---------------------------------------------------------------------------

function emptyComposition(
  viewpoint: Viewpoint,
  limit: number,
  now: string,
  reason: string,
): CompositionResult {
  void limit;
  void reason;
  return {
    snapshot: {
      id: `viewstream-${now}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
      createdAt: now,
      feed: [],
      consideredCount: 0,
      mutedCount: 0,
      viewpoint: { id: viewpoint.id, title: viewpoint.title },
    },
    report: {
      feedSize: 0,
      poolSize: 0,
      rules: [],
      satisfied: 0,
      violated: 0,
      channelsFeatured: [],
      narrativesFeatured: [],
    },
  };
}