/**
 * Viewstream generation: assemble a feed through a Viewpoint.
 *
 * The pipeline is the bootstrap pipeline with a Viewpoint lens applied:
 *   1. hard filters (topics, sources, dates, unfamiliarity) — deterministic
 *   2. channel muting — exclusion, not down-ranking
 *   3. ranking with the Viewpoint's derived weights
 *   4. post-selection enforcement of repetition + concentration limits
 *   5. snapshot with the Viewpoint embedded (the audit record)
 *
 * Phase 4: when the Viewpoint carries an EXPOSURE BUDGET (any rule
 * configured), assembly delegates selection to the composer
 * (src/viewpoints/composer.ts), which enforces the budget rules and
 * returns an honest satisfaction/violation report. Without a budget the
 * bootstrap assembly path runs unchanged.
 *
 * Every step is deterministic: same Viewpoint + candidates + profile ->
 * same Viewstream (module the snapshot id/timestamp).
 */

import type {
  CandidateVideo,
  FeedSnapshot,
  UserProfile,
} from '../model/types';
import type { CandidateProvider } from '../discovery/provider';
import { rankCandidates } from '../ranking/engine';
import type { Viewpoint } from '../model/viewpoint';
import type { ExposureReport } from '../model/exposure';
import {
  candidatePasses,
  interpretViewpoint,
  passesUnfamiliarity,
} from './interpret';
import { trainingFeedbackFor } from './firewall';
import { composeViewstream } from './composer';
import type { ComposerContext } from './composer';
import type { ClassificationLookup } from '../discovery/coverage';
import { unknownLookup } from '../discovery/coverage';

export interface ViewstreamRequest {
  viewpoint: Viewpoint;
  limit: number;
  profile: UserProfile;
}

export interface ComposeOptions {
  /** Classification lookup for budget rules that read classifications. */
  lookupClassification?: ClassificationLookup;
  /** Generation history for cooldown enforcement. */
  history?: import('../model/exposure').GenerationHistoryEntry[];
  /** Current generation index. */
  generation?: number;
}

export async function generateViewstream(
  provider: CandidateProvider,
  request: ViewstreamRequest,
  now: string,
): Promise<FeedSnapshot> {
  const { viewpoint, limit, profile } = request;
  const interpretation = interpretViewpoint(viewpoint.config);
  const { filters, limits, tuning } = interpretation;

  // 1. Hard filters. Disabled Viewpoints never generate.
  if (!viewpoint.enabled) {
    return emptySnapshot(now, viewpoint, 'viewpoint disabled');
  }
  const all = await provider.getCandidates({ limit: 1000 });
  const result = await assembleViewstream(all, { viewpoint, limit, profile }, now);
  return result.snapshot;
}

/**
 * Pool-backed generation: candidates are supplied by the caller (already
 * acquired, cached, deduped, and adapted to CandidateVideo). Used by the
 * extension path where acquisition goes through the candidate pool.
 *
 * Phase 4: returns the composed snapshot AND the exposure report when a
 * budget is configured. The report is the audit record for "Why this
 * Viewstream looks like this".
 */
export async function assembleViewstream(
  candidates: CandidateVideo[],
  request: ViewstreamRequest,
  now: string,
  options: ComposeOptions = {},
): Promise<{ snapshot: FeedSnapshot; report: ExposureReport | null }> {
  const { viewpoint, limit, profile } = request;
  // Phase 4 exploration firewall: ranking inside this Viewpoint sees only
  // feedback visible to it (global + this Viewpoint's own). Preference
  // feedback recorded in other Viewpoints never trains this one. Mutes
  // stay global (exclusion is global by design).
  const lensedProfile: UserProfile = {
    ...profile,
    feedback: trainingFeedbackFor(profile, viewpoint),
  };
  if (!viewpoint.enabled) {
    return {
      snapshot: emptySnapshot(now, viewpoint, 'viewpoint disabled'),
      report: null,
    };
  }
  const interpretation = interpretViewpoint(viewpoint.config);
  const { filters, limits, tuning } = interpretation;

  const budget = viewpoint.config.exposureBudget ?? {};
  const budgetRules = Object.keys(budget).filter(
    (k) => budget[k as keyof typeof budget] !== undefined,
  );

  if (budgetRules.length > 0) {
    // Phase 4 composer path: budget-aware selection with honest reporting.
    const composerContext: ComposerContext = {
      viewpoint,
      limit,
      profile: lensedProfile,
      lookupClassification: options.lookupClassification ?? unknownLookup,
      history: options.history ?? [],
      generation: options.generation ?? 0,
      now,
    };
    return composeViewstream(candidates, composerContext);
  }

  const passing = candidates.filter(
    (c) =>
      candidatePasses(c, filters) &&
      passesUnfamiliarity(c, lensedProfile, tuning.unfamiliarityTarget),
  );

  // 2. Channel muting.
  const muted = new Set(lensedProfile.mutedChannelIds);
  const unmuted = passing.filter((c) => !muted.has(c.channelId));
  const mutedCount = passing.length - unmuted.length;

  // 3. Rank with the Viewpoint's weights.
  const ranked = rankCandidates(unmuted, {
    pool: unmuted,
    profile: lensedProfile,
    weights: tuning.weights,
  });

  // 4. Post-selection limits: repetition + concentration.
  const feed = applyAssemblyLimits(ranked, limits, limit);

  return {
    snapshot: {
      id: `viewstream-${now}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
      createdAt: now,
      feed,
      consideredCount: unmuted.length,
      mutedCount,
      viewpoint: { id: viewpoint.id, title: viewpoint.title },
    },
    report: null,
  };
}

function emptySnapshot(
  now: string,
  viewpoint: Viewpoint,
  reason: string,
): FeedSnapshot {
  void reason;
  return {
    id: `viewstream-${now}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
    createdAt: now,
    feed: [],
    consideredCount: 0,
    mutedCount: 0,
    viewpoint: { id: viewpoint.id, title: viewpoint.title },
  };
}

export { unknownLookup };

/**
 * Walk the ranked list, taking items until limits would be violated.
 * Deterministic: iterates in rank order and applies limits greedily.
 */
function applyAssemblyLimits(
  ranked: ReturnType<typeof rankCandidates>,
  limits: { repetitionLimit: number; sourceConcentrationLimit: number },
  limit: number,
) {
  const selected: typeof ranked = [];
  const perChannel = new Map<string, number>();
  for (const item of ranked) {
    if (selected.length >= limit) break;
    const channelId = item.candidate.channelId;
    const count = perChannel.get(channelId) ?? 0;
    // Hard repetition limit per channel.
    if (count >= limits.repetitionLimit) continue;
    // Hard concentration limit: max share of the feed per channel.
    const maxByConcentration = Math.max(
      1,
      Math.floor(limit * limits.sourceConcentrationLimit),
    );
    if (count >= maxByConcentration) continue;
    selected.push(item);
    perChannel.set(channelId, count + 1);
  }
  return selected;
}