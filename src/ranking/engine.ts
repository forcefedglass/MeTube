import type {
  CandidateVideo,
  FeedCandidate,
  RankComponents,
  RankComponentName,
  UserProfile,
} from '../model/types';
import { RANK_COMPONENT_LABELS } from '../model/types';
import { isUnknownDate } from '../model/discovery';
import {
  RANK_COMPONENT_ORDER,
  scoreRelevance,
  scoreRepetition,
  scoreSourceNovelty,
  scoreTopicNovelty,
  scoreNarrativeNovelty,
  scoreTemporalDiversity,
  scoreControlledExploration,
  scoreSourceConcentration,
} from './components';
import type { RankWeights } from './components';

export interface RankContext {
  pool: CandidateVideo[];
  profile: UserProfile;
  weights: RankWeights;
}

export function rankCandidates(
  candidates: CandidateVideo[],
  context: RankContext,
): FeedCandidate[] {
  const { profile, weights } = context;
  const pool = candidates;
  const out: FeedCandidate[] = [];
  for (const candidate of candidates) {
    const components: RankComponents = {
      relevance: scoreRelevance(candidate, profile),
      sourceNovelty: scoreSourceNovelty(candidate, profile),
      topicNovelty: scoreTopicNovelty(candidate, profile),
      narrativeNovelty: scoreNarrativeNovelty(candidate, profile).value,
      temporalDiversity: scoreTemporalDiversity(candidate, pool),
      controlledExploration: scoreControlledExploration(candidate, profile),
      repetition: scoreRepetition(candidate, profile),
      sourceConcentration: scoreSourceConcentration(candidate, pool),
    };
    const weighted = weightComponents(components, weights);
    const score = RANK_RANK_SUM(weighted);
    const explanations = buildExplanations(candidate, components);
    out.push({ candidate, score, components, weighted,
      reason: buildReason(weighted), explanations });
  }
  return out.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
}

function RANK_RANK_SUM(weighted: RankComponents): number {
  return RANK_COMPONENT_ORDER.reduce((sum, name) => sum + weighted[name], 0);
}

function weightComponents(components: RankComponents, weights: RankWeights): RankComponents {
  return {
    relevance: components.relevance * weights.relevance,
    sourceNovelty: components.sourceNovelty * weights.sourceNovelty,
    topicNovelty: components.topicNovelty * weights.topicNovelty,
    narrativeNovelty: components.narrativeNovelty * weights.narrativeNovelty,
    temporalDiversity: components.temporalDiversity * weights.temporalDiversity,
    controlledExploration: components.controlledExploration * weights.controlledExploration,
    repetition: components.repetition * weights.repetition,
    sourceConcentration: components.sourceConcentration * weights.sourceConcentration,
  };
}

function buildReason(weighted: RankComponents): string {
  const positives = RANK_COMPONENT_ORDER.filter((n) => weighted[n] > 0.001)
    .sort((a, b) => weighted[b] - weighted[a]);
  if (positives.length === 0) {
    return 'No positive components; surfaced by feed assembly rules.';
  }
  const top = positives.slice(0, 2).map((n) => RANK_COMPONENT_LABELS[n].toLowerCase());
  return `Why this appeared: ${top.join(' + ')}.`;
}

function buildExplanations(candidate: CandidateVideo, components: RankComponents): Record<RankComponentName, string> {
  const out = {} as Record<RankComponentName, string>;
  for (const name of RANK_COMPONENT_ORDER) {
    out[name] = explainComponent(candidate, name, components[name]);
  }
  return out;
}

function explainComponent(candidate: CandidateVideo, name: RankComponentName, value: number): string {
  switch (name) {
    case 'relevance':
      return `Overlap with declared interests (${candidate.topicIds.join(', ') || 'none'}).`;
    case 'sourceNovelty':
      return value > 0 ? 'Discovery source has not surfaced this material to you before.' : 'Discovery source already in your history.';
    case 'topicNovelty':
      return value > 0 ? 'Topic under-represented in your history.' : 'Topic already in your history.';
    case 'narrativeNovelty':
      return value > 0 ? 'Narrative cluster new to you.' : 'Narrative cluster already seen.';
    case 'temporalDiversity':
      return isUnknownDate(candidate.publishedAt)
        ? 'Publication date unknown (source gave no absolute date); temporal component not scored.'
        : `Published ${candidate.publishedAt.slice(0, 10)}; temporal distance from pool mean scored.`;
    case 'controlledExploration':
      return 'Constant exploration allowance: every candidate receives this.';
    case 'repetition':
      return value < 0 ? 'You already gave explicit feedback on this video.' : 'No prior explicit feedback on this video.';
    case 'sourceConcentration':
      return value < 0 ? 'Channel already has significant presence in the candidate pool.' : 'Channel share of pool is low.';
    default:
      return 'Unexplained at bootstrap fidelity.';
  }
}
