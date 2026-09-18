/**
 * DEMO Viewpoints — clearly marked, built on the existing fixtures.
 *
 * These exist so the Viewpoint pipeline is observable without real
 * acquisition. They are ordinary Viewpoints: fully inspectable, editable,
 * deletable, duplicable. The `DEMO` marker lives in the description and the
 * `vp-demo-` id prefix; nothing else distinguishes them.
 *
 * Note on political DEMOs: "Counter A / Counter B" only demonstrates the
 * *mechanism* (positive/negative topic + narrative constraints). No
 * political classification exists anywhere in MeTube; these constraints
 * reference fixture topics/narratives only. `baselineContext` stays empty
 * in DEMOs because a user baseline is user-authored by definition.
 */

import type { Viewpoint } from '../model/viewpoint';
import { newViewpoint } from '../model/viewpoint';

const NOW = '2026-09-18T00:00:00Z';

export const DEMO_MARKER = 'DEMO';

export function demoViewpoints(): Viewpoint[] {
  return [
    newViewpoint(
      'vp-demo-bubble-exit',
      'Gaming Outside My Usual Bubble',
      `${DEMO_MARKER} — stands in for "same subject, channels I never see". Fixture approximation: unfamiliarity on, exploration high.`,
      NOW,
      {
        seedTopics: ['topic-aero'],
        positiveTopicConstraints: ['topic-aero'],
        unfamiliarityTarget: 'mostly-unfamiliar',
        explorationPercent: 0.4,
        narrativeDiversityTarget: 'mixed-narratives',
      },
    ),
    newViewpoint(
      'vp-demo-small-channels',
      'Small PC Gaming Channels',
      `${DEMO_MARKER} — channel-size preference for small/obscure, strict concentration limit.`,
      NOW,
      {
        channelSizePreferences: ['small', 'obscure'],
        sourceConcentrationLimit: 0.25,
      },
    ),
    newViewpoint(
      'vp-demo-jp-coverage',
      'Japanese Coverage of Western Games',
      `${DEMO_MARKER} — locale preference demonstration. Fixtures carry no real language data; the constraint is recorded and inspectable.`,
      NOW,
      {
        locale: { language: 'ja', region: 'JP' },
        explorationPercent: 0.25,
      },
    ),
    newViewpoint(
      'vp-demo-counter-a',
      'Counter Political Viewpoint A',
      `${DEMO_MARKER} — mechanism demo: narrative-cluster constraint selecting one framing on the urban-planning topic. Not a political classifier; baselineContext is user-authored and left empty.`,
      NOW,
      {
        positiveTopicConstraints: ['topic-urban'],
        unfamiliarityTarget: 'strictly-unfamiliar',
      },
    ),
    newViewpoint(
      'vp-demo-counter-b',
      'Counter Political Viewpoint B',
      `${DEMO_MARKER} — mechanism demo: the other urban-planning narrative cluster. Same topic, different lens; no ideology inference anywhere.`,
      NOW,
      {
        positiveTopicConstraints: ['topic-urban'],
        narrativeDiversityTarget: 'max-narrative-spread',
      },
    ),
    newViewpoint(
      'vp-demo-historical',
      'Historical Coverage Before Release',
      `${DEMO_MARKER} — temporal window constraint; picks the oldest fixture material.`,
      NOW,
      {
        temporal: 'historical',
        temporalTo: '2026-01-01T00:00:00Z',
      },
    ),
    newViewpoint(
      'vp-demo-technical',
      'Technical Analysis Only',
      `${DEMO_MARKER} — negative topic constraints exclude everything except the technical topics.`,
      NOW,
      {
        negativeTopicConstraints: ['topic-urban', 'topic-cooking', 'topic-music'],
      },
    ),
    newViewpoint(
      'vp-demo-not-recommended',
      'Things I Normally Wouldn\'t Be Recommended',
      `${DEMO_MARKER} — maximum exploration, zero relevance weight, strictly-unfamiliar.`,
      NOW,
      {
        unfamiliarityTarget: 'strictly-unfamiliar',
        explorationPercent: 1.0,
        weightOverrides: [
          { component: 'relevance', value: 0 },
          { component: 'topicNovelty', value: 1.2 },
          { component: 'narrativeNovelty', value: 1.0 },
        ],
      },
    ),
  ];
}

/** Seed demo viewpoints into storage exactly once. */
export async function seedDemoViewpoints(
  repo: import('./repository').ViewpointRepository,
): Promise<void> {
  for (const vp of demoViewpoints()) {
    try {
      await repo.create(vp);
    } catch {
      // Already seeded — id collision is the expected signal.
    }
  }
}