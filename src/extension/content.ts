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
import { openViewpointRepository, VIEWPOINT_SEEDED_KEY } from '../viewpoints/repository';
import { seedDemoViewpoints } from '../viewpoints/demo';
import { generateViewstream } from '../viewpoints/viewstream';
import { summarizeViewpoint } from '../model/viewpoint';
import { renderViewpointManager } from '../ui/viewpoint-manager';

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
let panelMode: 'feed' | 'manager' = 'feed';

async function ensureSeeded(): Promise<void> {
  const seeded = await store.getKv(VIEWPOINT_SEEDED_KEY);
  if (seeded === true) return;
  const repo = openViewpointRepository(store);
  await seedDemoViewpoints(repo);
  await store.putKv(VIEWPOINT_SEEDED_KEY, true);
}

async function showFeed(): Promise<void> {
  feedVisible = true;
  panelMode = 'feed';
  const mount = ensureMount();
  mount.className = 'metube-visible';
  if (!mounted) {
    mounted = true;
    injectStyles();
  }
  mount.replaceChildren();
  const header = document.createElement('h2');
  header.textContent = 'MeTube feed';
  mount.append(header);

  await ensureSeeded();
  const repo = openViewpointRepository(store);
  const active = await repo.getActive();

  let snapshot: import('../model/types').FeedSnapshot;
  if (active) {
    // Viewstream: feed assembled through the active Viewpoint.
    const profile = await loadProfile();
    snapshot = await generateViewstream(provider, { viewpoint: active, limit: 8, profile }, nowIso());
    const banner = document.createElement('p');
    banner.className = 'metube-viewpoint-banner';
    banner.textContent = `Active Viewpoint: ${active.title} — this Viewstream was generated through it.`;
    mount.append(banner);
    const summary = document.createElement('p');
    summary.className = 'metube-viewpoint-summary';
    summary.textContent = `Constraints: ${summarizeViewpoint(active)}`;
    mount.append(summary);
  } else {
    const note = document.createElement('p');
    note.textContent = 'Unlensed bootstrap feed: local fixtures only. Every score component is shown per card. Activate a Viewpoint to generate a Viewstream.';
    mount.append(note);
    const profile = await loadProfile();
    snapshot = await assembleFeed(provider, { limit: 8, profile }, nowIso());
  }
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

  // Link to the manager from the feed itself: Viewpoints must be inspectable.
  const manage = document.createElement('button');
  manage.type = 'button';
  manage.textContent = 'Manage Viewpoints';
  manage.addEventListener('click', () => void showManager());
  mount.append(manage);
}

async function showManager(): Promise<void> {
  feedVisible = true;
  panelMode = 'manager';
  const mount = ensureMount();
  mount.className = 'metube-visible';
  if (!mounted) {
    mounted = true;
    injectStyles();
  }
  mount.replaceChildren();
  await ensureSeeded();
  const repo = openViewpointRepository(store);
  const [viewpoints, viewlists, activeId] = await Promise.all([
    repo.list(),
    repo.listViewlists(),
    store.getKv('active-viewpoint-id'),
  ]);
  const activeVp = await repo.getActive();
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back to feed';
  back.addEventListener('click', () => void showFeed());
  mount.append(back);
  mount.append(
    renderViewpointManager(repo, viewpoints, viewlists, activeVp ? activeVp.id : (activeId as string | null), {
      onActivate: () => void showFeed(),
      onRefreshFeed: () => void showManager(),
    }),
  );
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