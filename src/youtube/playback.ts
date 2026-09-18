/**
 * Playback isolation boundary — decisions only. Pure, DOM-free, testable.
 *
 * What MeTube can and cannot guarantee, stated plainly:
 *   CAN   — session isolation: real videos play in a sandboxed iframe on
 *           the youtube-nocookie.com embed origin with cookies blocked and
 *           referrers suppressed, so playback is not attached to the
 *           user's logged-in YouTube session or watch history.
 *   CANNOT — guarantee YouTube servers never see the request. Loading
 *           any real video contacts YouTube. The isolation is session
 *           isolation, not anonymity. Fixtures are never playable.
 *
 * This module is the only place playback decisions are made.
 */

export type PlaybackDecision =
  | { kind: 'disabled'; reason: 'fixture'; videoId: string }
  | { kind: 'embedded'; videoId: string }
  | { kind: 'unavailable'; reason: string; videoId: string };

export const ISOLATED_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

export function decidePlayback(videoId: string): PlaybackDecision {
  if (videoId.startsWith('MT-FX-')) {
    return { kind: 'disabled', reason: 'fixture', videoId };
  }
  return { kind: 'embedded', videoId };
}

/** URL for the isolated embed. Pure string building, no DOM. */
export function isolatedEmbedUrl(videoId: string): string {
  return `${ISOLATED_EMBED_ORIGIN}/embed/${encodeURIComponent(videoId)}?rel=0`;
}

export const ISOLATED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation';
export const ISOLATED_REFERRER_POLICY = 'no-referrer';
export const ISOLATED_ALLOW_FEATURES =
  'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';