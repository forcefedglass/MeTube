/**
 * Exposure budget model — Phase 4: the Viewstream composer.
 *
 * An EXPOSURE BUDGET is a set of user-visible, user-editable rules that
 * bound how the composed Viewstream spends its slots. Budgets are
 * *proportions of the final feed*, expressed as fractions in [0,1].
 *
 * Design rules (FROZEN for Phase 4):
 *   - Every rule is visible and editable. No rule is hidden behind ML.
 *   - Budgets are CEILINGS (max) and FLOORS (min) on shares of the feed,
 *     never scores. They never rank candidates; they select within a
 *     ranked list.
 *   - The engine degrades honestly: when the pool cannot satisfy a floor
 *     or a quota, the composition report says exactly which rule was
 *     violated and why. Diversity is NEVER manufactured by misclassifying
 *     candidates — an unknown stays unknown.
 *   - Unknown classifications never count toward any diversity floor: a
 *     candidate with unknown source type does not satisfy "alternate
 *     source type" any more than one with the majority type would.
 *
 * Everything in this module is pure and DOM-free.
 */

import type { ChannelId, NarrativeClusterId, TopicId } from './types';

/**
 * All budget rules are optional. A missing rule means "no constraint on
 * this axis". Values are fractions of the final feed size in [0,1].
 */
export interface ExposureBudget {
  /** Max fraction of the feed from any single channel. */
  maxSingleChannelShare?: number;
  /** Max fraction of the feed from any single narrative cluster. */
  maxSingleNarrativeShare?: number;
  /** Min fraction of the feed from channels never seen in MeTube. */
  minUnfamiliarChannelShare?: number;
  /** Min fraction of the feed from source types other than the pool's
   *  dominant classified source type ("alternate source types"). */
  minAlternateSourceTypeShare?: number;
  /** Min fraction of the feed that is historical material (published
   *  more than a year before `now`, or explicitly classified
   *  retrospective/historical by framing). */
  minHistoricalShare?: number;
  /** Min fraction of the feed reserved for wildcard/exploration picks
   *  (candidates outside the Viewpoint's positive topic constraints). */
  explorationShare?: number;
  /** Max fraction of the feed touching any single topic. */
  maxSingleTopicShare?: number;
  /** After a feed includes a channel, how many feeds must pass before it
   *  can appear again (repeated-channel cooldown, in generations). */
  repeatedChannelCooldown?: number;
  /** After a feed includes a narrative cluster, how many feeds must pass
   *  before it can appear again (in generations). */
  repeatedNarrativeCooldown?: number;
  /** Optional: language diversity target — min number of distinct
   *  languages when language data is evidenced (it is not, yet; recorded
   *  honestly rather than fabricated). */
  minDistinctLanguages?: number;
  /** Optional: geographic diversity target — min number of distinct
   *  regions when region data is evidenced (it is not, yet). */
  minDistinctRegions?: number;
  /** Optional: channel-scale diversity target — min number of distinct
   *  scale bands represented (bands come from channel profiles when
   *  known; unknown otherwise). */
  minDistinctScaleBands?: number;
}

/**
 * One budget rule's evaluation against a composed feed. Facts only: the
 * rule, the observed value, whether it was satisfied, and why not.
 */
export interface ExposureRuleReport {
  /** Stable rule id, e.g. 'maxSingleChannelShare'. */
  rule: keyof ExposureBudget;
  /** Human-readable restatement of the rule. */
  statement: string;
  /** The configured target fraction/count. */
  target: number;
  /** What the composed feed actually contains (fraction or count). */
  observed: number;
  /** 'satisfied' | 'violated' — and for floors, 'unachievable' when the
   *  pool provably could not satisfy them. */
  status: 'satisfied' | 'violated' | 'not-applicable';
  /** Why the rule evaluated this way, in plain words. Never empty. */
  explanation: string;
}

/** The full evaluation of one composition against its budget. */
export interface ExposureReport {
  /** Feed size actually composed. */
  feedSize: number;
  /** Candidates available after hard filters and muting. */
  poolSize: number;
  /** Per-rule evaluations, one per configured rule. */
  rules: ExposureRuleReport[];
  /** How many rules were satisfied. */
  satisfied: number;
  /** How many rules were violated (including unachievable floors). */
  violated: number;
  /** Channels that appeared in a feed (for cooldown tracking). */
  channelsFeatured: ChannelId[];
  /** Narrative clusters that appeared (for cooldown tracking). */
  narrativesFeatured: NarrativeClusterId[];
}

/** Recorded history used to enforce cooldowns across generations. */
export interface GenerationHistoryEntry {
  /** Generation index (monotonic; increments once per composed feed). */
  generation: number;
  composedAt: string;
  viewpointId: string;
  channels: ChannelId[];
  narrativeClusters: NarrativeClusterId[];
}

/** Which topics a feed item touched (helper facts for ceilings). */
export function topicsOf(topicIds: TopicId[]): TopicId[] {
  return [...new Set(topicIds)];
}