/**
 * Blind-spot detection — Phase 4.
 *
 * The first functional COVERAGE / BLIND-SPOT view: which regions of the
 * information map are underrepresented in what the Viewpoint actually
 * surfaced (the composed feed), relative to what the pool could offer.
 *
 * DESCRIPTIVE RULES (FROZEN):
 *   - A blind spot is a region where the POOL has candidates but the FEED
 *     has few or none. It describes a gap in this Viewpoint's output —
 *     never a judgment about which perspectives are correct, superior, or
 *     worth adopting. No underrepresented region is ever described as
 *     something the user "ought to" adopt.
 *   - Unknown classifications are their own region ("unknown"), never
 *     folded into other regions, and never counted as coverage.
 *   - Exploration from a blind spot is user-initiated: the UI offers
 *     "Explore from here"; this module computes what that means (a
 *     candidate list) but never regenerates anything by itself.
 *
 * Pure and deterministic.
 */

import type { CandidateVideo, UserProfile } from '../model/types';
import type { CoverageBucket } from '../model/classification';
import type { ClassificationLookup } from '../discovery/coverage';

/** One underrepresented region, with the facts that make it one. */
export interface BlindSpot {
  /** Which dimension this region belongs to. */
  dimension: 'topic' | 'sourceType' | 'narrativeCluster' | 'temporalPosition' | 'channelFamiliarity' | 'ageBand';
  /** Region key within the dimension (topic id, source type, ...). */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Candidates in the pool inside this region. */
  poolCount: number;
  /** Candidates from this region that made the composed feed. */
  feedCount: number;
  /** Representation ratio in [0,1]; 0 = fully blind. */
  representedShare: number;
  /** Descriptive explanation (facts, no judgment). */
  description: string;
  /** Pool candidates in this region (for user-initiated exploration). */
  sample: CandidateVideo[];
}

export interface BlindSpotView {
  /** All detected blind spots, sorted by severity (pool minus feed). */
  spots: BlindSpot[];
  /** Feed and pool sizes for context. */
  feedSize: number;
  poolSize: number;
  /** Statement of what the feed covers, for the panel header. */
  summary: string;
}

/**
 * Compute blind spots for the active Viewpoint: regions where the pool
 * offers material but the composed feed is thin.
 *
 * `pool` = all candidates available after the Viewpoint's hard filters;
 * `feed` = what was actually composed. A region with pool candidates and
 * zero-or-thin feed presence is a blind spot.
 */
export function computeBlindSpots(
  pool: CandidateVideo[],
  feed: CandidateVideo[],
  lookupClassification: ClassificationLookup,
  profile: UserProfile,
): BlindSpotView {
  const feedIds = new Set(feed.map((c) => c.id));
  const spots: BlindSpot[] = [];

  spots.push(...regionSpots(
    'topic', 'Topic', pool, feed, feedIds, lookupClassification,
    (c) => topicKeys(c, lookupClassification),
  ));
  spots.push(...regionSpots(
    'sourceType', 'Source type', pool, feed, feedIds, lookupClassification,
    (c) => [sourceTypeKey(c, lookupClassification)],
  ));
  spots.push(...regionSpots(
    'narrativeCluster', 'Narrative cluster', pool, feed, feedIds, lookupClassification,
    (c) => c.narrativeClusterIds,
  ));
  spots.push(...regionSpots(
    'temporalPosition', 'Temporal position', pool, feed, feedIds, lookupClassification,
    (c) => [temporalKey(c, lookupClassification)],
  ));

  // Sort: most missed candidates first; deterministic tie-break on key.
  spots.sort(
    (a, b) =>
      (b.poolCount - b.feedCount) - (a.poolCount - a.feedCount) ||
      a.key.localeCompare(b.key),
  );

  const covered = spots.length === 0;
  const summary = covered
    ? `Feed of ${feed.length} covers every pool region that had candidates. No underrepresented region detected at this threshold.`
    : `${spots.length} underrepresented region(s) across topic, source type, narrative cluster, and temporal position dimensions. ` +
      `These are descriptive gaps in what this Viewpoint surfaced, not judgments about which perspectives to adopt.`;

  return {
    spots,
    feedSize: feed.length,
    poolSize: pool.length,
    summary,
  };
}

function topicKeys(
  c: CandidateVideo,
  lookupClassification: ClassificationLookup,
): string[] {
  const cls = lookupClassification(c.id);
  if (cls && cls.topics.length > 0) {
    return cls.topics.map((t) => t.value).filter((v) => v !== 'unknown');
  }
  // Fall back to evidenced ids on the record itself.
  return [...c.topicIds];
}

function sourceTypeKey(
  c: CandidateVideo,
  lookupClassification: ClassificationLookup,
): string {
  const cls = lookupClassification(c.id);
  return cls ? cls.sourceType.value : 'unknown';
}

function temporalKey(
  c: CandidateVideo,
  lookupClassification: ClassificationLookup,
): string {
  const cls = lookupClassification(c.id);
  return cls ? cls.temporalPosition.value : 'unknown';
}

function regionSpots(
  dimension: BlindSpot['dimension'],
  dimensionLabel: string,
  pool: CandidateVideo[],
  feed: CandidateVideo[],
  feedIds: Set<string>,
  lookupClassification: ClassificationLookup,
  keysOf: (c: CandidateVideo) => string[],
): BlindSpot[] {
  const poolByRegion = new Map<string, CandidateVideo[]>();
  for (const c of pool) {
    const keys = keysOf(c);
    if (keys.length === 0) continue;
    for (const key of keys) {
      const list = poolByRegion.get(key);
      if (list) list.push(c);
      else poolByRegion.set(key, [c]);
    }
  }
  const feedByRegion = new Map<string, number>();
  for (const c of feed) {
    for (const key of keysOf(c)) {
      feedByRegion.set(key, (feedByRegion.get(key) ?? 0) + 1);
    }
  }

  const spots: BlindSpot[] = [];
  for (const [key, members] of poolByRegion) {
    if (key === 'unknown') continue; // unknown is a fact, not a blind spot
    const feedCount = feedByRegion.get(key) ?? 0;
    const representedShare = members.length === 0 ? 0 : feedCount / members.length;
    // A region is underrepresented when the feed covers less than half
    // its pool share. Pure arithmetic, descriptive only.
    if (feedCount * 2 < members.length) {
      spots.push({
        dimension,
        key,
        label: `${dimensionLabel}: ${key}`,
        poolCount: members.length,
        feedCount,
        representedShare,
        description:
          `The pool offered ${members.length} candidate(s) in this region; the composed feed included ${feedCount}. ` +
          `This is a descriptive gap in this Viewpoint's output, not a statement about which perspective is correct or worth adopting.`,
        sample: members.slice(0, 5),
      });
    }
  }
  return spots;
}

/**
 * What "Explore from here" means: the pool candidates inside a blind-spot
 * region, ranked by the standard engine's order (caller decides how to
 * rank; here we return them in pool order deterministically). The user
 * initiates; this only computes.
 */
export function candidatesInBlindSpot(
  spot: BlindSpot,
  pool: CandidateVideo[],
  lookupClassification: ClassificationLookup,
): CandidateVideo[] {
  const keysOf =
    spot.dimension === 'topic'
      ? (c: CandidateVideo) => topicKeys(c, lookupClassification)
      : spot.dimension === 'sourceType'
        ? (c: CandidateVideo) => [sourceTypeKey(c, lookupClassification)]
        : spot.dimension === 'narrativeCluster'
          ? (c: CandidateVideo) => [...c.narrativeClusterIds]
          : (c: CandidateVideo) => [temporalKey(c, lookupClassification)];
  return pool.filter((c) => keysOf(c).includes(spot.key));
}