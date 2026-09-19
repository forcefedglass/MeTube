/**
 * Onboarding panel — first-use gate.
 *
 * The one-time first-open screen. It states what Slipgate is and is not,
 * then offers three paths forward:
 *
 *   [ Show me how it works ]        — the guided tour (resumable, skippable)
 *   [ Start with starter Viewpoints ] — the optional generic starters
 *   [ Start empty ]                 — decline everything; fully working product
 *
 * FROZEN RULES (unchanged from Phase 5):
 *   - The wording never suggests any perspective is correct, balanced,
 *     recommended, or worth adopting.
 *   - Declining everything leaves a fully working product.
 *   - Onboarding shows once; re-showing is an explicit user action.
 */

import { ONBOARDING_TEXT } from '../viewpoints/onboarding';

export interface OnboardingCallbacks {
  /** Start the guided tour (explicit user choice). */
  onStartTour: () => void;
  /** Accept the optional starter Viewpoints (they are editable). */
  onAcceptStarters: () => void;
  /** Decline: skip everything, finish onboarding. */
  onDecline: () => void;
}

export function renderOnboardingPanel(callbacks: OnboardingCallbacks): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-onboarding';
  const h = document.createElement('h2');
  h.textContent = 'Slipgate';
  wrap.append(h);
  const tagline = document.createElement('p');
  tagline.className = 'metube-onboarding-tagline';
  tagline.textContent = 'Escape Your Walled Garden.';
  wrap.append(tagline);
  for (const paragraph of ONBOARDING_TEXT) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    wrap.append(p);
  }

  const actions = document.createElement('div');
  actions.className = 'metube-onboarding-actions';

  const tour = document.createElement('button');
  tour.type = 'button';
  tour.className = 'metube-onboarding-tour';
  tour.textContent = 'Show me how it works';
  tour.addEventListener('click', () => callbacks.onStartTour());
  actions.append(tour);

  const starters = document.createElement('button');
  starters.type = 'button';
  starters.textContent = 'Start with starter Viewpoints';
  starters.addEventListener('click', () => callbacks.onAcceptStarters());
  actions.append(starters);

  const decline = document.createElement('button');
  decline.type = 'button';
  decline.textContent = 'Start empty — I will author my own';
  decline.addEventListener('click', () => callbacks.onDecline());
  actions.append(decline);

  wrap.append(actions);
  return wrap;
}