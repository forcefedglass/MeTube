/**
 * Feed autopsy — Phase 5.
 *
 * A descriptive report over a COMPOSED VIEWSTREAM and its POOL: what the
 * feed is made of, measured against what was available. Every number is
 * computed from recorded data; where a dimension is unknown it is counted
 * as unknown — never folded into another bucket, never guessed.
 *
 * DESCRIPTIVE RULES (FROZEN):
 *   - The autopsy describes composition. It never judges which
 *     perspectives "should" have been included and never recommends
 *     adopting any position.
 *   - Concentration metrics state the arithmetic (top-N share, HHI-style
 *     concentration) and nothing more.
 *   - Exploration percentage and exposure-budget compliance come from the
 *     composer's own report — the autopsy re-states them, never recomputes
 *     them differently.
 *
 * Pure and DOM-free. Deterministic.
 */

import type { CandidateVideo, UserProfile } from '../model/types';
import type { FeedCandidate } from '../model/types';
import type { ExposureReport } from '../model/exposure';
import type { ClassificationLookup } from '../discovery/coverage';
import type { Viewpoint } from '../model/viewpoint';
import { isUnknownDate } from '../model/discovery';
import { AGE_BANDS } from '../model/classification';
import type { AgeBandKey } from '../model/classification';
import { isFamiliar } from '../viewpoints/interpret';

function ageBandKey(publishedAt: string, now: string): AgeBandKey {
  if (isUnknownDate(publishedAt)) return 'unknown';
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return 'unknown';
  const ageDays = (Date.parse(now) - published) / 86_400_000;
  if (ageDays < 0) return 'unknown';
  for (const band of AGE_BANDS) {
    if (band.key === 'unknown') continue;
    if (ageDays <= band.days) return band.key;
  }
  return 'older';
}

/** One named metric in the autopsy. */
export interface AutopsyMetric {
  /** Stable metric id (e.g. 'source-concentration'). */
  id: string;
  /** Human label. */
  label: string;
  /** The measured value, already formatted for display. */
  value: string;
  /** Plain-statement explanation of what was measured and how. */
  detail: string;
}

export interface FeedAutopsy {
  metrics: AutopsyMetric[];
  /** Statement of what this autopsy covers. Facts only. */
  summary: string;
}

interface ShareEntry {
  key: string;
  label: string;
  count: number;
  share: number;
}

function topShare(entries: ShareEntry[]): { top: ShareEntry | undefined; top3Share: number; hhi: number } {
  if (entries.length === 0) return { top: undefined, top3Share: 0, hhi: 0 };
  const total = entries.reduce((s, e) => s + e.count, 0);
  if (total === 0) return { top: undefined, top3Share: 0, hhi: 0 };
  const sorted = [...entries].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const top3 = sorted.slice(0, 3).reduce((s, e) => s + e.count, 0) / total;
  const hhi = entries.reduce((s, e) => s + (e.count / total) ** 2, 0);
  return { top: sorted[0], top3Share: top3, hhi };
}

function distBucket(map: Map<string, ShareEntry>): ShareEntry[] {
  const total = [...map.values()].reduce((s, e) => s + e.count, 0);
  return [...map.values()]
    .map((e) => ({ ...e, share: total > 0 ? e.count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Compute the feed autopsy over a composed Viewstream and its working set.
 *
 * `feed` = what was composed; `pool` = the Viewpoint's working set —
 * candidates whose recorded provenance ties them to this Viewpoint, after
 * hard filters and muting (the composer's input). Both are recorded data.
 */
export function computeFeedAutopsy(
  feed: FeedCandidate[],
  pool: CandidateVideo[],
  viewpoint: Viewpoint | null,
  profile: UserProfile,
  lookupClassification: ClassificationLookup,
  exposureReport: ExposureReport | null,
  now: string,
): FeedAutopsy {
  const metrics: AutopsyMetric[] = [];
  const feedCands = feed.map((f) => f.candidate);
  const n = feedCands.length;

  if (n === 0) {
    return {
      metrics: [],
      summary:
        'Feed autopsy: the composed Viewstream is empty. Nothing to describe. ' +
        'An empty feed is reported as empty; it is never padded.',
    };
  }

  // --- Source (discovery) concentration ---------------------------------
  const sourceMap = new Map<string, ShareEntry>();
  for (const c of feedCands) {
    for (const src of [c.discoveredVia, ...c.alsoSeenVia]) {
      const e = sourceMap.get(src) ?? { key: src, label: src, count: 0, share: 0 };
      e.count += 1;
      sourceMap.set(src, e);
    }
  }
  const srcDist = distBucket(sourceMap);
  const srcTop = topShare(srcDist);
  metrics.push({
    id: 'source-concentration',
    label: 'Source concentration (discovery sources)',
    value: srcTop.top
      ? `top source ${(srcTop.top.share * 100).toFixed(0)}% · top-3 ${(srcTop.top3Share * 100).toFixed(0)}%`
      : 'no sources recorded',
    detail:
      `Share of feed items by discovery source that surfaced them (first sighting + repeat sightings). ` +
      `Top source: ${srcTop.top ? `${srcTop.top.label} (${srcTop.top.count}/${n})` : 'none'}. ` +
      `HHI-style concentration: ${srcTop.hhi.toFixed(2)} (0 = spread, 1 = single source).`,
  });

  // --- Channel concentration ---------------------------------------------
  const channelMap = new Map<string, ShareEntry>();
  for (const c of feedCands) {
    const e = channelMap.get(c.channelId) ?? { key: c.channelId, label: c.channelTitle, count: 0, share: 0 };
    e.count += 1;
    channelMap.set(c.channelId, e);
  }
  const chDist = distBucket(channelMap);
  const chTop = topShare(chDist);
  metrics.push({
    id: 'channel-concentration',
    label: 'Channel concentration',
    value: chTop.top
      ? `top channel ${(chTop.top.share * 100).toFixed(0)}% · ${chDist.length} channel(s)`
      : 'no channels recorded',
    detail:
      `Share of feed items by channel. Top channel: ${chTop.top ? `${chTop.top.label} (${chTop.top.count}/${n})` : 'none'}. ` +
      `HHI-style concentration: ${chTop.hhi.toFixed(2)}.`,
  });

  // --- Narrative concentration --------------------------------------------
  const narrativeMap = new Map<string, ShareEntry>();
  let unknownNarrative = 0;
  for (const c of feedCands) {
    if (c.narrativeClusterIds.length === 0) {
      unknownNarrative += 1;
      const e = narrativeMap.get('unknown') ?? { key: 'unknown', label: 'Unknown narrative cluster', count: 0, share: 0 };
      e.count += 1;
      narrativeMap.set('unknown', e);
      continue;
    }
    for (const nc of c.narrativeClusterIds) {
      const e = narrativeMap.get(nc) ?? { key: nc, label: nc, count: 0, share: 0 };
      e.count += 1;
      narrativeMap.set(nc, e);
    }
  }
  void unknownNarrative;
  const naDist = distBucket(narrativeMap);
  const naTop = topShare(naDist);
  metrics.push({
    id: 'narrative-concentration',
    label: 'Narrative concentration',
    value: naTop.top
      ? `top cluster ${(naTop.top.share * 100).toFixed(0)}% · ${naDist.length} cluster(s)`
      : 'no narrative data',
    detail:
      `Share of feed items by narrative cluster id (classification + overrides; unknown is its own bucket, never folded in). ` +
      `Top cluster: ${naTop.top ? `${naTop.top.label} (${naTop.top.count} sightings)` : 'none'}. ` +
      `HHI-style concentration: ${naTop.hhi.toFixed(2)}.`,
  });

  // --- Topic distribution --------------------------------------------------
  const topicMap = new Map<string, ShareEntry>();
  for (const c of feedCands) {
    if (c.topicIds.length === 0) {
      const e = topicMap.get('unknown') ?? { key: 'unknown', label: 'No topic recorded', count: 0, share: 0 };
      e.count += 1;
      topicMap.set('unknown', e);
      continue;
    }
    for (const t of c.topicIds) {
      const e = topicMap.get(t) ?? { key: t, label: t, count: 0, share: 0 };
      e.count += 1;
      topicMap.set(t, e);
    }
  }
  const toDist = distBucket(topicMap);
  metrics.push({
    id: 'topic-distribution',
    label: 'Topic distribution',
    value: `${toDist.filter((d) => d.key !== 'unknown').length} topic(s); top: ${toDist[0]?.label ?? 'none'}`,
    detail:
      `Feed items by topic id. ${toDist.find((d) => d.key === 'unknown')?.count ?? 0} item(s) carry no topic data. ` +
      `Shares: ${toDist.slice(0, 5).map((d) => `${d.label} ${(d.share * 100).toFixed(0)}%`).join(', ') || 'none'}.`,
  });

  // --- Source-type distribution (classification lookup) ---------------------
  const stMap = new Map<string, ShareEntry>();
  for (const c of feedCands) {
    const cls = lookupClassification(c.id);
    const st = cls?.sourceType.value ?? 'unknown';
    const e = stMap.get(st) ?? { key: st, label: st, count: 0, share: 0 };
    e.count += 1;
    stMap.set(st, e);
  }
  const stDist = distBucket(stMap);
  metrics.push({
    id: 'source-type-distribution',
    label: 'Source-type distribution',
    value: stDist.map((d) => `${d.label} ${(d.share * 100).toFixed(0)}%`).join(', ') || 'none recorded',
    detail:
      'Feed items by classified source type (machine classification + user overrides; unknown is its own bucket). ' +
      `Buckets: ${stDist.map((d) => `${d.label}=${d.count}`).join(', ') || 'none'}.`,
  });

  // --- Familiarity ----------------------------------------------------------
  let familiarCount = 0;
  for (const c of feedCands) {
    if (isFamiliar(c, profile)) familiarCount += 1;
  }
  const familiarShare = familiarCount / n;
  metrics.push({
    id: 'familiarity',
    label: 'Familiarity',
    value: `${(familiarShare * 100).toFixed(0)}% familiar (${familiarCount}/${n})`,
    detail:
      'Familiar = Slipgate-internal familiarity only (explicit exposure facts + the legacy more-like-this signal, ' +
      'per the exploration firewall). YouTube watch history is never read. Unknown familiarity is not guessed.',
  });

  // --- Temporal distribution ------------------------------------------------
  const ageMap = new Map<string, ShareEntry>();
  let unknownDates = 0;
  for (const c of feedCands) {
    if (isUnknownDate(c.publishedAt)) {
      unknownDates += 1;
      const e = ageMap.get('unknown') ?? { key: 'unknown', label: 'Unknown date', count: 0, share: 0 };
      e.count += 1;
      ageMap.set('unknown', e);
      continue;
    }
    const band = ageBandKey(c.publishedAt, now);
    const e = ageMap.get(band) ?? { key: band, label: band, count: 0, share: 0 };
    e.count += 1;
    ageMap.set(band, e);
  }
  const ageDist = distBucket(ageMap);
  metrics.push({
    id: 'temporal-distribution',
    label: 'Temporal distribution',
    value:
      `${ageDist.map((d) => `${d.label} ${(d.share * 100).toFixed(0)}%`).join(', ') || 'none'}`
      + (unknownDates > 0 ? ` · ${unknownDates} unknown date(s)` : ''),
    detail:
      `Feed items by age band relative to generation time (${AGE_BANDS.map((b) => b.label).join('; ')}). ` +
      'Publication dates that the discovery source did not provide absolutely stay unknown — they are never estimated.',
  });

  // --- Exploration percentage --------------------------------------------------
  // Restated from the composer's own accounting (exploration picks = items
  // outside the Viewpoint's positive topic constraints when an
  // explorationShare budget rule is configured).
  const positiveTopics = new Set(viewpoint?.config.positiveTopicConstraints ?? []);
  const explorationPicks = positiveTopics.size
    ? feedCands.filter((c) => !c.topicIds.some((t) => positiveTopics.has(t))).length
    : 0;
  metrics.push({
    id: 'exploration-percent',
    label: 'Exploration percentage',
    value: `${((explorationPicks / n) * 100).toFixed(0)}% (${explorationPicks}/${n})`,
    detail:
      'Exploration picks = feed items outside the Viewpoint\'s positive topic constraints (only meaningful when ' +
      'topic constraints and/or an explorationShare budget rule are configured). Recomputed here from the same ' +
      'definition the composer uses; the composer\'s own per-rule report is the authority and is shown under ' +
      'exposure-budget compliance below.',
  });

  // --- Exposure-budget compliance ------------------------------------------------
  if (exposureReport) {
    const satisfiedCount = exposureReport.rules.filter((r) => r.status === 'satisfied').length;
    const violated = exposureReport.rules.filter((r) => r.status === 'violated');
    metrics.push({
      id: 'budget-compliance',
      label: 'Exposure-budget compliance',
      value: violated.length === 0
        ? `${satisfiedCount}/${exposureReport.rules.length} rules satisfied`
        : `${satisfiedCount}/${exposureReport.rules.length} satisfied · ${violated.length} violated`,
      detail:
        'Per-rule compliance restated from the composer\'s ExposureReport (the authority; never recomputed). ' +
        (violated.length > 0
          ? `Violated rules: ${violated.map((v) => v.rule).join(', ')}. A violated rule means the pool lacked ` +
            'qualifying material or ceilings shortened the feed — the report states which, honestly.'
          : 'All configured rules report satisfied.'),
    });
  } else {
    metrics.push({
      id: 'budget-compliance',
      label: 'Exposure-budget compliance',
      value: 'no budget configured',
      detail:
        'This Viewstream was composed without an exposure budget (legacy assembly path). Configure ' +
        'exposureBudget rules on the Viewpoint for enforced, per-rule-reported composition.',
    });
  }

  // --- Working set vs feed ---------------------------------------------------
  metrics.push({
    id: 'pool-vs-feed',
    label: 'Working set vs feed',
    value: `${pool.length} eligible → ${n} composed`,
    detail:
      'Eligible = candidates in this Viewpoint\'s working set (recorded provenance ties them to this Viewpoint) ' +
      'after the Viewpoint\'s hard filters and muting — the composer\'s input, never the global catalog. ' +
      'The gap is dominated by limit (feed size), ceilings, floors, and cooldowns — each enforced or honestly ' +
      'reported by the composer, never silently.',
  });

  const summary =
    `Feed autopsy of a ${n}-item Viewstream${viewpoint ? ` composed through "${viewpoint.title}"` : ''}: ` +
    `${metrics.length} descriptive metrics computed from recorded data. This autopsy describes composition only; ` +
    'it states no judgment about which perspectives should be present and implies no causal claims.';

  return { metrics, summary };
}