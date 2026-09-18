/**
 * Viewpoint manager UI. Plain DOM, no framework, no polish.
 *
 * Everything the product requires is exposed:
 *   - list all Viewpoints (title, enabled, one-line constraint summary)
 *   - select/activate one (generates its Viewstream)
 *   - deactivate (back to unlensed bootstrap feed)
 *   - create / edit / delete / duplicate Viewpoints
 *   - Viewlists: create/edit/delete, assign/unassign Viewpoints
 *   - full config editing for every Viewpoint field
 *
 * Editing is deliberately plain: text inputs for lists (comma-separated),
 * nothing clever. Inspectable beats elegant at this phase.
 */

import type { Viewpoint, Viewlist, ViewpointConfig } from '../model/viewpoint';
import { summarizeViewpoint, defaultViewpointConfig } from '../model/viewpoint';
import type { ViewpointRepository } from '../viewpoints/repository';

export interface ManagerCallbacks {
  onActivate: (id: string | null) => void;
  onRefreshFeed: () => void;
}

export function renderViewpointManager(
  repo: ViewpointRepository,
  viewpoints: Viewpoint[],
  viewlists: Viewlist[],
  activeId: string | null,
  callbacks: ManagerCallbacks,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'metube-vp-manager';

  const header = document.createElement('h3');
  header.textContent = 'Viewpoints';
  root.append(header);

  const active = document.createElement('p');
  active.className = 'metube-vp-active-line';
  active.textContent = activeId
    ? `Active Viewpoint: ${viewpoints.find((v) => v.id === activeId)?.title ?? activeId}`
    : 'Active Viewpoint: none (unlensed feed)';
  root.append(active);

  const list = document.createElement('ul');
  list.className = 'metube-vp-list';
  for (const vp of viewpoints) {
    list.append(renderViewpointRow(vp, activeId === vp.id, repo, callbacks));
  }
  if (viewpoints.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No Viewpoints. Create one below.';
    list.append(empty);
  }
  root.append(list);

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.textContent = 'New Viewpoint';
  createBtn.addEventListener('click', () => {
    openEditor(repo, undefined, callbacks);
  });
  root.append(createBtn);

  root.append(renderViewlistSection(repo, viewlists, viewpoints, callbacks));
  return root;
}

function renderViewpointRow(
  vp: Viewpoint,
  isActive: boolean,
  repo: ViewpointRepository,
  callbacks: ManagerCallbacks,
): HTMLElement {
  const li = document.createElement('li');
  li.className = 'metube-vp-row';
  li.dataset.viewpointId = vp.id;

  const titleLine = document.createElement('div');
  titleLine.className = 'metube-vp-title';
  titleLine.textContent = `${vp.title}${isActive ? ' ●' : ''}${vp.enabled ? '' : ' (disabled)'}`;
  li.append(titleLine);

  const summary = document.createElement('div');
  summary.className = 'metube-vp-summary';
  summary.textContent = summarizeViewpoint(vp);
  li.append(summary);

  if (vp.description) {
    const desc = document.createElement('div');
    desc.className = 'metube-vp-desc';
    desc.textContent = vp.description;
    li.append(desc);
  }

  const controls = document.createElement('div');
  controls.className = 'metube-vp-controls';

  const activate = document.createElement('button');
  activate.type = 'button';
  activate.textContent = isActive ? 'Deactivate' : 'Activate';
  activate.addEventListener('click', async () => {
    await (isActive ? repo.setActive(null) : repo.setActive(vp.id));
    callbacks.onActivate(isActive ? null : vp.id);
  });
  controls.append(activate);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => openEditor(repo, vp, callbacks));
  controls.append(edit);

  const dup = document.createElement('button');
  dup.type = 'button';
  dup.textContent = 'Duplicate';
  dup.addEventListener('click', async () => {
    await repo.duplicate(vp.id, `${vp.title} (copy)`);
    callbacks.onRefreshFeed();
  });
  controls.append(dup);

  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = 'Delete';
  del.addEventListener('click', async () => {
    await repo.remove(vp.id);
    callbacks.onRefreshFeed();
  });
  controls.append(del);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = vp.enabled ? 'Disable' : 'Enable';
  toggle.addEventListener('click', async () => {
    const current = await repo.get(vp.id);
    if (!current) return;
    // Deactivating a disabled Viewpoint would break getActive's contract.
    if (vp.enabled && (await repo.getActive())?.id === vp.id) {
      await repo.setActive(null);
    }
    await repo.update({ ...current, enabled: !current.enabled, updatedAt: new Date().toISOString() });
    callbacks.onRefreshFeed();
  });
  controls.append(toggle);

  li.append(controls);
  return li;
}

function renderViewlistSection(
  repo: ViewpointRepository,
  viewlists: Viewlist[],
  viewpoints: Viewpoint[],
  callbacks: ManagerCallbacks,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'metube-vp-viewlists';
  const h = document.createElement('h3');
  h.textContent = 'Viewlists';
  section.append(h);

  if (viewlists.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No Viewlists.';
    section.append(p);
  }
  for (const list of viewlists) {
    const box = document.createElement('div');
    box.className = 'metube-vp-viewlist';
    const title = document.createElement('div');
    title.className = 'metube-vp-viewlist-title';
    title.textContent = list.title;
    box.append(title);

    for (const vp of viewpoints) {
      const inList = list.viewpointIds.includes(vp.id);
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = inList;
      cb.addEventListener('change', async () => {
        if (cb.checked) await repo.assignViewpoint(list.id, vp.id);
        else await repo.unassignViewpoint(list.id, vp.id);
      });
      label.append(cb, document.createTextNode(` ${vp.title}`));
      box.append(label);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete list';
    del.addEventListener('click', async () => {
      await repo.removeViewlist(list.id);
      callbacks.onRefreshFeed();
    });
    box.append(del);
    section.append(box);
  }

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.textContent = 'New Viewlist';
  newBtn.addEventListener('click', async () => {
    const title = prompt('Viewlist title');
    if (!title) return;
    const now = new Date().toISOString();
    await repo.createViewlist({
      id: `vlist-${Date.now().toString(36)}`,
      title,
      description: '',
      viewpointIds: [],
      createdAt: now,
      updatedAt: now,
    });
    callbacks.onRefreshFeed();
  });
  section.append(newBtn);
  return section;
}

const CONFIG_FIELDS: Array<{
  key: ConfigFieldKey;
  label: string;
  kind: 'text' | 'textarea' | 'number';
}> = [
  { key: 'seedTopics', label: 'Seed topics (comma-separated topic ids)', kind: 'text' },
  { key: 'seedConcepts', label: 'Seed concepts (comma-separated search queries)', kind: 'text' },
  { key: 'seedChannels', label: 'Seed channels (comma-separated @handles or channel urls)', kind: 'text' },
  { key: 'seedPlaylists', label: 'Seed playlists (comma-separated playlist ids or urls)', kind: 'text' },
  { key: 'positiveTopicConstraints', label: 'Positive topic constraints (comma-separated)', kind: 'text' },
  { key: 'negativeTopicConstraints', label: 'Negative topic constraints (comma-separated)', kind: 'text' },
  { key: 'sourceConstraints', label: 'Source constraints (comma-separated source ids)', kind: 'text' },
  { key: 'sourceTypePreferences', label: 'Source-type preferences (comma-separated)', kind: 'text' },
  { key: 'unfamiliarityTarget', label: 'Unfamiliarity target (any | mostly-unfamiliar | strictly-unfamiliar)', kind: 'text' },
  { key: 'narrativeDiversityTarget', label: 'Narrative diversity target (any | mixed-narratives | max-narrative-spread)', kind: 'text' },
  { key: 'temporal', label: 'Temporal sampling (any | recent | historical | wide-window)', kind: 'text' },
  { key: 'temporalFrom', label: 'Temporal from (ISO 8601)', kind: 'text' },
  { key: 'temporalTo', label: 'Temporal to (ISO 8601)', kind: 'text' },
  { key: 'channelSizePreferences', label: 'Channel-size preferences (comma-separated: obscure|small|mid|large|mega)', kind: 'text' },
  { key: 'locale.language', label: 'Locale language (e.g. ja)', kind: 'text' },
  { key: 'locale.region', label: 'Locale region (e.g. JP)', kind: 'text' },
  { key: 'explorationPercent', label: 'Exploration percent (0–100)', kind: 'number' },
  { key: 'repetitionLimit', label: 'Repetition limit (max items per channel)', kind: 'number' },
  { key: 'sourceConcentrationLimit', label: 'Source-concentration limit (0–1)', kind: 'number' },
  { key: 'baselineContext', label: 'Your baseline/context (shown verbatim; never inferred)', kind: 'textarea' },
];

type ConfigFieldKey =
  | 'seedTopics' | 'seedConcepts' | 'seedChannels' | 'seedPlaylists'
  | 'positiveTopicConstraints' | 'negativeTopicConstraints'
  | 'sourceConstraints' | 'sourceTypePreferences'
  | 'unfamiliarityTarget' | 'narrativeDiversityTarget' | 'temporal'
  | 'temporalFrom' | 'temporalTo' | 'channelSizePreferences'
  | 'locale.language' | 'locale.region'
  | 'explorationPercent' | 'repetitionLimit' | 'sourceConcentrationLimit'
  | 'baselineContext';

function openEditor(
  repo: ViewpointRepository,
  existing: Viewpoint | undefined,
  callbacks: ManagerCallbacks,
): void {
  const title = prompt('Viewpoint title', existing?.title ?? '');
  if (!title) return;
  const description = prompt('Description', existing?.description ?? '') ?? '';

  const config: ViewpointConfig = existing
    ? JSON.parse(JSON.stringify(existing.config))
    : defaultViewpointConfig();

  for (const field of CONFIG_FIELDS) {
    const raw = prompt(`${field.label}`, currentFieldValue(existing, field.key) ?? '');
    if (raw === null) continue;
    applyFieldValue(config, field.key, raw);
  }

  const now = new Date().toISOString();
  if (existing) {
    void repo.update({ ...existing, title, description, config, updatedAt: now })
      .then(() => callbacks.onRefreshFeed());
  } else {
    const vp = {
      id: `vp-${Date.now().toString(36)}`,
      title,
      description,
      config,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    void repo.create(vp).then(() => callbacks.onRefreshFeed());
  }
}

function currentFieldValue(vp: Viewpoint | undefined, key: ConfigFieldKey): string {
  if (!vp) return '';
  if (key === 'locale.language' || key === 'locale.region') {
    const locale = (vp.config as unknown as Record<string, unknown>)['locale'] as Record<string, unknown> | undefined;
    const sub = key === 'locale.language' ? 'language' : 'region';
    const v = locale?.[sub];
    return v === undefined || v === null ? '' : String(v);
  }
  const v = (vp.config as unknown as Record<string, unknown>)[key as string];
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function applyFieldValue(config: ViewpointConfig, key: ConfigFieldKey, raw: string): void {
  const trimmed = raw.trim();
  const target = config as unknown as Record<string, unknown>;
  if (key === 'explorationPercent') {
    const n = Number(trimmed);
    target[key] = Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : 0.15;
    return;
  }
  if (key === 'repetitionLimit') {
    const n = Number(trimmed);
    target[key] = Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
    return;
  }
  if (key === 'sourceConcentrationLimit') {
    const n = Number(trimmed);
    target[key] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
    return;
  }
  if (key === 'locale.language' || key === 'locale.region') {
    const localeKey = key === 'locale.language' ? 'language' : 'region';
    const locale = { ...((target['locale'] as unknown as Record<string, unknown> | undefined) ?? {}) };
    locale[localeKey] = trimmed === '' ? undefined : trimmed;
    target['locale'] = locale;
    return;
  }
  if (key === 'temporalFrom' || key === 'temporalTo') {
    // An empty input clears the window. Any other value is stored verbatim;
    // the interpret layer treats unparseable values as no window (never as a
    // filter that silently drops every candidate).
    target[key] = trimmed === '' ? undefined : trimmed;
    return;
  }
  if (
    key === 'seedTopics' || key === 'seedConcepts' ||
    key === 'seedChannels' || key === 'seedPlaylists' ||
    key === 'positiveTopicConstraints' || key === 'negativeTopicConstraints' ||
    key === 'sourceConstraints' || key === 'sourceTypePreferences' ||
    key === 'channelSizePreferences'
  ) {
    target[key] = trimmed === '' ? [] : trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    return;
  }
  target[key] = trimmed;
}