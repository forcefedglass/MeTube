/**
 * Time Machine panel — Phase 5.
 *
 * Temporal exploration controls for the active Viewpoint: the user edits
 * the anchor date and period windows; the panel shows the descriptive
 * comparison across periods.
 *
 * PRESENTATION RULES (FROZEN):
 *   - Every period states counts and distributions. The panel never
 *     phrases anything as cause and effect; the standing note says so.
 *   - Unclassifiable dates are shown as their own row, never hidden.
 */

import type {
  TimeMachineComparison,
  TimePeriodKey,
} from '../viewpoints/timemachine';
import { TIME_PERIOD_LABELS } from '../viewpoints/timemachine';
import type { TimeMachineConfig } from '../model/viewpoint';

export interface TimeMachineCallbacks {
  /** Persist edited config (called on every field change). */
  onConfigChange: (config: TimeMachineConfig) => void;
}

export function renderTimeMachinePanel(
  config: TimeMachineConfig | undefined,
  comparison: TimeMachineComparison | null,
  hasActiveViewpoint: boolean,
  callbacks: TimeMachineCallbacks,
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-timemachine';
  const h = document.createElement('h3');
  h.textContent = 'Time Machine';
  wrap.append(h);

  if (!hasActiveViewpoint) {
    const note = document.createElement('p');
    note.textContent = 'No active Viewpoint. Activate one to use the Time Machine.';
    wrap.append(note);
    return wrap;
  }

  const cfg: TimeMachineConfig = config ?? {
    anchorDate: new Date().toISOString().slice(0, 10),
    preEventDays: 30,
    duringEventDays: 7,
    postEventDays: 30,
    retrospectiveAfterDays: 60,
  };

  // --- Config editor ------------------------------------------------------
  const form = document.createElement('div');
  form.className = 'metube-tm-config';
  const fields: { key: keyof TimeMachineConfig; label: string; type: 'date' | 'number' }[] = [
    { key: 'anchorDate', label: 'Anchor date (user-authored)', type: 'date' },
    { key: 'preEventDays', label: 'Pre-event window (days)', type: 'number' },
    { key: 'duringEventDays', label: 'During-event window (days)', type: 'number' },
    { key: 'postEventDays', label: 'Post-event window (days)', type: 'number' },
    { key: 'retrospectiveAfterDays', label: 'Retrospective starts after (days)', type: 'number' },
  ];
  const inputs = new Map<keyof TimeMachineConfig, HTMLInputElement>();
  for (const f of fields) {
    const label = document.createElement('label');
    label.textContent = `${f.label}:`;
    const input = document.createElement('input');
    input.type = f.type;
    if (f.type === 'date') {
      input.value = String(cfg.anchorDate).slice(0, 10);
    } else {
      input.min = '0';
      input.value = String(cfg[f.key] ?? 0);
    }
    input.addEventListener('change', () => {
      const next: TimeMachineConfig = { ...cfg };
      if (f.type === 'date') {
        next.anchorDate = input.value ? `${input.value}T00:00:00Z` : cfg.anchorDate;
      } else {
        const n = Number(input.value);
        (next[f.key] as number) = Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
      }
      callbacks.onConfigChange(next);
    });
    inputs.set(f.key, input);
    label.append(input);
    form.append(label);
  }
  wrap.append(form);
  void inputs;

  // --- Descriptive comparison --------------------------------------------
  if (comparison) {
    const summary = document.createElement('p');
    summary.className = 'metube-tm-summary';
    summary.textContent = comparison.summary;
    wrap.append(summary);
    for (const profile of comparison.profiles) {
      const box = document.createElement('div');
      box.className = 'metube-tm-period';
      const head = document.createElement('h4');
      head.textContent = profile.label;
      const count = document.createElement('div');
      count.className = 'metube-tm-count';
      count.textContent = `${profile.candidates.length} candidate(s)`;
      box.append(head, count);
      if (profile.candidates.length > 0) {
        if (profile.channels.length > 0) {
          const p = document.createElement('p');
          p.textContent = `Channels: ${profile.channels.slice(0, 6).map((c) => `${c.channelTitle} ×${c.count}`).join(', ')}`;
          box.append(p);
        }
        if (profile.narratives.length > 0) {
          const p = document.createElement('p');
          p.textContent = `Narrative clusters: ${profile.narratives.slice(0, 6).map((c) => `${c.clusterId} ×${c.count}`).join(', ')}`;
          box.append(p);
        }
        if (profile.topics.length > 0) {
          const p = document.createElement('p');
          p.textContent = `Topics: ${profile.topics.slice(0, 6).map((c) => `${c.topicId} ×${c.count}`).join(', ')}`;
          box.append(p);
        }
        if (profile.sourceTypes.length > 0) {
          const p = document.createElement('p');
          p.textContent = `Source types: ${profile.sourceTypes.map((c) => `${c.key} ×${c.count}`).join(', ')}`;
          box.append(p);
        }
      }
      wrap.append(box);
    }
  }

  // --- Standing note -------------------------------------------------------
  const note = document.createElement('p');
  note.className = 'metube-tm-note';
  note.textContent =
    'Periods are publication-date positions relative to a user-authored anchor. Comparisons between ' +
    'pre-event, during-event, post-event, and retrospective material are descriptive: counts and ' +
    'distributions only. YourTube does not imply knowledge of causal relationships unless evidence ' +
    'supports them — and publication timing alone is never such evidence.';
  wrap.append(note);
  return wrap;
}

/** Format one period row for tests/verification. */
export function periodRowLabel(key: TimePeriodKey): string {
  return TIME_PERIOD_LABELS[key];
}