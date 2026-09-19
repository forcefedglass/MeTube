/**
 * Portability panel — Phase 5.
 *
 * Export/import UI over src/viewpoints/portability.ts. Export downloads a
 * versioned JSON document; import validates and applies it under an
 * explicit merge mode. Private data (feedback history) is opt-in on
 * export, shown verbatim on import when present.
 */

import type { ImportMode } from '../viewpoints/portability';

export interface PortabilityCallbacks {
  onExport: (includeFeedback: boolean) => void;
  onImport: (raw: unknown, mode: ImportMode) => void;
}

export function renderPortabilityPanel(callbacks: PortabilityCallbacks): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-portability';
  const h = document.createElement('h3');
  h.textContent = 'Portability — export / import';
  wrap.append(h);

  const desc = document.createElement('p');
  desc.className = 'metube-portability-note';
  desc.textContent =
    'Exports contain your Viewpoints, Viewlists, classification overrides, and YourTube preferences in a ' +
    'versioned format (metube-export v1). Feedback history is private data and is included only when you ' +
    'explicitly select it. Nothing outside YourTube\'s own stores is ever exported.';
  wrap.append(desc);

  // --- Export ---------------------------------------------------------------
  const exportRow = document.createElement('div');
  exportRow.className = 'metube-portability-actions';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = 'Export (lenses + preferences)';
  exportBtn.addEventListener('click', () => callbacks.onExport(false));
  const exportAllBtn = document.createElement('button');
  exportAllBtn.type = 'button';
  exportAllBtn.textContent = 'Export + feedback history (private data)';
  exportAllBtn.addEventListener('click', () => callbacks.onExport(true));
  exportRow.append(exportBtn, exportAllBtn);
  wrap.append(exportRow);

  // --- Import ---------------------------------------------------------------
  const importRow = document.createElement('div');
  importRow.className = 'metube-portability-actions';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  const importLabel = document.createElement('label');
  importLabel.textContent = 'Choose export file…';
  importLabel.append(fileInput);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        callbacks.onImport({ __metubeParseError: text.slice(0, 120) }, 'keep-mine');
        return;
      }
      const mode = importModeSelect.value === 'import-wins' ? 'import-wins' : 'keep-mine';
      callbacks.onImport(parsed, mode);
    });
    fileInput.value = '';
  });
  const modeLabel = document.createElement('label');
  modeLabel.className = 'metube-portability-note';
  modeLabel.textContent = 'On id collision: ';
  const importModeSelect = document.createElement('select');
  importModeSelect.className = 'metube-tm-config-select';
  for (const [value, label] of [
    ['keep-mine', 'keep mine (imported-only ids are added)'],
    ['import-wins', 'import wins (mine-only ids are kept)'],
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    importModeSelect.append(opt);
  }
  modeLabel.append(importModeSelect);
  importRow.append(importLabel, modeLabel);
  wrap.append(importRow);

  return wrap;
}

/** Render the result line of the last import/export (verbatim). */
export function renderPortabilityResult(message: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'metube-portability-result';
  p.textContent = message;
  return p;
}