/**
 * Feed autopsy panel — Phase 5 COVERAGE surface.
 *
 * Renders the descriptive autopsy metrics computed by
 * src/viewpoints/autopsy.ts. Presentation rule: every metric shows its
 * measured value and its plain-language detail. Nothing here recommends
 * anything.
 */

import type { FeedAutopsy } from '../viewpoints/autopsy';

export function renderAutopsyPanel(autopsy: FeedAutopsy): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-autopsy';
  const h = document.createElement('h3');
  h.textContent = 'Feed autopsy';
  wrap.append(h);
  const summary = document.createElement('p');
  summary.className = 'metube-autopsy-summary';
  summary.textContent = autopsy.summary;
  wrap.append(summary);
  for (const metric of autopsy.metrics) {
    const box = document.createElement('div');
    box.className = 'metube-autopsy-metric';
    const title = document.createElement('h4');
    title.textContent = metric.label;
    const value = document.createElement('div');
    value.className = 'metube-metric-value';
    value.textContent = metric.value;
    const detail = document.createElement('p');
    detail.textContent = metric.detail;
    box.append(title, value, detail);
    wrap.append(box);
  }
  return wrap;
}