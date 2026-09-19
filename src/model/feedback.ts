/**
 * Feedback semantics — Phase 4: the exploration firewall and explicit
 * feedback kinds.
 *
 * EXPANSION of the bootstrap feedback set from 5 to the Phase 4 set of
 * 12 explicit signals. Rules that are FROZEN:
 *
 *   - "I watched this" (watched/seen) stays SEPARATE from "I want more of
 *     this". Recording that a video was watched is a fact about exposure,
 *     never a training signal for preference. Only 'good-recommendation'
 *     and the 'more-*' kinds are preference statements.
 *   - Every kind is explicit: the user pressed a labeled button. Nothing
 *     is inferred from clicks, dwell, or watch time.
 *   - Feedback is scoped to the Active Viewpoint when recorded through
 *     the Viewstream (exploration firewall); global feedback kinds exist
 *     for signals that are genuinely Viewpoint-independent (save, mute).
 *   - Unknown feedback kinds recorded by older versions are preserved,
 *     never dropped, and never reinterpreted.
 *
 * Pure and DOM-free.
 */

import type { FeedbackKind } from './types';

/**
 * The full Phase 4 explicit feedback set. Ordered as presented in the UI.
 */
export const PHASE4_FEEDBACK_KINDS: FeedbackKind[] = [
  'good-recommendation',
  'interesting-no-extrapolate',
  'more-from-source',
  'less-from-source',
  'more-topic',
  'less-topic',
  'more-narrative-region',
  'cluster-overrepresented',
  'saved',
  'watched',
  'skipped',
  'not-interested',
];

/** Labels shown on the buttons, one per kind, in order. */
export const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
  'good-recommendation': 'Good recommendation',
  'interesting-no-extrapolate': 'Interesting — don\'t extrapolate',
  'more-from-source': 'More from this source',
  'less-from-source': 'Less from this source',
  'more-topic': 'More of this topic',
  'less-topic': 'Less of this topic',
  'more-narrative-region': 'More from this narrative region',
  'cluster-overrepresented': 'This cluster is overrepresented',
  saved: 'Save',
  watched: 'I watched this (recording exposure only)',
  skipped: 'Skipped',
  'not-interested': 'Not interested',
  'more-like-this': 'More like this',
};

/**
 * Semantic groupings. Which pipeline may consume which kind — stated
 * here so tests can pin the contract.
 */
export type FeedbackSemantic =
  | 'preference-positive' // an explicit request for more
  | 'preference-negative' // an explicit request for less
  | 'exposure-fact' // a record of what happened, never a preference
  | 'representation-note'; // a note about pool/feed composition

export const FEEDBACK_SEMANTICS: Record<FeedbackKind, FeedbackSemantic> = {
  'good-recommendation': 'preference-positive',
  'interesting-no-extrapolate': 'representation-note',
  'more-from-source': 'preference-positive',
  'less-from-source': 'preference-negative',
  'more-topic': 'preference-positive',
  'less-topic': 'preference-negative',
  'more-narrative-region': 'preference-positive',
  'cluster-overrepresented': 'representation-note',
  saved: 'exposure-fact',
  watched: 'exposure-fact',
  skipped: 'exposure-fact',
  'not-interested': 'preference-negative',
  'more-like-this': 'preference-positive',
};

/**
 * "I watched this" is deliberately NOT a preference. Familiarity treats
 * watched as exposure; preference treats it as nothing at all. This
 * function is the single source of truth for that separation.
 */
export function isPreferenceSignal(kind: FeedbackKind): boolean {
  return FEEDBACK_SEMANTICS[kind] === 'preference-positive'
    || FEEDBACK_SEMANTICS[kind] === 'preference-negative';
}

/**
 * Kinds that may influence channel familiarity (MeTube-internal
 * familiarity only; never YouTube watch history).
 */
export function countsAsFamiliar(kind: FeedbackKind): boolean {
  return FEEDBACK_SEMANTICS[kind] === 'exposure-fact' || kind === 'more-like-this';
}

/**
 * The five bootstrap kinds, kept verbatim so old records stay valid.
 * 'watched' existed at bootstrap and remains an exposure fact.
 */
export const LEGACY_FEEDBACK_KINDS: FeedbackKind[] = [
  'watched',
  'skipped',
  'saved',
  'not-interested',
  'more-like-this',
];

/** Which kinds are scoped per-Viewpoint by the exploration firewall. */
export function isViewpointScoped(kind: FeedbackKind): boolean {
  // Save and mute are about the video itself, independent of lens; the
  // preference statements are about what this Viewpoint should surface.
  return FEEDBACK_SEMANTICS[kind] !== 'exposure-fact' || kind === 'watched';
}