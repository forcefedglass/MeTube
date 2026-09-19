/**
 * Working-set panel — retrieval-isolation diagnostics.
 *
 * Shows the counts that define the boundary between the global candidate
 * catalog and the active Viewpoint's working set. Counts only, no
 * opinions: which candidates are eligible for this Viewpoint and why,
 * per the recorded provenance. Read-only.
 */

import type { WorkingSetDiagnostics } from '../viewpoints/workingset';

export function renderWorkingSetPanel(view: WorkingSetDiagnostics): HTMLElement {
  const root = document.createElement('section');
  root.className = 'metube-workingset';

  const header = document.createElement('h4');
  header.textContent = 'Candidate working set for this Viewpoint';
  root.append(header);

  const intro = document.createElement('p');
  intro.className = 'metube-workingset-intro';
  intro.textContent =
    'Composition draws only from this working set: candidates whose recorded provenance ' +
    'ties them to this Viewpoint. The global candidate catalog stays global — it is the ' +
    'cache and deduplication inventory, not the feed source.';
  root.append(intro);

  const facts = document.createElement('ul');
  facts.className = 'metube-pool-facts';
  facts.append(fact('Global candidate catalog', String(view.globalCandidateCount)));
  facts.append(fact('Active Viewpoint working set', String(view.activeViewpointCount)));
  facts.append(fact('Shared with other Viewpoints', String(view.sharedWithOtherViewpoints)));
  facts.append(fact('Exclusive to this Viewpoint', String(view.exclusiveToActiveViewpoint)));
  root.append(facts);

  return root;
}

function fact(label: string, value: string): HTMLElement {
  const li = document.createElement('li');
  li.className = 'metube-pool-fact';
  const name = document.createElement('span');
  name.textContent = `${label}: `;
  li.append(name);
  const val = document.createElement('strong');
  val.textContent = value;
  li.append(val);
  return li;
}