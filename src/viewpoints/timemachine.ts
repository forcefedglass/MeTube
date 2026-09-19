/**
 * Time Machine — Phase 5.
 *
 * Temporal exploration for a Viewpoint: the user authors an anchor date
 * and period windows; MeTube computes which period each candidate's
 * PUBLICATION DATE falls in, and offers a descriptive comparison between
 * periods.
 *
 * DESCRIPTIVE RULES (FROZEN):
 *   - Periods are positions relative to the user-authored anchor:
 *       pre-event      [anchor - preEventDays,       anchor)
 *       during-event   [anchor,                      anchor + duringEventDays)
 *       post-event     [anchor + duringEventDays,     anchor + duringEventDays + postEventDays)
 *       retrospective  [anchor + retrospectiveAfterDays, ∞)
 *     Publication dates BEFORE (anchor - preEventDays) fall in 'before-window'.
 *   - EVIDENCE GATE: a candidate whose publication date is unknown or
 *     unparseable is 'unclassifiable' — never assigned to a period by
 *     guessing. 'unclassifiable' is a real answer, shown as such.
 *   - The comparison between periods is DESCRIPTIVE ONLY: counts, shares,
 *     channel/narrative/topic distribution per period. Nothing here states,
 *     implies, or is phrased to suggest a causal relationship between
 *     periods or between the anchor and anything else. The anchor is a
 *     user-authored sampling reference, not an identified cause.
 *
 * Pure and DOM-free. Deterministic.
 */

import type { CandidateVideo } from '../model/types';
import type { TimeMachineConfig } from '../model/viewpoint';
import type { ClassificationLookup } from '../discovery/coverage';
import { isUnknownDate } from '../model/discovery';

export type TimePeriodKey =
  | 'pre-event'
  | 'during-event'
  | 'post-event'
  | 'retrospective'
  | 'before-window'
  | 'unclassifiable';

export const TIME_PERIOD_LABELS: Record<TimePeriodKey, string> = {
  'pre-event': 'Pre-event (published before the anchor)',
  'during-event': 'During-event (published in the anchor window)',
  'post-event': 'Post-event (published after the anchor window)',
  retrospective: 'Retrospective (published long after)',
  'before-window': 'Before the pre-event window',
  unclassifiable: 'Unclassifiable (publication date unknown)',
};

/** A period's exact bounds as ms timestamps; null = open-ended. */
export interface TimePeriodBounds {
  key: TimePeriodKey;
  from: number | null;
  to: number | null;
}

/** Compute the exact bounds of every period from a config. Deterministic. */
export function timePeriodBounds(config: TimeMachineConfig): TimePeriodBounds[] {
  const anchor = Date.parse(config.anchorDate);
  const day = 86_400_000;
  const duringEnd = anchor + Math.max(0, config.duringEventDays) * day;
  return [
    {
      key: 'pre-event',
      from: anchor - Math.max(0, config.preEventDays) * day,
      to: anchor - 1,
    },
    { key: 'during-event', from: anchor, to: duringEnd - 1 },
    { key: 'post-event', from: duringEnd, to: duringEnd + Math.max(0, config.postEventDays) * day - 1 },
    {
      key: 'retrospective',
      from: anchor + Math.max(0, config.retrospectiveAfterDays) * day,
      to: null,
    },
  ];
}

/**
 * Which period does a candidate's publication date fall in?
 * Evidence-gated: unknown/unparseable dates are 'unclassifiable'.
 */
export function classifyTimePeriod(
  candidate: CandidateVideo,
  config: TimeMachineConfig,
): TimePeriodKey {
  if (isUnknownDate(candidate.publishedAt)) return 'unclassifiable';
  const ts = Date.parse(candidate.publishedAt);
  if (Number.isNaN(ts)) return 'unclassifiable';
  const anchor = Date.parse(config.anchorDate);
  if (Number.isNaN(anchor)) return 'unclassifiable';
  const day = 86_400_000;
  const duringEnd = anchor + Math.max(0, config.duringEventDays) * day;
  if (ts < anchor - Math.max(0, config.preEventDays) * day) return 'before-window';
  if (ts < anchor) return 'pre-event';
  if (ts < duringEnd) return 'during-event';
  if (ts < duringEnd + Math.max(0, config.postEventDays) * day) return 'post-event';
  if (ts >= anchor + Math.max(0, config.retrospectiveAfterDays) * day) return 'retrospective';
  // Gap between post-event end and retrospective start: unclassifiable
  // would fabricate precision; these dates fall between authored windows.
  return 'before-window';
}

/** Candidates that fall in one named period (publication-date evidence). */
export function candidatesInPeriod(
  candidates: CandidateVideo[],
  period: TimePeriodKey,
  config: TimeMachineConfig,
): CandidateVideo[] {
  return candidates.filter((c) => classifyTimePeriod(c, config) === period);
}

export interface PeriodChannelShare {
  channelId: string;
  channelTitle: string;
  count: number;
}

export interface PeriodNarrativeShare {
  clusterId: string;
  count: number;
}

export interface PeriodTopicShare {
  topicId: string;
  count: number;
}

/** One period's descriptive profile. Counts and distributions — nothing else. */
export interface PeriodProfile {
  key: TimePeriodKey;
  label: string;
  candidates: CandidateVideo[];
  channels: PeriodChannelShare[];
  narratives: PeriodNarrativeShare[];
  topics: PeriodTopicShare[];
  /** Distinct source types present (classified via lookup when available). */
  sourceTypes: { key: string; count: number }[];
  unclassifiableDates: number;
}

/**
 * Build a descriptive profile of one period from the candidates the CALLER
 * already assigned to that period (via classifyTimePeriod). Pure: no
 * causal statements anywhere in the output.
 */
export function periodProfile(
  period: TimePeriodKey,
  periodCandidates: CandidateVideo[],
  lookupClassification: ClassificationLookup,
): PeriodProfile {
  const channels = new Map<string, PeriodChannelShare>();
  const narratives = new Map<string, PeriodNarrativeShare>();
  const topics = new Map<string, PeriodTopicShare>();
  const sourceTypes = new Map<string, { key: string; count: number }>();
  let unclassifiableDates = 0;

  for (const c of periodCandidates) {
    const ch = channels.get(c.channelId) ?? {
      channelId: c.channelId,
      channelTitle: c.channelTitle,
      count: 0,
    };
    ch.count += 1;
    channels.set(c.channelId, ch);
    for (const n of c.narrativeClusterIds) {
      const entry = narratives.get(n) ?? { clusterId: n, count: 0 };
      entry.count += 1;
      narratives.set(n, entry);
    }
    for (const t of c.topicIds) {
      const entry = topics.get(t) ?? { topicId: t, count: 0 };
      entry.count += 1;
      topics.set(t, entry);
    }
    const cls = lookupClassification(c.id);
    const st = cls?.sourceType.value ?? 'unknown';
    const stEntry = sourceTypes.get(st) ?? { key: st, count: 0 };
    stEntry.count += 1;
    sourceTypes.set(st, stEntry);
    if (isUnknownDate(c.publishedAt)) unclassifiableDates += 1;
  }

  return {
    key: period,
    label: TIME_PERIOD_LABELS[period],
    candidates: periodCandidates,
    channels: [...channels.values()].sort((a, b) => b.count - a.count || a.channelId.localeCompare(b.channelId)),
    narratives: [...narratives.values()].sort((a, b) => b.count - a.count || a.clusterId.localeCompare(b.clusterId)),
    topics: [...topics.values()].sort((a, b) => b.count - a.count || a.topicId.localeCompare(b.topicId)),
    sourceTypes: [...sourceTypes.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    unclassifiableDates,
  };
}

export interface TimeMachineComparison {
  /** Profiles per period, always including empty ones (honest emptiness). */
  profiles: PeriodProfile[];
  /** Total candidates considered. */
  total: number;
  /** Candidates whose publication date could not establish a period. */
  unclassifiable: number;
  /** Descriptive statement of what was compared. Facts only. */
  summary: string;
}

/**
 * Descriptive comparison across the four named periods. The output states
 * counts and distributions; it deliberately contains no language that
 * could be read as a causal claim about the anchor or the periods.
 */
export function comparePeriods(
  candidates: CandidateVideo[],
  config: TimeMachineConfig,
  lookupClassification: ClassificationLookup,
): TimeMachineComparison {
  const order: TimePeriodKey[] = [
    'before-window',
    'pre-event',
    'during-event',
    'post-event',
    'retrospective',
    'unclassifiable',
  ];
  let unclassifiable = 0;
  const buckets = new Map<TimePeriodKey, CandidateVideo[]>();
  for (const key of order) buckets.set(key, []);
  for (const c of candidates) {
    const key = classifyTimePeriod(c, config);
    buckets.get(key)!.push(c);
    if (key === 'unclassifiable') unclassifiable += 1;
  }
  const profiles = order.map((key) =>
    periodProfile(key, buckets.get(key)!, lookupClassification),
  );
  const parts: string[] = [];
  for (const p of profiles) {
    if (p.candidates.length > 0) {
      parts.push(`${TIME_PERIOD_LABELS[p.key]}: ${p.candidates.length}`);
    }
  }
  const summary =
    `Descriptive comparison around anchor ${config.anchorDate.slice(0, 10)} (user-authored). ` +
    `Counts by period: ${parts.join('; ')}.` +
    (unclassifiable > 0
      ? ` ${unclassifiable} candidate(s) have no establishable publication date and are not assigned to any period.`
      : '') +
    ' This comparison describes when material was published relative to the anchor. It does not establish or imply any causal relationship.';
  return { profiles, total: candidates.length, unclassifiable, summary };
}