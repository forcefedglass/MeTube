/**
 * Phase 4 tests: the Viewstream composer — pathological cases.
 *
 * Every pathological case from the Phase 4 spec is pressed directly:
 *   - one channel dominates the candidate pool
 *   - one narrative dominates the candidate pool
 *   - insufficient candidates to satisfy quotas
 *   - unknown classifications
 *   - conflicting Viewpoint constraints
 *   - sparse historical material
 *   - muted sources
 *   - repeated regeneration (cooldowns)
 *
 * The standing rule under test: the engine degrades honestly when
 * requested diversity cannot be achieved, and never manufactures
 * diversity by misclassifying candidates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { composeViewstream } from '../src/viewpoints/composer';
import type { ComposerContext } from '../src/viewpoints/composer';
import { newViewpoint } from '../src/model/viewpoint';
import type { ExposureBudget } from '../src/model/exposure';
import type { GenerationHistoryEntry } from '../src/model/exposure';
import { emptyUserProfile } from '../src/model/types';
import type { CandidateVideo, UserProfile, FeedbackKind } from '../src/model/types';
import { buildCatalog } from '../src/model/catalog';
import {
  FIXTURE_TOPICS,
  FIXTURE_CHANNELS,
  FIXTURE_NARRATIVE_CLUSTERS,
} from '../src/discovery/fixtures';
import type { VideoClassification } from '../src/model/classification';
import type { ClassificationLookup } from '../src/discovery/coverage';

const NOW = '2026-09-18T00:00:00Z';
const NOW_MS = Date.parse(NOW);
const TWO_YEARS_AGO = new Date(NOW_MS - 2 * 365 * 86_400_000).toISOString();

const CATALOG = buildCatalog({
  topics: FIXTURE_TOPICS,
  channels: FIXTURE_CHANNELS,
  narrativeClusters: FIXTURE_NARRATIVE_CLUSTERS,
  discoverySources: [],
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let candidateSeq = 0;

function makeCandidate(overrides: Partial<CandidateVideo> = {}): CandidateVideo {
  candidateSeq += 1;
  return {
    id: `vid-${candidateSeq}`,
    title: 'A test video',
    channelId: 'ch-test',
    channelTitle: 'Test Channel',
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

/** Classification map with sourceType control; other dimensions unknown. */
function lookupWithSourceTypes(
  candidates: CandidateVideo[],
  sourceTypeOf: (c: CandidateVideo) => import('../src/model/classification').SourceType | undefined,
  temporalOf: (c: CandidateVideo) => import('../src/model/classification').TemporalPosition | undefined = () => undefined,
): ClassificationLookup {
  const map = new Map<string, VideoClassification>();
  for (const c of candidates) {
    const st = sourceTypeOf(c);
    const tp = temporalOf(c);
    map.set(c.id, {
      videoId: c.id,
      sourceType: {
        value: st ?? ('unknown' as const),
        confidence: st ? 0.8 : 0.2,
        origin: st ? ('classifier' as const) : ('provider' as const),
        method: st ? 'fixture' : 'no evidence',
        evidence: st ? `fixture says ${st}` : 'no evidence',
      },
      narrativeCluster: {
        value: 'unknown',
        confidence: 0.2,
        origin: 'provider' as const,
        method: 'no evidence',
        evidence: 'no evidence',
      },
      temporalPosition: {
        value: tp ?? ('unknown' as const),
        confidence: tp ? 0.8 : 0.2,
        origin: tp ? ('classifier' as const) : ('provider' as const),
        method: tp ? 'fixture' : 'no evidence',
        evidence: tp ? `fixture says ${tp}` : 'no evidence',
      },
      topics: [],
    });
  }
  return (videoId) => map.get(videoId);
}

const EMPTY_LOOKUP: ClassificationLookup = () => undefined;

function profileWithFeedback(
  entries: Array<{ videoId: string; kind: FeedbackKind }>,
): UserProfile {
  const profile = emptyUserProfile(NOW);
  for (let i = 0; i < entries.length; i++) {
    profile.feedback.push({
      id: `fb-${i}`,
      videoId: entries[i].videoId,
      kind: entries[i].kind,
      capturedAt: NOW,
    });
  }
  return profile;
}

function composeContext(overrides: Partial<ComposerContext> = {}): ComposerContext {
  return {
    viewpoint: newViewpoint('vp-composer', 'Composer test', 'test viewpoint', NOW),
    limit: 8,
    profile: emptyUserProfile(NOW),
    lookupClassification: EMPTY_LOOKUP,
    history: [],
    generation: 0,
    now: NOW,
    ...overrides,
  };
}

function budgetWith(budget: ExposureBudget): { config: Parameters<typeof newViewpoint>[4] } {
  return { config: { exposureBudget: budget } };
}

function compose(
  candidates: CandidateVideo[],
  budget: ExposureBudget,
  contextOverrides: Partial<ComposerContext> = {},
  limit = 8,
): ReturnType<typeof composeViewstream> {
  const viewpoint = newViewpoint(
    'vp-composer',
    'Composer test',
    'test viewpoint',
    NOW,
    { exposureBudget: budget },
  );
  return composeViewstream(candidates, {
    ...composeContext({ ...contextOverrides, viewpoint, limit }),
  });
}

function ruleReport(report: ReturnType<typeof composeViewstream>['report'], rule: string) {
  const found = report.rules.find((r) => r.rule === rule);
  assert.ok(found, `rule ${rule} present in report`);
  return found;
}

// ---------------------------------------------------------------------------
// Ceilings
// ---------------------------------------------------------------------------

test('ceiling: one channel dominating the pool yields a diversified feed, honestly reported', () => {
  // 12 candidates: 10 from ch-dominant, 2 others. Ceiling: at most 50% of
  // the FINAL FEED from one channel. With only 2 other candidates the
  // largest honest feed is 4 (2 dominant + 2 other) — the trim pass
  // shortens the feed rather than let the share exceed the ceiling.
  const dominant = Array.from({ length: 10 }, (_, i) =>
    makeCandidate({ id: `vid-dom-${i}`, channelId: 'ch-dominant', channelTitle: 'Dominant' }),
  );
  const others = Array.from({ length: 2 }, (_, i) =>
    makeCandidate({ id: `vid-other-${i}`, channelId: `ch-other-${i}`, channelTitle: `Other ${i}` }),
  );
  const result = compose([...dominant, ...others], { maxSingleChannelShare: 0.5 });
  const perChannel = new Map<string, number>();
  for (const item of result.snapshot.feed) {
    perChannel.set(item.candidate.channelId, (perChannel.get(item.candidate.channelId) ?? 0) + 1);
  }
  const topChannel = [...perChannel.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(topChannel, 'feed not empty');
  assert.equal(topChannel[1], 2, 'at most 50% of the final feed from one channel');
  const report = ruleReport(result.report, 'maxSingleChannelShare');
  assert.equal(report.status, 'satisfied');
  // The feed got SHORTER, not padded: 2 dominant + 2 other = 4 items.
  assert.equal(result.snapshot.feed.length, 4);
});

test('ceiling: one narrative cluster dominating the pool is capped, unknown clusters never counted', () => {
  // Feed of 8, ceiling 50% -> max 4 from one cluster. 6 candidates share
  // cluster-n, 4 have no cluster.
  const clustered = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-clus-${i}`, narrativeClusterIds: ['cluster-n'] }),
  );
  const bare = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-bare-${i}`, channelId: `ch-bare-${i}` }),
  );
  const result = compose([...clustered, ...bare], { maxSingleNarrativeShare: 0.5 });
  const inCluster = result.snapshot.feed.filter((f) =>
    f.candidate.narrativeClusterIds.includes('cluster-n'),
  ).length;
  assert.ok(inCluster <= 4, 'at most 4 of 8 from one cluster');
  const report = ruleReport(result.report, 'maxSingleNarrativeShare');
  assert.equal(report.status, 'satisfied');
});

// ---------------------------------------------------------------------------
// Floors and honest degradation
// ---------------------------------------------------------------------------

test('floor: insufficient unfamiliar-channel candidates -> violated, never padded', () => {
  // Floor: 50% unfamiliar channels in a feed of 8 -> needs 4. Pool: every
  // channel has recorded feedback (familiar). Result must report the
  // violation honestly, not manufacture unfamiliarity.
  const candidates = Array.from({ length: 8 }, (_, i) =>
    makeCandidate({ id: `vid-fam-${i}`, channelId: `ch-fam-${i}` }),
  );
  const feedback = candidates.map((c) => ({ videoId: c.id, kind: 'watched' as FeedbackKind }));
  const profile = profileWithFeedback(feedback);
  const result = compose(
    candidates,
    { minUnfamiliarChannelShare: 0.5 },
    { profile },
  );
  const report = ruleReport(result.report, 'minUnfamiliarChannelShare');
  assert.equal(report.status, 'violated');
  assert.match(report.explanation, /does not contain enough|not enough/i);
  // And no candidate was reclassified: the feed still contains the same
  // candidates with their recorded facts intact.
  for (const item of result.snapshot.feed) {
    assert.ok(profile.feedback.some((f) => f.videoId === item.candidate.id));
  }
});

test('floor: min unfamiliar share satisfied when pool has unfamiliar channels', () => {
  const unfamiliar = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-unf-${i}`, channelId: `ch-unf-${i}`, topicIds: ['topic-urban'] }),
  );
  const familiar = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-fam-${i}`, channelId: `ch-fam-${i}`, topicIds: ['topic-urban'] }),
  );
  const feedback = familiar.map((c) => ({ videoId: c.id, kind: 'watched' as FeedbackKind }));
  const profile = profileWithFeedback(feedback);
  const result = compose(
    [...unfamiliar, ...familiar],
    { minUnfamiliarChannelShare: 0.5 },
    { profile },
  );
  const report = ruleReport(result.report, 'minUnfamiliarChannelShare');
  assert.equal(report.status, 'satisfied');
  assert.ok(result.snapshot.feed.length > 0);
});

test('floor: unknown source types never count toward alternate-source-type floor', () => {
  // Pool: 6 candidates all classified 'independent-creator' (the dominant type),
  // 2 with UNKNOWN source type. Floor: 25% alternate (needs 2 of 8).
  // Unknowns must NOT be counted as alternate.
  const independents = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-ind-${i}`, channelId: `ch-ind-${i}` }),
  );
  const unknowns = Array.from({ length: 2 }, (_, i) =>
    makeCandidate({ id: `vid-unk-${i}`, channelId: `ch-unk-${i}` }),
  );
  const lookup = lookupWithSourceTypes(
    [...independents, ...unknowns],
    (c) => (c.id.startsWith('vid-unk') ? undefined : 'independent-creator'),
  );
  const result = compose(
    [...independents, ...unknowns],
    { minAlternateSourceTypeShare: 0.25 },
    { lookupClassification: lookup },
  );
  const report = ruleReport(result.report, 'minAlternateSourceTypeShare');
  assert.equal(report.status, 'violated');
  assert.match(
    report.explanation,
    /unknown classifications were not counted|not counted as diversity/i,
  );
});

test('floor: alternate source-type floor satisfied with real alternate types', () => {
  const independents = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-ind-${i}`, channelId: `ch-ind-${i}` }),
  );
  const broadcast = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-bc-${i}`, channelId: `ch-bc-${i}` }),
  );
  const lookup = lookupWithSourceTypes(
    [...independents, ...broadcast],
    (c) => (c.id.startsWith('vid-bc') ? 'publication' : 'independent-creator'),
  );
  const result = compose(
    [...independents, ...broadcast],
    { minAlternateSourceTypeShare: 0.25 },
    { lookupClassification: lookup },
  );
  const report = ruleReport(result.report, 'minAlternateSourceTypeShare');
  assert.equal(report.status, 'satisfied');
});

test('floor: sparse historical material -> honest violation, no re-dating', () => {
  // Floor: 50% historical (needs 4 of 8). Pool: 8 candidates all published
  // NOW, none classified historical. The composer must report violated
  // and never treat recent items as historical.
  const fresh = Array.from({ length: 8 }, (_, i) =>
    makeCandidate({ id: `vid-fresh-${i}`, channelId: `ch-fresh-${i}` }),
  );
  const result = compose(fresh, { minHistoricalShare: 0.5 });
  const report = ruleReport(result.report, 'minHistoricalShare');
  assert.equal(report.status, 'violated');
  assert.match(report.explanation, /sparse historical|honestly/i);
  // No candidate's date was rewritten.
  for (const item of result.snapshot.feed) {
    assert.equal(item.candidate.publishedAt, NOW);
  }
});

test('floor: historical material recognized from age and from framing', () => {
  const old = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-old-${i}`, channelId: `ch-old-${i}`, publishedAt: TWO_YEARS_AGO }),
  );
  const retro = Array.from({ length: 2 }, (_, i) =>
    makeCandidate({ id: `vid-retro-${i}`, channelId: `ch-retro-${i}` }),
  );
  const fresh = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-fresh-${i}`, channelId: `ch-fresh-${i}` }),
  );
  const lookup = lookupWithSourceTypes(
    [...old, ...retro, ...fresh],
    () => 'independent-creator',
    (c) => (c.id.startsWith('vid-retro') ? 'retrospective' : undefined),
  );
  const result = compose(
    [...old, ...retro, ...fresh],
    { minHistoricalShare: 0.5 },
    { lookupClassification: lookup },
  );
  const report = ruleReport(result.report, 'minHistoricalShare');
  assert.equal(report.status, 'satisfied');
});

test('floor: exploration share counts candidates outside positive topic constraints', () => {
  const seedTopic = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-seed-${i}`, channelId: `ch-seed-${i}`, topicIds: ['topic-urban'] }),
  );
  const wildcard = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-wild-${i}`, channelId: `ch-wild-${i}`, topicIds: ['topic-aero'] }),
  );
  const viewpoint = newViewpoint('vp-expl', 'Exploration', 'test', NOW, {
    positiveTopicConstraints: ['topic-urban'],
    exposureBudget: { explorationShare: 0.25 },
  });
  const result = composeViewstream([...seedTopic, ...wildcard], {
    viewpoint,
    limit: 8,
    profile: emptyUserProfile(NOW),
    lookupClassification: EMPTY_LOOKUP,
    history: [],
    generation: 0,
    now: NOW,
  });
  const report = ruleReport(result.report, 'explorationShare');
  assert.equal(report.status, 'satisfied');
});

// ---------------------------------------------------------------------------
// Conflicting constraints
// ---------------------------------------------------------------------------

test('conflicting constraints: floor exceeds ceiling capacity -> both reported, honest result', () => {
  // 6 candidates all from ch-x (ceiling: 25% of the final feed) and all
  // familiar (floor: 50% unfamiliar). The rules conflict beyond repair:
  // every possible feed either exceeds the ceiling or misses the floor.
  // The composer degrades to a minimal feed and BOTH rules report their
  // honest arithmetic — never "satisfied" by miscounting.
  const chX = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-x-${i}`, channelId: 'ch-x' }),
  );
  const feedback = chX.map((c) => ({ videoId: c.id, kind: 'watched' as FeedbackKind }));
  const profile = profileWithFeedback(feedback);
  const result = compose(
    chX,
    { maxSingleChannelShare: 0.25, minUnfamiliarChannelShare: 0.5 },
    { profile },
  );
  const channelRule = ruleReport(result.report, 'maxSingleChannelShare');
  assert.equal(channelRule.status, 'violated', 'a single-channel pool cannot honestly satisfy a 25% ceiling');
  const unfamiliarRule = ruleReport(result.report, 'minUnfamiliarChannelShare');
  assert.equal(unfamiliarRule.status, 'violated');
  assert.ok(result.snapshot.feed.length >= 1, 'feed degrades to a minimal honest feed, never empty by construction');
  assert.ok(result.snapshot.feed.length <= 2);
});

test('conflicting constraints: impossible ceiling with single-candidate pool degrades to short feed', () => {
  // Ceiling 25% of the final feed from one channel, but every candidate in
  // the pool is from ch-same. No feed larger than floor(25%) = 1 item can
  // satisfy it. Honest degradation: the shortest feed that can exist (1
  // item), with the ceiling reported VIOLATED — a 1/1 feed is 100% one
  // channel, and reporting "satisfied" would hide the actual exposure.
  const same = Array.from({ length: 10 }, (_, i) =>
    makeCandidate({ id: `vid-same-${i}`, channelId: 'ch-same' }),
  );
  const result = compose(same, { maxSingleChannelShare: 0.25 });
  assert.ok(result.snapshot.feed.length >= 1, 'at least one item still composed');
  assert.equal(result.snapshot.feed.length, 1, 'feed degrades to the shortest honest feed, not padded');
  const report = ruleReport(result.report, 'maxSingleChannelShare');
  assert.equal(report.status, 'violated', 'single-channel pool cannot honestly satisfy the ceiling');
  assert.match(report.explanation, /ch-same/);
});

// ---------------------------------------------------------------------------
// Muted sources
// ---------------------------------------------------------------------------

test('muted channels are excluded from the composed feed entirely', () => {
  const candidates = Array.from({ length: 10 }, (_, i) =>
    makeCandidate({ id: `vid-mute-${i}`, channelId: i % 2 === 0 ? 'ch-muted' : `ch-open-${i}` }),
  );
  const profile = emptyUserProfile(NOW);
  profile.mutedChannelIds = ['ch-muted'];
  const result = compose(candidates, { maxSingleChannelShare: 0.5 }, { profile });
  for (const item of result.snapshot.feed) {
    assert.notEqual(item.candidate.channelId, 'ch-muted');
  }
  assert.ok(result.snapshot.feed.length > 0);
  assert.equal(result.snapshot.mutedCount, 5);
});

// ---------------------------------------------------------------------------
// Repeated regeneration: cooldowns
// ---------------------------------------------------------------------------

test('repeated regeneration: channel cooldown blocks channels from recent generations', () => {
  const candidates = Array.from({ length: 10 }, (_, i) =>
    makeCandidate({ id: `vid-cool-${i}`, channelId: `ch-cool-${i}` }),
  );
  const history: GenerationHistoryEntry[] = [
    {
      generation: 0,
      composedAt: NOW,
      viewpointId: 'vp-composer',
      channels: ['ch-cool-0', 'ch-cool-1'],
      narrativeClusters: [],
    },
  ];
  const result = compose(
    candidates,
    { repeatedChannelCooldown: 1 },
    { history },
  );
  const featured = result.snapshot.feed.map((f) => f.candidate.channelId);
  assert.ok(!featured.includes('ch-cool-0'), 'ch-cool-0 cooled down');
  assert.ok(!featured.includes('ch-cool-1'), 'ch-cool-1 cooled down');
  assert.ok(featured.length > 0);
  const report = ruleReport(result.report, 'repeatedChannelCooldown');
  assert.equal(report.status, 'satisfied');
});

test('repeated regeneration: cooldown only applies within the same Viewpoint', () => {
  // 9 distinct single-candidate channels. The most recent generation in
  // history belongs to a DIFFERENT Viewpoint (vp-other) and featured
  // ch-shared: per-Viewpoint cooldown state means that history must not
  // block ch-shared here. All channels are otherwise symmetric in the
  // ranking (one candidate each), so ch-shared is featured normally.
  const candidates = Array.from({ length: 9 }, (_, i) =>
    makeCandidate({ id: `vid-xcool-${i}`, channelId: i === 0 ? 'ch-shared' : `ch-own-${i}` }),
  );
  const history: GenerationHistoryEntry[] = [
    {
      generation: 0,
      composedAt: NOW,
      viewpointId: 'vp-other',
      channels: ['ch-shared'],
      narrativeClusters: [],
    },
  ];
  const result = compose(
    candidates,
    { repeatedChannelCooldown: 1 },
    { history },
  );
  const featured = result.snapshot.feed.map((f) => f.candidate.channelId);
  assert.ok(featured.includes('ch-shared'), 'other-Viewpoint history does not block this one');
});

test('repeated regeneration: narrative cooldown blocks recent clusters', () => {
  const clustered = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-ncool-${i}`, channelId: `ch-n-${i}`, narrativeClusterIds: ['cluster-recent'] }),
  );
  const fresh = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-ncfresh-${i}`, channelId: `ch-nf-${i}` }),
  );
  const history: GenerationHistoryEntry[] = [
    {
      generation: 0,
      composedAt: NOW,
      viewpointId: 'vp-composer',
      channels: [],
      narrativeClusters: ['cluster-recent'],
    },
  ];
  const result = compose(
    [...clustered, ...fresh],
    { repeatedNarrativeCooldown: 1 },
    { history },
  );
  for (const item of result.snapshot.feed) {
    assert.ok(
      !item.candidate.narrativeClusterIds.includes('cluster-recent'),
      'recently featured cluster blocked',
    );
  }
});

// ---------------------------------------------------------------------------
// Determinism and no-manufactured-diversity
// ---------------------------------------------------------------------------

test('composition is deterministic: same inputs -> same feed order', () => {
  const candidates = Array.from({ length: 12 }, (_, i) =>
    makeCandidate({ id: `vid-det-${i}`, channelId: `ch-det-${i % 4}` }),
  );
  const budget: ExposureBudget = {
    maxSingleChannelShare: 0.5,
    minUnfamiliarChannelShare: 0.25,
  };
  const a = compose(candidates, budget);
  const b = compose(candidates, budget);
  assert.deepEqual(
    a.snapshot.feed.map((f) => f.candidate.id),
    b.snapshot.feed.map((f) => f.candidate.id),
  );
  assert.deepEqual(a.report.rules, b.report.rules);
});

test('no rule configured -> composer not engaged; legacy limits path applies', () => {
  const candidates = Array.from({ length: 12 }, (_, i) =>
    makeCandidate({ id: `vid-legacy-${i}`, channelId: `ch-legacy-${i % 3}` }),
  );
  const viewpoint = newViewpoint('vp-plain', 'Plain', 'no budget', NOW, {});
  const context = composeContext({ viewpoint });
  const result = composeViewstream(candidates, context);
  // The legacy path composes the feed with default repetition limits.
  assert.ok(result.snapshot.feed.length > 0);
  // No exposure rules to report when none are configured.
  assert.equal(result.report.rules.length, 0);
});

test('empty pool -> empty feed, empty report, no crash', () => {
  const result = compose([], { maxSingleChannelShare: 0.5 });
  assert.equal(result.snapshot.feed.length, 0);
  // The ceiling rule is still reported (satisfied vacuously, feed of 0).
  const report = ruleReport(result.report, 'maxSingleChannelShare');
  assert.equal(report.status, 'satisfied');
});

test('disabled Viewpoint -> empty feed with no rules', () => {
  const candidates = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-dis-${i}`, channelId: `ch-dis-${i}` }),
  );
  const viewpoint = newViewpoint('vp-dis', 'Disabled', 'test', NOW, {
    exposureBudget: { maxSingleChannelShare: 0.5 },
  });
  viewpoint.enabled = false;
  const result = composeViewstream(candidates, composeContext({ viewpoint }));
  assert.equal(result.snapshot.feed.length, 0);
  assert.equal(result.report.rules.length, 0);
});

// ---------------------------------------------------------------------------
// Language/region/scale targets: recorded, never fabricated
// ---------------------------------------------------------------------------

test('language and region targets report not-applicable until evidenced data exists', () => {
  const candidates = Array.from({ length: 6 }, (_, i) =>
    makeCandidate({ id: `vid-lang-${i}`, channelId: `ch-lang-${i}` }),
  );
  const result = compose(candidates, { minDistinctLanguages: 2, minDistinctRegions: 2 });
  const langRule = ruleReport(result.report, 'minDistinctLanguages');
  assert.equal(langRule.status, 'not-applicable');
  assert.match(langRule.explanation, /never satisfied by guessing|never.*guess/i);
  const regionRule = ruleReport(result.report, 'minDistinctRegions');
  assert.equal(regionRule.status, 'not-applicable');
});

test('scale bands: unknown channel scale counts as unknown, not as a band', () => {
  const candidates = Array.from({ length: 8 }, (_, i) =>
    makeCandidate({ id: `vid-scale-${i}`, channelId: `ch-scale-${i}` }),
  );
  const result = compose(candidates, { minDistinctScaleBands: 2 });
  const report = ruleReport(result.report, 'minDistinctScaleBands');
  // No evidenced channel-scale data on candidates yet -> violated honestly.
  assert.ok(report.status === 'violated' || report.status === 'not-applicable');
  assert.match(report.explanation, /unknown/i);
});

// ---------------------------------------------------------------------------
// Topic concentration ceiling
// ---------------------------------------------------------------------------

test('topic concentration ceiling caps candidates touching one topic', () => {
  const onTopic = Array.from({ length: 8 }, (_, i) =>
    makeCandidate({ id: `vid-top-${i}`, channelId: `ch-top-${i}`, topicIds: ['topic-urban'] }),
  );
  const offTopic = Array.from({ length: 4 }, (_, i) =>
    makeCandidate({ id: `vid-offtop-${i}`, channelId: `ch-offtop-${i}`, topicIds: ['topic-aero'] }),
  );
  const result = compose([...onTopic, ...offTopic], { maxSingleTopicShare: 0.5 }, {}, 8);
  const touchingUrban = result.snapshot.feed.filter((f) =>
    f.candidate.topicIds.includes('topic-urban'),
  ).length;
  assert.ok(touchingUrban <= 4, 'at most 4 of 8 touching one topic');
  const report = ruleReport(result.report, 'maxSingleTopicShare');
  assert.equal(report.status, 'satisfied');
});

// ---------------------------------------------------------------------------
// Report integrity
// ---------------------------------------------------------------------------

test('report counts satisfied/violated consistently with rule list', () => {
  const candidates = Array.from({ length: 10 }, (_, i) =>
    makeCandidate({ id: `vid-ri-${i}`, channelId: `ch-ri-${i}` }),
  );
  const result = compose(candidates, {
    maxSingleChannelShare: 0.5,
    minHistoricalShare: 0.5,
    minDistinctLanguages: 2,
  });
  const satisfied = result.report.rules.filter((r) => r.status === 'satisfied').length;
  const violated = result.report.rules.filter(
    (r) => r.status === 'violated' || r.status === 'not-applicable',
  ).length;
  assert.equal(result.report.satisfied, satisfied);
  assert.equal(result.report.violated, violated);
  assert.equal(result.report.rules.length, satisfied + violated);
  assert.ok(result.report.rules.length > 0);
});

test('report lists every distinct channel and cluster actually featured', () => {
  const candidates = Array.from({ length: 8 }, (_, i) =>
    makeCandidate({
      id: `vid-listed-${i}`,
      channelId: `ch-listed-${i % 4}`,
      narrativeClusterIds: i % 2 === 0 ? ['cluster-a'] : ['cluster-b'],
    }),
  );
  const result = compose(candidates, {});
  const featuredChannels = new Set(result.snapshot.feed.map((f) => f.candidate.channelId));
  const featuredClusters = new Set(
    result.snapshot.feed.flatMap((f) => f.candidate.narrativeClusterIds),
  );
  for (const ch of featuredChannels) {
    assert.ok(result.report.channelsFeatured.includes(ch));
  }
  for (const cl of featuredClusters) {
    assert.ok(result.report.narrativesFeatured.includes(cl));
  }
});
test('relief pass: soft rules never empty the feed while candidates pass hard filters', () => {
  // Pool of one candidate whose channel and cluster were both featured in
  // the previous generation. Cooldowns (soft rules) must not produce an
  // empty feed: the top-ranked candidate is taken and the cooldown is
  // reported as bypassed, never silently satisfied.
  const solo = makeCandidate({
    id: 'vid-relief-1',
    channelId: 'ch-relief',
    narrativeClusterIds: ['cluster-relief'],
  });
  const history: GenerationHistoryEntry[] = [
    {
      generation: 0,
      composedAt: NOW,
      viewpointId: 'vp-composer',
      channels: ['ch-relief'],
      narrativeClusters: ['cluster-relief'],
    },
  ];
  const result = compose([solo], { repeatedChannelCooldown: 1, repeatedNarrativeCooldown: 1 }, { history });
  assert.equal(result.snapshot.feed.length, 1, 'feed keeps the top-ranked candidate');
  assert.equal(result.snapshot.feed[0]?.candidate.id, 'vid-relief-1');
  const channelRule = ruleReport(result.report, 'repeatedChannelCooldown');
  assert.equal(channelRule.status, 'violated', 'cooldown bypass is reported honestly');
  assert.match(channelRule.explanation, /relief pass|cooldown/i);
  const narrativeRule = ruleReport(result.report, 'repeatedNarrativeCooldown');
  assert.equal(narrativeRule.status, 'violated');
});
