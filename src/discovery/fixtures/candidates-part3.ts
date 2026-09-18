import type { CandidateVideo } from '../../model/types';

export const FIXTURE_CANDIDATES_PART3: CandidateVideo[] = [
  {
    id: 'MT-FX-v00007', title: 'Who really built the jet age',
    channelId: 'MT-FX-ch-arc', channelTitle: 'Archive Access',
    description: 'A systemic reading of jet-engine development, from restored lectures.',
    publishedAt: '2025-12-05T09:00:00Z', durationSeconds: 2410,
    topicIds: ['topic-history', 'topic-aero'], narrativeClusterIds: ['narr-history-determinism'],
    discoveredVia: 'src-fixture-citation', alsoSeenVia: [],
  },
  {
    id: 'MT-FX-v00008', title: 'Zoning as code: reading the rules that build the city',
    channelId: 'MT-FX-ch-obs', channelTitle: 'The Observers',
    description: 'Zoning ordinances read as a programming language for cities.',
    publishedAt: '2026-05-14T11:00:00Z', durationSeconds: 1890,
    topicIds: ['topic-urban'], narrativeClusterIds: ['narr-urban-15min'],
    discoveredVia: 'src-fixture-citation', alsoSeenVia: ['src-fixture-community'],
  },
  {
    id: 'MT-FX-v00009', title: 'Counterpoint in three minutes',
    channelId: 'MT-FX-ch-mus', channelTitle: 'Semi-Tone',
    description: 'Independent voices, minimal rules, one exercise.',
    publishedAt: '2026-02-27T07:00:00Z', durationSeconds: 205,
    topicIds: ['topic-music'], narrativeClusterIds: ['narr-music-harmony'],
    discoveredVia: 'src-fixture-community', alsoSeenVia: ['src-fixture-citation'],
  },
  {
    id: 'MT-FX-v00010', title: 'Mise en place is systems thinking',
    channelId: 'MT-FX-ch-kit', channelTitle: 'Kitchen Chronicles',
    description: 'How cooks pre-structure work before the first cut.',
    publishedAt: '2026-04-02T16:00:00Z', durationSeconds: 840,
    topicIds: ['topic-cooking'], narrativeClusterIds: ['narr-cook-technique'],
    discoveredVia: 'src-fixture-editorial', alsoSeenVia: [],
  },
];