/**
 * Fixture data barrel. All synthetic; see candidates-*.ts for provenance notes.
 */

export { FIXTURE_TOPICS } from './topics';
export { FIXTURE_CHANNELS } from './channels';
export { FIXTURE_NARRATIVE_CLUSTERS, FIXTURE_DISCOVERY_SOURCES } from './graph';
export { FIXTURE_CANDIDATES } from './candidates-part1';
export { FIXTURE_CANDIDATES_PART2 } from './candidates-part2';
export { FIXTURE_CANDIDATES_PART3 } from './candidates-part3';

import type { CandidateVideo } from '../../model/types';
import { FIXTURE_CANDIDATES } from './candidates-part1';
import { FIXTURE_CANDIDATES_PART2 } from './candidates-part2';
import { FIXTURE_CANDIDATES_PART3 } from './candidates-part3';

/** All fixture candidates, in stable id order. */
export const ALL_FIXTURE_CANDIDATES: CandidateVideo[] = [
  ...FIXTURE_CANDIDATES,
  ...FIXTURE_CANDIDATES_PART2,
  ...FIXTURE_CANDIDATES_PART3,
].sort((a, b) => a.id.localeCompare(b.id));