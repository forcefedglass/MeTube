/**
 * DEMO Viewpoints — the opt-in demo mechanism (first-use onboarding).
 *
 * The four US political test Viewpoints live in
 * src/viewpoints/test-viewpoints.ts and are deliberately NOT wired into
 * any automatic path. This module is the deliberate OPTIONAL DEMO
 * mechanism that promotes them for the guided tour — under rules that
 * keep every guarantee the test-viewpoints module was built with:
 *
 *   - EXPLICIT OPT-IN ONLY: the user must choose "Try a political-
 *     perspective demo" themselves. Nothing here runs at startup, at
 *     onboarding accept, or from any automatic trigger.
 *   - NO POLITICAL IDENTITY INFERENCE: adding or removing a demo
 *     Viewpoint records nothing about the user. No preference change, no
 *     hidden activation, no scoring. The demo lenses are sampling
 *     instructions, not statements that any source or argument is
 *     correct, representative, moderate, extreme, or authoritative.
 *   - NO MODIFICATION OF THE TEST DEFINITIONS: this module calls
 *     testViewpoints() and derives its own copies (fresh objects, never
 *     shared references with the test module). The definitions in
 *     test-viewpoints.ts are the single source of truth for their
 *     content.
 *   - REMOVABLE AFTERWARD: "Remove demo Viewpoints" removes ONLY the
 *     demo instances created through this mechanism — matched by the
 *     `vp-test-` id prefix AND the DEMO marker this module records.
 *     Forks/duplicates/edits the user derived from a demo Viewpoint get
 *     new ids from the repository (e.g. `vp-test-left-broad-copy`) and
 *     keep the user's own content — they are preserved (per spec: "If a
 *     user modifies/forks a demo, preserve the user's derived
 *     Viewpoint").
 *   - NO AUTOMATIC ACTIVATION: the tour activates a demo Viewpoint only
 *     through the same explicit activation the product already has, and
 *     deactivation is one click. When the tour ends, whichever Viewpoint
 *     is active stays active only if the user chose to keep it; the
 *     tour's final step asks.
 */

import type { Viewpoint } from '../model/viewpoint';
import { duplicateViewpoint } from '../model/viewpoint';
import type { ViewpointRepository } from '../viewpoints/repository';
import { testViewpoints, TEST_VIEWPOINT_MARKER } from '../viewpoints/test-viewpoints';

/** The id prefix every promoted demo Viewpoint carries. */
export const DEMO_VIEWPOINT_ID_PREFIX = 'vp-test-';

/** Marker recorded in the description of demo instances created here. */
export const DEMO_INSTANCE_MARKER = 'DEMO INSTANCE';

/** The exact ids this mechanism creates (deterministic, never random). */
export const DEMO_INSTANCE_IDS = [
  'vp-test-demo-0',
  'vp-test-demo-1',
  'vp-test-demo-2',
  'vp-test-demo-3',
] as const;

/**
 * The demo instances this mechanism creates: fresh copies of the four
 * test Viewpoints, marked as demo instances. Never shared references
 * with the test module's objects.
 */
export function demoViewpointInstances(): Viewpoint[] {
  const now = new Date().toISOString();
  return testViewpoints().map((vp, i) => {
    const copy = duplicateViewpoint(vp, DEMO_INSTANCE_IDS[i], vp.title, now);
    copy.description = `${DEMO_INSTANCE_MARKER} — ${vp.description}`;
    copy.config = JSON.parse(JSON.stringify(vp.config));
    return copy;
  });
}

/**
 * True when a Viewpoint is a demo instance created by this mechanism.
 * Id-exact: user duplicates and forks get `-copy` suffixed ids and must
 * NEVER be treated as demo instances (spec: user forks survive removal).
 */
export function isDemoViewpoint(vp: Viewpoint): boolean {
  return (DEMO_INSTANCE_IDS as readonly string[]).includes(vp.id);
}

/** True for the four canonical test Viewpoints themselves (never created here). */
export function isCanonicalTestViewpoint(vp: Viewpoint): boolean {
  return vp.id.startsWith(DEMO_VIEWPOINT_ID_PREFIX) && vp.description.includes(TEST_VIEWPOINT_MARKER) && !isDemoViewpoint(vp);
}

/** The demo-broad pair for the tour's compare step (left broad + right broad). */
export function demoComparePair(): [Viewpoint, Viewpoint] | null {
  // Instance order mirrors testViewpoints(): 0=left-broad, 1=right-broad,
  // 2=left-policy, 3=right-policy. The compare step uses the BROAD pair.
  const all = demoViewpointInstances();
  const left = all[0];
  const right = all[1];
  return left && right ? [left, right] : null;
}

/**
 * Add the demo Viewpoints (explicit user opt-in). Idempotent: existing
 * demo-instance ids are skipped. Returns the ids that were added.
 * Never activates anything and records nothing about the user.
 */
export async function optInToDemos(
  repo: ViewpointRepository,
): Promise<string[]> {
  const added: string[] = [];
  for (const vp of demoViewpointInstances()) {
    try {
      await repo.create(vp);
      added.push(vp.id);
    } catch {
      // Already present — id collision is the expected signal.
    }
  }
  return added;
}

/**
 * Remove ONLY the demo instances created by this mechanism. Any
 * Viewpoint the user forked, duplicated, or edited from a demo gets a
 * different id from the repository and is PRESERVED. Canonical test
 * Viewpoints (never created here) are also preserved.
 */
export async function removeDemoViewpoints(
  repo: ViewpointRepository,
): Promise<string[]> {
  const all = await repo.list();
  const removed: string[] = [];
  for (const vp of all) {
    if (isDemoViewpoint(vp)) {
      await repo.remove(vp.id);
      removed.push(vp.id);
    }
  }
  return removed;
}