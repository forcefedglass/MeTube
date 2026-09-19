/**
 * Feed card UI. Plain DOM, no framework. Every card must show:
 *   - video title, channel, duration
 *   - "why this appeared" reason line
 *   - all 8 ranking components with values and weighted contributions
 *   - the discovery source that surfaced it
 *   - explicit feedback buttons (the full Phase 4 semantics: exposure
 *     facts kept separate from preference signals)
 */

import type { FeedCandidate } from '../model/types';
import { RANK_COMPONENT_LABELS } from '../model/types';
import { RANK_COMPONENT_ORDER } from '../ranking/components';
import { decidePlayback } from '../youtube/playback';
import { buildIsolatedPlayer } from '../youtube/player-frame';
import { PHASE4_FEEDBACK_KINDS, FEEDBACK_LABELS } from '../model/feedback';

export interface CardCallbacks {
  onFeedback: (videoId: string, kind: import('../model/types').FeedbackKind) => void;
  onMuteChannel: (channelId: string) => void;
  /** Phase 3: clicking the card opens the candidate inspector. */
  onInspect?: (item: FeedCandidate, card: HTMLElement) => void;
  /**
   * Phase 4: "Compare treatments" — offered only when an evidenced
   * same-subject different-position pairing exists for this item. The
   * callback receives the card element; it opens the comparison panel.
   */
  onCompare?: (card: HTMLElement) => void;
}

export function renderFeedCard(
  item: FeedCandidate,
  callbacks: CardCallbacks,
): HTMLElement {
  const card = document.createElement('article');
  card.className = 'metube-card';
  card.dataset.videoId = item.candidate.id;

  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = item.candidate.title;
  const channel = document.createElement('div');
  channel.className = 'metube-card-channel';
  channel.textContent = item.candidate.channelTitle;
  header.append(title, channel);
  card.append(header);

  const reason = document.createElement('p');
  reason.className = 'metube-card-reason';
  reason.textContent = item.reason;
  card.append(reason);

  const source = document.createElement('p');
  source.className = 'metube-card-source';
  source.textContent = `Discovered via: ${item.candidate.discoveredVia}`;
  card.append(source);

  const scoreTable = renderScoreTable(item);
  card.append(scoreTable);

  const playArea = document.createElement('div');
  playArea.className = 'metube-card-player';
  const decision = decidePlayback(item.candidate.id);
  renderPlayback(playArea, decision, item.candidate.id);
  card.append(playArea);

  card.append(renderFeedbackRow(item, callbacks));

  if (callbacks.onInspect) {
    card.classList.add('metube-card-inspectable');
    card.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      // Buttons, links, and the player area keep their own behavior; the
      // inspector opens only from plain card clicks.
      if (target.closest('button, a, iframe, .metube-card-player')) return;
      callbacks.onInspect?.(item, card);
    });
  }

  // Phase 4: "Compare treatments" is offered only when the caller has
  // evidenced pairings for this item. No evidence -> no button; no
  // forced symmetry.
  if (callbacks.onCompare) {
    const compare = document.createElement('button');
    compare.type = 'button';
    compare.className = 'metube-card-compare';
    compare.textContent = 'Compare treatments';
    compare.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onCompare?.(card);
    });
    card.append(compare);
  }
  return card;
}

function renderScoreTable(item: FeedCandidate): HTMLElement {
  const details = document.createElement('details');
  details.className = 'metube-card-components';
  const summary = document.createElement('summary');
  summary.textContent = 'Ranking components';
  details.append(summary);
  const table = document.createElement('table');
  table.className = 'metube-component-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Component</th><th>Value</th><th>Weighted</th></tr>';
  table.append(thead);
  const tbody = document.createElement('tbody');
  for (const name of RANK_COMPONENT_ORDER) {
    const tr = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.textContent = RANK_COMPONENT_LABELS[name];
    const valueTd = document.createElement('td');
    valueTd.textContent = item.components[name].toFixed(3);
    const weightedTd = document.createElement('td');
    weightedTd.textContent = item.weighted[name].toFixed(3);
    tr.append(labelTd, valueTd, weightedTd);
    tbody.append(tr);
  }
  table.append(tbody);
  details.append(table);
  return details;
}

function renderPlayback(
  host: HTMLElement,
  decision: ReturnType<typeof decidePlayback>,
  videoId: string,
): void {
  if (decision.kind === 'embedded') {
    host.append(buildIsolatedPlayer(decision.videoId));
    return;
  }
  const note = document.createElement('p');
  note.className = 'metube-card-playback-note';
  note.textContent =
    decision.kind === 'disabled'
      ? 'Playback disabled: fixture video (synthetic id, not on YouTube).'
      : 'Playback unavailable.';
  host.append(note);
}

function renderFeedbackRow(
  item: FeedCandidate,
  callbacks: CardCallbacks,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'metube-card-feedback';

  // Phase 4: the full explicit feedback vocabulary. Exposure facts
  // ("I watched this") stay separate from preference signals ("I want
  // more of this") — semantics are declared in src/model/feedback.ts,
  // not inferred here.
  const exposure = document.createElement('div');
  exposure.className = 'metube-feedback-group metube-feedback-exposure';
  exposure.append(feedbackButton(item, 'watched', callbacks));
  exposure.append(feedbackButton(item, 'skipped', callbacks));
  exposure.append(feedbackButton(item, 'saved', callbacks));
  row.append(exposure);

  const preference = document.createElement('div');
  preference.className = 'metube-feedback-group metube-feedback-preference';
  for (const kind of PHASE4_FEEDBACK_KINDS) {
    preference.append(feedbackButton(item, kind, callbacks));
  }
  row.append(preference);

  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'metube-feedback-mute';
  mute.textContent = `Mute channel (${item.candidate.channelTitle})`;
  mute.addEventListener('click', () => callbacks.onMuteChannel(item.candidate.channelId));
  row.append(mute);
  return row;
}

function feedbackButton(
  item: FeedCandidate,
  kind: import('../model/types').FeedbackKind,
  callbacks: CardCallbacks,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = FEEDBACK_LABELS[kind];
  btn.addEventListener('click', () => callbacks.onFeedback(item.candidate.id, kind));
  return btn;
}