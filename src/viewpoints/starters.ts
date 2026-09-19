/**
 * Starter Viewpoints — Phase 5.
 *
 * Generic, EDITABLE starter lenses offered at onboarding. They demonstrate
 * the MECHANISM (seed topics, constraints, budgets) with zero political
 * prescription: MeTube does not suggest what anyone should believe or
 * which perspectives to adopt. The user is offered these as starting
 * points and can edit or delete every field of them.
 *
 * These replace the Phase 2-4 DEMO set for NEW installs; existing stored
 * viewpoints are never touched by seeding (id-collision skip).
 *
 * FROZEN RULES:
 *   - No starter references a political position, party, ideology, or a
 *     "counter" to anything. Topics reference the fixture catalog (real
 *     acquisition material) or nothing at all.
 *   - Every starter is a fully inspectable, editable, deletable ordinary
 *     Viewpoint. Nothing distinguishes them from user-authored ones
 *     except the description text.
 */

import type { Viewpoint } from '../model/viewpoint';
import { newViewpoint } from '../model/viewpoint';

const NOW = '2026-09-18T00:00:00Z';

export const STARTER_MARKER = 'STARTER';

export function starterViewpoints(): Viewpoint[] {
  return [
    newViewpoint(
      'vp-starter-wide-open',
      'Wide Open Sampling',
      `${STARTER_MARKER} — no constraints at all: everything the pool has, ranked by the default engine. A neutral starting point you can edit into anything you need.`,
      NOW,
      {
        // Seeds across the whole catalog so acquisition actually fills
        // the pool; the LENS itself adds no constraints.
        seedTopics: [
          'topic-aero', 'topic-urban', 'topic-music', 'topic-cooking', 'topic-history',
        ],
      },
    ),
    newViewpoint(
      'vp-starter-outside-bubble',
      'Outside My Usual Bubble',
      `${STARTER_MARKER} — favors sources and topics YourTube has never shown you (strictly-unfamiliar channels, high exploration share). Demonstrates the unfamiliarity and exploration controls.`,
      NOW,
      {
        unfamiliarityTarget: 'strictly-unfamiliar',
        explorationPercent: 0.4,
        weightOverrides: [
          { component: 'relevance', value: 0 },
          { component: 'topicNovelty', value: 1.2 },
        ],
      },
    ),
    newViewpoint(
      'vp-starter-mixed-source',
      'Mixed Source Types',
      `${STARTER_MARKER} — deliberately mixes source types (publications, independent creators, technical analysts...) instead of letting one kind dominate. Demonstrates the exposure budget.`,
      NOW,
      {
        exposureBudget: {
          maxSingleChannelShare: 0.25,
          maxSingleNarrativeShare: 0.4,
          minAlternateSourceTypeShare: 0.25,
          explorationShare: 0.1,
        },
      },
    ),
    newViewpoint(
      'vp-starter-deep-history',
      'Deep History',
      `${STARTER_MARKER} — samples older material: a publication window that excludes the recent past, so the feed is not dominated by the newest uploads. Demonstrates the temporal window.`,
      NOW,
      {
        // Seed concept (user-authored text) that reaches archival material
        // in the fixture catalog, so the temporal window has a pool to
        // filter. Edit or replace this seed with your own subject.
        seedConcepts: ['jet age'],
        temporal: 'historical',
        temporalTo: '2026-01-01T00:00:00Z',
      },
    ),
    newViewpoint(
      'vp-starter-single-subject',
      'One Subject, Many Angles',
      `${STARTER_MARKER} — pick one subject (edit the seed topic below) and require narrative spread within it. Demonstrates narrative-cluster diversity without ever scoring positions.`,
      NOW,
      {
        seedTopics: ['topic-aero'],
        positiveTopicConstraints: ['topic-aero'],
        narrativeDiversityTarget: 'max-narrative-spread',
        exposureBudget: {
          maxSingleNarrativeShare: 0.34,
        },
      },
    ),
  ];
}

/** Seed starter viewpoints into storage exactly once (id collision = skip). */
export async function seedStarterViewpoints(
  repo: import('./repository').ViewpointRepository,
): Promise<void> {
  for (const vp of starterViewpoints()) {
    try {
      await repo.create(vp);
    } catch {
      // Already seeded — id collision is the expected signal.
    }
  }
}