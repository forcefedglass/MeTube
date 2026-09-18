import type { CandidateVideo } from '../../model/types';

/**
 * Temporal diversity — rewards candidates that are neither brand new nor
 * from the same publication era as the rest of the feed. Bootstrap
 * fidelity: bucket by months-old, uniformly spread coverage.
 */
export function scoreTemporalDiversity(
  candidate: CandidateVideo,
  pool: CandidateVideo[],
): number {
  if (pool.length === 0) return 0;
  const t = Date.parse(candidate.publishedAt);
  if (Number.isNaN(t)) return 0;
  const ages = pool.map((c) => Date.parse(c.publishedAt));
  const valid = ages.filter((a) => !Number.isNaN(a));
  if (valid.length === 0) return 0;
  const mean = valid.reduce((s, a) => s + a, 0) / valid.length;
  const spreadMs = Math.abs(t - mean);
  const days = spreadMs / 86400000;
  // Within a month of pool mean: neutral; older/farther: capped at 1.
  return Math.min(1, days / 30);
}