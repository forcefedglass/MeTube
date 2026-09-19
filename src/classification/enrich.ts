/**
 * Enrichment — classification meets the candidate pool.
 *
 * The Phase 3 wiring point: `toCandidateVideo` in the pool layer leaves
 * topicIds/narrativeClusterIds empty (the raw web provider does not carry
 * them), and interpret/ranking operate on CandidateVideo. This module
 * classifies each pool candidate and merges the classification back into
 * the candidate so Viewpoint filters and ranking start working on real
 * candidates — with the full audit trail preserved alongside.
 *
 * Overrides are applied at read time here (never written into the pool),
 * so they survive pool regeneration and MAX_POOL_SIZE pruning by design.
 */

import type {
  CandidateVideo,
  NarrativeClusterId,
  TopicId,
} from '../model/types';
import type { NarrativeCluster } from '../model/types';
import type { Catalog } from '../model/catalog';
import type { VideoClassification } from '../model/classification';
import { classifyCandidate } from './classify';
import { applyOverrides } from './overrides';
import type { ClassificationOverride } from '../model/classification';

/** A candidate plus its full classification audit trail. */
export interface EnrichedCandidate extends CandidateVideo {
  classification: VideoClassification;
}

/**
 * Classify candidates and merge the classification back into each one.
 *
 * - machine classification runs over every candidate (pure, deterministic)
 * - overrides (already loaded) are applied on top: user always wins
 * - topic/narrativeCluster ids are copied onto the candidate itself so
 *   Viewpoint filters and ranking see them
 * - narrative cluster ids are only copied when they resolve in the catalog
 *   (never a fabricated cluster reference)
 */
export function enrichCandidates(
  candidates: CandidateVideo[],
  catalog: { narrativeClusters: Map<NarrativeClusterId, NarrativeCluster> },
  overrides: ClassificationOverride[],
  now: string,
): EnrichedCandidate[] {
  return candidates.map((candidate) => {
    const machine = classifyCandidate(candidate, catalog, now);
    const classified = applyOverrides(machine, overrides);
    const topicIds = classified.topics
      .map((t) => t.value)
      .filter((v): v is TopicId => v !== 'unknown');
    const narrativeClusterIds = classified.narrativeCluster.value === 'unknown'
      ? []
      : [classified.narrativeCluster.value as NarrativeClusterId];
    return {
      ...candidate,
      topicIds,
      narrativeClusterIds,
      classification: classified,
    };
  });
}

/**
 * Build a videoId -> classification lookup from enriched candidates
 * (machine + overrides already applied). Feeds the inspector and the
 * coverage map.
 */
export function classificationIndex(
  enriched: EnrichedCandidate[],
): (videoId: string) => VideoClassification | undefined {
  const index = new Map(enriched.map((c) => [c.id, c.classification]));
  return (videoId) => index.get(videoId);
}