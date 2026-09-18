import type {
  CandidateVideo,
  FeedCandidate,
  FeedSnapshot,
  UserProfile,
} from '../model/types';
import type { CandidateProvider } from '../discovery/provider';
import { rankCandidates } from '../ranking/engine';
import type { RankWeights } from '../ranking/components';
import { DEFAULT_WEIGHTS } from '../ranking/components';

export interface FeedRequest {
  limit: number;
  /** Muted channels are dropped, not down-ranked. */
  profile: UserProfile;
  weights?: RankWeights;
}

export async function assembleFeed(
  provider: CandidateProvider,
  request: FeedRequest,
  now: string,
): Promise<FeedSnapshot> {
  const weights = request.weights ?? DEFAULT_WEIGHTS;
  const candidates = await provider.getCandidates({
    limit: Math.max(request.limit * 3, request.limit + 10),
  });
  const muted = new Set(request.profile.mutedChannelIds);
  const unmuted = candidates.filter((c) => !muted.has(c.channelId));
  const mutedCount = candidates.length - unmuted.length;
  const ranked = rankCandidates(unmuted, {
    pool: unmuted,
    profile: request.profile,
    weights,
  });
  const feed = ranked.slice(0, request.limit);
  return {
    id: `feed-${now}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
    createdAt: now,
    feed,
    consideredCount: unmuted.length,
    mutedCount,
  };
}