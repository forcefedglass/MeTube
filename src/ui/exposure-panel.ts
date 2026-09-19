/**
 * Exposure panel — "Why this Viewstream looks like this" (Phase 4).
 *
 * Shows the current exposure-budget satisfaction and violations for the
 * composed Viewstream: every configured rule, its target, what was
 * observed, and the plain-word explanation. Rules the user configured are
 * visible here in full — nothing is hidden behind ML.
 *
 * The panel never ranks or judges: it reports facts about the composition.
 */

import type { ExposureReport } from '../model/exposure';

export function renderExposurePanel(
  report: ExposureReport | null,
  budgetSummary: string | null,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'metube-exposure';

  const heading = document.createElement('h3');
  heading.textContent = 'Why this Viewstream looks like this';
  section.append(heading);

  if (!report) {
    const none = document.createElement('p');
    none.className = 'metube-exposure-none';
    none.textContent =
      'No exposure budget configured for this Viewpoint. The feed was assembled by ranking and post-selection limits only. Every rule is optional and always visible in the Viewpoint editor.';
    section.append(none);
    return section;
  }

  const intro = document.createElement('p');
  intro.className = 'metube-exposure-intro';
  intro.textContent =
    `Exposure budget check for this composition: ${report.satisfied} rule(s) satisfied, ` +
    `${report.violated} violated or not applicable. Feed size ${report.feedSize} of a requested ${report.poolSize >= 0 ? '' : ''}${report.feedSize === 0 ? 0 : report.feedSize} — pool offered ${report.poolSize} candidates after filters.`;
  section.append(intro);

  if (budgetSummary) {
    const summary = document.createElement('p');
    summary.className = 'metube-exposure-budget-summary';
    summary.textContent = budgetSummary;
    section.append(summary);
  }

  const list = document.createElement('ul');
  list.className = 'metube-exposure-rules';
  for (const rule of report.rules) {
    const li = document.createElement('li');
    li.className = `metube-exposure-rule metube-exposure-rule-${rule.status}`;
    const status = document.createElement('span');
    status.className = 'metube-exposure-status';
    status.textContent =
      rule.status === 'satisfied' ? 'SATISFIED' :
      rule.status === 'violated' ? 'VIOLATED' : 'NOT APPLICABLE';
    const statement = document.createElement('strong');
    statement.textContent = rule.statement;
    const observed = document.createElement('span');
    observed.className = 'metube-exposure-observed';
    observed.textContent = ` observed ${formatValue(rule.observed)} vs target ${formatValue(rule.target)}`;
    const explanation = document.createElement('p');
    explanation.className = 'metube-exposure-explanation';
    explanation.textContent = rule.explanation;
    li.append(status, statement, observed, explanation);
    list.append(li);
  }
  section.append(list);

  if (report.rules.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'metube-exposure-none';
    empty.textContent = 'The exposure budget object exists but carries no configured rules.';
    section.append(empty);
  }

  return section;
}

function formatValue(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}