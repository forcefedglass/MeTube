/**
 * TEST-SEED Viewpoints — DEMO / TEST VIEWPOINTS for testing Slipgate's
 * political discovery behavior in the United States.
 *
 * These four Viewpoints are USER-CONTROLLED SAMPLING LENSES, not statements
 * that any source or argument is correct, representative, moderate,
 * extreme, or authoritative. No Viewpoint here implies a user's political
 * identity, and none is framed as more accurate or balanced than another.
 *
 * Marking and wiring rules (FROZEN for this module):
 *   - The `TEST-SEED` marker lives in the description and the
 *     `vp-test-` id prefix; nothing else distinguishes these.
 *   - NOT STARTERS: this module is separate from starters.ts on purpose.
 *     `seedTestViewpoints` is never called by onboarding, acceptStarters,
 *     or the extension content path. Existing users never receive these
 *     Viewpoints automatically; the only way one exists is explicit,
 *     deliberate seeding (e.g. a test harness or a developer action).
 *   - Seed CONCEPTS only — query-driven acquisition starts. No individual
 *     political channels are hard-coded into these definitions: the point
 *     is to observe what live acquisition actually finds, not to
 *     pre-select sources.
 *   - Structural symmetry: left and right variants differ ONLY in seed
 *     concepts and assumption wording. No behavioral setting differs
 *     between the left and right versions of the same shape.
 *   - Schema honesty: `locale` is a soft recorded preference (never
 *     enforced as a filter), `temporal` is the 'wide-window' sampling
 *     request (no from/to date window — unknown publication dates must
 *     never be dropped), and NO political classification exists anywhere
 *     in Slipgate, so political dimensions of surfaced material are all
 *     UNKNOWN today. Budget floors (minAlternateSourceTypeShare,
 *     minDistinctScaleBands) may be unsatisfiable from a live pool; the
 *     composer's honest violation reports are the expected outcome, never
 *     a reason to manufacture satisfaction.
 */

import type {
  LocalePreference,
  SourceTypePreference,
  TemporalSampling,
  UnfamiliarityTarget,
  Viewpoint,
} from '../model/viewpoint';
import { newViewpoint } from '../model/viewpoint';
import type { ExposureBudget } from '../model/exposure';

const NOW = '2026-09-19T00:00:00Z';

export const TEST_VIEWPOINT_MARKER = 'TEST-SEED';

/**
 * Settings shared by all four test Viewpoints (structural symmetry: left
 * and right variants differ ONLY in seed concepts and assumption wording).
 * A factory, not a constant: every Viewpoint gets its own fresh nested
 * objects so no mutable state is shared between them.
 */
function sharedSettings(): {
  unfamiliarityTarget: UnfamiliarityTarget;
  explorationPercent: number;
  locale: LocalePreference;
  temporal: TemporalSampling;
  exposureBudget: ExposureBudget;
} {
  return {
    unfamiliarityTarget: 'strictly-unfamiliar',
    explorationPercent: 0.35,
    locale: { language: 'en', region: 'US' },
    temporal: 'wide-window',
    exposureBudget: {
      maxSingleChannelShare: 0.12,
      maxSingleNarrativeShare: 0.34,
      repeatedChannelCooldown: 1,
      repeatedNarrativeCooldown: 1,
      minAlternateSourceTypeShare: 0.25,
      minDistinctScaleBands: 3,
    },
  };
}

/** Source-type preferences for the policy/primary-source variants only. */
const POLICY_SOURCE_TYPE_PREFERENCES: SourceTypePreference[] = [
  'official',
  'publication',
  'primary-source',
];

export function testViewpoints(): Viewpoint[] {
  return [
    newViewpoint(
      'vp-test-left-broad',
      'US Political Left — Broad Sample',
      `${TEST_VIEWPOINT_MARKER} — DEMO / TEST VIEWPOINT for testing US political discovery behavior. A user-controlled sampling lens over material associated with multiple US left-of-center political traditions — NOT a statement that any source or argument is correct, representative, moderate, extreme, or authoritative, and NOT an inference about anyone's political identity. Query-driven acquisition only: no channels are hard-coded; what the live pool finds is the test signal. Locale (en/US) is a soft recorded preference, not an enforced filter; no political classification exists, so political dimensions are all UNKNOWN.`,
      NOW,
      {
        seedConcepts: [
          'US progressive politics',
          'US liberal politics',
          'progressive policy analysis',
          'Democratic policy debate',
          'labor politics United States',
          'social democratic politics US',
          'progressive economics',
          'progressive foreign policy',
          'progressive healthcare policy',
          'progressive housing policy',
          'progressive criminal justice policy',
          'progressive climate policy',
          'progressive technology policy',
        ],
        ...sharedSettings(),
        assumptions: [
          'This Viewpoint intentionally samples material associated with multiple US left-of-center political traditions. It does not assume those traditions agree with one another or that any candidate represents the political left as a whole.',
          'Sampling lens, not a verdict: nothing about this Viewpoint states or implies that any source or argument it surfaces is correct, representative, moderate, extreme, or authoritative.',
          'Acquisition is query-driven from seed concepts only; no channels are pre-selected, so results reflect what live acquisition finds.',
          'Locale (en/US) is a soft recorded preference; Slipgate does not enforce language or region as filters.',
          'Temporal sampling is the wide-window request with no from/to date window, so candidates with unknown publication dates are never dropped.',
          'No political classification exists in Slipgate: political dimensions of every candidate are UNKNOWN, and exposure-budget floors that live acquisition cannot satisfy are reported honestly as violated rather than manufactured.',
        ],
      },
    ),
    newViewpoint(
      'vp-test-right-broad',
      'US Political Right — Broad Sample',
      `${TEST_VIEWPOINT_MARKER} — DEMO / TEST VIEWPOINT for testing US political discovery behavior. A user-controlled sampling lens over material associated with multiple US right-of-center political traditions — NOT a statement that any source or argument is correct, representative, moderate, extreme, or authoritative, and NOT an inference about anyone's political identity. Query-driven acquisition only: no channels are hard-coded; what the live pool finds is the test signal. Locale (en/US) is a soft recorded preference, not an enforced filter; no political classification exists, so political dimensions are all UNKNOWN.`,
      NOW,
      {
        seedConcepts: [
          'US conservative politics',
          'US right wing politics',
          'conservative policy analysis',
          'Republican policy debate',
          'libertarian politics United States',
          'conservative economics',
          'conservative foreign policy',
          'conservative healthcare policy',
          'conservative housing policy',
          'conservative criminal justice policy',
          'conservative energy policy',
          'conservative technology policy',
        ],
        ...sharedSettings(),
        assumptions: [
          'This Viewpoint intentionally samples material associated with multiple US right-of-center political traditions. It does not assume those traditions agree with one another or that any candidate represents the political right as a whole.',
          'Sampling lens, not a verdict: nothing about this Viewpoint states or implies that any source or argument it surfaces is correct, representative, moderate, extreme, or authoritative.',
          'Acquisition is query-driven from seed concepts only; no channels are pre-selected, so results reflect what live acquisition finds.',
          'Locale (en/US) is a soft recorded preference; Slipgate does not enforce language or region as filters.',
          'Temporal sampling is the wide-window request with no from/to date window, so candidates with unknown publication dates are never dropped.',
          'No political classification exists in Slipgate: political dimensions of every candidate are UNKNOWN, and exposure-budget floors that live acquisition cannot satisfy are reported honestly as violated rather than manufactured.',
        ],
      },
    ),
    newViewpoint(
      'vp-test-left-policy',
      'US Political Left — Policy / Primary Sources',
      `${TEST_VIEWPOINT_MARKER} — DEMO / TEST VIEWPOINT for testing US political discovery behavior. A user-controlled sampling lens emphasizing concrete policy and primary-source material associated with US left-of-center politics — NOT a statement that any source or argument is correct, representative, moderate, extreme, or authoritative, and NOT an inference about anyone's political identity. Query-driven acquisition only: no channels are hard-coded; what the live pool finds is the test signal. Source-type preference is descriptive, never a quality or truth ranking. Locale (en/US) is a soft recorded preference, not an enforced filter; no political classification exists, so political dimensions are all UNKNOWN.`,
      NOW,
      {
        seedConcepts: [
          'progressive policy proposal',
          'Democratic policy proposal',
          'progressive legislation',
          'Democratic legislation',
          'progressive policy hearing',
          'labor policy proposal',
          'progressive economic policy',
          'progressive healthcare proposal',
          'progressive housing proposal',
          'progressive climate proposal',
          'progressive technology regulation',
          'progressive foreign policy proposal',
        ],
        ...sharedSettings(),
        sourceTypePreferences: [...POLICY_SOURCE_TYPE_PREFERENCES],
        assumptions: [
          'This Viewpoint emphasizes concrete policy and primary-source material associated with US left-of-center politics. Source type is descriptive, not a quality or truth ranking.',
          'Sampling lens, not a verdict: nothing about this Viewpoint states or implies that any source or argument it surfaces is correct, representative, moderate, extreme, or authoritative.',
          'Acquisition is query-driven from seed concepts only; no channels are pre-selected, so results reflect what live acquisition finds.',
          'Locale (en/US) is a soft recorded preference; Slipgate does not enforce language or region as filters.',
          'Temporal sampling is the wide-window request with no from/to date window, so candidates with unknown publication dates are never dropped.',
          'No political classification exists in Slipgate: political dimensions of every candidate are UNKNOWN, and exposure-budget floors that live acquisition cannot satisfy are reported honestly as violated rather than manufactured.',
        ],
      },
    ),
    newViewpoint(
      'vp-test-right-policy',
      'US Political Right — Policy / Primary Sources',
      `${TEST_VIEWPOINT_MARKER} — DEMO / TEST VIEWPOINT for testing US political discovery behavior. A user-controlled sampling lens emphasizing concrete policy and primary-source material associated with US right-of-center politics — NOT a statement that any source or argument is correct, representative, moderate, extreme, or authoritative, and NOT an inference about anyone's political identity. Query-driven acquisition only: no channels are hard-coded; what the live pool finds is the test signal. Source-type preference is descriptive, never a quality or truth ranking. Locale (en/US) is a soft recorded preference, not an enforced filter; no political classification exists, so political dimensions are all UNKNOWN.`,
      NOW,
      {
        seedConcepts: [
          'conservative policy proposal',
          'Republican policy proposal',
          'conservative legislation',
          'Republican legislation',
          'conservative policy hearing',
          'libertarian policy proposal',
          'conservative economic policy',
          'conservative healthcare proposal',
          'conservative housing proposal',
          'conservative energy proposal',
          'conservative technology regulation',
          'conservative foreign policy proposal',
        ],
        ...sharedSettings(),
        sourceTypePreferences: [...POLICY_SOURCE_TYPE_PREFERENCES],
        assumptions: [
          'This Viewpoint emphasizes concrete policy and primary-source material associated with US right-of-center politics. Source type is descriptive, not a quality or truth ranking.',
          'Sampling lens, not a verdict: nothing about this Viewpoint states or implies that any source or argument it surfaces is correct, representative, moderate, extreme, or authoritative.',
          'Acquisition is query-driven from seed concepts only; no channels are pre-selected, so results reflect what live acquisition finds.',
          'Locale (en/US) is a soft recorded preference; Slipgate does not enforce language or region as filters.',
          'Temporal sampling is the wide-window request with no from/to date window, so candidates with unknown publication dates are never dropped.',
          'No political classification exists in Slipgate: political dimensions of every candidate are UNKNOWN, and exposure-budget floors that live acquisition cannot satisfy are reported honestly as violated rather than manufactured.',
        ],
      },
    ),
  ];
}

/**
 * Seed the test Viewpoints into a repository. Idempotent: existing ids are
 * skipped (the repository's create() id-collision is the expected signal).
 * Never wired into onboarding, acceptStarters, or the extension content
 * path — callers must invoke this deliberately.
 */
export async function seedTestViewpoints(
  repo: import('./repository').ViewpointRepository,
): Promise<void> {
  for (const vp of testViewpoints()) {
    try {
      await repo.create(vp);
    } catch {
      // Already seeded — id collision is the expected signal.
    }
  }
}