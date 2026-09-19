/**
 * Coverage map UI — plain facts, deliberately not a polished
 * visualization (per Phase 3 scope: build the data model first).
 *
 * Renders the CoverageMap as plain lists: how many candidates per topic,
 * per source type, per narrative cluster, per temporal position, per age
 * band, per familiarity band, per channel. Every number is a count of
 * real candidates; nothing is extrapolated. UNKNOWN buckets show as
 * UNKNOWN — they are answers, not gaps.
 */

import type { CoverageMap } from '../model/classification';

export function renderCoverageMap(map: CoverageMap): HTMLElement {
  const section = document.createElement('section');
  section.className = 'metube-coverage';

  const heading = document.createElement('h3');
  heading.textContent = 'Coverage map';
  section.append(heading);

  const intro = document.createElement('p');
  intro.className = 'metube-coverage-intro';
  intro.textContent =
    `Counts of candidates in the current pool by information-map dimension. ` +
    `Total: ${map.totalCandidates} candidate(s). ` +
    `${map.unclassified} without classification, ${map.unknownDates} with unknown dates.`;
  section.append(intro);

  section.append(renderBuckets('Topics', map.topics));
  section.append(renderBuckets('Source types', map.sourceTypes));
  section.append(renderBuckets('Narrative clusters', map.narrativeClusters));
  section.append(renderBuckets('Temporal positions', map.temporalPositions));
  section.append(renderBuckets('Age of candidates', map.ageBands));
  section.append(renderBuckets('Channel familiarity (within YourTube)', map.channelFamiliarity));
  section.append(renderBuckets('Channels', map.channels));
  return section;
}

function renderBuckets(title: string, buckets: CoverageMap['topics']): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-coverage-group';
  const h4 = document.createElement('h4');
  h4.textContent = title;
  box.append(h4);
  if (buckets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'metube-inspector-unknown';
    empty.textContent = 'Nothing recorded yet.';
    box.append(empty);
    return box;
  }
  const list = document.createElement('ul');
  list.className = 'metube-coverage-list';
  for (const bucket of buckets) {
    const li = document.createElement('li');
    li.textContent = `${bucket.label}: ${bucket.count}`;
    list.append(li);
  }
  box.append(list);
  return box;
}