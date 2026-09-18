/**
 * Candidate acquisition — the front door of MeTube's discovery pipeline.
 *
 * A CandidateProvider surfaces CandidateVideos from independent sources.
 * Bootstrap fidelity: one provider, backed by local fixtures, zero network.
 * Future providers (editorial lists, community lists, citation-following,
 * random walks) implement this same interface — nothing downstream needs
 * to know where candidates came from.
 */

import type { CandidateVideo } from '../model/types';
import type { ChannelId, TopicId } from '../model/types';

export interface CandidateProvider {
  /** Stable provider id, e.g. "fixture-local". */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /**
   * Fetch candidates. Providers are passive: they surface material; they do
   * not score it, and they never consult YouTube's own recommendations.
   */
  getCandidates(request: CandidateRequest): Promise<CandidateVideo[]>;
}

export interface CandidateRequest {
  /** Maximum number of candidates to return. */
  limit: number;
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