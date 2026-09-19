/**
 * Saved panel — Phase 5 SAVED tab.
 *
 * Lists every video the user saved (explicit 'saved' feedback), most
 * recent first, with the Viewpoint it was saved under when that was
 * recorded. Pure rendering: no inference, no re-ranking.
 */

import type { UserFeedback, UserProfile } from '../model/types';
import type { FeedCandidate } from '../model/types';

export function renderSavedPanel(
  profile: UserProfile,
  poolCandidates: FeedCandidate['candidate'][],
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-saved';
  const h = document.createElement('h3');
  h.textContent = 'Saved';
  wrap.append(h);

  const saved: UserFeedback[] = profile.feedback
    .filter((f) => f.kind === 'saved')
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

  if (saved.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'metube-saved-empty';
    empty.textContent =
      'Nothing saved yet. "Save" on any card records an explicit exposure fact here (never a preference signal).';
    wrap.append(empty);
    return wrap;
  }

  const byId = new Map(poolCandidates.map((c) => [c.id, c]));
  const list = document.createElement('div');
  list.className = 'metube-feed-list';
  for (const entry of saved) {
    const c = byId.get(entry.videoId);
    const card = document.createElement('div');
    card.className = 'metube-card';
    const title = document.createElement('h4');
    title.textContent = c?.title ?? entry.videoId;
    const meta = document.createElement('div');
    meta.className = 'metube-card-channel';
    meta.textContent =
      (c?.channelTitle ?? 'unknown channel') +
      ` — saved ${entry.capturedAt.slice(0, 10)}` +
      (entry.viewpointId ? ` under Viewpoint ${entry.viewpointId}` : '');
    const link = document.createElement('a');
    link.href = `https://www.youtube.com/watch?v=${entry.videoId}`;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = 'Open on YouTube';
    card.append(title, meta, link);
    list.append(card);
  }
  wrap.append(list);
  return wrap;
}