/**
 * Shell header — Phase 5.
 *
 * The persistent top strip: the ACTIVE VIEWPOINT name (always visible),
 * a one-line constraints summary, and the rapid Viewpoint switcher.
 * Switching re-renders the feed through the newly active lens.
 */

import type { Viewpoint } from '../model/viewpoint';
import { summarizeViewpoint } from '../model/viewpoint';

export interface ShellHeaderCallbacks {
  onSwitch: (viewpointId: string) => void;
}

export function renderShellHeader(
  viewpoints: Viewpoint[],
  active: Viewpoint | null,
  callbacks: ShellHeaderCallbacks,
): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'metube-active-strip';

  const label = document.createElement('span');
  label.textContent = 'Active Viewpoint:';
  const name = document.createElement('span');
  name.className = 'metube-active-name';
  name.textContent = active ? active.title : 'none (unlensed bootstrap feed)';
  const summary = document.createElement('span');
  summary.className = 'metube-active-summary';
  summary.textContent = active ? summarizeViewpoint(active) : 'local fixtures only; activate a Viewpoint to generate a Viewstream';
  strip.append(label, name, summary);

  const switcher = document.createElement('div');
  switcher.className = 'metube-switcher';
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Switch Viewpoint…';
  placeholder.disabled = viewpoints.length === 0;
  select.append(placeholder);
  for (const vp of viewpoints) {
    const opt = document.createElement('option');
    opt.value = vp.id;
    opt.textContent = `${vp.title}${vp.enabled ? '' : ' (disabled)'}`;
    if (active && vp.id === active.id) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    const id = select.value;
    if (id) callbacks.onSwitch(id);
  });
  switcher.append(select);
  strip.append(switcher);
  return strip;
}

/** Tab bar: VIEWSTREAM / VIEWPOINTS / VIEWLISTS / COVERAGE / SAVED (+ TIME MACHINE when configured). */
export type ShellTab =
  | 'viewstream'
  | 'viewpoints'
  | 'viewlists'
  | 'coverage'
  | 'saved';

export const SHELL_TABS: { id: ShellTab; label: string }[] = [
  { id: 'viewstream', label: 'Viewstream' },
  { id: 'viewpoints', label: 'Viewpoints' },
  { id: 'viewlists', label: 'Viewlists' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'saved', label: 'Saved' },
];

export interface TabBarCallbacks {
  onSelect: (tab: ShellTab) => void;
}

export function renderTabBar(active: ShellTab, callbacks: TabBarCallbacks): HTMLElement {
  const bar = document.createElement('nav');
  bar.className = 'metube-tabs';
  for (const tab of SHELL_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'metube-tab';
    btn.textContent = tab.label;
    btn.dataset.active = String(active === tab.id);
    btn.addEventListener('click', () => callbacks.onSelect(tab.id));
    bar.append(btn);
  }
  return bar;
}