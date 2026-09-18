/**
 * Discovery-plan domain model — Phase 2.
 *
 * A DiscoveryPlan is what a Viewpoint becomes when it is time to actually
 * acquire candidates: a bounded list of acquisition steps derived only from
 * the Viewpoint's own fields (seed topics → seed queries, seed concepts →
 * searches). Plans never consult YouTube's own recommendations.
 *
 * Every discovered candidate carries CandidateProvenance so the pool can
 * always answer "where did this come from, and who asked for it?"
 */

import type { ChannelId, Iso8601, TopicId, VideoId } from './types';

/**
 * How a candidate was acquired. Mirrors the acquisition starts the product
 * allows: seed-derived search, explicit channel uploads, explicit videos,
 * playlists, and (future) relationships between already-discovered
 * candidates. `home-recommendations` is deliberately absent: that surface is
 * never an acquisition start.
 */
export type AcquisitionMethod =
  | 'seed-search'
  | 'channel-uploads'
  | 'explicit-video'
  | 'playlist';

/**
 * One bounded acquisition step in a plan.
 */
export interface AcquisitionStep {
  method: AcquisitionMethod;
  /**
   * What the step targets: a search query for `seed-search`, a channel id
   * for `channel-uploads`, a video id for `explicit-video`, a playlist id
   * for `playlist`.
   */
  target: string;
  /** Human-readable restatement, shown in the pool inspector. */
  label: string;
}

/**
 * A bounded acquisition plan derived from one Viewpoint.
 */
export interface DiscoveryPlan {
  viewpointId: string;
  /** Steps, deduplicated and capped at a small bound. */
  steps: AcquisitionStep[];
  /** Plan creation timestamp. */
  createdAt: Iso8601;
}

/** Provider that executed a discovery. */
export type ProviderId = string;

/**
 * Where a candidate came from — kept forever with the candidate record.
 */
export interface CandidateProvenance {
  provider: ProviderId;
  /** How it was acquired. */
  method: AcquisitionMethod;
  /** The seed/query/channel/playlist that found it. */
  seed: string;
  /** When it was discovered. */
  discoveredAt: Iso8601;
  /** The Viewpoint whose plan surfaced it (null only for manual adds). */
  viewpointId: string | null;
  /** Channel the candidate was found through, when applicable. */
  parentChannelId?: ChannelId;
  /** Video the candidate was found/channel was found through, when applicable. */
  parentVideoId?: VideoId;
}

/**
 * How reliable the metadata source was, recorded — never fabricated.
 * `page-metadata`: parsed from a real YouTube page's embedded data.
 */
export type MetadataConfidence =
  | 'page-metadata'
  | 'fixture';

/**
 * A real candidate as acquired from a provider, with provenance.
 * Metadata fields are optional where the source does not provide them;
 * they are never invented.
 */
export interface DiscoveredCandidate {
  videoId: VideoId;
  channelId: ChannelId | null;
  channelTitle: string | null;
  title: string | null;
  description: string | null;
  /** ISO-8601 when the source provides an absolute date; null for relative dates ("2 years ago"). */
  publishedAt: Iso8601 | null;
  durationSeconds: number | null;
  viewCount: number | null;
  tags: string[];
  thumbnailUrl: string | null;
  language: string | null;
  metadataConfidence: MetadataConfidence;
  provenance: CandidateProvenance;
}

/** Cap on plan size: a personal extension, not a crawler. */
export const MAX_PLAN_STEPS = 6;

/** Cap on candidates accepted per step. */
export const MAX_PER_STEP = 12;

/**
 * Sentinel publication date for candidates whose source gave no absolute
 * date (e.g. "2 years ago" on a search page). Date-window filters must
 * treat it as *unknown* and skip the window, never as 1970 — converting a
 * relative date to an absolute one would fabricate precision.
 */
export const UNKNOWN_DATE = '1970-01-01T00:00:00.000Z';

export function isUnknownDate(iso: string | null): boolean {
  return iso === null || iso === UNKNOWN_DATE;
}

/**
 * Resolve topic ids to search query strings. Unresolvable ids yield null
 * and produce no step — never a guessed query.
 */
export type TopicLabelResolver = (topicId: TopicId) => string | null;

/**
 * Derive a bounded acquisition plan from a Viewpoint's config.
 * Deterministic: same config -> same plan. Only seed-driven surfaces are
 * used — never YouTube Home recommendations.
 */
export function deriveDiscoveryPlan(
  viewpointId: string,
  seedTopics: TopicId[],
  seedConcepts: string[],
  createdAt: Iso8601,
  explicitChannels: string[] = [],
  resolveTopicLabel: TopicLabelResolver = () => null,
  seedPlaylists: string[] = [],
): DiscoveryPlan {
  const steps: AcquisitionStep[] = [];
  const seen = new Set<string>();

  const push = (step: AcquisitionStep) => {
    const key = `${step.method}:${step.target}`;
    if (seen.has(key) || steps.length >= MAX_PLAN_STEPS) return;
    seen.add(key);
    steps.push(step);
  };

  // Seed concepts are user-authored free text: the strongest search signal.
  for (const concept of seedConcepts) {
    const q = concept.trim();
    if (q.length === 0) continue;
    push({ method: 'seed-search', target: q, label: `search: ${q}` });
  }
  // Seed topics become searches on the label the user controls.
  for (const topicId of seedTopics) {
    const label = resolveTopicLabel(topicId);
    if (label === null) continue;
    const q = label.trim();
    if (q.length === 0) continue;
    push({ method: 'seed-search', target: q, label: `search: ${q}` });
  }
  // Explicit channels: their uploads tabs. Accepts @handle, bare handle,
  // or full channel urls; normalized so spellings of one channel dedupe.
  for (const channel of explicitChannels) {
    const c = normalizeChannelTarget(channel);
    if (c === null) continue;
    push({ method: 'channel-uploads', target: c, label: `channel: ${c}` });
  }
  // Explicit playlists: direct acquisition starts.
  for (const playlist of seedPlaylists) {
    const p = normalizePlaylistTarget(playlist);
    if (p === null) continue;
    push({ method: 'playlist', target: p, label: `playlist: ${p}` });
  }

  return { viewpointId, steps, createdAt };
}

/** Accept raw ids, list urls, or full urls; yield the bare playlist id. */
export function normalizePlaylistTarget(raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  const m = t.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^(PL|OL|UU|FL|RD|LL)[A-Za-z0-9_-]{10,}$/.test(t)) return t;
  return null;
}

/**
 * Normalize a channel reference for dedup: @handle, bare handle, or a full
 * channel url all address the same uploads page. Bare handles are stored
 * with the @ prefix (the canonical spelling used in fetch urls).
 */
export function normalizeChannelTarget(raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  // Handle urls: youtube.com/@handle
  const handle = t.match(/youtube\.com\/(@[A-Za-z0-9._-]+)/);
  if (handle) return handle[1];
  // Canonical id urls: youtube.com/channel/UC...
  const uc = t.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (uc) return uc[1];
  if (t.startsWith('@')) return t;
  // Bare canonical id
  if (/^UC[A-Za-z0-9_-]{22}$/.test(t)) return t;
  if (/^[A-Za-z0-9._-]+$/.test(t)) return `@${t}`;
  return t;
}