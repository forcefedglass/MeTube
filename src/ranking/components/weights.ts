import type { RankComponentName } from '../../model/types';
import { RANK_COMPONENT_LABELS } from '../../model/types';

/**
 * Named score components and their weights. Every component must have a
 * weight; weights are inspectable and adjustable; the sum must stay
 * explainable — no opaque ML anywhere in the pipeline.
 */

export interface RankWeights {
  relevance: number;
  sourceNovelty: number;
  topicNovelty: number;
  narrativeNovelty: number;
  temporalDiversity: number;
  controlledExploration: number;
  repetition: number;
  sourceConcentration: number;
}

export const DEFAULT_WEIGHTS: RankWeights = {
  relevance: 1.0,
  sourceNovelty: 0.7,
  topicNovelty: 0.7,
  narrativeNovelty: 0.6,
  temporalDiversity: 0.4,
  controlledExploration: 0.15,
  repetition: 0.6,
  sourceConcentration: 0.5,
};

export const RANK_COMPONENT_ORDER: RankComponentName[] = [
  'relevance',
  'sourceNovelty',
  'topicNovelty',
  'narrativeNovelty',
  'temporalDiversity',
  'controlledExploration',
  'repetition',
  'sourceConcentration',
];

export function explainingLabels(weights: RankWeights): string[] {
  return RANK_COMPONENT_ORDER.filter((k) => weights[k] !== 0).map(
    (k) => RANK_COMPONENT_LABELS[k],
  );
}