/**
 * FixtureCandidateProvider — the bootstrap CandidateProvider.
 *
 * Serves the local fixture pool. This is the standing shape of candidate
 * acquisition: when real providers land (editorial, community, citation-
 * follow, random-walk), they implement CandidateProvider and slot in
 * beside this one. The fixture provider is also the canary for the
 * contract: if the interface changes, this file fails to compile.
 */

import type { CandidateVideo } from '../model/types';
import type { CandidateProvider, CandidateRequest } from './provider';
import { ALL_FIXTURE_CANDIDATES } from './fixtures';

export class FixtureCandidateProvider implements CandidateProvider {
  readonly id = 'fixture-local';
  readonly label = 'Local fixtures (bootstrap)';

  async getCandidates(request: CandidateRequest): Promise<CandidateVideo[]> {
    // Deterministic slice; fixtures have no meaningful "latest" ordering.
    return ALL_FIXTURE_CANDIDATES.slice(0, Math.max(0, request.limit));
  }
}