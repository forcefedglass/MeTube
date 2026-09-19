/**
 * Coverage map — quantify representation across the information map.
 *
 * Answers "how is my candidate pool distributed?" with counts only:
 * topics, channels, source types, narrative clusters, temporal positions,
 * age bands, familiar-vs-unfamiliar sources. Deliberately NOT a polished
 * visualization (Phase 3 is the data model); the UI renders these facts
 * as plain lists.
 *
 * Pure and deterministic. No scoring: coverage describes the pool; it
 * never judges it.
 */

import type { CandidateVideo, UserProfile } from '../model/types';
import type { ChannelId } from '../model/types';
import type {
  AgeBandKey,
  ChannelFamiliarity,
  ChannelFamiliarityFacts,
  CoverageBucket,
  CoverageMap,
} from '../model/classification';
import {
  AGE_BANDS,
  classifyChannelFamiliarity,
} from '../model/classification';
import type { VideoClassification } from '../model/classification';
import { isUnknownDate } from '../model/discovery';

/** A classification lookup: videoId -> its classification (may be absent). */
export type ClassificationLookup = (videoId: string) => VideoClassification | undefined;

/** A lookup that resolves nothing: every dimension stays UNKNOWN. */
export const unknownLookup: ClassificationLookup = () => undefined;

/**
 * Count pool sightings per channel: how many distinct candidates each
 * channel contributes to the pool (including secondary sightings).
 */
export function countChannelSightings(
  candidates: CandidateVideo[],
): Map<ChannelId, number> {
  const counts = new Map<ChannelId, number>();
  for (const c of candidates) {
    counts.set(c.channelId, (counts.get(c.channelId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Compute channel familiarity facts for every channel represented in the
 * pool. Sightings count distinct candidates in the pool; explicit feedback
 * comes from the profile only (watched/saved/more-like-this — never
 * watch time, never clicks).
 */
export function familiarityFacts(
  candidates: CandidateVideo[],
  profile: UserProfile,
): Map<ChannelId, ChannelFamiliarityFacts> {
  const sightings = countChannelSightings(candidates);
  const channelOfVideo = new Map(candidates.map((c) => [c.id, c.channelId]));
  const explicitByChannel = new Map<ChannelId, number>();
  for (const fb of profile.feedback) {
    const channel = channelOfVideo.get(fb.videoId);
    if (channel === undefined) continue;
    if (
      fb.kind === 'watched' ||
      fb.kind === 'saved' ||
      fb.kind === 'more-like-this'
    ) {
      explicitByChannel.set(channel, (explicitByChannel.get(channel) ?? 0) + 1);
    }
  }
  const out = new Map<ChannelId, ChannelFamiliarityFacts>();
  for (const [channelId, poolSightings] of sightings) {
    out.set(channelId, {
      channelId,
      poolSightings,
      explicitFeedbackCount: explicitByChannel.get(channelId) ?? 0,
    });
  }
  return out;
}

/** Classify familiarity for one channel's facts (deterministic). */
export function classifyFamiliarity(facts: ChannelFamiliarityFacts): ChannelFamiliarity {
  return classifyChannelFamiliarity(facts);
}

/** Sort buckets by count desc, then key asc (deterministic order). */
function sortedBuckets(buckets: Map<string, { label: string; count: number }>): CoverageBucket[] {
  return [...buckets.entries()]
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function ageBandOf(candidate: CandidateVideo, nowMs: number): AgeBandKey {
  if (isUnknownDate(candidate.publishedAt)) return 'unknown';
  const published = Date.parse(candidate.publishedAt);
  if (Number.isNaN(published)) return 'unknown';
  const ageDays = (nowMs - published) / 86_400_000;
  if (ageDays < 0) return 'unknown';
  for (const band of AGE_BANDS) {
    if (band.key === 'unknown') continue;
    if (ageDays <= band.days) return band.key;
  }
  return 'older';
}

/**
 * Compute the coverage map over a candidate pool.
 *
 * `lookupClassification` resolves a video's classification (machine +
 * overrides already applied). Candidates without a classification still
 * count toward totals and channels; they land in the 'unclassified' and
 * 'unknown' buckets of each dimension. No fabrication: absence stays
 * absence.
 */
export function computeCoverageMap(
  candidates: CandidateVideo[],
  lookupClassification: ClassificationLookup,
  profile: UserProfile,
  now: string,
): CoverageMap {
  const nowMs = Date.parse(now);

  const topics = new Map<string, { label: string; count: number }>();
  const clusters = new Map<string, { label: string; count: number }>();
  const sourceTypes = new Map<string, { label: string; count: number }>();
  const temporal = new Map<string, { label: string; count: number }>();
  const familiarity = new Map<string, { label: string; count: number }>();
  const channels = new Map<string, { label: string; count: number }>();

  // Age bands are a fixed taxonomy: always present, even at zero. A
  // coverage map that hides empty bands would misrepresent the pool.
  const ageBands = new Map<string, { label: string; count: number }>(
    AGE_BANDS.map((b) => [b.key, { label: b.label, count: 0 }]),
  );

  const familiarityByChannel = familiarityFacts(candidates, profile);

  let unknownDates = 0;
  let unclassified = 0;

  for (const c of candidates) {
    if (isUnknownDate(c.publishedAt)) unknownDates += 1;

    const channel = familiarityByChannel.get(c.channelId);
    const fam: ChannelFamiliarity =
      channel !== undefined ? classifyFamiliarity(channel) : 'unknown';
    bump(familiarity, fam, fam, c.id);

    // Channels always count, classified or not.
    bump(channels, c.channelId, c.channelTitle, c.id);

    const cls = lookupClassification(c.id);
    if (!cls) {
      unclassified += 1;
      bump(sourceTypes, 'unknown', 'Unknown', c.id);
      bump(temporal, 'unknown', 'Unknown', c.id);
      bump(clusters, 'unknown', 'Unknown', c.id);
    } else {
      if (cls.topics.length === 0) {
        bump(topics, 'unknown', 'Unknown', c.id);
      } else {
        for (const t of cls.topics) bump(topics, t.value, t.value, c.id);
      }
      bump(sourceTypes, cls.sourceType.value, cls.sourceType.value, c.id);
      bump(clusters, cls.narrativeCluster.value, cls.narrativeCluster.value, c.id);
      bump(
        temporal,
        cls.temporalPosition.value,
        cls.temporalPosition.value,
        c.id,
      );
    }

    bump(ageBands, ageBandOf(c, nowMs), ageBandOf(c, nowMs), c.id);
  }

  return {
    totalCandidates: candidates.length,
    topics: sortedBuckets(topics),
    narrativeClusters: sortedBuckets(clusters),
    sourceTypes: sortedBuckets(sourceTypes),
    temporalPositions: sortedBuckets(temporal),
    ageBands: sortedBuckets(ageBands),
    channelFamiliarity: sortedBuckets(familiarity),
    channels: sortedBuckets(channels),
    unknownDates,
    unclassified,
  };
}

function bump(
  target: Map<string, { label: string; count: number }>,
  key: string,
  label: string,
  _videoId: string,
): void {
  const existing = target.get(key);
  if (existing) existing.count += 1;
  else target.set(key, { label, count: 1 });
}