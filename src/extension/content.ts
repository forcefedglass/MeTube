/**
 * Content script entry point. Orchestration lives here:
 *   nav entry -> feed assembly -> card rendering -> feedback -> persistence.
 *
 * Runs on youtube.com pages only (see manifest). It never reads YouTube's
 * own recommendations, never touches the watch history, and never
 * propagates anything to any server.
 */

import { emptyUserProfile } from '../model/types';
import type { FeedbackKind, UserFeedback, UserProfile } from '../model/types';
import { FixtureCandidateProvider } from '../discovery/fixture-provider';
import { assembleFeed } from '../discovery/assemble-feed';
import { openLocalStore } from '../storage/local-store';
import type { LocalStore } from '../storage/local-store';
import { insertNavEntry, ensureMount } from '../youtube/nav';
import { renderFeedCard } from '../ui/feed-card';
import { FEED_STYLES } from '../ui/styles';

const store: LocalStore = openLocalStore();
const provider = new FixtureCandidateProvider();

function nowIso(): string {
  return new Date().toISOString();
}

function loadProfile(): Promise<UserProfile> {
  return (store.getKv('user-profile') as Promise<UserProfile | undefined>).then(
    (p) => p ?? emptyUserProfile(nowIso()),
  );
}

function recordFeedback(profile: UserProfile, videoId: string, kind: FeedbackKind): UserProfile {
  const fb: UserFeedback = {
    id: `fb-${nowIso()}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
    videoId,
    kind,
    capturedAt: nowIso(),
  };
  return { ...profile, feedback: [...profile.feedback, fb], updatedAt: nowIso() };
}

let feedVisible = false;
let mounted = false;

async function showFeed(): Promise<void> {
  feedVisible = true;
  const mount = ensureMount();
  mount.className = 'metube-visible';
  if (!mounted) {
    mounted = true;
    injectStyles();
  }
  mount.replaceChildren();
  const header = document.createElement('h2');
  header.textContent = 'MeTube feed';
  const note = document.createElement('p');
  note.textContent = 'Bootstrap feed: local fixtures only. Every score component is shown per card.';
  mount.append(header, note);
  const profile = await loadProfile();
  const snapshot = await assembleFeed(provider, { limit: 8, profile }, nowIso());
  await store.saveFeed(snapshot);
  const list = document.createElement('div');
  list.className = 'metube-feed-list';
  for (const item of snapshot.feed) {
    list.append(
      renderFeedCard(item, {
        onFeedback: (videoId, kind) => {
          void loadProfile().then((current) => {
            const next = recordFeedback(current, videoId, kind);
            return store.putKv('user-profile', next);
          });
        },
        onMuteChannel: (channelId) => {
          void loadProfile().then((current) => {
            const next: UserProfile = {
              ...current,
              mutedChannelIds: [...new Set([...current.mutedChannelIds, channelId])],
              updatedAt: nowIso(),
            };
            return store.putKv('user-profile', next);
          });
        },
      }),
    );
  }
  mount.append(list);
}

function hideFeed(): void {
  feedVisible = false;
  const mount = document.getElementById('metube-mount');
  if (mount) mount.className = 'metube-hidden';
}

function toggleFeed(): void {
  if (feedVisible) hideFeed();
  else void showFeed();
}

function injectStyles(): void {
  const style = document.createElement('style');
  style.id = 'metube-styles';
  style.textContent = FEED_STYLES;
  document.head.append(style);
}

function bootstrap(): void {
  const inserted = insertNavEntry(toggleFeed);
  if (inserted) {
    console.info('[MeTube] nav entry inserted');
  }
  // YouTube is a SPA; re-insert when navigation replaces the guide.
  const mo = new MutationObserver(() => {
    if (!document.getElementById('metube-nav-entry')) {
      insertNavEntry(toggleFeed);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

bootstrap();