import type { CandidateVideo, UserProfile } from '../../model/types';

/**
 * Relevance — bootstrap fidelity: explicit declared-interest overlap only.
 * Inferred preference is out of scope by design.
 */
export function scoreRelevance(
  candidate: CandidateVideo,
  profile: UserProfile,
): number {
  const interestSet = new Set(profile.declaredInterests);
  const overlap = candidate.topicIds.filter((t) => interestSet.has(t)).length;
  if (candidate.topicIds.length === 0) return 0;
  return overlap / candidate.topicIds.length;
}