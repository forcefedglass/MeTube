/**
 * Pool inspector — facts about the candidate pool, nothing else.
 *
 * Shows: candidate count, provenance breakdown, discovering Viewpoints,
 * cache age, duplicate suppression, and failed/missing-metadata records.
 * No scoring opinions, no recommendations. Read-only.
 */

import type { PoolInspectView } from '../discovery/pool';
import type { PoolState } from '../discovery/pool';
import { inspectPool } from '../discovery/pool';

export function renderPoolInspector(
  state: PoolState,
  now: string,
  onRefreshAcquisition: () => void,
): HTMLElement {
  const view = inspectPool(state, now);
  const root = document.createElement('section');
  root.className = 'metube-pool-inspector';

  const header = document.createElement('h3');
  header.textContent = 'Candidate pool';
  root.append(header);

  const facts = document.createElement('ul');
  facts.className = 'metube-pool-facts';
  facts.append(fact('Candidates discovered', String(view.totalCandidates)));
  facts.append(fact('Duplicate discoveries suppressed', String(view.duplicateSuppressed)));
  facts.append(fact('Unknown publication dates', String(view.unknownDates)));
  facts.append(fact('Missing duration', String(view.missingDuration)));
  facts.append(fact('Missing channel', String(view.missingChannel)));
  if (view.cacheAgeOldest !== null && view.cacheAgeNewest !== null) {
    facts.append(fact('Cache age', `${view.cacheAgeOldest.slice(0, 10)} → ${view.cacheAgeNewest.slice(0, 10)}`));
  } else {
    facts.append(fact('Cache age', 'no discoveries yet'));
  }
  root.append(facts);

  if (view.byMethod.length > 0) {
    const methodsTitle = document.createElement('h4');
    methodsTitle.textContent = 'By acquisition method';
    root.append(methodsTitle);
    const methods = document.createElement('ul');
    methods.className = 'metube-pool-facts';
    for (const m of view.byMethod) {
      methods.append(fact(m.method, String(m.count)));
    }
    root.append(methods);
  }

  if (view.discoveringViewpoints.length > 0) {
    const vpTitle = document.createElement('h4');
    vpTitle.textContent = 'Discovering Viewpoints';
    root.append(vpTitle);
    const vps = document.createElement('ul');
    vps.className = 'metube-pool-facts';
    for (const v of view.discoveringViewpoints) {
      vps.append(
        fact(v.viewpointId, `${v.count} candidates; last run ${v.lastRunAt ? v.lastRunAt.slice(0, 10) : 'unknown'}`),
      );
    }
    root.append(vps);
  }

  if (view.failedSteps.length > 0) {
    const failTitle = document.createElement('h4');
    failTitle.textContent = 'Failed / empty acquisition steps';
    root.append(failTitle);
    const fails = document.createElement('ul');
    fails.className = 'metube-pool-facts metube-pool-failures';
    for (const f of view.failedSteps.slice(-12)) {
      fails.append(fact(f.step, f.reason));
    }
    root.append(fails);
  } else {
    const none = document.createElement('p');
    none.className = 'metube-pool-note';
    none.textContent = 'No failed acquisition steps recorded.';
    root.append(none);
  }

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Refresh acquisition now (bypasses cache)';
  refresh.addEventListener('click', onRefreshAcquisition);
  root.append(refresh);

  return root;
}

function fact(label: string, value: string): HTMLLIElement {
  const li = document.createElement('li');
  const b = document.createElement('strong');
  b.textContent = `${label}: `;
  li.append(b, document.createTextNode(value));
  return li;
}