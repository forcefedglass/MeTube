import type { CandidateVideo, UserProfile } from '../../model/types';

/**
 * Repetition — negative component. Penalizes candidates the user has
 * already given explicit feedback on (watched or skipped). No inference
 * from watch time or clicks.
 */
export function scoreRepetition(
  candidate: CandidateVideo,
  profile: UserProfile,
): number {
  const seen = profile.feedback.filter(
    (f) => f.videoId === candidate.id && (f.kind === 'watched' || f.kind === 'skipped'),
  ).length;
  return -Math.min(1, seen);
}