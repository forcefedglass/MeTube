import type { CandidateVideo, UserProfile } from '../../model/types';

/**
 * Narrative novelty — rewards candidates whose narrative clusters are new
 * to the user. Narrative clusters describe how a story is told, never who
 * is right. This is the component that keeps the feed from collapsing
 * into a single storyline.
 */
export function scoreNarrativeNovelty(
  candidate: CandidateVideo,
  profile: UserProfile,
): { value: number; newClusters: string[] } {
  const seenClusters = new Set<string>();
  for (const fb of profile.feedback) {
    seenClusters.add(`stub:${fb.videoId}`);
  }
  const newClusters = candidate.narrativeClusterIds.filter(
    (c) => !seenClusters.has(`stub:${c}`),
  );
  if (candidate.narrativeClusterIds.length === 0) return { value: 0, newClusters: [] };
  return {
    value: newClusters.length / candidate.narrativeClusterIds.length,
    newClusters,
  };
}