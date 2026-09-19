/**
 * Viewpoint working set — the retrieval isolation boundary.
 *
 * DISTINCTION (FROZEN):
 *   - Candidate Catalog (the pool) = GLOBAL reusable inventory. Every
 *     candidate ever discovered by any Viewpoint, kept for caching and
 *     deduplication across Viewpoints.
 *   - Viewpoint Working Set = the candidates ELIGIBLE for composition in
 *     ONE Viewpoint's Viewstream.
 *
 * A candidate qualifies for a Viewpoint's working set when — and only
 * when — recorded provenance supports it:
 *   1. originally discovered by that Viewpoint's plan
 *      (`candidate.provenance.viewpointId === viewpointId`), or
 *   2. re-surfaced later by that Viewpoint's plan
 *      (an `alsoDiscoveredVia` entry with `viewpointId === viewpointId`).
 *
 * Deliberately NOT qualification rules:
 *   - existing in the global catalog (mere existence never implies
 *     relevance — a Viewpoint composes only what its own acquisition
 *     surfaced);
 *   - manual adds (`provenance.viewpointId === null`): the current model
 *     has no pin-into-Viewpoint concept; if one is added later it must
 *     carry explicit Viewpoint attribution, not a null one.
 *
 * Pipeline position:
 *   global candidate cache
 *     -> working-set selection (this module)
 *     -> classification
 *     -> composition
 *     -> Viewstream
 *
 * Pure, DOM-free, storage-free: it filters pool entries, nothing else.
 */

import type { PoolEntry } from '../discovery/pool';

/** Does one provenance record tie this candidate to this Viewpoint? */
function provenanceSupportsViewpoint(
  provenance: { viewpointId: string | null },
  viewpointId: string,
): boolean {
  return provenance.viewpointId === viewpointId;
}

/**
 * THE working-set rule. A pool entry belongs to a Viewpoint's working
 * set exactly when its original provenance or any later sighting was
 * produced by that Viewpoint's plan.
 */
export function entryInWorkingSet(entry: PoolEntry, viewpointId: string): boolean {
  return (
    provenanceSupportsViewpoint(entry.candidate.provenance, viewpointId) ||
    entry.alsoDiscoveredVia.some((p) => provenanceSupportsViewpoint(p, viewpointId))
  );
}

/** All pool entries eligible for one Viewpoint, in pool order. */
export function viewpointWorkingSet(entries: PoolEntry[], viewpointId: string): PoolEntry[] {
  return entries.filter((e) => entryInWorkingSet(e, viewpointId));
}

/** Diagnostics for the working-set boundary — counts, never opinions. */
export interface WorkingSetDiagnostics {
  /** Total candidates in the global catalog (cache + dedup inventory). */
  globalCandidateCount: number;
  /** Candidates eligible for the active Viewpoint's working set. */
  activeViewpointCount: number;
  /**
   * Working-set candidates that at least one other stored Viewpoint's
   * provenance also supports (legitimate independent discovery — the
   * same video genuinely found by two plans — never leakage).
   */
  sharedWithOtherViewpoints: number;
  /** Working-set candidates only the active Viewpoint's provenance supports. */
  exclusiveToActiveViewpoint: number;
}

/**
 * Compute working-set diagnostics for one Viewpoint against the global
 * catalog. `allViewpointIds` should be the ids of every stored Viewpoint
 * so "other Viewpoints" excludes deleted ones; the active Viewpoint's
 * own id is excluded from "other" by definition.
 */
export function workingSetDiagnostics(
  entries: PoolEntry[],
  viewpointId: string,
  allViewpointIds: string[],
): WorkingSetDiagnostics {
  const storedViewpoints = new Set(allViewpointIds);
  let active = 0;
  let shared = 0;
  for (const entry of entries) {
    if (!entryInWorkingSet(entry, viewpointId)) continue;
    active += 1;
    const supportedElsewhere = [
      entry.candidate.provenance,
      ...entry.alsoDiscoveredVia,
    ].some(
      (p) =>
        p.viewpointId !== null &&
        p.viewpointId !== viewpointId &&
        storedViewpoints.has(p.viewpointId),
    );
    if (supportedElsewhere) shared += 1;
  }
  return {
    globalCandidateCount: entries.length,
    activeViewpointCount: active,
    sharedWithOtherViewpoints: shared,
    exclusiveToActiveViewpoint: active - shared,
  };
}