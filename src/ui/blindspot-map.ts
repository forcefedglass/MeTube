/**
 * Blind-spot map UI — the first functional coverage/blind-spot view.
 *
 * Shows underrepresented regions for the active Viewpoint as descriptive
 * facts: pool count vs feed count, with the explicit statement that a gap
 * is not a judgment. Each region carries a user-initiated
 * "Explore from here" action; the caller wires it to regeneration.
 */

import type { BlindSpot, BlindSpotView } from '../viewpoints/blindspots';

export interface BlindSpotCallbacks {
  /** User-initiated exploration from a region: regenerate from it. */
  onExplore: (spot: BlindSpot) => void;
}

export function renderBlindSpotMap(
  view: BlindSpotView,
  callbacks: BlindSpotCallbacks,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'metube-blindspots';

  const heading = document.createElement('h3');
  heading.textContent = 'Coverage / blind spots';
  section.append(heading);

  const intro = document.createElement('p');
  intro.className = 'metube-blindspots-intro';
  intro.textContent =
    `${view.summary} (Feed ${view.feedSize}, pool ${view.poolSize}.) ` +
    `Underrepresented regions are descriptive facts about what this Viewpoint surfaced — never a claim that a perspective is correct, superior, or something to adopt.`;
  section.append(intro);

  if (view.spots.length === 0) {
    const none = document.createElement('p');
    none.className = 'metube-blindspots-none';
    none.textContent = 'No underrepresented regions detected: every pool region with candidates is represented in the feed.';
    section.append(none);
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'metube-blindspot-list';
  for (const spot of view.spots) {
    const li = document.createElement('li');
    li.className = 'metube-blindspot';
    li.dataset.dimension = spot.dimension;
    li.dataset.key = spot.key;

    const label = document.createElement('strong');
    label.textContent = spot.label;
    const counts = document.createElement('span');
    counts.className = 'metube-blindspot-counts';
    counts.textContent = ` — pool ${spot.poolCount}, feed ${spot.feedCount} (${(spot.representedShare * 100).toFixed(0)}% represented)`;

    const description = document.createElement('p');
    description.className = 'metube-blindspot-description';
    description.textContent = spot.description;

    const explore = document.createElement('button');
    explore.type = 'button';
    explore.className = 'metube-blindspot-explore';
    explore.textContent = 'Explore from here';
    explore.addEventListener('click', () => callbacks.onExplore(spot));

    li.append(label, counts, description, explore);
    list.append(li);
  }
  section.append(list);
  return section;
}