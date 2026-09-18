/**
 * Viewpoint interpretation — pure and deterministic.
 *
 * A Viewpoint's config is user-facing and expressive; this module converts
 * it into the concrete parameters the ranking engine consumes:
 *   - hard filters (candidate in/out)
 *   - derived rank weights
 *   - assembly limits (repetition, source concentration)
 *
 * Every rule is deterministic and testable: same config + same candidates
 * -> same result, always. No randomness, no inference.
 */

import type {
  CandidateVideo,
  ChannelScaleBand,
  UserProfile,
} from '../model/types';
import type { ViewpointConfig, WeightOverride } from '../model/viewpoint';
import type { RankWeights } from '../ranking/components';
import { DEFAULT_WEIGHTS } from '../ranking/components';

/** Hard constraints applied before ranking. */
export interface ViewpointFilters {
  /** Topic whitelist; empty means no topic constraint. */
  positiveTopics: Set<string>;
  /** Topic blacklist; a candidate touching any is dropped. */
  negativeTopics: Set<string>;
  /** Discovery source whitelist; empty means any source. */
  sources: Set<string>;
  /** Publication date window; undefined = unbounded. */
  from?: number;
  to?: number;
}

export interface ViewpointAssemblyLimits {
  /** Max items from any one channel in the final feed. */
  repetitionLimit: number;
  /** Max share [0,1] of the feed one channel may occupy. */
  sourceConcentrationLimit: number;
}

export interface ViewpointRankTuning {
  weights: RankWeights;
  /** Effective exploration percentage [0,1]. */
  explorationPercent: number;
  unfamiliarityTarget: string;
  narrativeDiversityTarget: string;
}

export interface ViewpointInterpretation {
  filters: ViewpointFilters;
  limits: ViewpointAssemblyLimits;
  tuning: ViewpointRankTuning;
}

/** Deterministic: interpret a config into engine parameters. */
export function interpretViewpoint(config: ViewpointConfig): ViewpointInterpretation {
  const filters: ViewpointFilters = {
    positiveTopics: new Set(config.positiveTopicConstraints),
    negativeTopics: new Set(config.negativeTopicConstraints),
    sources: new Set(config.sourceConstraints),
    from: config.temporalFrom !== undefined ? Date.parse(config.temporalFrom) : undefined,
    to: config.temporalTo !== undefined ? Date.parse(config.temporalTo) : undefined,
  };
  const limits: ViewpointAssemblyLimits = {
    repetitionLimit: Math.max(1, Math.trunc(config.repetitionLimit)),
    sourceConcentrationLimit: clamp01(config.sourceConcentrationLimit),
  };
  const tuning: ViewpointRankTuning = {
    weights: applyWeightOverrides(DEFAULT_WEIGHTS, config.weightOverrides),
    explorationPercent: clamp01(config.explorationPercent),
    unfamiliarityTarget: config.unfamiliarityTarget,
    narrativeDiversityTarget: config.narrativeDiversityTarget,
  };
  return { filters, limits, tuning };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function applyWeightOverrides(
  base: RankWeights,
  overrides: WeightOverride[],
): RankWeights {
  const out: RankWeights = { ...base };
  for (const o of overrides) {
    out[o.component] = o.value;
  }
  return out;
}

/** Hard filter: does this candidate pass the Viewpoint's constraints? */
export function candidatePasses(
  candidate: CandidateVideo,
  filters: ViewpointFilters,
): boolean {
  if (
    filters.positiveTopics.size > 0 &&
    !candidate.topicIds.some((t) => filters.positiveTopics.has(t))
  ) {
    return false;
  }
  if (
    filters.negativeTopics.size > 0 &&
    candidate.topicIds.some((t) => filters.negativeTopics.has(t))
  ) {
    return false;
  }
  if (
    filters.sources.size > 0 &&
    !filters.sources.has(candidate.discoveredVia) &&
    !candidate.alsoSeenVia.some((s) => filters.sources.has(s))
  ) {
    return false;
  }
  const published = Date.parse(candidate.publishedAt);
  if (Number.isNaN(published)) return false;
  if (filters.from !== undefined && !Number.isNaN(filters.from) && published < filters.from) return false;
  if (filters.to !== undefined && !Number.isNaN(filters.to) && published > filters.to) return false;
  return true;
}

/**
 * Deterministic check that a candidate matches the Viewpoint's *soft*
 * preferences, used as tie-breaking guidance. Each match adds 1.
 */
export function softPreferenceScore(
  candidate: CandidateVideo,
  channelOf: (channelId: string) => ChannelScaleBand | undefined,
  config: ViewpointConfig,
): number {
  let score = 0;
  if (config.channelSizePreferences.length > 0) {
    const band = channelOf(candidate.channelId);
    if (band !== undefined && config.channelSizePreferences.includes(band)) score += 1;
  }
  return score;
}

/** Unfamiliarity check against explicit feedback only. Never inferred. */
export function isFamiliar(
  candidate: CandidateVideo,
  profile: UserProfile,
): boolean {
  return profile.feedback.some(
    (f) => f.videoId === candidate.id && (f.kind === 'watched' || f.kind === 'saved' || f.kind === 'more-like-this'),
  );
}

/** Deterministic unfamiliarity gate for the configured target. */
export function passesUnfamiliarity(
  candidate: CandidateVideo,
  profile: UserProfile,
  target: string,
): boolean {
  const familiar = isFamiliar(candidate, profile);
  if (target === 'strictly-unfamiliar') return !familiar;
  if (target === 'mostly-unfamiliar') return true;
  return true;
}