/**
 * Candidate acquisition — the front door of MeTube's discovery pipeline.
 *
 * A CandidateProvider surfaces candidates from independent sources. Phase 2
 * extends the request shape: providers can be driven by an acquisition plan
 * (seed searches, channel uploads, explicit videos, playlists) derived from
 * a Viewpoint. Providers still never consume YouTube's own recommendations
 * and still never score anything.
 */

import type { CandidateVideo } from '../model/types';
import type { ChannelId, TopicId } from '../model/types';
import type { AcquisitionStep } from '../model/discovery';

export interface CandidateProvider {
  /** Stable provider id, e.g. "fixture-local", "youtube-web". */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /**
   * Fetch candidates. Providers are passive: they surface material; they do
   * not score it, and they never consult YouTube's own recommendations.
   */
  getCandidates(request: CandidateRequest): Promise<CandidateVideo[]>;
}

/**
 * A provider that can execute a discovery plan (Phase 2+). Both the real
 * YouTube provider and the fixture provider implement this, so development
 * mode and live mode run the identical acquisition pipeline.
 */
export interface PlanCapableProvider extends CandidateProvider {
  runPlan(
    steps: AcquisitionStep[],
    viewpointId: string | null,
    now: string,
  ): Promise<import('./youtube-web').AcquisitionRunResult>;
}

export interface CandidateRequest {
  /** Maximum number of candidates to return. */
  limit: number;
  /**
   * Optional acquisition steps (Phase 2). When provided, the provider
   * fetches from those surfaces only. When absent, providers return their
   * standing pool (fixtures: the local pool; real providers: previously
   * discovered material is supplied by the pool layer, not refetched).
   */
  steps?: AcquisitionStep[];
}

/**
 * Read-through cache so repeated provider calls (build feed, re-rank, feed
 * autopsy) do not re-fetch. Providers are side-effect free; the cache is a
 * pure performance detail and is safe to bypass.
 */
export class CandidateCache {
  private readonly hits = new Map<string, CandidateVideo[]>();

  async get(
    provider: CandidateProvider,
    request: CandidateRequest,
  ): Promise<CandidateVideo[]> {
    const key = `${provider.id}:${request.limit}`;
    const cached = this.hits.get(key);
    if (cached !== undefined) return cached;
    const fresh = await provider.getCandidates(request);
    this.hits.set(key, fresh);
    return fresh;
  }

  clear(): void {
    this.hits.clear();
  }
}

/** Channel and topic stats computed over a candidate pool. */
export interface CandidatePoolStats {
  total: number;
  uniqueChannels: number;
  uniqueTopics: number;
  channelHistogram: Array<{ channelId: ChannelId; channelTitle: string; count: number }>;
  topicHistogram: Array<{ topicId: TopicId; count: number }>;
}

export function computePoolStats(candidates: CandidateVideo[]): CandidatePoolStats {
  const channels = new Map<ChannelId, { title: string; count: number }>();
  const topics = new Map<TopicId, number>();
  for (const c of candidates) {
    const ch = channels.get(c.channelId) ?? { title: c.channelTitle, count: 0 };
    ch.count += 1;
    channels.set(c.channelId, ch);
    for (const t of c.topicIds) topics.set(t, (topics.get(t) ?? 0) + 1);
  }
  const channelHistogram = [...channels.entries()]
    .map(([channelId, { title, count }]) => ({ channelId, channelTitle: title, count }))
    .sort((a, b) => b.count - a.count || a.channelId.localeCompare(b.channelId));
  const topicHistogram = [...topics.entries()]
    .map(([topicId, count]) => ({ topicId, count }))
    .sort((a, b) => b.count - a.count || a.topicId.localeCompare(b.topicId));
  return {
    total: candidates.length,
    uniqueChannels: channels.size,
    uniqueTopics: topics.size,
    channelHistogram,
    topicHistogram,
  };
}