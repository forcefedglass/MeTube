import type { CandidateVideo } from '../../model/types';

export const FIXTURE_CANDIDATES: CandidateVideo[] = [
  {
    id: 'MT-FX-v00001', title: 'Why boosters come back: reusability, slowly explained',
    channelId: 'MT-FX-ch-lab', channelTitle: 'Test Bench Lab',
    description: 'A patient walk through landing burns, refurbishment, and what reuse actually costs.',
    publishedAt: '2026-08-02T10:00:00Z', durationSeconds: 1401,
    topicIds: ['topic-aero'], narrativeClusterIds: ['narr-aero-reuse'],
    discoveredVia: 'src-fixture-editorial', alsoSeenVia: ['src-fixture-citation'],
  },
  {
    id: 'MT-FX-v00002', title: 'The refurbishment bill nobody quotes',
    channelId: 'MT-FX-ch-lab', channelTitle: 'Test Bench Lab',
    description: 'Skeptical accounting of reuse economics between flights.',
    publishedAt: '2026-07-18T09:00:00Z', durationSeconds: 987,
    topicIds: ['topic-aero'], narrativeClusterIds: ['narr-aero-skeptic'],
    discoveredVia: 'src-fixture-citation', alsoSeenVia: [],
  },
  {
    id: 'MT-FX-v00003', title: 'A street is a room: proxemics of the 15-minute city',
    channelId: 'MT-FX-ch-obs', channelTitle: 'The Observers',
    description: 'How proximity planning changes the texture of daily life.',
    publishedAt: '2026-08-20T15:00:00Z', durationSeconds: 1720,
    topicIds: ['topic-urban'], narrativeClusterIds: ['narr-urban-15min'],
    discoveredVia: 'src-fixture-editorial', alsoSeenVia: ['src-fixture-community'],
  },
];