/**
 * Classification domain model — Phase 3: the information map.
 *
 * The information map describes *how videos differ* without reducing
 * everything to left/right ideology. Six dimensions, each independently
 * inspectable:
 *
 *   TOPICS              what the video is materially about
 *   SOURCE TYPE         what kind of source produced it
 *   NARRATIVE CLUSTER   which similar claim/framing family it belongs to
 *   TEMPORAL POSITION   when it sits relative to its subject and to now
 *   CHANNEL FAMILIARITY how often the viewer has seen this source here
 *   PROVENANCE          how the video, its channel, its sources, and its
 *                       topics actually relate (only evidenced edges)
 *
 * Design rules (FROZEN for Phase 3):
 *   - Every machine-derived classification is a ClassifiedValue: a value
 *     that may be UNKNOWN, plus confidence, origin, method, and evidence.
 *   - UNKNOWN is preferable to invented certainty. Classifiers must be
 *     conservative: they may classify only from evidence actually present
 *     in candidate data.
 *   - NO political scoring. Source types, topics, temporal positions, and
 *     narrative clusters describe material and framing — never party
 *     affiliation, voting preference, or ideological identity. Political
 *     labels appear only when a public organization/argument is being
 *     explicitly described, or when the user wrote them into their own
 *     Viewpoint.
 *   - User overrides always win over machine classification, and always
 *     survive regeneration. Overrides are keyed by videoId + dimension.
 *   - No fabricated relationships. Provenance edges only exist when the
 *     underlying candidate data evidences them.
 *
 * Everything in this module is pure and DOM-free.
 */

import type {
  ChannelId,
  DiscoverySourceId,
  Iso8601,
  NarrativeClusterId,
  TopicId,
  VideoId,
} from './types';

// ---------------------------------------------------------------------------
// Source type taxonomy
// ---------------------------------------------------------------------------

/**
 * What kind of source produced a video. This is about *production and
 * standing*, not quality and not politics: a technical analyst channel and
 * a hobbyist channel can both be "independent", but they differ in what
 * they claim to be doing.
 */
export type SourceType =
  | 'official' // official/company body: agency, manufacturer, agency channel
  | 'publication' // publication/media outlet with editorial process
  | 'independent-creator' // self-published individual creator
  | 'enthusiast-community' // community/enthusiast forum-adjacent channel
  | 'technical-analyst' // data/method-driven analysis channel
  | 'academic-expert' // credentialed expert or research institution
  | 'primary-source' // the footage/document itself, minimally mediated
  | 'promotional-sponsored' // promotional or sponsored content WHERE EVIDENCED
  | 'unknown';

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  official: 'Official / company',
  publication: 'Publication / media',
  'independent-creator': 'Independent creator',
  'enthusiast-community': 'Enthusiast / community',
  'technical-analyst': 'Technical analyst',
  'academic-expert': 'Academic / expert',
  'primary-source': 'Primary source',
  'promotional-sponsored': 'Promotional / sponsored (evidenced)',
  unknown: 'Unknown',
};

export const SOURCE_TYPES: SourceType[] = [
  'official',
  'publication',
  'independent-creator',
  'enthusiast-community',
  'technical-analyst',
  'academic-expert',
  'primary-source',
  'promotional-sponsored',
  'unknown',
];

// ---------------------------------------------------------------------------
// Temporal position
// ---------------------------------------------------------------------------

/**
 * Where a video sits in time relative to its subject and to now. Only
 * establishable positions are assigned; "where this can actually be
 * established" — otherwise UNKNOWN.
 */
export type TemporalPosition =
  | 'contemporary' // published near the events it discusses (live coverage era)
  | 'historical' // published long after (or about a long-past era)
  | 'pre-event' // published before the events it anticipates
  | 'post-event' // published after events it references
  | 'retrospective' // explicitly looking back at an era/period
  | 'unknown';

export const TEMPORAL_POSITIONS: TemporalPosition[] = [
  'contemporary',
  'historical',
  'pre-event',
  'post-event',
  'retrospective',
  'unknown',
];

export const TEMPORAL_POSITION_LABELS: Record<TemporalPosition, string> = {
  contemporary: 'Contemporary (published near its subject)',
  historical: 'Historical (long-past subject or long gap)',
  'pre-event': 'Pre-event (published before what it anticipates)',
  'post-event': 'Post-event (published after what it references)',
  retrospective: 'Retrospective (explicitly looking back)',
  unknown: 'Unknown',
};

// ---------------------------------------------------------------------------
// Classified values
// ---------------------------------------------------------------------------

/**
 * How a classification value came to exist.
 *   user-override  — the user set it; always wins; never regenerated away.
 *   classifier     — deterministic rules over candidate evidence.
 *   provider       — carried from the discovery provider itself (fixtures).
 */
export type ClassificationOrigin =
  | 'user-override'
  | 'classifier'
  | 'provider';

/**
 * One classified value with its full audit trail. `value` is a string so
 * UNKNOWN and future dimensions stay representable; callers validate it
 * against the dimension's value set.
 */
export interface ClassifiedValue<T extends string = string> {
  /** The classified value. 'unknown' when not establishable. */
  value: T;
  /** Confidence in [0,1]. 0 = a guess, 1 = certain. User overrides are 1. */
  confidence: number;
  /** Where this classification came from. */
  origin: ClassificationOrigin;
  /** Method name/identifier, e.g. 'channel-lexicon', 'user', 'fixture'. */
  method: string;
  /** Evidence actually present in the candidate data (cited, not invented). */
  evidence: string;
}

/** The classification dimensions of one video. */
export interface VideoClassification {
  videoId: VideoId;
  /** What this is materially about. */
  topics: ClassifiedValue<TopicId | 'unknown'>[];
  /** What kind of source produced it. */
  sourceType: ClassifiedValue<SourceType>;
  /** Which claim/framing family it belongs to. */
  narrativeCluster: ClassifiedValue<NarrativeClusterId | 'unknown'>;
  /** Where it sits relative to its subject and to now. */
  temporalPosition: ClassifiedValue<TemporalPosition>;
}

export function unknownClassification(videoId: VideoId): VideoClassification {
  return {
    videoId,
    topics: [],
    sourceType: unknownValue(),
    narrativeCluster: unknownValue<NarrativeClusterId | 'unknown'>(),
    temporalPosition: unknownValue<TemporalPosition>(),
  };
}

function unknownValue<T extends string>(): ClassifiedValue<T> {
  return {
    value: 'unknown' as T,
    confidence: 0,
    origin: 'classifier',
    method: 'no-evidence',
    evidence: 'No evidence available in the candidate data.',
  };
}

// ---------------------------------------------------------------------------
// Channel familiarity
// ---------------------------------------------------------------------------

/**
 * How familiar a channel is *within MeTube*: countable from explicit
 * feedback and pool sightings only. Never watch history, never YouTube
 * recommendations. A channel is "known" when MeTube has already surfaced
 * it; exposure frequency counts how often.
 */
export type ChannelFamiliarity =
  | 'never-seen'
  | 'seen-once'
  | 'seen-few' // 2–5 pool sightings
  | 'seen-often' // 6+ pool sightings
  | 'familiar' // explicit positive feedback exists (watched/saved/more-like-this)
  | 'unknown';

export const CHANNEL_FAMILIARITY_LABELS: Record<ChannelFamiliarity, string> = {
  'never-seen': 'Never seen in Slipgate',
  'seen-once': 'Seen once in Slipgate',
  'seen-few': 'Seen a few times in Slipgate',
  'seen-often': 'Seen often in Slipgate',
  familiar: 'Familiar (explicit feedback recorded)',
  unknown: 'Unknown',
};

/** Raw countable signals behind familiarity (facts, not opinions). */
export interface ChannelFamiliarityFacts {
  channelId: ChannelId;
  poolSightings: number;
  explicitFeedbackCount: number;
}

/**
 * Derive familiarity from countable facts. Deterministic; explicit
 * feedback outranks pool frequency.
 */
export function classifyChannelFamiliarity(
  facts: ChannelFamiliarityFacts,
): ChannelFamiliarity {
  if (facts.explicitFeedbackCount > 0) return 'familiar';
  if (facts.poolSightings === 0) return 'never-seen';
  if (facts.poolSightings === 1) return 'seen-once';
  if (facts.poolSightings <= 5) return 'seen-few';
  return 'seen-often';
}

// ---------------------------------------------------------------------------
// Provenance edges (the source ecosystem graph)
// ---------------------------------------------------------------------------

/**
 * Evidence-backed relationships between entities in the information map.
 * Edges are only created where candidate data evidences them — the map
 * never invents a relationship to fill a gap. See docs/CLASSIFICATION.md
 * for the full no-fabrication rules.
 */
export type ProvenanceEdgeKind =
  | 'surfaced-by' // video -> discovery source that surfaced it
  | 'published-by' // video -> channel that published it
  | 'discusses-topic' // video -> topic
  | 'belongs-to-cluster' // video -> narrative cluster
  | 'found-through' // video -> parent video/channel (acquisition path)
  | 'discovered-by-viewpoint' // video -> Viewpoint whose plan surfaced it
  | 'feedback-on' // feedback -> video (explicit user signal)
  | 'seed-topic-of' // topic -> Viewpoint (explicit user seed)
  | 'seed-channel-of' // channel -> Viewpoint (explicit user seed)
  | 'seed-concept-of'; // concept string -> Viewpoint (explicit user seed)

/**
 * One provenance edge. `evidence` cites the concrete data that justifies
 * the edge's existence (e.g. the provenance seed string).
 */
export interface ProvenanceEdge {
  kind: ProvenanceEdgeKind;
  from: string;
  to: string;
  evidence: string;
}

// ---------------------------------------------------------------------------
// Coverage map
// ---------------------------------------------------------------------------

/**
 * One bucket in a coverage histogram. Counts are facts; the bucket key is
 * a classification value or a raw age band.
 */
export interface CoverageBucket {
  key: string;
  label: string;
  count: number;
}

/** Representation across topics, source types, clusters, ages, familiarity. */
export interface CoverageMap {
  totalCandidates: number;
  topics: CoverageBucket[];
  narrativeClusters: CoverageBucket[];
  sourceTypes: CoverageBucket[];
  temporalPositions: CoverageBucket[];
  /** Age bands relative to `asOf`. */
  ageBands: CoverageBucket[];
  /** Channel familiarity within MeTube (explicit feedback + pool sightings). */
  channelFamiliarity: CoverageBucket[];
  /** Channels represented, descending by candidate count. */
  channels: CoverageBucket[];
  /** How many candidates have unknown publication dates. */
  unknownDates: number;
  /** How many candidates have no machine classification at all. */
  unclassified: number;
}

export const AGE_BANDS = [
  { key: 'past-week', label: 'Past week', days: 7 },
  { key: 'past-month', label: 'Past month', days: 30 },
  { key: 'past-year', label: 'Past year', days: 365 },
  { key: 'older', label: 'Older than a year', days: Number.POSITIVE_INFINITY },
  { key: 'unknown', label: 'Unknown date', days: 0 },
] as const;

export type AgeBandKey = (typeof AGE_BANDS)[number]['key'];

// ---------------------------------------------------------------------------
// User overrides
// ---------------------------------------------------------------------------

/**
 * One user override of a machine classification. Overrides always win over
 * any classifier output and always survive pool regeneration (they live in
 * their own KV key, not in the pool).
 */
export interface ClassificationOverride {
  videoId: VideoId;
  /** Which dimension is being overridden. */
  dimension: ClassificationDimension;
  /** The user's chosen value ('unknown' is a valid choice). */
  value: string;
  /** When the user set it. */
  setAt: Iso8601;
  /** Optional user note explaining the override (shown verbatim). */
  note?: string;
}

export type ClassificationDimension =
  | 'topics'
  | 'sourceType'
  | 'narrativeCluster'
  | 'temporalPosition';

export const CLASSIFICATION_DIMENSIONS: ClassificationDimension[] = [
  'topics',
  'sourceType',
  'narrativeCluster',
  'temporalPosition',
];

export const DIMENSION_LABELS: Record<ClassificationDimension, string> = {
  topics: 'Topics',
  sourceType: 'Source type',
  narrativeCluster: 'Narrative cluster',
  temporalPosition: 'Temporal position',
};