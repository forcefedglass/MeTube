/**
 * Feed card UI. Plain DOM, no framework. Every card must show:
 *   - video title, channel, duration
 *   - "why this appeared" reason line
 *   - all 8 ranking components with values and weighted contributions
 *   - the discovery source that surfaced it
 *   - explicit feedback buttons (watched / skipped / saved / not interested / more like this)
 */

import type { FeedCandidate } from '../model/types';
import { RANK_COMPONENT_LABELS } from '../model/types';
import { RANK_COMPONENT_ORDER } from '../ranking/components';
import { decidePlayback } from '../youtube/playback';
import { buildIsolatedPlayer } from '../youtube/player-frame';

export interface CardCallbacks {
  onFeedback: (videoId: string, kind: import('../model/types').FeedbackKind) => void;
  onMuteChannel: (channelId: string) => void;
  /** Phase 3: clicking the card opens the candidate inspector. */
  onInspect?: (item: FeedCandidate, card: HTMLElement) => void;
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
  const kinds: Array<{ kind: import('../model/types').FeedbackKind; label: string }> = [
    { kind: 'watched', label: 'Watched' },
    { kind: 'skipped', label: 'Skipped' },
    { kind: 'saved', label: 'Save' },
    { kind: 'not-interested', label: 'Not interested' },
    { kind: 'more-like-this', label: 'More like this' },
  ];
  for (const { kind, label } of kinds) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', () => callbacks.onFeedback(item.candidate.id, kind));
    row.append(btn);
  }
  const mute = document.createElement('button');
  mute.type = 'button';
  mute.textContent = `Mute channel (${item.candidate.channelTitle})`;
  mute.addEventListener('click', () => callbacks.onMuteChannel(item.candidate.channelId));
  row.append(mute);
  return row;
}