import type { ChannelProfile } from '../../model/types';

export const FIXTURE_CHANNELS: ChannelProfile[] = [
  { id: 'MT-FX-ch-lab', title: 'Test Bench Lab', description: 'Small-scale engineering deep dives.', scaleBand: 'small', topicIds: ['topic-aero', 'topic-history'] },
  { id: 'MT-FX-ch-obs', title: 'The Observers', description: 'Long-form explainers about cities.', scaleBand: 'mid', topicIds: ['topic-urban'] },
  { id: 'MT-FX-ch-mus', title: 'Semi-Tone', description: 'Music theory without gatekeeping.', scaleBand: 'obscure', topicIds: ['topic-music'] },
  { id: 'MT-FX-ch-kit', title: 'Kitchen Chronicles', description: 'Cooking techniques, explained mechanically.', scaleBand: 'large', topicIds: ['topic-cooking'] },
  { id: 'MT-FX-ch-arc', title: 'Archive Access', description: 'Digitized lectures and restored material.', scaleBand: 'small', topicIds: ['topic-history', 'topic-aero'] },
  { id: 'MT-FX-ch-hab', title: 'Habitat Radio', description: 'Interviews about how cities feel.', scaleBand: 'obscure', topicIds: ['topic-urban'] },
];