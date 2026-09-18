import type { CandidateVideo, UserProfile } from '../../model/types';

/**
 * Topic novelty — rewards candidates whose topics are under-represented
 * in the user's explicit history. Declared interests pull topics toward
 * familiarity; novelty pushes against concentration.
 */
export function scoreTopicNovelty(
  candidate: CandidateVideo,
  profile: UserProfile,
): number {
  const seenTopics = new Set(
    profile.feedback.flatMap((f) => f.videoId),
  );
  return candidate.topicIds.some((t) => seenTopics.has(t)) ? 0 : 1;
}