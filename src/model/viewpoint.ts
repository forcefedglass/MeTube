/**
 * Viewpoint domain model — PROVISIONAL.
 *
 * A Viewpoint is a user-controlled discovery/ranking lens. Activating one
 * generates a Viewstream (a feed produced through that lens).
 *
 * Design rules (FROZEN for Phase 1):
 *   - A Viewpoint is NOT a search query and NOT necessarily political.
 *   - It is completely inspectable and editable. Every field that can shape
 *     a feed is visible and changeable by the user.
 *   - No political ideology inference. For political Viewpoints, any
 *     statement about the user's own political baseline must be text the
 *     user wrote themselves (`baselineContext`). Nothing is inferred from
 *     clicks or watch history.
 *   - Interpretation of a Viewpoint's constraints is deterministic and
 *     testable (see src/viewpoints/interpret.ts).
 */

import type {
  ChannelId,
  ChannelScaleBand,
  DiscoverySourceId,
  FeedbackKind,
  Iso8601,
  NarrativeClusterId,
  TopicId,
  ViewpointId,
} from './types';
import type { ExposureBudget } from './exposure';

/** What familiarity target the Viewpoint asks for. */
export type UnfamiliarityTarget =
  | 'any'
  | 'mostly-unfamiliar'
  | 'strictly-unfamiliar';

/** How hard the Viewpoint pushes for narrative spread. */
export type NarrativeDiversityTarget =
  | 'any'
  | 'mixed-narratives'
  | 'max-narrative-spread';

/** How the Viewpoint samples publication dates. */
export type TemporalSampling =
  | 'any'
  | 'recent'
  | 'historical'
  | 'wide-window';

export type SourceTypePreference =
  | DiscoverySourceId
  | 'editorial'
  | 'community'
  | 'citation-follow'
  | 'search'
  | 'random-walk'
  | 'fixture';

/** A single explicit weighting override. */
export interface WeightOverride {
  component: 'relevance'
    | 'sourceNovelty'
    | 'topicNovelty'
    | 'narrativeNovelty'
    | 'temporalDiversity'
    | 'controlledExploration'
    | 'repetition'
    | 'sourceConcentration';
  value: number;
}

/**
 * Language/region preference. Both fields optional: unknown means "no
 * constraint". Never used to infer anything about the user.
 */
export interface LocalePreference {
  /** ISO 639-1 language code when known, e.g. "ja". */
  language?: string;
  /** ISO 3166-1 region code when known, e.g. "JP". */
  region?: string;
}

/**
 * The inspectable configuration of a Viewpoint. Every field is optional
 * except title and enabled; omitted constraints mean "no constraint".
 */
export interface ViewpointConfig {
  /** Seed topics — the entry points into the discovery graph. */
  seedTopics: TopicId[];
  /** Free-text seed concepts for search-based acquisition. */
  seedConcepts: string[];
  /** Channel handles/urls whose uploads are explicit acquisition starts. */
  seedChannels: string[];
  /** Playlist ids/urls that are explicit acquisition starts. */
  seedPlaylists: string[];
  /** Candidate must touch at least one of these topics (OR). */
  positiveTopicConstraints: TopicId[];
  /** Candidate must touch none of these topics (NOT). */
  negativeTopicConstraints: TopicId[];
  /** Candidate must have been surfaced by at least one of these sources. */
  sourceConstraints: DiscoverySourceId[];
  /** Prefer these source kinds; soft preference, not a hard filter. */
  sourceTypePreferences: SourceTypePreference[];
  /** Minimum familiarity requirement (hard-ish guide for ranking). */
  unfamiliarityTarget: UnfamiliarityTarget;
  /** Narrative spread request (guide for ranking). */
  narrativeDiversityTarget: NarrativeDiversityTarget;
  /** Temporal range/sampling request. */
  temporal: TemporalSampling;
  temporalFrom?: Iso8601;
  temporalTo?: Iso8601;
  /** Preferred channel size bands (soft). */
  channelSizePreferences: ChannelScaleBand[];
  /** Geographic/language preferences when known (soft). */
  locale: LocalePreference;
  /** Fraction [0,1] of feed budget for exploration (soft). */
  explorationPercent: number;
  /** Max items from one source in the final feed (hard). */
  repetitionLimit: number;
  /** Max share of feed [0,1] one channel may occupy (hard). */
  sourceConcentrationLimit: number;
  /** Explicit per-component weighting overrides. */
  weightOverrides: WeightOverride[];
  /** User-written baseline/context, shown and editable verbatim. */
  baselineContext: string;
  /**
   * User-authored temporary premises for this Viewpoint (Phase 3).
   * Examples: "My normal information environment generally favors X.",
   * "I already see substantial coverage from Y.",
   * "For this Viewpoint I want to understand arguments associated with Z."
   * Assumptions belong to the Viewpoint, never to the user's identity;
   * they are shown and edited verbatim and never influence anything
   * silently.
   */
  assumptions: string[];
  /**
   * Exposure budget (Phase 4): visible, editable bounds on how this
   * Viewpoint's Viewstream spends its slots — max single-channel share,
   * min unfamiliar share, cooldowns, and more. Every rule is enforced (or
   * honestly reported as violated) by the composer. See
   * src/model/exposure.ts.
   */
  exposureBudget: ExposureBudget;
  /**
   * Time Machine (Phase 5): user-authored temporal sampling for this
   * Viewpoint. A named anchor date plus optional labels for the periods
   * around it. All fields are user-authored facts about what to sample —
   * never claims about what caused what. See src/viewpoints/timemachine.ts.
   */
  timeMachine?: TimeMachineConfig;
}

/**
 * Time Machine configuration on a Viewpoint.
 *
 * DESCRIPTIVE RULES (FROZEN):
 *   - The anchor date and period labels are user-authored. MeTube never
 *     decides what counts as "the event".
 *   - Periods are defined by the anchor: pre-event / during-event /
 *     post-event / retrospective are TEMPORAL POSITIONS relative to the
 *     anchor, computed from publication dates. A publication date that
 *     cannot be established puts the candidate in 'unclassifiable' for
 *     that period — never a guess.
 *   - The comparison between periods is DESCRIPTIVE: counts and shares.
 *     It never states or implies causal relationships between periods.
 */
export interface TimeMachineConfig {
  /** User-authored ISO date the periods are computed around. */
  anchorDate: Iso8601;
  /** Window (days) each named period spans from the anchor. */
  preEventDays: number;
  duringEventDays: number;
  postEventDays: number;
  /** Retrospective period starts this many days after the anchor. */
  retrospectiveAfterDays: number;
}

export interface Viewpoint {
  id: ViewpointId;
  title: string;
  description: string;
  config: ViewpointConfig;
  /** true when selectable/generatable. Disabled Viewpoints never generate. */
  enabled: boolean;
  createdAt: Iso8601;
  updatedAt: Iso8601;
  /**
   * Fork lineage (Phase 5): set when this Viewpoint was created by
   * duplicating another and changing one assumption. The changed assumption
   * is recorded verbatim (user-authored text); it is a statement about the
   * fork operation, never an inferred difference.
   */
  forkedFrom?: {
    viewpointId: ViewpointId;
    viewpointTitle: string;
    changedAssumption: string;
    forkedAt: Iso8601;
  };
}

/**
 * A Viewlist: named collection of Viewpoints. Membership is by id, so
 * deleting a Viewpoint just removes it from lists on resolve.
 */
export interface Viewlist {
  id: string;
  title: string;
  description: string;
  viewpointIds: ViewpointId[];
  createdAt: Iso8601;
  updatedAt: Iso8601;
}

export function defaultViewpointConfig(): ViewpointConfig {
  return {
    seedTopics: [],
    seedConcepts: [],
    seedChannels: [],
    seedPlaylists: [],
    positiveTopicConstraints: [],
    negativeTopicConstraints: [],
    sourceConstraints: [],
    sourceTypePreferences: [],
    unfamiliarityTarget: 'any',
    narrativeDiversityTarget: 'any',
    temporal: 'any',
    temporalFrom: undefined,
    temporalTo: undefined,
    channelSizePreferences: [],
    locale: {},
    explorationPercent: 0.15,
    repetitionLimit: 1,
    sourceConcentrationLimit: 0.5,
    weightOverrides: [],
    baselineContext: '',
    assumptions: [],
    exposureBudget: {},
  };
}

/** Create a new Viewpoint with defaults. */
export function newViewpoint(
  id: ViewpointId,
  title: string,
  description: string,
  now: Iso8601,
  partial?: Partial<ViewpointConfig>,
): Viewpoint {
  return {
    id,
    title,
    description,
    config: { ...defaultViewpointConfig(), ...partial },
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Duplicate a Viewpoint under a new id. Copies the config and all fields;
 * the caller supplies the new title/id and timestamp.
 */
export function duplicateViewpoint(
  source: Viewpoint,
  id: ViewpointId,
  title: string,
  now: Iso8601,
): Viewpoint {
  return {
    ...source,
    id,
    title,
    config: structuredCloneConfig(source.config),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Serialize a ViewpointConfig deterministically — used to test that
 * interpretation is a pure function of configuration.
 */
export function structuredCloneConfig(config: ViewpointConfig): ViewpointConfig {
  return JSON.parse(JSON.stringify(config)) as ViewpointConfig;
}

/**
 * Fork a Viewpoint (Phase 5): duplicate it AND record the single assumption
 * the user changed, plus lineage. The changed assumption is user-authored
 * text recorded verbatim — a statement about the fork operation, never an
 * inferred difference.
 */
export function forkViewpoint(
  source: Viewpoint,
  id: ViewpointId,
  title: string,
  changedAssumption: string,
  now: Iso8601,
): Viewpoint {
  return {
    ...duplicateViewpoint(source, id, title, now),
    forkedFrom: {
      viewpointId: source.id,
      viewpointTitle: source.title,
      changedAssumption,
      forkedAt: now,
    },
  };
}

/**
 * One-line summary of what a Viewpoint asks for, shown on the feed.
 * Deliberately plain: it restates constraints, it does not editorialize.
 */
export function summarizeViewpoint(vp: Viewpoint): string {
  const parts: string[] = [];
  if (vp.config.positiveTopicConstraints.length > 0) {
    parts.push(`topics: ${vp.config.positiveTopicConstraints.join(' | ')}`);
  }
  if (vp.config.negativeTopicConstraints.length > 0) {
    parts.push(`excluding: ${vp.config.negativeTopicConstraints.join(' | ')}`);
  }
  if (vp.config.unfamiliarityTarget !== 'any') {
    parts.push(vp.config.unfamiliarityTarget);
  }
  if (vp.config.narrativeDiversityTarget !== 'any') {
    parts.push(vp.config.narrativeDiversityTarget);
  }
  if (vp.config.temporal !== 'any') {
    parts.push(vp.config.temporal);
  }
  if (vp.config.channelSizePreferences.length > 0) {
    parts.push(`channel size: ${vp.config.channelSizePreferences.join(' | ')}`);
  }
  if (vp.config.assumptions.length > 0) {
    parts.push(`${vp.config.assumptions.length} assumption(s), shown below`);
  }
  const budgetRules = Object.keys(vp.config.exposureBudget).length;
  if (budgetRules > 0) {
    parts.push(`exposure budget: ${budgetRules} rule(s), shown below`);
  }
  if (parts.length === 0) return 'no constraints';
  return parts.join(' · ');
}