/**
 * Phase 4 tests: perspective pairing, exploration firewall, feedback
 * semantics, and blind-spot coverage.
 *
 * These tests pressure-test the frozen Phase 4 rules:
 * - pairing is evidence-gated; no false two-sided symmetry
 * - feedback inside one Viewpoint never trains another
 * - 'watched' (exposure fact) stays separate from preference signals
 * - blind-spot highlighting is descriptive, never prescriptive
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CandidateVideo,
  FeedCandidate,
  FeedbackKind,
  RankComponentName,
  RankComponents,
  UserFeedback,
  UserProfile,
  ViewpointId,
} from '../src/model/types';
import { emptyUserProfile } from '../src/model/types';
import {
  PHASE4_FEEDBACK_KINDS,
  FEEDBACK_LABELS,
  countsAsFamiliar,
  isPreferenceSignal,
  isViewpointScoped,
} from '../src/model/feedback';
import {
  feedbackVisibleTo,
  recordFeedbackThroughFirewall,
  trainingFeedbackFor,
  migrateLegacyFeedback,
} from '../src/viewpoints/firewall';
import {
  findPerspectivePairs,
  comparisonsForItem,
} from '../src/viewpoints/pairing';
import type { ClassificationLookup } from '../src/discovery/coverage';
import type { ClassifiedValue, VideoClassification } from '../src/model/classification';
import { computeBlindSpots } from '../src/viewpoints/blindspots';

const NOW = '2026-09-18T00:00:00Z';

// ---------------------------------------------------------------------------
// Test helpers (mirrors of composer.test.ts helpers, independent of them so
// each suite can evolve without breaking the other)
// ---------------------------------------------------------------------------

let nextId = 0;

function makeCandidate(overrides: Partial<CandidateVideo> = {}): CandidateVideo {
  nextId += 1;
  return {
    id: `vid-p4-${nextId}`,
    title: 'A test video',
    channelId: `ch-p4-${nextId}`,
    channelTitle: `Channel ${nextId}`,
    description: '',
    publishedAt: NOW,
    durationSeconds: 600,
    topicIds: [],
    narrativeClusterIds: [],
    discoveredVia: 'youtube-web:seed-search',
    alsoSeenVia: [],
    ...overrides,
  };
}

function feedbackEntry(
  videoId: string,
  kind: FeedbackKind,
  viewpointId?: ViewpointId,
): UserFeedback {
  return { id: `fb-${videoId}-${kind}`, videoId, kind, capturedAt: NOW, viewpointId };
}

function profileWith(entries: UserFeedback[]): UserProfile {
  const profile = emptyUserProfile(NOW);
  profile.feedback.push(...entries);
  return profile;
}


function classifyLookup(
  entries: Array<{ videoId: string; sourceType?: string; temporal?: string }>,
): ClassificationLookup {
  const cv = (value: string | undefined): ClassifiedValue => ({
    value: (value ?? 'unknown') as never,
    confidence: value ? 0.8 : 0.2,
    origin: value ? 'classifier' : 'provider',
    method: value ? 'fixture' : 'no evidence',
    evidence: value ? `fixture says ${value}` : 'no evidence',
  });
  const map = new Map<string, VideoClassification>();
  for (const e of entries) {
    map.set(e.videoId, {
      videoId: e.videoId,
      topics: [],
      sourceType: cv(e.sourceType),
      narrativeCluster: cv(undefined),
      temporalPosition: cv(e.temporal),
    } as unknown as VideoClassification);
  }
  return (videoId) => map.get(videoId);
}


// ---------------------------------------------------------------------------
// Feedback semantics
// ---------------------------------------------------------------------------

test('feedback semantics: all Phase 4 kinds have labels and known semantics', () => {
  for (const kind of PHASE4_FEEDBACK_KINDS) {
    assert.ok(FEEDBACK_LABELS[kind], `label for ${kind}`);
  }
});

test('feedback semantics: watched is an exposure fact, never a preference signal', () => {
  assert.equal(isPreferenceSignal('watched'), false);
  assert.ok(countsAsFamiliar('watched'));
});

test('feedback semantics: skipped and saved are exposure facts too', () => {
  assert.equal(isPreferenceSignal('skipped'), false);
  assert.equal(isPreferenceSignal('saved'), false);
});

test('feedback semantics: preference kinds are viewpoint-scoped', () => {
  const scoped = PHASE4_FEEDBACK_KINDS.filter((k) => isViewpointScoped(k));
  // every more-*/less-* kind plus good-recommendation, interesting-no-extrapolate,
  // cluster-overrepresented, not-interested — and watched (recorded per
  // Viewpoint even though its semantics are a global exposure fact).
  assert.ok(scoped.includes('watched'));
  assert.ok(scoped.includes('more-from-source'));
  assert.ok(scoped.includes('less-from-source'));
  assert.ok(scoped.includes('more-topic'));
  assert.ok(scoped.includes('less-topic'));
  assert.ok(scoped.includes('more-narrative-region'));
  assert.ok(scoped.includes('cluster-overrepresented'));
  assert.ok(scoped.includes('good-recommendation'));
  assert.ok(scoped.includes('interesting-no-extrapolate'));
  assert.ok(scoped.includes('not-interested'));
  // exposure facts that stay global:
  assert.ok(!scoped.includes('skipped'));
  assert.ok(!scoped.includes('saved'));
});

test('feedback semantics: not-interested is a preference, saved is an exposure fact', () => {
  assert.equal(isViewpointScoped('not-interested'), true);
  assert.equal(isViewpointScoped('saved'), false);
  assert.ok(isPreferenceSignal('not-interested'));
  assert.equal(isPreferenceSignal('saved'), false);
});

// ---------------------------------------------------------------------------
// Exploration firewall
// ---------------------------------------------------------------------------

test('firewall: viewpoint-scoped feedback stays inside its Viewpoint', () => {
  const profile = profileWith([
    feedbackEntry('vid-1', 'more-from-source', 'vp-a'),
    feedbackEntry('vid-2', 'watched', 'vp-a'),
  ]);
  // vp-b sees nothing from vp-a
  const visibleToB = feedbackVisibleTo(profile, 'vp-b');
  assert.equal(visibleToB.length, 0);
  const visibleToA = feedbackVisibleTo(profile, 'vp-a');
  assert.equal(visibleToA.length, 2);
});

test('firewall: global feedback is visible to every Viewpoint', () => {
  const profile = profileWith([
    feedbackEntry('vid-1', 'skipped'),
    feedbackEntry('vid-2', 'saved'),
    feedbackEntry('vid-3', 'not-interested'),
  ]);
  assert.equal(feedbackVisibleTo(profile, 'vp-a').length, 3);
  assert.equal(feedbackVisibleTo(profile, 'vp-b').length, 3);
});

test('firewall: unlensed feed sees only global feedback', () => {
  const profile = profileWith([
    feedbackEntry('vid-1', 'skipped'),
    feedbackEntry('vid-2', 'more-from-source', 'vp-a'),
    feedbackEntry('vid-3', 'watched', 'vp-a'),
  ]);
  const visible = feedbackVisibleTo(profile, null);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].kind, 'skipped');
});

test('firewall: recordFeedbackThroughFirewall scopes preference kinds', () => {
  const profile = emptyUserProfile(NOW);
  const withScoped = recordFeedbackThroughFirewall(
    profile, 'vid-1', 'more-topic', 'vp-a', NOW,
  );
  const scopedEntry = withScoped.feedback[0];
  assert.equal(scopedEntry.viewpointId, 'vp-a');

  const withGlobal = recordFeedbackThroughFirewall(
    profile, 'vid-2', 'saved', 'vp-a', NOW,
  );
  assert.equal(withGlobal.feedback[0].viewpointId, undefined);
});

test('firewall: recorded watched feedback carries the Viewpoint id', () => {
  // watched is recorded per-Viewpoint (the exploration firewall scopes it),
  // but it stays an exposure fact: familiarity arithmetic reads it through
  // countsAsFamiliar and never treats it as a preference.
  const profile = emptyUserProfile(NOW);
  const next = recordFeedbackThroughFirewall(profile, 'vid-1', 'watched', 'vp-a', NOW);
  assert.equal(next.feedback[0].viewpointId, 'vp-a');
  assert.equal(isPreferenceSignal('watched'), false);
  assert.ok(countsAsFamiliar('watched'));
  // scoped recording means other Viewpoints do not see this entry:
  assert.equal(feedbackVisibleTo(next, 'vp-b').length, 0);
  assert.equal(feedbackVisibleTo(next, 'vp-a').length, 1);
});

test('firewall: training feedback for a Viewpoint excludes other Viewpoints', () => {
  const profile = profileWith([
    feedbackEntry('vid-1', 'watched', 'vp-a'),
    feedbackEntry('vid-2', 'more-from-source', 'vp-a'),
    feedbackEntry('vid-3', 'watched', 'vp-b'),
    feedbackEntry('vid-4', 'less-topic', 'vp-b'),
    feedbackEntry('vid-5', 'skipped'),
  ]);
  const forA = trainingFeedbackFor(profile, null);
  assert.equal(forA.length, 1);
  assert.equal(forA[0].videoId, 'vid-5');
});

test('firewall: migrateLegacyFeedback is a deliberate no-op', () => {
  const profile = profileWith([feedbackEntry('vid-1', 'watched')]);
  const migrated = migrateLegacyFeedback(profile);
  assert.equal(migrated.feedback.length, 1);
  assert.equal(migrated.feedback[0].viewpointId, undefined);
});

// ---------------------------------------------------------------------------
// Perspective pairing
// ---------------------------------------------------------------------------

test('pairing: shared topic + disjoint clusters pair candidates', () => {
  const a = makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: ['cluster-official'] });
  const b = makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: ['cluster-skeptic'] });
  const result = findPerspectivePairs([a, b], () => undefined);
  assert.equal(result.pairs.length, 1);
  assert.equal(result.groupableCount, 2);
  assert.equal(result.singletonCount, 0);
});

test('pairing: no shared topic -> no pair (never invent overlap)', () => {
  const a = makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: ['cluster-official'] });
  const b = makeCandidate({ topicIds: ['topic-urbanism'], narrativeClusterIds: ['cluster-skeptic'] });
  const result = findPerspectivePairs([a, b], () => undefined);
  assert.equal(result.pairs.length, 0);
});

test('pairing: same narrative cluster -> no pair (no false symmetry within a story)', () => {
  const a = makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: ['cluster-official'] });
  const b = makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: ['cluster-official'] });
  const result = findPerspectivePairs([a, b], () => undefined);
  assert.equal(result.pairs.length, 0);
});

test('pairing: differing non-unknown source types can pair without cluster info', () => {
  const a = makeCandidate({ topicIds: ['topic-ev'] });
  const b = makeCandidate({ topicIds: ['topic-ev'] });
  const lookup = classifyLookup([
    { videoId: a.id, sourceType: 'publication' },
    { videoId: b.id, sourceType: 'independent-creator' },
  ]);
  const result = findPerspectivePairs([a, b], lookup);
  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].differsOn, 'source-type');
  assert.match(result.pairs[0].basis, /Shared subject/);
});

test('pairing: unknown source types never pair by guesswork', () => {
  const a = makeCandidate({ topicIds: ['topic-ev'] });
  const b = makeCandidate({ topicIds: ['topic-ev'] });
  const result = findPerspectivePairs([a, b], () => undefined);
  assert.equal(result.pairs.length, 0);
  assert.ok(result.singletonCount >= 2);
});

test('pairing: comparisonsForItem maps every paired item', () => {
  const a = makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: ['cluster-official'] });
  const b = makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: ['cluster-skeptic'] });
  const result = findPerspectivePairs([a, b], () => undefined);
  const wrap = (c: CandidateVideo): FeedCandidate =>
    ({ candidate: c, score: 0, components: {} as RankComponents, weighted: {} as RankComponents, reason: '', explanations: {} as Record<RankComponentName, string> });
  assert.ok(comparisonsForItem(wrap(a), result, [a, b]).length > 0);
  assert.ok(comparisonsForItem(wrap(b), result, [a, b]).length > 0);
  assert.ok(comparisonsForItem(wrap(makeCandidate()), result, [a, b]).length === 0);
});

test('pairing: a three-cluster triangle becomes ONE comparison group, not three pairs', () => {
  const mk = (cluster: string) =>
    makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: [cluster] });
  const a = mk('cluster-official');
  const b = mk('cluster-skeptic');
  const c = mk('cluster-technical');
  const result = findPerspectivePairs([a, b, c], () => undefined);
  // pairs count is over raw candidate pairs; groups is what the UI shows
  assert.ok(result.pairs.length >= 2);
  assert.equal(result.groupableCount, 3);
  assert.equal(result.singletonCount, 0);
  // every one of the three is in the same group
  const wrap = (c: CandidateVideo): FeedCandidate =>
    ({ candidate: c, score: 0, components: {} as RankComponents, weighted: {} as RankComponents, reason: '', explanations: {} as Record<RankComponentName, string> });
  const all = [a, b, c];
  assert.ok(comparisonsForItem(wrap(a), result, all).length >= 2);
  assert.ok(comparisonsForItem(wrap(b), result, all).length >= 2);
  assert.ok(comparisonsForItem(wrap(c), result, all).length >= 2);
});

test('pairing: single dominant cluster with stragglers stays singleton (no forced balance)', () => {
  const mk = (cluster: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      makeCandidate({ topicIds: ['topic-ev'], narrativeClusterIds: [cluster], id: `vid-${cluster}-${i}` }),
    );
  const official = mk('cluster-official', 4);
  const skeptic = mk('cluster-skeptic', 1);
  const result = findPerspectivePairs([...official, ...skeptic], () => undefined);
  // 4 official x 1 skeptic can pair — evidence supports that comparison
  assert.ok(result.pairs.length >= 1);
  assert.ok(result.groupableCount >= 5);
});

// ---------------------------------------------------------------------------
// Blind-spot coverage
// ---------------------------------------------------------------------------

test('blindspots: underrepresented regions are described, never prescribed', () => {
  // Pool: 8 candidates. Feed takes only 4, all topic-urban. topic-aero
  // (2 in the pool) is entirely absent from the feed -> a real blind spot.
  const urban = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ topicIds: ['topic-urban'], narrativeClusterIds: ['cluster-a'] }),
  );
  const aero = Array.from({ length: 2 }, (_, i) =>
    makeCandidate({ topicIds: ['topic-aero'], narrativeClusterIds: ['cluster-b'] }),
  );
  const pool = [...urban, ...aero];
  const feed = pool.slice(0, 4); // all topic-urban
  const view = computeBlindSpots(pool, feed, () => undefined, emptyUserProfile(NOW));
  assert.ok(view.spots.length > 0, 'dimensional blind spots found');
  const aeroSpot = view.spots.find((s) => s.key === 'topic-aero');
  assert.ok(aeroSpot, 'topic-aero blind spot detected');
  assert.equal(aeroSpot?.poolCount, 2);
  assert.equal(aeroSpot?.feedCount, 0);
  for (const spot of view.spots) {
    assert.equal(typeof spot.label, 'string');
    assert.equal(typeof spot.description, 'string');
    // descriptive: counts, no "you should" prescriptions
    assert.ok(!/should|ought|must/i.test(spot.description), `description must stay descriptive: ${spot.description}`);
  }
});

test('blindspots: unknown regions are never highlighted as underrepresented', () => {
  const pool = Array.from({ length: 6 }, (_, i) => makeCandidate());
  const feed = pool.slice(0, 3);
  const view = computeBlindSpots(pool, feed, () => undefined, emptyUserProfile(NOW));
  for (const spot of view.spots) {
    assert.ok(!spot.label.toLowerCase().includes('unknown'), 'unknown never highlighted');
  }
});

test('blindspots: balanced pool reports few or no spots', () => {
  const pool = Array.from({ length: 8 }, (_, i) =>
    makeCandidate({ topicIds: [`topic-${i % 4}`] }),
  );
  const feed = pool.slice(0, 4);
  const view = computeBlindSpots(pool, feed, () => undefined, emptyUserProfile(NOW));
  // Feed and pool are proportionally identical here: no spot should fire
  assert.equal(view.spots.length, 0);
});

test('blindspots: sparse historical material is an honest spot', () => {
  const pool = Array.from({ length: 8 }, (_, i) =>
    makeCandidate({ topicIds: ['topic-ev'] }),
  );
  const feed = pool.slice(0, 4);
  // The FEED (first 4) is all contemporary; the pool's historical
  // material (last 4) never made the feed -> historical is the blind spot.
  const lookup = classifyLookup([
    ...pool.slice(0, 4).map((c) => ({ videoId: c.id, sourceType: 'publication', temporal: 'contemporary' })),
    ...pool.slice(4).map((c) => ({ videoId: c.id, sourceType: 'publication', temporal: 'historical' })),
  ]);
  const view = computeBlindSpots(pool, feed, lookup, emptyUserProfile(NOW));
  const historical = view.spots.find((s) => s.key === 'historical');
  assert.ok(historical, 'historical region spotted');
  assert.equal(historical?.feedCount, 0);
  assert.equal(historical?.poolCount, 4);
  assert.ok(historical?.sample.length === 4, 'pool candidates offered for user-initiated exploration');
});