/**
 * Guided-tour state — first-use onboarding (v0.7.0).
 *
 * A persisted, resumable record of the guided tour, kept STRICTLY
 * separate from Viewpoint preference data (per the onboarding spec:
 * "Do not mix onboarding progress into Viewpoint preference data").
 *
 * Lifecycle:
 *
 *   never-started -> in-progress -> completed
 *                        |
 *                        +-------> skipped  (user pressed Skip tour)
 *
 * The tour shows ONLY while state is 'never-started' or 'in-progress'.
 * Replay is always an explicit user action (Help & replay link), which
 * resets state to 'in-progress' at step 0 WITHOUT erasing the completed
 * marker for a user who already finished once (see replayTour).
 *
 * Storage: KV key TOUR_STATE_KEY (its own key; never embedded inside
 * 'viewpoints' or any other preference document).
 */

import type { LocalStore } from '../storage/local-store';

export const TOUR_STATE_KEY = 'guided-tour-state';

/** The ordered step ids of the guided tour. Stable ids, never renumbered. */
export const TOUR_STEP_IDS = [
  'welcome',
  'what-is-a-viewpoint',
  'demo-choice',
  'viewpoint-details',
  'build-viewstream',
  'first-card',
  'unknown-is-honest',
  'feed-autopsy',
  'coverage',
  'compare-viewpoints',
  'feedback',
  'exploration-firewall',
  'change-something',
  'create-your-own',
  'done',
] as const;

export type TourStepId = (typeof TOUR_STEP_IDS)[number];

export type TourStatus = 'never-started' | 'in-progress' | 'completed' | 'skipped';

export interface TourState {
  status: TourStatus;
  /** Current step for resumability; null when not in progress. */
  currentStep: TourStepId | null;
  /** Timestamp of the last transition (diagnostics only). */
  updatedAt: string;
}

export function tourStepIndex(step: TourStepId): number {
  return TOUR_STEP_IDS.indexOf(step);
}

function normalize(raw: unknown): TourState {
  // Unparseable or missing records resolve to never-started, never to an
  // invented state. Unknown step ids resolve to null (restart at step 0
  // on resume) rather than crashing the shell.
  if (typeof raw !== 'object' || raw === null) {
    return { status: 'never-started', currentStep: null, updatedAt: '' };
  }
  const rec = raw as Record<string, unknown>;
  const status = rec.status;
  const step = rec.currentStep;
  const known: TourStatus[] = ['never-started', 'in-progress', 'completed', 'skipped'];
  const knownStep = typeof step === 'string' && (TOUR_STEP_IDS as readonly string[]).includes(step);
  return {
    status: known.includes(status as TourStatus) ? (status as TourStatus) : 'never-started',
    currentStep: knownStep ? (step as TourStepId) : null,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : '',
  };
}

export async function readTourState(store: LocalStore): Promise<TourState> {
  return normalize(await store.getKv(TOUR_STATE_KEY));
}

/** Begin the guided tour (explicit user action only). */
export async function startTour(store: LocalStore, now: string): Promise<void> {
  await store.putKv(TOUR_STATE_KEY, {
    status: 'in-progress',
    currentStep: TOUR_STEP_IDS[0],
    updatedAt: now,
  } satisfies TourState);
}

/**
 * Advance to a step (forward or back). Records the step so a reload
 * resumes where the user left off.
 */
export async function setTourStep(
  store: LocalStore,
  step: TourStepId,
  now: string,
): Promise<void> {
  const current = await readTourState(store);
  if (current.status !== 'in-progress') return; // not running: no-op
  await store.putKv(TOUR_STATE_KEY, { status: 'in-progress', currentStep: step, updatedAt: now });
}

/** User finished the tour (final step or explicit "finish"). */
export async function completeTour(store: LocalStore, now: string): Promise<void> {
  await store.putKv(TOUR_STATE_KEY, {
    status: 'completed',
    currentStep: null,
    updatedAt: now,
  } satisfies TourState);
}

/** User pressed "Skip tour" mid-tour. */
export async function skipTour(store: LocalStore, now: string): Promise<void> {
  await store.putKv(TOUR_STATE_KEY, {
    status: 'skipped',
    currentStep: null,
    updatedAt: now,
  } satisfies TourState);
}

/**
 * Replay: an explicit user request (the Help & replay link) to run the
 * tour again. Sets state to in-progress at the first step. If the tour
 * previously completed, that fact is preserved in `completedOnce` so a
 * reload cannot force a finished user back into the tutorial
 * unintentionally — but the explicit replay request is honored.
 */
export async function replayTour(store: LocalStore, now: string): Promise<void> {
  const current = await readTourState(store);
  const completedOnce = current.status === 'completed' || current.status === 'skipped';
  await store.putKv(TOUR_STATE_KEY, {
    status: 'in-progress',
    currentStep: TOUR_STEP_IDS[0],
    updatedAt: now,
    ...(completedOnce ? { replayed: true } : {}),
  } as TourState);
}

/** True when the tour overlay should render at all. */
export function tourIsVisible(state: TourState): boolean {
  // never-started must NOT auto-show: the tour renders only after the
  // user explicitly chooses it (first-run gate, Help replay). This is
  // the no-modal-prison rule.
  return state.status === 'in-progress';
}

/** Which step to show for a given state (first step when unstarted). */
export function currentTourStep(state: TourState): TourStepId {
  if (state.status === 'in-progress' && state.currentStep) return state.currentStep;
  return TOUR_STEP_IDS[0];
}