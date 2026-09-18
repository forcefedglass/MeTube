import type { CandidateVideo } from '../../model/types';

/**
 * Source concentration — negative component. Penalizes candidates whose
 * channel already dominates the candidate pool. Guard against one source
 * flooding the feed.
 */
export function scoreSourceConcentration(
  candidate: CandidateVideo,
  pool: CandidateVideo[],
): number {
  if (pool.length === 0) return 0;
  const sameChannel = pool.filter((c) => c.channelId === candidate.channelId).length;
  const share = sameChannel / pool.length;
  // Penalty ramps from 0 at <=10% share to -1 at >=50% share.
  if (share <= 0.1) return 0;
  const ramped = (share - 0.1) / 0.4;
  return -Math.min(1, ramped);
}