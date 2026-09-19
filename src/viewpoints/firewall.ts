/**
 * Exploration firewall — Phase 4.
 *
 * MeTube tracks three state spaces, deliberately separated:
 *
 *   1. GLOBAL MeTube state — candidate pool, classification overrides,
 *      saves, mutes. These describe the user's MeTube-wide facts.
 *   2. PER-VIEWPOINT state — preference feedback recorded through a
 *      Viewstream (good recommendation, more/less from source, more/less
 *      of topic, narrative-region preferences). These train only the
 *      Viewpoint they were recorded under.
 *   3. NORMAL YouTube state — which MeTube never reads and never
 *      intentionally mutates (no cookie, localStorage, watch-history, or
 *      subscription access anywhere in the codebase).
 *
 * The firewall's one rule: feedback recorded inside a Viewpoint's
 * Viewstream does not automatically influence unrelated Viewpoints. The
 * separation is enforced at read time (pure functions below), not by
 * hoping callers behave.
 *
 * Normal YouTube state is NOT replicated here: it is absent by design.
 * The firewall's job is to keep MeTube's own scopes apart.
 */

import type { FeedbackKind, UserFeedback, UserProfile, ViewpointId } from '../model/types';
import { isViewpointScoped } from '../model/feedback';
import type { Viewpoint } from '../model/viewpoint';

/** Feedback visible to a specific Viewpoint (its own + global). */
export function feedbackVisibleTo(
  profile: UserProfile,
  viewpointId: ViewpointId | null,
): UserFeedback[] {
  if (viewpointId === null) {
    // Unlensed feed: only truly global feedback (nothing scoped).
    return profile.feedback.filter((f) => f.viewpointId === undefined);
  }
  return profile.feedback.filter(
    (f) => f.viewpointId === undefined || f.viewpointId === viewpointId,
  );
}

/**
 * Record feedback through the firewall. Scoped kinds get the Viewpoint
 * id attached; global kinds stay Viewpoint-free. Returns the new feedback
 * entry (caller persists it in the profile).
 */
export function recordFeedback(
  profile: UserProfile,
  videoId: string,
  kind: FeedbackKind,
  activeViewpointId: ViewpointId | null,
  now: string,
): UserFeedback {
  const entry: UserFeedback = {
    id: `fb-${profile.feedback.length}-${Math.trunc(Math.random() * 1e6).toString(36)}`,
    videoId,
    kind,
    capturedAt: now,
  };
  if (activeViewpointId !== null && isViewpointScoped(kind)) {
    entry.viewpointId = activeViewpointId;
  }
  return entry;
}

/**
 * Apply one feedback entry to a profile through the firewall: appends the
 * entry (scoping it to the active Viewpoint when the kind is scoped).
 * Pure: returns a new profile.
 */
export function recordFeedbackThroughFirewall(
  profile: UserProfile,
  videoId: string,
  kind: FeedbackKind,
  activeViewpointId: ViewpointId | null,
  now: string,
): UserProfile {
  const entry = recordFeedback(profile, videoId, kind, activeViewpointId, now);
  return { ...profile, feedback: [...profile.feedback, entry], updatedAt: now };
}

/**
 * The firewall read for ranking: which feedback trains THIS Viewpoint?
 * Unlensed assembly sees global feedback only; a Viewpoint sees its own
 * plus global. 'watched' never becomes preference anywhere.
 */
export function trainingFeedbackFor(
  profile: UserProfile,
  viewpoint: Viewpoint | null,
): UserFeedback[] {
  const visible = feedbackVisibleTo(profile, viewpoint ? viewpoint.id : null);
  return visible;
}

/**
 * Migration helper: feedback recorded before Phase 4 has no viewpointId;
 * it stays global (visible to every Viewpoint). This is deliberate:
 * reinterpreting old data into a scope it never declared would be
 * fabrication. Pure; returns the profile unchanged.
 */
export function migrateLegacyFeedback(profile: UserProfile): UserProfile {
  return profile;
}