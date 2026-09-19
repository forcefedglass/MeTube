/**
 * Onboarding — Phase 5.
 *
 * A one-screen, concise explanation shown on first open:
 *
 *   1. What MeTube is NOT: it does not attempt to determine what the user
 *      should believe. It has no political scoring and no "correct mix".
 *   2. What MeTube IS: user-controlled lenses (Viewpoints) for sampling
 *      information differently. Every constraint is visible and editable.
 *   3. An optional, generic, editable starter set — offered, never
 *      imposed, never politically prescriptive.
 *
 * FROZEN RULES:
 *   - The wording never suggests any perspective is correct, balanced,
 *     recommended, or worth adopting.
 *   - Declining the starters leaves a fully working product (an empty
 *     Viewpoint list the user can author themselves).
 *   - Onboarding shows once; re-showing is an explicit user action.
 */

import type { LocalStore } from '../storage/local-store';
import { seedStarterViewpoints } from './starters';
import { openViewpointRepository } from './repository';

export const ONBOARDED_KEY = 'onboarded';

/** The exact first-run statement. Facts about the tool, nothing else. */
export const ONBOARDING_TEXT = [
  'MeTube is an independent layer over YouTube discovery. It never reads YouTube\'s own recommendations.',
  'MeTube does not attempt to determine what you should believe. There is no political scoring, no "correct balance", and no recommended mix of perspectives anywhere in it.',
  'A Viewpoint is a lens you author: seeds, constraints, exposure budgets. Activating one generates a Viewstream — a feed sampled through that lens. Every field is visible and editable, and every inclusion is traceable (Viewpoint rule → discovery → classification → ranking → inclusion).',
  'Everything stays on this device. MeTube has no backend and records feedback only from buttons you press.',
];

export interface OnboardingState {
  /** true once the user has finished (accepted or declined) onboarding. */
  onboarded: boolean;
}

export async function readOnboardingState(store: LocalStore): Promise<OnboardingState> {
  const v = await store.getKv(ONBOARDED_KEY);
  return { onboarded: v === true };
}

/** Mark onboarding finished (accept or decline both count). */
export async function markOnboarded(store: LocalStore): Promise<void> {
  await store.putKv(ONBOARDED_KEY, true);
}

/**
 * Accept the optional starters: seeds them and returns how many were new.
 * Declining is simply not calling this.
 */
export async function acceptStarters(store: LocalStore): Promise<number> {
  const repo = openViewpointRepository(store);
  const before = (await repo.list()).length;
  await seedStarterViewpoints(repo);
  const after = (await repo.list()).length;
  return after - before;
}