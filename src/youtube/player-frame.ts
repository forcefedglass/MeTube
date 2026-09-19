/**
 * Isolated player construction (DOM side of the playback boundary).
 * Decisions live in playback.ts; this file only builds elements.
 */

import {
  isolatedEmbedUrl,
  ISOLATED_SANDBOX,
  ISOLATED_REFERRER_POLICY,
  ISOLATED_ALLOW_FEATURES,
} from './playback';

export function buildIsolatedPlayer(videoId: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = isolatedEmbedUrl(videoId);
  iframe.setAttribute('sandbox', ISOLATED_SANDBOX);
  iframe.setAttribute('referrerpolicy', ISOLATED_REFERRER_POLICY);
  iframe.setAttribute('title', 'YourTube isolated playback');
  iframe.allow = ISOLATED_ALLOW_FEATURES;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  return iframe;
}