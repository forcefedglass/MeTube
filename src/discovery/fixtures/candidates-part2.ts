import type { CandidateVideo } from '../../model/types';

export const FIXTURE_CANDIDATES_PART2: CandidateVideo[] = [
  {
    id: 'MT-FX-v00004', title: 'Fifteen minutes to nowhere: the marketing of proximity',
    channelId: 'MT-FX-ch-hab', channelTitle: 'Habitat Radio',
    description: 'A critical reading of proximity branding and who profits from it.',
    publishedAt: '2026-06-30T12:00:00Z', durationSeconds: 2210,
    topicIds: ['topic-urban'], narrativeClusterIds: ['narr-urban-skeptic'],
    discoveredVia: 'src-fixture-community', alsoSeenVia: [],
  },
  {
    id: 'MT-FX-v00005', title: 'Voice leading, drawn on one page',
    channelId: 'MT-FX-ch-mus', channelTitle: 'Semi-Tone',
    description: 'Chord function and voice leading as a single diagram.',
    publishedAt: '2026-09-01T08:00:00Z', durationSeconds: 634,
    topicIds: ['topic-music'], narrativeClusterIds: ['narr-music-harmony'],
    discoveredVia: 'src-fixture-editorial', alsoSeenVia: [],
  },
  {
    id: 'MT-FX-v00006', title: 'Salt, acid, heat: the three dials',
    channelId: 'MT-FX-ch-kit', channelTitle: 'Kitchen Chronicles',
    description: 'Technique-first cooking: controlling the three variables that matter.',
    publishedAt: '2026-08-11T18:00:00Z', durationSeconds: 1120,
    topicIds: ['topic-cooking'], narrativeClusterIds: ['narr-cook-technique'],
    discoveredVia: 'src-fixture-community', alsoSeenVia: ['src-fixture-editorial'],
  },
];