/**
 * ytInitialData parser — pure, DOM-free, fetch-free, deterministic.
 *
 * Real YouTube pages embed a `ytInitialData = {...}` JSON blob. This module
 * extracts video candidates from that JSON for the three acquisition
 * surfaces MeTube uses:
 *   - search results (`/results?search_query=...`)
 *   - channel uploads (`/@handle/videos` — new `lockupViewModel` shape)
 *   - playlists (`/playlist?list=...`)
 *
 * It never fabricates metadata: a field the source does not carry is null.
 * Two source shapes are handled per surface because YouTube serves both the
 * classic `videoRenderer` and the newer `lockupViewModel` layouts.
 */

import type { DiscoveredCandidate } from '../model/discovery';
import type { CandidateProvenance, MetadataConfidence } from '../model/discovery';

/** Raw JSON value; the parser is tolerant of unknown shapes by design. */
type Json = undefined | null | boolean | number | string | Json[] | { [k: string]: Json };

/** Regex for the embedded JSON blob; `s` flag because it is one huge line. */
const YT_INITIAL_DATA_RE = /ytInitialData\s*=\s*(\{.*?\});/s;

/** Parse failure report — surfaced, never swallowed. */
export interface ParseFailure {
  reason: string;
}

export type ParseResult =
  | { ok: true; candidates: DiscoveredCandidate[] }
  | { ok: false; error: ParseFailure };

/** Channel-id resolution outcome: the id or the reason it is unavailable. */
export type ChannelIdResult =
  | { ok: true; channelId: string }
  | { ok: false; error: ParseFailure };

export function parseYtInitialData(html: string): Json | null {
  const m = html.match(YT_INITIAL_DATA_RE);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Json;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared field extraction helpers. All return null when the source does not
// provide the field — never a guess.
// ---------------------------------------------------------------------------

function runsText(node: Json): string | null {
  if (!isObject(node)) return null;
  const runs = node['runs'];
  if (!Array.isArray(runs)) return null;
  const parts: string[] = [];
  for (const r of runs) {
    if (isObject(r) && typeof r['text'] === 'string') parts.push(r['text']);
  }
  return parts.length > 0 ? parts.join('') : null;
}

function simpleText(node: Json): string | null {
  if (isObject(node) && typeof node['simpleText'] === 'string') {
    return node['simpleText'];
  }
  return null;
}

function isObject(v: Json): v is { [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** "14:47" or "1:02:03" -> seconds; null when unparseable. */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  let seconds = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    seconds = seconds * 60 + Number(p);
  }
  return seconds;
}

/** "694,704 views" -> 694704; null when the text does not say views. */
export function parseViewCount(text: string): number | null {
  const m = text.replace(/,/g, '').match(/^([\d.]+)([KMB]?) views$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2].toUpperCase()) {
    case 'K': return Math.round(n * 1_000);
    case 'M': return Math.round(n * 1_000_000);
    case 'B': return Math.round(n * 1_000_000_000);
    default: return Math.round(n);
  }
}

/**
 * Relative publication time. Both spellings appear in the wild:
 * "2 years ago" (verbose) and "2y ago" (compact). Recorded verbatim in
 * `relativePublishedText`; never converted to an absolute date, because
 * that would fabricate precision the source does not carry.
 */
export function parseRelativePublished(text: string): boolean {
  return /^\d+\s*(second|sec|minute|min|hour|hr|day|d|week|w|month|mo|year|y)s?\s+ago$/i.test(
    text.trim(),
  );
}

function bestThumbnail(node: Json): string | null {
  if (!isObject(node)) return null;
  const thumbs = node['thumbnails'];
  if (!Array.isArray(thumbs)) return null;
  let best: { url: string; width: number } | null = null;
  for (const t of thumbs) {
    if (!isObject(t)) continue;
    const url = t['url'];
    const width = t['width'];
    if (typeof url !== 'string') continue;
    const w = typeof width === 'number' ? width : 0;
    if (best === null || w > best.width) best = { url, width: w };
  }
  return best ? best.url : null;
}

function imageSourcesThumbnail(node: Json): string | null {
  if (!isObject(node)) return null;
  const sources = node['sources'];
  if (!Array.isArray(sources)) return null;
  let best: { url: string; width: number } | null = null;
  for (const s of sources) {
    if (!isObject(s)) continue;
    const url = s['url'];
    const width = s['width'];
    if (typeof url !== 'string') continue;
    const w = typeof width === 'number' ? width : 0;
    if (best === null || w > best.width) best = { url, width: w };
  }
  return best ? best.url : null;
}

function videoIdLooksReal(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

// ---------------------------------------------------------------------------
// Deep renderer collection. YouTube nests renderers arbitrarily; walk the
// whole tree collecting nodes that carry a video id.
// ---------------------------------------------------------------------------

function collectVideoRenderers(root: Json): Json[] {
  const out: Json[] = [];
  const stack: Json[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (key === 'videoRenderer' && isObject(value) && typeof value['videoId'] === 'string') {
        out.push(value);
      } else {
        stack.push(value);
      }
    }
  }
  return out;
}

function collectLockupViewModels(root: Json): Json[] {
  const out: Json[] = [];
  const stack: Json[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (
        key === 'lockupViewModel' &&
        isObject(value) &&
        typeof value['contentId'] === 'string' &&
        value['contentType'] === 'LOCKUP_CONTENT_TYPE_VIDEO'
      ) {
        out.push(value);
      } else {
        stack.push(value);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Candidate extraction per renderer shape
// ---------------------------------------------------------------------------

/** Extra source metadata kept on every real candidate. */
export interface SourceExtras {
  /** Channel browse id (UC...). */
  channelId: string | null;
  /** Verbatim relative publish text, e.g. "6d ago". */
  relativePublishedText: string | null;
}

/** Parse one classic `videoRenderer` (search results). */
function candidateFromVideoRenderer(
  vr: Json,
  provenance: CandidateProvenance,
): { candidate: DiscoveredCandidate; extras: SourceExtras } | null {
  if (!isObject(vr)) return null;
  const videoId = vr['videoId'];
  if (typeof videoId !== 'string' || !videoIdLooksReal(videoId)) return null;

  const title = runsText(vr['title']);
  const ownerRuns = isObject(vr['ownerText']) ? vr['ownerText'] : vr['longBylineText'];
  let channelTitle: string | null = null;
  let channelId: string | null = null;
  if (isObject(ownerRuns)) {
    channelTitle = runsText(ownerRuns);
    const runs = ownerRuns['runs'];
    if (Array.isArray(runs)) {
      for (const r of runs) {
        if (!isObject(r)) continue;
        const nav = r['navigationEndpoint'];
        if (!isObject(nav)) continue;
        const browse = nav['browseEndpoint'];
        if (isObject(browse) && typeof browse['browseId'] === 'string') {
          channelId = browse['browseId'];
          break;
        }
      }
    }
  }

  const publishedText = simpleText(vr['publishedTimeText']);
  const lengthText = simpleText(vr['lengthText']);
  const viewText = simpleText(vr['viewCountText']);

  const durationSeconds = lengthText !== null ? parseDuration(lengthText) : null;
  const viewCount = viewText !== null ? parseViewCount(viewText) : null;
  // Relative dates ("2y ago") are not absolute dates; recorded verbatim in
  // extras, never in publishedAt. Absolute text (rare) lands in publishedAt.
  const publishedAt =
    publishedText !== null && !parseRelativePublished(publishedText) ? publishedText : null;
  const relativePublishedText =
    publishedText !== null && parseRelativePublished(publishedText) ? publishedText : null;

  return {
    candidate: {
      videoId,
      channelId,
      channelTitle,
      title,
      description: null,
      publishedAt,
      durationSeconds,
      viewCount,
      tags: [],
      thumbnailUrl: isObject(vr['thumbnail']) ? bestThumbnail(vr['thumbnail']) : null,
      language: null,
      metadataConfidence: 'page-metadata' satisfies MetadataConfidence,
      provenance,
    },
    extras: {
      channelId,
      relativePublishedText,
    },
  };
}

/** Parse one `lockupViewModel` (channel uploads, playlists; new layout). */
function candidateFromLockupViewModel(
  lvm: Json,
  provenance: CandidateProvenance,
): { candidate: DiscoveredCandidate; extras: SourceExtras } | null {
  if (!isObject(lvm)) return null;
  const videoId = lvm['contentId'];
  if (typeof videoId !== 'string' || !videoIdLooksReal(videoId)) return null;

  const metadata = isObject(lvm['metadata']) ? lvm['metadata'] : null;
  const lockupMetadata = metadata && isObject(metadata['lockupMetadataViewModel'])
    ? metadata['lockupMetadataViewModel']
    : null;
  const title =
    lockupMetadata && isObject(lockupMetadata['title']) && typeof lockupMetadata['title']['content'] === 'string'
      ? lockupMetadata['title']['content']
      : null;

  // metadataRows carry [channelTitle?] and [viewCountText, publishedText]
  let channelTitle: string | null = null;
  let viewCount: number | null = null;
  let relativePublishedText: string | null = null;
  let publishedAt: string | null = null;
  if (
    lockupMetadata &&
    isObject(lockupMetadata['metadata']) &&
    isObject(lockupMetadata['metadata']['contentMetadataViewModel'])
  ) {
    const rows = lockupMetadata['metadata']['contentMetadataViewModel']['metadataRows'];
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!isObject(row)) continue;
        const parts = row['metadataParts'];
        if (!Array.isArray(parts)) continue;
        for (const part of parts) {
          if (!isObject(part)) continue;
          const textNode = part['text'];
          if (!isObject(textNode)) continue;
          const text = typeof textNode['content'] === 'string' ? textNode['content'] : null;
          if (text === null) continue;
          const vc = parseViewCount(text);
          if (vc !== null) {
            viewCount = vc;
            continue;
          }
          if (parseRelativePublished(text)) {
            relativePublishedText = text;
            continue;
          }
          if (/^[\d.]+[KMB]?$/i.test(text)) {
            // Compact view count without the word "views" (uploads rows).
            const compact = parseCompactCount(text);
            if (compact !== null) viewCount = compact;
            continue;
          }
          // Anything date-shaped is never a channel title.
          if (/(ago|views?|streaming|premiere)$/i.test(text)) continue;
          if (channelTitle === null) channelTitle = text;
        }
      }
    }
  }

  // Duration lives in thumbnail overlay badges.
  let durationSeconds: number | null = null;
  const contentImage = isObject(lvm['contentImage']) ? lvm['contentImage'] : null;
  if (contentImage && isObject(contentImage['thumbnailViewModel'])) {
    const overlays = contentImage['thumbnailViewModel']['overlays'];
    if (Array.isArray(overlays)) {
      for (const overlay of overlays) {
        if (!isObject(overlay)) continue;
        const bottom = overlay['thumbnailBottomOverlayViewModel'];
        if (!isObject(bottom)) continue;
        const badges = bottom['badges'];
        if (!Array.isArray(badges)) continue;
        for (const badge of badges) {
          if (!isObject(badge)) continue;
          const tbv = badge['thumbnailBadgeViewModel'];
          if (!isObject(tbv)) continue;
          const text = typeof tbv['text'] === 'string' ? tbv['text'] : null;
          if (text === null) continue;
          const d = parseDuration(text);
          if (d !== null) {
            durationSeconds = d;
            break;
          }
        }
        if (durationSeconds !== null) break;
      }
    }
  }

  const thumbnailUrl = contentImage && isObject(contentImage['thumbnailViewModel'])
    ? imageSourcesThumbnail(contentImage['thumbnailViewModel']['image'])
    : null;

  return {
    candidate: {
      videoId,
      channelId: null,
      channelTitle,
      title,
      description: null,
      publishedAt,
      durationSeconds,
      viewCount,
      tags: [],
      thumbnailUrl,
      language: null,
      metadataConfidence: 'page-metadata' satisfies MetadataConfidence,
      provenance,
    },
    extras: { channelId: null, relativePublishedText },
  };
}

/** "835K" -> 835000; null when not a compact count. */
export function parseCompactCount(text: string): number | null {
  const m = text.trim().match(/^([\d.]+)([KMB]?)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2].toUpperCase()) {
    case 'K': return Math.round(n * 1_000);
    case 'M': return Math.round(n * 1_000_000);
    case 'B': return Math.round(n * 1_000_000_000);
    default: return Math.round(n);
  }
}

// ---------------------------------------------------------------------------
// Page-level entry points
// ---------------------------------------------------------------------------

/**
 * Parse a YouTube search-results page HTML into candidates.
 * `seed` is the query that produced the page (provenance).
 */
export function parseSearchResults(
  html: string,
  provenance: CandidateProvenance,
): ParseResult {
  const data = parseYtInitialData(html);
  if (data === null) {
    return { ok: false, error: { reason: 'no ytInitialData found in page' } };
  }
  const renderers = collectVideoRenderers(data);
  const out: DiscoveredCandidate[] = [];
  for (const vr of renderers) {
    const parsed = candidateFromVideoRenderer(vr, provenance);
    if (parsed) out.push(parsed.candidate);
  }
  return { ok: true, candidates: out };
}

/**
 * Parse a channel uploads page (`/@handle/videos`) into candidates.
 * Handles both the new `lockupViewModel` grid and a classic
 * `videoRenderer` fallback. `channelId`/`channelTitle` from the page
 * metadata fill in what item renderers omit.
 */
export function parseChannelUploads(
  html: string,
  provenance: CandidateProvenance,
): ParseResult {
  const data = parseYtInitialData(html);
  if (data === null) {
    return { ok: false, error: { reason: 'no ytInitialData found in page' } };
  }
  // Channel-level metadata fills per-item gaps (lockups carry no channel id).
  const channelMeta = readChannelMetadata(data);
  const out: DiscoveredCandidate[] = [];
  for (const lvm of collectLockupViewModels(data)) {
    const parsed = candidateFromLockupViewModel(lvm, provenance);
    if (!parsed) continue;
    const c = parsed.candidate;
    out.push({
      ...c,
      channelId: c.channelId ?? channelMeta.channelId,
      channelTitle: c.channelTitle ?? channelMeta.channelTitle,
      language: channelMeta.language,
    });
  }
  if (out.length === 0) {
    for (const vr of collectVideoRenderers(data)) {
      const parsed = candidateFromVideoRenderer(vr, provenance);
      if (parsed) out.push(parsed.candidate);
    }
  }
  return { ok: true, candidates: out };
}

/**
 * Parse a playlist page (`/playlist?list=...`) into candidates.
 * Same lockup shape as channel uploads.
 */
export function parsePlaylist(
  html: string,
  provenance: CandidateProvenance,
): ParseResult {
  const data = parseYtInitialData(html);
  if (data === null) {
    return { ok: false, error: { reason: 'no ytInitialData found in page' } };
  }
  const out: DiscoveredCandidate[] = [];
  for (const lvm of collectLockupViewModels(data)) {
    const parsed = candidateFromLockupViewModel(lvm, provenance);
    if (parsed) out.push(parsed.candidate);
  }
  if (out.length === 0) {
    for (const vr of collectVideoRenderers(data)) {
      const parsed = candidateFromVideoRenderer(vr, provenance);
      if (parsed) out.push(parsed.candidate);
    }
  }
  return { ok: true, candidates: out };
}

/**
 * Page-level channel metadata (uploads pages): channel id, title, and the
 * channel's default language when declared.
 */
export interface ChannelMetadata {
  channelId: string | null;
  channelTitle: string | null;
  language: string | null;
}

function readChannelMetadata(data: Json): ChannelMetadata {
  const meta = isObject(data) ? data['metadata'] : null;
  const cmr = meta && isObject(meta) && isObject(meta['channelMetadataRenderer'])
    ? meta['channelMetadataRenderer']
    : null;
  let channelId: string | null = null;
  let channelTitle: string | null = null;
  if (isObject(cmr)) {
    const eid = cmr['externalId'];
    if (typeof eid === 'string') channelId = eid;
    const t = cmr['title'];
    if (typeof t === 'string') channelTitle = t;
  }
  // Language hint from the page header when present (never fabricated).
  let language: string | null = null;
  const micro = isObject(data) ? data['microformat'] : null;
  if (isObject(micro)) {
    const mdr = micro['microformatDataRenderer'];
    if (isObject(mdr)) {
      const tags = mdr['tags'];
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          if (typeof tag === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(tag)) {
            language = tag;
            break;
          }
        }
      }
    }
  }
  return { channelId, channelTitle, language };
}

/**
 * Resolve a channel homepage to its channel id
 * (`metadata.channelMetadataRenderer.externalId`). Returns null when the
 * page carries no channel id — never guesses.
 */
export function parseChannelId(html: string): ChannelIdResult {
  const data = parseYtInitialData(html);
  if (data === null) {
    return { ok: false, error: { reason: 'no ytInitialData found in page' } };
  }
  const meta = readChannelMetadata(data);
  if (meta.channelId === null) {
    return { ok: false, error: { reason: 'page carries no channel id' } };
  }
  return { ok: true, channelId: meta.channelId };
}

/** Detect an error/alert page (nonexistent playlist/channel). */
export function parseAlertError(html: string): string | null {
  const data = parseYtInitialData(html);
  if (data === null) return null;
  const alerts = isObject(data) ? data['alerts'] : null;
  if (!Array.isArray(alerts)) return null;
  for (const alert of alerts) {
    if (!isObject(alert)) continue;
    const ar = alert['alertRenderer'];
    if (!isObject(ar)) continue;
    if (ar['type'] === 'ERROR') {
      const text = runsText(ar['text']);
      if (text !== null) return text;
    }
  }
  return null;
}