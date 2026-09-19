/**
 * Onboarding panel — Phase 5.
 *
 * The one-time first-open screen. It states what MeTube is and is not,
 * and offers the optional generic starter Viewpoints. Declining leaves a
 * fully working product.
 */

import { ONBOARDING_TEXT } from '../viewpoints/onboarding';
import { starterViewpoints } from '../viewpoints/starters';

export interface OnboardingCallbacks {
  /** Accept the optional starter Viewpoints (they are editable). */
  onAcceptStarters: () => void;
  /** Decline: skip starters, finish onboarding. */
  onDecline: () => void;
}

export function renderOnboardingPanel(callbacks: OnboardingCallbacks): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-onboarding';
  const h = document.createElement('h2');
  h.textContent = 'YourTube';
  wrap.append(h);
  for (const paragraph of ONBOARDING_TEXT) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    wrap.append(p);
  }
  const startersList = document.createElement('ul');
  for (const s of starterViewpoints()) {
    const li = document.createElement('li');
    li.textContent = `${s.title} — ${s.description}`;
    startersList.append(li);
  }
  const startersIntro = document.createElement('p');
  startersIntro.textContent =
    'Optionally start from these generic, fully editable starter Viewpoints. They demonstrate mechanisms ' +
    '(constraints, budgets, windows) and take no positions. You can also decline and author your own from scratch.';
  wrap.append(startersIntro, startersList);

  const actions = document.createElement('div');
  actions.className = 'metube-onboarding-actions';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.textContent = 'Add starter Viewpoints (editable)';
  accept.addEventListener('click', () => callbacks.onAcceptStarters());
  const decline = document.createElement('button');
  decline.type = 'button';
  decline.textContent = 'Start empty — I will author my own';
  decline.addEventListener('click', () => callbacks.onDecline());
  actions.append(accept, decline);
  wrap.append(actions);
  return wrap;
}