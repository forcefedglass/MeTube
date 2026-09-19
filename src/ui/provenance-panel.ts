/**
 * Provenance panel — Phase 5.
 *
 * Renders the full five-step "Why this appeared" chain assembled by
 * src/viewpoints/provenance.ts, below the candidate inspector. Every step
 * is shown as its own labeled block; missing links are shown as unknown,
 * never omitted.
 */

import type { ProvenanceChain } from '../viewpoints/provenance';
import { PROVENANCE_LINK_LABELS } from '../viewpoints/provenance';

export function renderProvenancePanel(chain: ProvenanceChain): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-provenance';
  const h = document.createElement('h4');
  h.textContent = `Why this appeared — full trace (${chain.title})`;
  wrap.append(h);

  // Step 1: Viewpoint rule
  const s1 = document.createElement('div');
  s1.className = 'metube-prov-step';
  const s1h = document.createElement('h4');
  s1h.textContent = `1. ${PROVENANCE_LINK_LABELS['viewpoint-rule']} — ${chain.viewpointRule.viewpointTitle}`;
  const s1p = document.createElement('p');
  s1p.textContent = chain.viewpointRule.statement;
  const s1m = document.createElement('p');
  s1m.className = 'metube-prov-meta';
  s1m.textContent = `Constraints: ${chain.viewpointRule.constraintsSummary}`;
  s1.append(s1h, s1p, s1m);
  if (chain.viewpointRule.failed.length > 0) {
    const warn = document.createElement('p');
    warn.className = 'metube-prov-unknown';
    warn.textContent = `Filters this candidate FAILED (it should not be in the feed): ${chain.viewpointRule.failed.join('; ')}`;
    s1.append(warn);
  }
  wrap.append(s1);

  // Step 2: Discovery
  const s2 = document.createElement('div');
  s2.className = 'metube-prov-step';
  const s2h = document.createElement('h4');
  s2h.textContent = `2. ${PROVENANCE_LINK_LABELS.discovery}`;
  if (chain.discovery) {
    const s2p = document.createElement('p');
    s2p.textContent = chain.discovery.statement;
    const s2m = document.createElement('p');
    s2m.className = 'metube-prov-meta';
    s2m.textContent =
      `provider=${chain.discovery.provider}; method=${chain.discovery.method}; seed="${chain.discovery.seed}"; ` +
      `discoveredAt=${chain.discovery.discoveredAt}` +
      (chain.discovery.alsoSeenVia.length > 0
        ? `; also seen via: ${chain.discovery.alsoSeenVia.join(', ')}`
        : '');
    s2.append(s2h, s2p, s2m);
  }
  wrap.append(s2);

  // Step 3: Classification
  const s3 = document.createElement('div');
  s3.className = 'metube-prov-step';
  const s3h = document.createElement('h4');
  s3h.textContent = `3. ${PROVENANCE_LINK_LABELS.classification}`;
  if (chain.classification) {
    const s3p = document.createElement('p');
    s3p.textContent = `Topics: ${chain.classification.topics}`;
    const s3q = document.createElement('p');
    s3q.textContent = `Source type: ${chain.classification.sourceType}`;
    const s3r = document.createElement('p');
    s3r.textContent = `Narrative cluster: ${chain.classification.narrativeCluster}`;
    const s3s = document.createElement('p');
    s3s.textContent = `Temporal position: ${chain.classification.temporalPosition}`;
    s3.append(s3h, s3p, s3q, s3r, s3s);
  } else {
    const s3p = document.createElement('p');
    s3p.className = 'metube-prov-unknown';
    s3p.textContent = 'UNKNOWN: no classification recorded for this candidate.';
    s3.append(s3h, s3p);
  }
  wrap.append(s3);

  // Step 4: Ranking
  const s4 = document.createElement('div');
  s4.className = 'metube-prov-step';
  const s4h = document.createElement('h4');
  s4h.textContent = `4. ${PROVENANCE_LINK_LABELS.ranking}`;
  const s4p = document.createElement('p');
  s4p.textContent = chain.ranking.statement;
  s4.append(s4h, s4p);
  const table = document.createElement('table');
  table.className = 'metube-component-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const hcell of ['Component', 'Value', 'Weight', 'Weighted', 'Explanation']) {
    const th = document.createElement('th');
    th.textContent = hcell;
    hr.append(th);
  }
  thead.append(hr);
  table.append(thead);
  const tbody = document.createElement('tbody');
  for (const comp of chain.ranking.components) {
    const tr = document.createElement('tr');
    for (const val of [comp.label, comp.value.toFixed(3), comp.weight.toFixed(2), comp.weighted.toFixed(3), comp.explanation]) {
      const td = document.createElement('td');
      td.textContent = val;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  s4.append(table);
  wrap.append(s4);

  // Step 5: Inclusion
  const s5 = document.createElement('div');
  s5.className = 'metube-prov-step';
  const s5h = document.createElement('h4');
  s5h.textContent = `5. ${PROVENANCE_LINK_LABELS.inclusion}`;
  const s5p = document.createElement('p');
  s5p.textContent = chain.inclusion.statement;
  s5.append(s5h, s5p);
  wrap.append(s5);

  return wrap;
}