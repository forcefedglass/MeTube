/**
 * Perspective pairing — Phase 4.
 *
 * Identifies candidates that address substantially the same subject from
 * materially different source/narrative positions, and offers
 * "Compare treatments" links between them.
 *
 * EVIDENCE RULES (FROZEN):
 *   - "Same subject" is established ONLY by shared topic ids or shared
 *     narrative-cluster-adjacent subjects. Two candidates pairing requires
 *     at least one shared topic id (evidenced on both records). No
 *     keyword-similarity guessing: titles that merely *sound* similar do
 *     not pair.
 *   - "Materially different positions" requires difference in an
 *     evidenced dimension: narrative cluster id, or classified source
 *     type. Unknown never pairs against known — a candidate with unknown
 *     source type is not "different from" a publication; it is simply
 *     unknown.
 *   - NO forced symmetry. Groups may be 2, 3, 5 — or a candidate may
 *     have no comparison group at all (size 1 = no group). Opposing
 *     positions are never invented for balance.
 *   - No political scoring: "different narrative cluster" is a statement
 *     about framing families, never about who is right or which side a
 *     source is on.
 *
 * Pure and deterministic.
 */

import type { CandidateVideo, FeedCandidate } from '../model/types';
import type { VideoClassification } from '../model/classification';
import type { ClassificationLookup } from '../discovery/coverage';

export interface PerspectivePair {
  /** Stable key for this pair: sorted "a|b". */
  key: string;
  /** The two candidates. */
  a: CandidateVideo;
  b: CandidateVideo;
  /** Evidenced basis for pairing (verbatim, for the UI). */
  basis: string;
  /** Which evidenced dimension differs. */
  differsOn: 'narrative-cluster' | 'source-type' | 'narrative-cluster+source-type';
}

export interface PerspectiveGroup {
  /** Stable key: sorted member ids joined by '|'. */
  key: string;
  /** The group members (>= 2 when returned). */
  members: CandidateVideo[];
  /** Evidence statement for the group's cohesion. */
  sharedSubject: string;
  /** Per-member differences from the group's dominant evidence. */
  basis: string;
}

export interface PairingResult {
  pairs: PerspectivePair[];
  /** videoId -> list of video ids it compares with (both directions). */
  comparisonsFor: Map<string, string[]>;
  /** Candidates with a comparison group (for "Compare treatments"). */
  groupableCount: number;
  /** Candidates with no evidenced comparison (no false symmetry). */
  singletonCount: number;
}

/**
 * Build perspective pairs across a set of candidates (e.g. the composed
 * feed plus its pool context). Deterministic: same inputs -> same pairs.
 */
export function findPerspectivePairs(
  candidates: CandidateVideo[],
  lookupClassification: ClassificationLookup,
): PairingResult {
  const pairs: PerspectivePair[] = [];
  const comparisonsFor = new Map<string, string[]>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const pair = pairCandidates(a, b, lookupClassification);
      if (pair) {
        pairs.push(pair);
        pushComparison(comparisonsFor, a.id, b.id);
        pushComparison(comparisonsFor, b.id, a.id);
      }
    }
  }

  const groupable = new Set(comparisonsFor.keys());
  return {
    pairs,
    comparisonsFor,
    groupableCount: groupable.size,
    singletonCount: candidates.length - groupable.size,
  };
}

function pushComparison(
  map: Map<string, string[]>,
  from: string,
  to: string,
): void {
  const list = map.get(from);
  if (list) {
    if (!list.includes(to)) list.push(to);
  } else {
    map.set(from, [to]);
  }
}

/**
 * Do two candidates address substantially the same subject from
 * materially different positions? Returns the evidenced pair or null.
 * Never fabricates: no shared topic -> no pairing, regardless of how
 * different the positions look.
 */
export function pairCandidates(
  a: CandidateVideo,
  b: CandidateVideo,
  lookupClassification: ClassificationLookup,
): PerspectivePair | null {
  // Same subject: at least one shared topic id, evidenced on both records.
  const sharedTopics = a.topicIds.filter((t) => b.topicIds.includes(t));
  if (sharedTopics.length === 0) return null;

  const clsA = lookupClassification(a.id);
  const clsB = lookupClassification(b.id);
  const stA = clsA ? clsA.sourceType.value : 'unknown';
  const stB = clsB ? clsB.sourceType.value : 'unknown';

  // Different positions: differs on narrative cluster ids...
  const clustersA = new Set(a.narrativeClusterIds);
  const clustersB = new Set(b.narrativeClusterIds);
  const bothHaveClusters = clustersA.size > 0 && clustersB.size > 0;
  const disjointClusters = bothHaveClusters
    && [...clustersA].every((c) => !clustersB.has(c));
  // ...or on evidenced source type (unknown is not a position).
  const differsOnSource = stA !== stB && stA !== 'unknown' && stB !== 'unknown';

  if (!disjointClusters && !differsOnSource) return null;

  const differsOn: PerspectivePair['differsOn'] =
    disjointClusters && differsOnSource
      ? 'narrative-cluster+source-type'
      : disjointClusters
        ? 'narrative-cluster'
        : 'source-type';

  const clusterPart = disjointClusters
    ? `narrative clusters ${[...clustersA].join('/') || 'none'} vs ${[...clustersB].join('/') || 'none'}`
    : '';
  const sourcePart = differsOnSource ? `source types ${stA} vs ${stB}` : '';
  const basis = `Shared subject ${sharedTopics.join(', ')}; differs on ${[clusterPart, sourcePart].filter(Boolean).join(' and ')}.`;

  return {
    key: [a.id, b.id].sort().join('|'),
    a,
    b,
    basis,
    differsOn,
  };
}

/**
 * Build comparison groups: connected components over the pair graph.
 * A group of size 1 is no group — singletons are returned as nothing,
 * never as a fake "single perspective" balance unit.
 */
export function buildComparisonGroups(
  candidates: CandidateVideo[],
  pairs: PerspectivePair[],
): Map<string, CandidateVideo[]> {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const adjacency = new Map<string, Set<string>>();
  for (const pair of pairs) {
    link(adjacency, pair.a.id, pair.b.id);
    link(adjacency, pair.b.id, pair.a.id);
  }
  const groups = new Map<string, CandidateVideo[]>();
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    const component: string[] = [];
    const queue = [candidate.id];
    seen.add(candidate.id);
    while (queue.length > 0) {
      const id = queue.pop() as string;
      component.push(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (component.length >= 2) {
      groups.set(
        component.slice().sort().join('|'),
        component.map((id) => byId.get(id)).filter((c): c is CandidateVideo => c !== undefined),
      );
    }
  }
  return groups;
}

function link(map: Map<string, Set<string>>, a: string, b: string): void {
  const set = map.get(a);
  if (set) set.add(b);
  else map.set(a, new Set([b]));
}

/**
 * The UI-facing question: given a feed item, which other candidates can it
 * be compared with, and on what evidence? Returns null when no evidenced
 * comparison exists — "Compare treatments" is then simply not offered.
 */
export function comparisonsForItem(
  item: FeedCandidate,
  result: PairingResult,
  allCandidates: CandidateVideo[],
): Array<{ other: CandidateVideo; basis: string }> {
  const ids = result.comparisonsFor.get(item.candidate.id) ?? [];
  const byId = new Map(allCandidates.map((c) => [c.id, c]));
  const out: Array<{ other: CandidateVideo; basis: string }> = [];
  for (const id of ids) {
    const other = byId.get(id);
    if (!other) continue;
    const pair = result.pairs.find(
      (p) => (p.a.id === item.candidate.id && p.b.id === id) ||
        (p.b.id === item.candidate.id && p.a.id === id),
    );
    if (pair) out.push({ other, basis: pair.basis });
  }
  return out;
}