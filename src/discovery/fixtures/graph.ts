import type { NarrativeCluster, DiscoverySource } from '../../model/types';

export const FIXTURE_NARRATIVE_CLUSTERS: NarrativeCluster[] = [
  { id: 'narr-aero-reuse', label: 'Reusability is the turning point', description: 'Frames reusable boosters as the decisive shift in launch economics.', topicId: 'topic-aero' },
  { id: 'narr-aero-skeptic', label: 'Reusability is oversold', description: 'Argues refurbishment costs erode the reusability case.', topicId: 'topic-aero' },
  { id: 'narr-urban-15min', label: 'The 15-minute city, taken seriously', description: 'Treats proximity planning as practical policy design.', topicId: 'topic-urban' },
  { id: 'narr-urban-skeptic', label: '15-minute city as marketing', description: 'Reads proximity branding as a cover for property interests.', topicId: 'topic-urban' },
  { id: 'narr-music-harmony', label: 'Harmony-first pedagogy', description: 'Teaches music through chord function and voice leading.', topicId: 'topic-music' },
  { id: 'narr-cook-technique', label: 'Technique before recipes', description: 'Understanding heat, salt, and acid over step-by-step recipes.', topicId: 'topic-cooking' },
  { id: 'narr-history-determinism', label: 'Great-man skepticism', description: 'Reads technological change as systemic rather than individual.', topicId: 'topic-history' },
];

export const FIXTURE_DISCOVERY_SOURCES: DiscoverySource[] = [
  { id: 'src-fixture-editorial', label: 'Fixture editorial list', kind: 'fixture', description: 'BOOTSTRAP FIXTURE source standing in for a curated editorial list.' },
  { id: 'src-fixture-community', label: 'Fixture community list', kind: 'fixture', description: 'BOOTSTRAP FIXTURE source standing in for community-vetted lists.' },
  { id: 'src-fixture-citation', label: 'Fixture citation follow', kind: 'fixture', description: 'BOOTSTRAP FIXTURE source standing in for citation-following.' },
];