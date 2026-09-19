/**
 * YouTube page integration: inject a "MeTube" entry into YouTube's side nav.
 *
 * This module is DOM-only. It contains no scoring, no storage, no network.
 * Its job is to find the nav, insert the entry, and expose an anchor that
 * the feed UI can attach to. Bootstrap fidelity: single YouTube desktop
 * layout; MV3 Chromium.
 */

export const METUBE_NAV_ID = 'metube-nav-entry';
export const METUBE_MOUNT_ID = 'metube-mount';
export const METUBE_FEED_VISIBLE_KEY = 'metube:feed-visible';

/** Locate YouTube's primary side navigation element. */
export function findGuide(): HTMLElement | null {
  // YouTube desktop: #guide inside ytd-app; robust to minor markup drift.
  const candidates = [
    document.querySelector('ytd-guide-renderer'),
    document.querySelector('nav#guide'),
  ];
  for (const el of candidates) {
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

/** Find the first standard section of the guide (Home / Shorts / Subscriptions). */
export function findGuideSection(): HTMLElement | null {
  const guide = findGuide();
  if (!guide) return null;
  const section = guide.querySelector(
    'ytd-guide-section-renderer, tp-yt-paper-listbox',
  );
  return section instanceof HTMLElement ? section : null;
}

/** Build the MeTube nav entry element. Isolated styling via unique ids. */
export function buildNavEntry(): HTMLElement {
  const item = document.createElement('a');
  item.id = METUBE_NAV_ID;
  item.setAttribute('href', '#');
  item.textContent = 'YourTube';
  item.title = 'YourTube — independent discovery feed';
  return item;
}

/** Id for the floating fallback toggle (used when no guide exists). */
export const METUBE_FLOATING_ID = 'metube-floating-toggle';

/**
 * Insert the MeTube entry. Returns the inserted element or null when no
 * insertion point exists.
 *
 * Robustness: when YouTube's guide is absent (compact layouts, consent
 * interstitials, markup drift), a small floating toggle is injected into
 * the page instead. The feed stays reachable in every layout — the guide
 * is preferred, never required.
 */
export function insertNavEntry(onActivate: () => void): HTMLElement | null {
  const existing = document.getElementById(METUBE_NAV_ID);
  if (existing) return existing;
  const section = findGuideSection();
  if (section) {
    const entry = buildNavEntry();
    entry.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onActivate();
    });
    section.appendChild(entry);
    return entry;
  }
  let floating = document.getElementById(METUBE_FLOATING_ID);
  if (!floating) {
    floating = document.createElement('button');
    floating.id = METUBE_FLOATING_ID;
    (floating as HTMLButtonElement).type = 'button';
    floating.textContent = 'YourTube';
    floating.title = 'YourTube — independent discovery feed';
    document.body.appendChild(floating);
  }
  if (!floating.dataset.wired) {
    floating.dataset.wired = '1';
    floating.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onActivate();
    });
  }
  return floating;
}

/** Mount point for the feed UI. Sits over the page content area. */
export function ensureMount(): HTMLElement {
  let mount = document.getElementById(METUBE_MOUNT_ID);
  if (!mount) {
    mount = document.createElement('div');
    mount.id = METUBE_MOUNT_ID;
    document.body.appendChild(mount);
  }
  return mount;
}