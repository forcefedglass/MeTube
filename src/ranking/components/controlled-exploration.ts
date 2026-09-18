import type { CandidateVideo, UserProfile } from '../../model/types';

/**
 * Controlled exploration — a deliberately small, uniform bonus that every
 * candidate receives regardless of history. It exists so that even with
 * heavy feedback histories, out-of-history candidates are never fully
 * starved. It is "controlled" because it is constant: no exploration is
 * gated on inferred user state.
 */
export function scoreControlledExploration(
  _candidate: CandidateVideo,
  _profile: UserProfile,
): number {
  return 0.15;
}