/**
 * Candidate inspector UI — the Phase 3 information map surface.
 *
 * Clicking a candidate opens this panel. It shows, per dimension:
 *   - WHY THIS APPEARED (the ranking reason + discovery provenance)
 *   - TOPICS / SOURCE TYPE / NARRATIVE CLUSTER / TEMPORAL POSITION with
 *     value, confidence, origin/method, and evidence (verbatim)
 *   - USER OVERRIDES — current override state, set/clear controls
 *
 * The panel never editorializes: it restates classification facts. Where a
 * dimension is UNKNOWN it says so plainly — UNKNOWN is a real answer, not
 * a gap to be papered over.
 */

import type { FeedCandidate } from '../model/types';
import type {
  ClassificationDimension,
  ClassifiedValue,
  VideoClassification,
} from '../model/classification';
import {
  DIMENSION_LABELS,
  SOURCE_TYPE_LABELS,
  TEMPORAL_POSITION_LABELS,
} from '../model/classification';
import type { ClassificationOverride } from '../model/classification';

export interface InspectorCallbacks {
  /** Set an override for a video + dimension. */
  onSetOverride: (videoId: string, dimension: ClassificationDimension, value: string, note?: string) => void;
  /** Clear the override for a video + dimension. */
  onClearOverride: (videoId: string, dimension: ClassificationDimension) => void;
  onClose: () => void;
}

export function renderCandidateInspector(
  item: FeedCandidate,
  classification: VideoClassification | undefined,
  overrides: ClassificationOverride[],
  callbacks: InspectorCallbacks,
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'metube-inspector';

  const header = document.createElement('header');
  header.className = 'metube-inspector-header';
  const title = document.createElement('h3');
  title.textContent = item.candidate.title;
  const channel = document.createElement('div');
  channel.className = 'metube-card-channel';
  channel.textContent = item.candidate.channelTitle;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => callbacks.onClose());
  header.append(title, channel, close);
  panel.append(header);

  panel.append(renderWhyThisAppeared(item));
  panel.append(renderDiscoveryProvenance(item));

  if (!classification) {
    const empty = document.createElement('p');
    empty.className = 'metube-inspector-unknown';
    empty.textContent = 'No classification recorded for this candidate yet.';
    panel.append(empty);
    return panel;
  }

  panel.append(renderDimension(
    'topics',
    classification.topics.length > 0
      ? classification.topics
      : [],
    overrides,
    item.candidate.id,
    'topic ids, comma-separated',
    callbacks,
  ));
  panel.append(renderSingle(
    'sourceType',
    classification.sourceType,
    labelFor('sourceType', classification.sourceType.value),
    overrides,
    item.candidate.id,
    'source type (official|publication|independent-creator|enthusiast-community|technical-analyst|academic-expert|primary-source|promotional-sponsored|unknown)',
    callbacks,
  ));
  panel.append(renderSingle(
    'narrativeCluster',
    classification.narrativeCluster,
    classification.narrativeCluster.value,
    overrides,
    item.candidate.id,
    'narrative cluster id, or unknown',
    callbacks,
  ));
  panel.append(renderSingle(
    'temporalPosition',
    classification.temporalPosition,
    labelFor('temporalPosition', classification.temporalPosition.value),
    overrides,
    item.candidate.id,
    'temporal position (contemporary|historical|pre-event|post-event|retrospective|unknown)',
    callbacks,
  ));

  return panel;
}

function labelFor(dimension: ClassificationDimension, value: string): string {
  if (dimension === 'sourceType' && value in SOURCE_TYPE_LABELS) {
    return SOURCE_TYPE_LABELS[value as keyof typeof SOURCE_TYPE_LABELS];
  }
  if (dimension === 'temporalPosition' && value in TEMPORAL_POSITION_LABELS) {
    return TEMPORAL_POSITION_LABELS[value as keyof typeof TEMPORAL_POSITION_LABELS];
  }
  return value;
}

function renderWhyThisAppeared(item: FeedCandidate): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-inspector-why';
  const heading = document.createElement('h4');
  heading.textContent = 'Why this appeared';
  box.append(heading);
  const reason = document.createElement('p');
  reason.textContent = item.reason;
  box.append(reason);
  const list = document.createElement('ul');
  for (const [name, text] of Object.entries(item.explanations)) {
    const li = document.createElement('li');
    li.textContent = `${name}: ${text}`;
    list.append(li);
  }
  if (list.children.length > 0) box.append(list);
  return box;
}

function renderDiscoveryProvenance(item: FeedCandidate): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-inspector-provenance';
  const heading = document.createElement('h4');
  heading.textContent = 'Discovery provenance';
  box.append(heading);
  const primary = document.createElement('p');
  primary.textContent = `Surfaced by: ${item.candidate.discoveredVia}`;
  box.append(primary);
  if (item.candidate.alsoSeenVia.length > 0) {
    const also = document.createElement('p');
    also.textContent = `Also seen via: ${item.candidate.alsoSeenVia.join(', ')}`;
    box.append(also);
  }
  return box;
}

function renderSingle(
  dimension: ClassificationDimension,
  value: ClassifiedValue,
  label: string,
  overrides: ClassificationOverride[],
  videoId: string,
  hint: string,
  callbacks: InspectorCallbacks,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-inspector-dimension';
  const heading = document.createElement('h4');
  heading.textContent = DIMENSION_LABELS[dimension];
  box.append(heading);
  const valueLine = document.createElement('p');
  valueLine.className = value.value === 'unknown' ? 'metube-inspector-unknown' : '';
  valueLine.textContent = `Value: ${label}`;
  box.append(valueLine);
  box.append(renderAuditTrail(value));
  box.append(renderOverrideControls(dimension, overrides, videoId, hint, callbacks));
  return box;
}

function renderDimension(
  dimension: ClassificationDimension,
  values: ClassifiedValue[],
  overrides: ClassificationOverride[],
  videoId: string,
  hint: string,
  callbacks: InspectorCallbacks,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-inspector-dimension';
  const heading = document.createElement('h4');
  heading.textContent = DIMENSION_LABELS[dimension];
  box.append(heading);
  if (values.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'metube-inspector-unknown';
    empty.textContent = 'Value: unknown — no topics evidenced for this candidate.';
    box.append(empty);
  } else {
    const list = document.createElement('ul');
    for (const v of values) {
      const li = document.createElement('li');
      li.textContent = `${v.value} (confidence ${v.confidence.toFixed(2)}, ${v.origin}/${v.method}: ${v.evidence})`;
      list.append(li);
    }
    box.append(list);
  }
  box.append(renderOverrideControls(dimension, overrides, videoId, hint, callbacks));
  return box;
}

function renderAuditTrail(value: ClassifiedValue): HTMLElement {
  const p = document.createElement('p');
  p.className = 'metube-inspector-audit';
  p.textContent =
    `Confidence ${value.confidence.toFixed(2)} · origin: ${value.origin} · method: ${value.method} · evidence: ${value.evidence}`;
  return p;
}

function renderOverrideControls(
  dimension: ClassificationDimension,
  overrides: ClassificationOverride[],
  videoId: string,
  hint: string,
  callbacks: InspectorCallbacks,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-inspector-override';
  const existing = overrides.find((o) => o.videoId === videoId && o.dimension === dimension);
  const state = document.createElement('p');
  if (existing) {
    state.textContent =
      `User override: ${existing.value}` +
      (existing.note && existing.note.length > 0 ? ` (note: ${existing.note})` : '');
  } else {
    state.textContent = 'User override: none (machine classification shown).';
  }
  box.append(state);

  const setBtn = document.createElement('button');
  setBtn.type = 'button';
  setBtn.textContent = 'Set override';
  setBtn.addEventListener('click', () => {
    const value = prompt(`${DIMENSION_LABELS[dimension]} override — ${hint}`, existing?.value ?? '');
    if (value === null) return;
    const note = prompt('Optional note (shown verbatim)', existing?.note ?? '') ?? undefined;
    callbacks.onSetOverride(videoId, dimension, value.trim(), note && note.length > 0 ? note : undefined);
  });
  box.append(setBtn);

  if (existing) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear override';
    clearBtn.addEventListener('click', () => callbacks.onClearOverride(videoId, dimension));
    box.append(clearBtn);
  }
  return box;
}