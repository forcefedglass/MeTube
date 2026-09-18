/**
 * MeTube provisional domain model.
 *
 * PROVISIONAL — these types describe the discovery graph at bootstrap
 * fidelity. They are expected to evolve as real discovery providers land.
 * Nothing outside this repository should rely on their stability yet.
 *
 * Core stance encoded here: feedback is explicit. Watch time, clicks, and
 * dwell are deliberately NOT part of the model.
 */

/** YouTube video id (11 characters in practice; not validated here). */
export type VideoId = string;
export type ChannelId = string;
export type TopicId = string;
export type NarrativeClusterId = string;
export type DiscoverySourceId = string;
export type FeedbackId = string;
/** Viewpoint id. Stable per Viewpoint; demo ids are prefixed `vp-demo-`. */
export type ViewpointId = string;

/**
 * Reference to the Viewpoint that generated a feed. Embedded in snapshots so
 * any feed can always answer "which lens produced this?"
 */
export interface ViewpointRef {
  id: ViewpointId;
  title: string;
}

/** ISO-8601 timestamp string, e.g. "2025-11-02T14:00:00Z". */
export type Iso8601 = string;

/**
 * A video candidate surfaced by a candidate provider. Candidates are raw
 * material; nothing here says anything about quality or preference.
 */
export interface CandidateVideo {
  id: VideoId;
  title: string;
  channelId: ChannelId;
  channelTitle: string;
  description: string;
  publishedAt: Iso8601;
  durationSeconds: number;
  topicIds: TopicId[];
  narrativeClusterIds: NarrativeClusterId[];
  /** Discovery source that surfaced this candidate first. */
  discoveredVia: DiscoverySourceId;
  /** Other discovery sources that also surfaced this candidate. */
  alsoSeenVia: DiscoverySourceId[];
}

/**
 * Scale band for a channel. Used for scale diversity in the feed — never
 * as a quality judgment.
 */
export type ChannelScaleBand = 'obscure' | 'small' | 'mid' | 'large' | 'mega';

export interface ChannelProfile {
  id: ChannelId;
  title: string;
  description: string;
  scaleBand: ChannelScaleBand;
  topicIds: TopicId[];
}

export interface Topic {
  id: TopicId;
  label: string;
  description: string;
}

/**
 * A cluster of videos telling a recognizably similar story about a topic.
 * Narrative clusters describe *how a story is told*, never who is right.
 */
export interface NarrativeCluster {
  id: NarrativeClusterId;
  label: string;
  description: string;
  topicId: TopicId;
}

export type DiscoverySourceKind =
  | 'editorial'
  | 'community'
  | 'citation-follow'
  | 'search'
  | 'random-walk'
  | 'fixture';

/** Where candidates come from. Independent of YouTube's own recommendations. */
export interface DiscoverySource {
  id: DiscoverySourceId;
  label: string;
  kind: DiscoverySourceKind;
  description: string;
}

/**
 * Explicit user feedback only. The set is intentionally small and explicit:
 * the user said something, we recorded it. Nothing is inferred.
 */
export type FeedbackKind =
  | 'watched'
  | 'skipped'
  | 'saved'
  | 'not-interested'
  | 'more-like-this';

export interface UserFeedback {
  id: FeedbackId;
  videoId: VideoId;
  kind: FeedbackKind;
  capturedAt: Iso8601;
}

/** User profile built from explicit signals only. */
export interface UserProfile {
  /** Topics the user explicitly declared interest in (not inferred). */
  declaredInterests: TopicId[];
  feedback: UserFeedback[];
  mutedChannelIds: ChannelId[];
  updatedAt: Iso8601;
}

export function emptyUserProfile(now: Iso8601): UserProfile {
  return { declaredInterests: [], feedback: [], mutedChannelIds: [], updatedAt: now };
}

/** The named, additive components of a feed candidate's score. */
export type RankComponentName =
  | 'relevance'
  | 'sourceNovelty'
  | 'topicNovelty'
  | 'narrativeNovelty'
  | 'temporalDiversity'
  | 'controlledExploration'
  | 'repetition'
  | 'sourceConcentration';

export type RankComponents = Record<RankComponentName, number>;

/** Human-readable label for each named component. */
export const RANK_COMPONENT_LABELS: Record<RankComponentName, string> = {
  relevance: 'Relevance',
  sourceNovelty: 'Source novelty',
  topicNovelty: 'Topic novelty',
  narrativeNovelty: 'Narrative novelty',
  temporalDiversity: 'Temporal diversity',
  controlledExploration: 'Controlled exploration',
  repetition: 'Repetition',
  sourceConcentration: 'Source concentration',
};

/** One ranked item in a feed, with everything needed to explain it. */
export interface FeedCandidate {
  candidate: CandidateVideo;
  /** Total score: the weighted sum of `components`. */
  score: number;
  components: RankComponents;
  /** Weighted component values, aligned with `components`. */
  weighted: RankComponents;
  /** "Why this appeared" — one line, built from the components. */
  reason: string;
  /** Per-component explanation strings. Always populated for every component. */
  explanations: Record<RankComponentName, string>;
}

/** A materialized feed plus what it was assembled from. */
export interface FeedSnapshot {
  id: string;
  createdAt: Iso8601;
  feed: FeedCandidate[];
  /** Number of candidates considered (after muting). */
  consideredCount: number;
  /** Number of candidates dropped because their channel is muted. */
  mutedCount: number;
  /**
   * The Viewpoint that generated this snapshot, when one was active.
   * Feeds assembled without a Viewpoint record `null` (bootstrap path).
   */
  viewpoint: ViewpointRef | null;
}