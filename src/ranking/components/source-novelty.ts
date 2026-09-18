import type { CandidateVideo, UserProfile } from '../../model/types';

/**
 * Source novelty — rewards candidates from discovery sources that have
 * surfaced few of the candidates the user has engaged with before.
 * Diversifies provenance of the feed.
 */
export function scoreSourceNovelty(
  candidate: CandidateVideo,
  profile: UserProfile,
): number {
  const pool = profile.feedback;
  const fromSource = pool.filter((f) => f.videoId === candidate.id).length;
  return fromSource === 0 ? 1 : 0;
}