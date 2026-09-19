/**
 * Provenance chain — Phase 5.
 *
 * "Why this appeared" as one traceable chain, per feed item:
 *
 *   1. VIEWPOINT RULE — which constraints of the active Viewpoint the
 *      candidate passed (hard filters + soft preferences), restated from
 *      the Viewpoint's config.
 *   2. DISCOVERY — how the candidate entered the pool: provider, method,
 *      seed, first-sighting time (CandidateProvenance) plus repeat
 *      sightings.
 *   3. CLASSIFICATION — what the machine (or the user, via override)
 *      says the candidate is, with origin/method/evidence per dimension.
 *   4. RANKING — every score component, its weight, its weighted value,
 *      and its explanation (already recorded on FeedCandidate).
 *   5. INCLUSION — the composer's decision: taken by the main walk, a
 *      floor reservation (which floor), or the exploration reservation;
 *      or why it was NOT taken (ceiling/cooldown/limit), when that is
 *      known.
 *
 * The chain assembles RECORDED data. It never invents a step: when a
 * link is missing (no classification, unknown date, unranked) the chain
 * says "unknown" for that link.
 *
 * Pure and DOM-free. Deterministic.
 */

import type { FeedCandidate, CandidateVideo } from '../model/types';
import type { VideoClassification } from '../model/classification';
import type { Viewpoint } from '../model/viewpoint';
import { summarizeViewpoint } from '../model/viewpoint';
import { candidatePasses, interpretViewpoint } from '../viewpoints/interpret';

export type ProvenanceLink =
  | 'viewpoint-rule'
  | 'discovery'
  | 'classification'
  | 'ranking'
  | 'inclusion';

export const PROVENANCE_LINK_LABELS: Record<ProvenanceLink, string> = {
  'viewpoint-rule': 'Viewpoint rule',
  discovery: 'Discovery',
  classification: 'Classification',
  ranking: 'Ranking',
  inclusion: 'Inclusion',
};

/** Step 1: how the candidate related to the Viewpoint's rules. */
export interface ViewpointRuleStep {
  viewpointId: string;
  viewpointTitle: string;
  /** One line summary of all constraints (restated, not judged). */
  constraintsSummary: string;
  /** Which hard filters this candidate passed, with the recorded constraint. */
  passed: string[];
  /** Hard filters that would have dropped it (should be empty when included). */
  failed: string[];
  /** Human statement of the step. */
  statement: string;
}

/** Step 2: how the candidate was discovered. */
export interface DiscoveryStep {
  provider: string;
  method: string;
  seed: string;
  discoveredAt: string;
  viewpointId: string | null;
  /** Repeat sightings (other providers/seeds that also surfaced it). */
  alsoSeenVia: string[];
  statement: string;
}

/** Step 3: classification with audit trail. */
export interface ClassificationStep {
  topics: string;
  sourceType: string;
  narrativeCluster: string;
  temporalPosition: string;
  statement: string;
}

/** Step 4: ranking components. */
export interface RankingStep {
  score: number;
  components: { name: string; label: string; value: number; weight: number; weighted: number; explanation: string }[];
  statement: string;
}

/** Step 5: inclusion decision. */
export interface InclusionStep {
  included: boolean;
  /** 'main-walk' | 'floor-reservation' | 'exploration-reservation' | reason for exclusion. */
  basis: string;
  statement: string;
}

export interface ProvenanceChain {
  videoId: string;
  title: string;
  viewpointRule: ViewpointRuleStep;
  discovery: DiscoveryStep | null;
  classification: ClassificationStep | null;
  ranking: RankingStep;
  inclusion: InclusionStep;
}

/** Provenance carried from the pool (first sighting), when available. */
export interface PoolProvenance {
  provider: string;
  method: string;
  seed: string;
  discoveredAt: string;
  viewpointId: string | null;
  alsoSeenVia: { provider: string; method: string; seed: string }[];
}

/** How the composer included the item, when known. */
export interface InclusionBasis {
  basis: 'main-walk' | 'floor-reservation' | 'exploration-reservation';
  detail?: string;
}

export interface ProvenanceInput {
  item: FeedCandidate;
  viewpoint: Viewpoint | null;
  classification: VideoClassification | undefined;
  poolProvenance: PoolProvenance | null;
  inclusion: InclusionBasis | null;
}

/**
 * Assemble the full five-step chain for one feed item. Every step states
 * recorded facts or says "unknown". Deterministic.
 */
export function buildProvenanceChain(input: ProvenanceInput): ProvenanceChain {
  const { item, viewpoint, classification, poolProvenance, inclusion } = input;
  const candidate = item.candidate;

  // --- Step 1: Viewpoint rule ------------------------------------------
  let viewpointRule: ViewpointRuleStep;
  if (viewpoint) {
    const interpretation = interpretViewpoint(viewpoint.config);
    const filters = interpretation.filters;
    const passed: string[] = [];
    const failed: string[] = [];
    if (filters.positiveTopics.size > 0) {
      const constraint = `[...${[...filters.positiveTopics].join(', ')}]`;
      const ok = candidate.topicIds.some((t) => filters.positiveTopics.has(t));
      (ok ? passed : failed).push(`positive topic constraint ${constraint}`);
    }
    if (filters.negativeTopics.size > 0) {
      const constraint = `[...${[...filters.negativeTopics].join(', ')}]`;
      const ok = !candidate.topicIds.some((t) => filters.negativeTopics.has(t));
      (ok ? passed : failed).push(`negative topic constraint ${constraint}`);
    }
    if (filters.sources.size > 0) {
      const constraint = `[${[...filters.sources].join(', ')}]`;
      const ok =
        filters.sources.has(candidate.discoveredVia) ||
        candidate.alsoSeenVia.some((s) => filters.sources.has(s));
      (ok ? passed : failed).push(`discovery source constraint ${constraint}`);
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      const window = `[${filters.from !== undefined ? new Date(filters.from).toISOString().slice(0, 10) : '…'} .. ${filters.to !== undefined ? new Date(filters.to).toISOString().slice(0, 10) : '…'}]`;
      const ok = candidatePasses(candidate, filters);
      (ok ? passed : failed).push(`publication window ${window}`);
    }
    if (passed.length === 0 && failed.length === 0) {
      passed.push('no hard filters configured on this Viewpoint');
    }
    viewpointRule = {
      viewpointId: viewpoint.id,
      viewpointTitle: viewpoint.title,
      constraintsSummary: summarizeViewpoint(viewpoint),
      passed,
      failed,
      statement:
        `Candidate passed the hard filters of Viewpoint "${viewpoint.title}": ` +
        (passed.length > 0 ? passed.join('; ') : '(none configured)'),
    };
  } else {
    viewpointRule = {
      viewpointId: 'none',
      viewpointTitle: 'no active Viewpoint',
      constraintsSummary: 'unlensed bootstrap feed',
      passed: [],
      failed: [],
      statement:
        'No Viewpoint was active: this item came from the unlensed bootstrap feed (local fixtures only).',
    };
  }

  // --- Step 2: Discovery ---------------------------------------------------
  let discovery: DiscoveryStep | null = null;
  if (poolProvenance) {
    discovery = {
      provider: poolProvenance.provider,
      method: poolProvenance.method,
      seed: poolProvenance.seed,
      discoveredAt: poolProvenance.discoveredAt,
      viewpointId: poolProvenance.viewpointId,
      alsoSeenVia: poolProvenance.alsoSeenVia.map((a) => `${a.provider}/${a.method} via "${a.seed}"`),
      statement:
        `Discovered by provider "${poolProvenance.provider}" using ${poolProvenance.method} ` +
        `(seed: "${poolProvenance.seed}") on ${poolProvenance.discoveredAt.slice(0, 10)}, ` +
        `surfaced ${poolProvenance.viewpointId ? `by the plan of Viewpoint ${poolProvenance.viewpointId}` : 'manually'}.`,
    };
  } else {
    discovery = {
      provider: candidate.discoveredVia,
      method: 'unknown (recorded before Phase 5 provenance)',
      seed: 'unknown',
      discoveredAt: 'unknown',
      viewpointId: null,
      alsoSeenVia: candidate.alsoSeenVia,
      statement:
        `First sighting recorded only as discovery source "${candidate.discoveredVia}"; ` +
        'full acquisition provenance was not recorded for this pool entry.',
    };
  }

  // --- Step 3: Classification -------------------------------------------
  let clsStep: ClassificationStep | null = null;
  if (classification) {
    const topics = classification.topics.length > 0
      ? classification.topics.map((t) => `${t.value} (confidence ${t.confidence.toFixed(2)}, ${t.origin}, ${t.method}; evidence: ${t.evidence})`).join('; ')
      : 'none recorded';
    clsStep = {
      topics,
      sourceType: `${classification.sourceType.value} (confidence ${classification.sourceType.confidence.toFixed(2)}, ${classification.sourceType.origin}, ${classification.sourceType.method}; evidence: ${classification.sourceType.evidence})`,
      narrativeCluster: `${classification.narrativeCluster.value} (confidence ${classification.narrativeCluster.confidence.toFixed(2)}, ${classification.narrativeCluster.origin}, ${classification.narrativeCluster.method}; evidence: ${classification.narrativeCluster.evidence})`,
      temporalPosition: `${classification.temporalPosition.value} (confidence ${classification.temporalPosition.confidence.toFixed(2)}, ${classification.temporalPosition.origin}, ${classification.temporalPosition.method}; evidence: ${classification.temporalPosition.evidence})`,
      statement:
        'Classification as recorded (machine + user overrides; every dimension carries origin, method, and evidence).',
    };
  } else {
    clsStep = null;
  }

  // --- Step 4: Ranking ----------------------------------------------------
  const components = Object.entries(item.components).map(([name, value]) => ({
    name,
    label: name,
    value,
    weight: item.weighted[name as keyof typeof item.weighted] / (value !== 0 ? value : 1),
    weighted: item.weighted[name as keyof typeof item.weighted],
    explanation: item.explanations[name as keyof typeof item.explanations] ?? 'unknown',
  }));
  const ranking: RankingStep = {
    score: item.score,
    components,
    statement:
      `Ranked ${item.score.toFixed(3)} total; every component, its weight, and its recorded explanation are listed. ` +
      item.reason,
  };

  // --- Step 5: Inclusion ----------------------------------------------------
  const inclusionStep: InclusionStep = inclusion
    ? {
        included: true,
        basis: inclusion.basis,
        statement:
          inclusion.basis === 'main-walk'
            ? 'Included by the composer\'s main walk: the highest-ranked candidate that fit all ceilings and cooldowns at this slot.'
            : inclusion.basis === 'floor-reservation'
              ? `Included by floor reservation: reserved to satisfy the budget floor (${inclusion.detail ?? 'floor rule'}).`
              : 'Included by exploration reservation: reserved outside the positive topic constraints under the explorationShare rule.',
      }
    : {
        included: true,
        basis: 'unknown (composed before Phase 5 inclusion recording)',
        statement:
          'Inclusion basis was not recorded for this snapshot. The item is in the feed; the composer decision link is unknown for it.',
      };

  return {
    videoId: candidate.id,
    title: candidate.title,
    viewpointRule,
    discovery,
    classification: clsStep,
    ranking,
    inclusion: inclusionStep,
  };
}