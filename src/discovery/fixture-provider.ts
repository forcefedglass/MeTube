/**
 * FixtureCandidateProvider — the bootstrap CandidateProvider.
 *
 * Serves the local fixture pool. This is the standing shape of candidate
 * acquisition: when real providers land (editorial, community, citation-
 * follow, random-walk), they implement CandidateProvider and slot in
 * beside this one. The fixture provider is also the canary for the
 * contract: if the interface changes, this file fails to compile.
 *
 * Phase 4: implements plan-driven acquisition (`runPlan`) so development
 * mode (fixture pool) exercises the SAME pipeline as real acquisition —
 * plan -> provider -> pool -> classification -> composition. Fixture
 * provenance is honest: every record is marked `fixture`, never
 * `page-metadata`.
 */

import type { CandidateVideo } from '../model/types';
import type { CandidateProvider, CandidateRequest } from './provider';
import { ALL_FIXTURE_CANDIDATES } from './fixtures';
import type {
  AcquisitionStep,
  DiscoveredCandidate,
} from '../model/discovery';
import type { AcquisitionRunResult, StepReport } from './youtube-web';

export class FixtureCandidateProvider implements CandidateProvider {
  readonly id = 'fixture-local';
  readonly label = 'Local fixtures (bootstrap)';

  async getCandidates(request: CandidateRequest): Promise<CandidateVideo[]> {
    // Deterministic slice; fixtures have no meaningful "latest" ordering.
    return ALL_FIXTURE_CANDIDATES.slice(0, Math.max(0, request.limit));
  }

  /**
   * Plan-driven acquisition over the fixture pool. Steps are honored
   * honestly: a step harvests only fixtures its method can legitimately
   * reach, and an unreachable step reports `empty` — never a stretch to
   * "find something anyway".
   */
  async runPlan(
    steps: AcquisitionStep[],
    viewpointId: string | null,
    now: string,
  ): Promise<AcquisitionRunResult> {
    const seen = new Set<string>();
    const candidates: DiscoveredCandidate[] = [];
    const reports: StepReport[] = [];

    for (const step of steps) {
      const harvestedForStep = this.fixturesForStep(step).filter(
        (c) => !seen.has(c.id),
      );
      for (const c of harvestedForStep) seen.add(c.id);
      const accepted = harvestedForStep.slice(0, 12);
      for (const c of accepted) {
        candidates.push({
          videoId: c.id,
          channelId: c.channelId,
          channelTitle: c.channelTitle,
          title: c.title,
          description: c.description,
          publishedAt: c.publishedAt,
          durationSeconds: c.durationSeconds,
          viewCount: null,
          tags: [],
          thumbnailUrl: null,
          language: null,
          metadataConfidence: 'fixture',
          provenance: {
            provider: this.id,
            method: step.method,
            seed: step.target,
            discoveredAt: now,
            viewpointId,
            parentChannelId: step.method === 'channel-uploads' ? step.target : undefined,
          },
        });
      }
      reports.push({
        step,
        status: accepted.length > 0 ? 'ok' : 'empty',
        harvested: harvestedForStep.length,
        ...(accepted.length === 0 ? { error: 'no fixture matches this step' } : {}),
      });
    }
    return { providerId: this.id, candidates, steps: reports, runAt: now };
  }

  /** Which fixtures a step legitimately reaches. No guessing, no stretches. */
  private fixturesForStep(step: AcquisitionStep): CandidateVideo[] {
    switch (step.method) {
      case 'seed-search': {
        // Word-level matching, standing in for a real search page: a query
        // reaches a fixture when any of its significant words appears in the
        // title, description, or channel title. This mirrors how a real
        // search would return topically adjacent material; it does not
        // fabricate matches for queries with nothing in common.
        const words = step.target
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 3);
        if (words.length === 0) return [];
        return ALL_FIXTURE_CANDIDATES.filter((c) => {
          const haystack =
            `${c.title} ${c.description} ${c.channelTitle}`.toLowerCase();
          return words.some((w) => haystack.includes(w));
        });
      }
      case 'channel-uploads':
        return ALL_FIXTURE_CANDIDATES.filter((c) => c.channelId === step.target);
      case 'explicit-video':
        return ALL_FIXTURE_CANDIDATES.filter((c) => c.id === step.target);
      case 'playlist':
        // No fixture playlists exist; an honest empty, never invented members.
        return [];
      default:
        return [];
    }
  }
}