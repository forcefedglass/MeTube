/**
 * Viewstream generation: assemble a feed through a Viewpoint.
 *
 * The pipeline is the bootstrap pipeline with a Viewpoint lens applied:
 *   1. hard filters (topics, sources, dates, unfamiliarity) — deterministic
 *   2. channel muting — exclusion, not down-ranking
 *   3. ranking with the Viewpoint's derived weights
 *   4. post-selection enforcement of repetition + concentration limits
 *   5. snapshot with the Viewpoint embedded (the audit record)
 *
 * Every step is deterministic: same Viewpoint + candidates + profile ->
 * same Viewstream (module the snapshot id/timestamp).
 */

import type {
  CandidateVideo,
  FeedSnapshot,
  UserProfile,
} from '../model/types';
import type { CandidateProvider } from '../discovery/provider';
import { rankCandidates } from '../ranking/engine';
import type { Viewpoint } from '../model/viewpoint';
import {
  candidatePasses,
  interpretViewpoint,
  passesUnfamiliarity,
} from './interpret';

export interface ViewstreamRequest {
  viewpoint: Viewpoint;
  limit: number;
  profile: UserProfile;
}

export async function generateViewstream(
  provider: CandidateProvider,
  request: ViewstreamRequest,
  now: string,
): Promise<FeedSnapshot> {
  const { viewpoint, limit, profile } = request;
  const interpretation = interpretViewpoint(viewpoint.config);
  const { filters, limits, tuning } = interpretation;

  // 1. Hard filters. Disabled Viewpoints never generate.
  if (!viewpoint.enabled) {
    return emptySnapshot(now, viewpoint, 'viewpoint disabled');
  }
  const all = await provider.getCandidates({ limit: 1000 });
  const passing = all.filter(
    (c) =>
      candidatePasses(c, filters) &&
      passesUnfamiliarity(c, profile, tuning.unfamiliarityTarget),
  );

  // 2. Channel muting.
  const muted = new Set(profile.mutedChannelIds);
  const unmuted = passing.filter((c) => !muted.has(c.channelId));
  const mutedCount = passing.length - unmuted.length;

  // 3. Rank with the Viewpoint's weights.
  const ranked = rankCandidates(unmuted, {
    pool: unmuted,
    profile: request.profile,
    weights: tuning.weights,
  });

  // 4. Post-selection limits: repetition + concentration.
  const feed = applyAssemblyLimits(ranked, limits, limit);

  return {
    id: `viewstream-${now}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
    createdAt: now,
    feed,
    consideredCount: unmuted.length,
    mutedCount,
    viewpoint: { id: viewpoint.id, title: viewpoint.title },
  };
}

function emptySnapshot(
  now: string,
  viewpoint: Viewpoint,
  reason: string,
): FeedSnapshot {
  return {
    id: `viewstream-${now}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
    createdAt: now,
    feed: [],
    consideredCount: 0,
    mutedCount: 0,
    viewpoint: { id: viewpoint.id, title: viewpoint.title },
  };
}

/**
 * Walk the ranked list, taking items until limits would be violated.
 * Deterministic: iterates in rank order and applies limits greedily.
 */
function applyAssemblyLimits(
  ranked: ReturnType<typeof rankCandidates>,
  limits: { repetitionLimit: number; sourceConcentrationLimit: number },
  limit: number,
) {
  const selected: typeof ranked = [];
  const perChannel = new Map<string, number>();
  for (const item of ranked) {
    if (selected.length >= limit) break;
    const channelId = item.candidate.channelId;
    const count = perChannel.get(channelId) ?? 0;
    // Hard repetition limit per channel.
    if (count >= limits.repetitionLimit) continue;
    // Hard concentration limit: max share of the feed per channel.
    const maxByConcentration = Math.max(
      1,
      Math.floor(limit * limits.sourceConcentrationLimit),
    );
    if (count >= maxByConcentration) continue;
    selected.push(item);
    perChannel.set(channelId, count + 1);
  }
  return selected;
}