/**
 * Phase 3 tests: the information map.
 *
 * Covers the classification invariants that Phase 3 promised:
 *   - explainability: every classification carries value, confidence,
 *     origin/method, and evidence
 *   - UNKNOWN over invented certainty: conservative classification, no
 *     fabricated narrative clusters, no temporal position from nothing
 *   - no political inference: lexicons never assign ideology
 *   - overrides: user wins, and overrides survive pool regeneration
 *   - coverage map: counts describe the pool; nothing is extrapolated
 *   - enrichment: topic ids reach Viewpoint filters on real candidates
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCandidate,
  classifySourceType,
  classifyTemporalPosition,
  classifyTopics,
  classifyNarrativeCluster,
  buildProvenanceEdges,
} from '../src/classification/classify';
import {
  applyOverrides,
  setOverride,
  clearOverride,
  loadOverrides,
} from '../src/classification/overrides';
import { enrichCandidates } from '../src/classification/enrich';
import {
  computeCoverageMap,
  familiarityFacts,
} from '../src/discovery/coverage';
import { MemoryLocalStore } from '../src/storage/local-store';
import { emptyUserProfile } from '../src/model/types';
import type { CandidateVideo, UserProfile } from '../src/model/types';
import type { FeedbackKind } from '../src/model/types';
import { buildCatalog } from '../src/model/catalog';
import {
  FIXTURE_TOPICS,
  FIXTURE_CHANNELS,
  FIXTURE_NARRATIVE_CLUSTERS,
} from '../src/discovery/fixtures';
import { isUnknownDate, UNKNOWN_DATE } from '../src/model/discovery';
import { candidatePasses, interpretViewpoint } from '../src/viewpoints/interpret';
import { newViewpoint } from '../src/model/viewpoint';

const NOW = '2026-09-18T00:00:00Z';

const CATALOG = buildCatalog({
  topics: FIXTURE_TOPICS,
  channels: FIXTURE_CHANNELS,
  narrativeClusters: FIXTURE_NARRATIVE_CLUSTERS,
  discoverySources: [],
});

function makeCandidate(overrides: Partial<CandidateVideo> = {}): CandidateVideo {
  return {
    id: 'vid-test',
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

function profileWithFeedback(
  kinds: FeedbackKind[],
  videoIds: string[],
): UserProfile {
  const profile = emptyUserProfile(NOW);
  for (let i = 0; i < kinds.length; i++) {
    profile.feedback.push({
      id: `fb-${i}`,
      videoId: videoIds[i],
      kind: kinds[i],
      capturedAt: NOW,
    });
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Explainability: every classified value carries its audit trail
// ---------------------------------------------------------------------------

test('every machine classification carries value, confidence, origin, method, evidence', () => {
  const cls = classifyCandidate(makeCandidate(), CATALOG, NOW);
  for (const value of [
    cls.sourceType,
    cls.narrativeCluster,
    cls.temporalPosition,
    ...cls.topics,
  ]) {
    assert.ok(typeof value.value === 'string' && value.value.length > 0, 'value present');
    assert.ok(typeof value.confidence === 'number', 'confidence present');
    assert.ok(typeof value.origin === 'string', 'origin present');
    assert.ok(typeof value.method === 'string' && value.method.length > 0, 'method present');
    assert.ok(typeof value.evidence === 'string' && value.evidence.length > 0, 'evidence present');
    assert.ok(value.confidence >= 0 && value.confidence <= 1, 'confidence in [0,1]');
  }
});

test('classification is deterministic: same input, same output', () => {
  const c = makeCandidate();
  const a = classifyCandidate(c, CATALOG, NOW);
  const b = classifyCandidate(makeCandidate(), CATALOG, NOW);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// UNKNOWN over invented certainty
// ---------------------------------------------------------------------------

test('plain candidate classifies unknown everywhere rather than guessing', () => {
  const c = makeCandidate(); // no markers, no ids, real date
  const cls = classifyCandidate(c, CATALOG, NOW);
  assert.equal(cls.sourceType.value, 'unknown');
  assert.equal(cls.narrativeCluster.value, 'unknown');
  assert.equal(cls.topics.length, 0);
  // Publication age alone never establishes a position relative to the
  // subject: a fresh video can be a retrospective, an old one was
  // contemporary with its events. No framing -> UNKNOWN.
  assert.equal(cls.temporalPosition.value, 'unknown');
});

test('unknown publication date never yields a temporal position', () => {
  const c = makeCandidate({ publishedAt: UNKNOWN_DATE });
  const cls = classifyTemporalPosition(c, NOW);
  assert.equal(cls.value, 'unknown');
  assert.match(cls.evidence, /not establishable/i);
});

test('unparseable publication date stays unknown', () => {
  const c = makeCandidate({ publishedAt: 'not-a-date' });
  const cls = classifyTemporalPosition(c, NOW);
  assert.equal(cls.value, 'unknown');
});

test('narrative clusters are never inferred from keywords', () => {
  // Title mentions a topic word but carries no cluster id: the cluster must
  // stay UNKNOWN even though the topic is identifiable.
  const c = makeCandidate({
    topicIds: ['topic-aero'],
    title: 'Rocket reuse discussion',
    narrativeClusterIds: [],
  });
  const cls = classifyCandidate(c, CATALOG, NOW);
  assert.equal(cls.narrativeCluster.value, 'unknown');
  assert.ok(cls.topics.some((t) => t.value === 'topic-aero'));
});

test('narrative cluster ids that do not resolve in the catalog stay unknown', () => {
  const c = makeCandidate({ narrativeClusterIds: ['narr-does-not-exist'] });
  const cls = classifyNarrativeCluster(c, CATALOG);
  assert.equal(cls.value, 'unknown');
});

test('provider-carried cluster ids resolve with provider origin', () => {
  const c = makeCandidate({ narrativeClusterIds: ['narr-aero-reuse'] });
  const cls = classifyNarrativeCluster(c, CATALOG);
  assert.equal(cls.value, 'narr-aero-reuse');
  assert.equal(cls.origin, 'provider');
});

test('provider-carried topic ids pass through with provider origin', () => {
  const c = makeCandidate({ topicIds: ['topic-urban', 'topic-music'] });
  const topics = classifyTopics(c);
  assert.equal(topics.length, 2);
  assert.ok(topics.every((t) => t.origin === 'provider'));
  assert.deepEqual(
    topics.map((t) => t.value).sort(),
    ['topic-music', 'topic-urban'],
  );
});

// ---------------------------------------------------------------------------
// Source type lexicon fires only on evidence
// ---------------------------------------------------------------------------

test('source type: publication naming evidence', () => {
  const c = makeCandidate({ channelTitle: 'The Aurora Herald' });
  assert.equal(classifySourceType(c).value, 'publication');
});

test('source type: academic naming evidence', () => {
  const c = makeCandidate({ channelTitle: 'Northern Institute of Technology' });
  assert.equal(classifySourceType(c).value, 'academic-expert');
});

test('source type: sponsorship must be evidenced in text', () => {
  const clean = makeCandidate({ description: 'A review of kitchen tools' });
  assert.equal(classifySourceType(clean).value, 'unknown');
  const sponsored = makeCandidate({ description: 'This video is sponsored by Acme.' });
  assert.equal(classifySourceType(sponsored).value, 'promotional-sponsored');
});

test('source type evidence cites the matched marker', () => {
  const c = makeCandidate({ channelTitle: 'City Archive Records' });
  const cls = classifySourceType(c);
  assert.match(cls.evidence, /archive/);
});

// ---------------------------------------------------------------------------
// No political inference
// ---------------------------------------------------------------------------

test('no lexicon value encodes a political identity', () => {
  // A candidate with overtly political *content* still classifies on
  // source production only: no party/ideology dimension exists.
  const c = makeCandidate({
    title: 'Party platform analysis: which side wins the election',
    description: 'Voting preferences by county; our endorsement for the election.',
    channelTitle: 'Regular Commentator',
  });
  const cls = classifyCandidate(c, CATALOG, NOW);
  const values = [
    cls.sourceType.value,
    cls.narrativeCluster.value,
    cls.temporalPosition.value,
    ...cls.topics.map((t) => t.value),
  ];
  for (const v of values) {
    assert.ok(
      !/left|right|liberal|conservative|democrat|republican|progressive|party|ideolog/.test(v),
      `political term leaked into classification value: ${v}`,
    );
  }
});

test('political subject matter never fabricates a topic or cluster id', () => {
  const c = makeCandidate({
    title: 'Election strategy explained',
    description: 'Campaign messaging and voter outreach',
  });
  const cls = classifyCandidate(c, CATALOG, NOW);
  assert.equal(cls.narrativeCluster.value, 'unknown');
  // No fixture topic covers elections; the classifier must not invent one.
  for (const t of cls.topics) {
    assert.ok(CATALOG.topics.has(t.value as never), `topic ${t.value} not in catalog`);
  }
});

// ---------------------------------------------------------------------------
// Temporal positions
// ---------------------------------------------------------------------------

test('explicit historical framing classifies from text evidence', () => {
  const c = makeCandidate({
    publishedAt: '2026-08-01T00:00:00Z',
    title: 'An archival film: early booster landings',
  });
  const cls = classifyTemporalPosition(c, NOW);
  assert.equal(cls.value, 'historical');
});

test('explicit retrospective framing classifies even for a fresh video', () => {
  const recent = makeCandidate({
    publishedAt: NOW,
    title: 'Retrospective: the rise of booster reuse',
  });
  const cls = classifyTemporalPosition(recent, NOW);
  assert.equal(cls.value, 'retrospective');
  assert.equal(cls.method, 'temporal-position-lexicon');
});

test('publication age alone never classifies temporal position', () => {
  // Two years old, no framing words: must stay UNKNOWN despite the age.
  const old = makeCandidate({ publishedAt: '2024-06-01T00:00:00Z', title: 'Booster telemetry' });
  assert.equal(classifyTemporalPosition(old, NOW).value, 'unknown');
});

// ---------------------------------------------------------------------------
// Provenance edges: only evidenced edges
// ---------------------------------------------------------------------------

test('provenance edges exist only for evidenced relationships', () => {
  const c = makeCandidate({
    topicIds: ['topic-aero'],
    narrativeClusterIds: ['narr-aero-reuse'],
    alsoSeenVia: ['youtube-web:channel-uploads'],
  });
  const edges = buildProvenanceEdges(c, CATALOG.channels);
  const kinds = edges.map((e) => e.kind);
  assert.ok(kinds.includes('published-by'));
  assert.ok(kinds.includes('surfaced-by'));
  assert.equal(kinds.filter((k) => k === 'discusses-topic').length, 1);
  assert.equal(kinds.filter((k) => k === 'belongs-to-cluster').length, 1);
  for (const e of edges) {
    assert.ok(typeof e.evidence === 'string' && e.evidence.length > 0);
  }
});

test('candidate without topic ids gets no discusses-topic edges', () => {
  const c = makeCandidate({ topicIds: [] });
  const edges = buildProvenanceEdges(c, CATALOG.channels);
  assert.equal(edges.filter((e) => e.kind === 'discusses-topic').length, 0);
});

// ---------------------------------------------------------------------------
// Overrides: user wins, and they survive regeneration
// ---------------------------------------------------------------------------

test('override replaces machine classification and always wins', () => {
  const c = makeCandidate(); // sourceType unknown
  const machine = classifyCandidate(c, CATALOG, NOW);
  assert.equal(machine.sourceType.value, 'unknown');
  const overridden = applyOverrides(machine, [
    {
      videoId: c.id,
      dimension: 'sourceType',
      value: 'independent-creator',
      setAt: NOW,
      note: 'I follow this person',
    },
  ]);
  assert.equal(overridden.sourceType.value, 'independent-creator');
  assert.equal(overridden.sourceType.origin, 'user-override');
  assert.equal(overridden.sourceType.confidence, 1);
  assert.match(overridden.sourceType.evidence, /I follow this person/);
});

test('override note is optional and evidence still present', () => {
  const machine = classifyCandidate(makeCandidate(), CATALOG, NOW);
  const overridden = applyOverrides(machine, [
    { videoId: 'vid-test', dimension: 'temporalPosition', value: 'pre-event', setAt: NOW },
  ]);
  assert.equal(overridden.temporalPosition.value, 'pre-event');
  assert.ok(overridden.temporalPosition.evidence.length > 0);
});

test('clearing an override falls back to machine classification', () => {
  const machine = classifyCandidate(makeCandidate(), CATALOG, NOW);
  const withOverride = applyOverrides(machine, [
    { videoId: 'vid-test', dimension: 'sourceType', value: 'official', setAt: NOW },
  ]);
  assert.equal(withOverride.sourceType.value, 'official');
  // Clearing = not applying that override.
  const restored = applyOverrides(withOverride === machine ? machine : machine, []);
  assert.equal(restored.sourceType.value, 'unknown');
});

test('overrides stored under their own KV key survive pool regeneration', async () => {
  const store = new MemoryLocalStore();
  await setOverride(store, {
    videoId: 'MT-FX-v00001',
    dimension: 'sourceType',
    value: 'primary-source',
    setAt: NOW,
    note: 'raw footage channel',
  });
  // Pool regeneration: the pool KV is rewritten; the overrides KV is not.
  await store.putKv('candidate-pool', { entries: [], runLog: [] });
  const loaded = await loadOverrides(store);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].value, 'primary-source');

  // And it still wins when reapplied to fresh machine classification.
  const c = makeCandidate({
    id: 'MT-FX-v00001',
    channelTitle: 'BoostersLab',
    topicIds: ['topic-aero'],
    narrativeClusterIds: ['narr-aero-reuse'],
  });
  const machine = classifyCandidate(c, CATALOG, NOW);
  const final = applyOverrides(machine, loaded);
  assert.equal(final.sourceType.value, 'primary-source');
  assert.equal(final.sourceType.origin, 'user-override');
});

test('setOverride replaces a previous override for the same dimension', async () => {
  const store = new MemoryLocalStore();
  await setOverride(store, { videoId: 'v1', dimension: 'sourceType', value: 'official', setAt: NOW });
  await setOverride(store, { videoId: 'v1', dimension: 'sourceType', value: 'publication', setAt: NOW });
  const loaded = await loadOverrides(store);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].value, 'publication');
});

test('clearOverride removes exactly one dimension override', async () => {
  const store = new MemoryLocalStore();
  await setOverride(store, { videoId: 'v1', dimension: 'sourceType', value: 'official', setAt: NOW });
  await setOverride(store, { videoId: 'v1', dimension: 'temporalPosition', value: 'historical', setAt: NOW });
  await clearOverride(store, 'v1', 'sourceType');
  const loaded = await loadOverrides(store);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].dimension, 'temporalPosition');
});

// ---------------------------------------------------------------------------
// Enrichment: classification reaches the ranking path
// ---------------------------------------------------------------------------

test('enrichment injects topic ids so Viewpoint filters match real candidates', () => {
  // A "real" candidate: no topicIds from the provider, but text evidence.
  const c = makeCandidate({
    id: 'real-1',
    title: 'Booster landing burn analysis',
    description: 'Reusable rocket telemetry discussion',
  });
  const enriched = enrichCandidates([c], CATALOG, [], NOW);
  assert.equal(enriched.length, 1);
  assert.ok(enriched[0].topicIds.length > 0, 'topic id injected by enrichment');
  // The Viewpoint filter path now sees the topic.
  const vp = newViewpoint('vp-aero', 'Aero lens', '', NOW, {
    positiveTopicConstraints: ['topic-aero'],
  });
  const filters = interpretViewpoint(vp.config).filters;
  assert.ok(candidatePasses(enriched[0], filters), 'enriched candidate passes topic filter');
});

test('enrichment copies only catalog-resolving cluster ids onto the candidate', () => {
  const c = makeCandidate({
    id: 'real-2',
    narrativeClusterIds: ['narr-does-not-exist'],
  });
  const enriched = enrichCandidates([c], CATALOG, [], NOW);
  assert.deepEqual(enriched[0].narrativeClusterIds, []);
});

test('enrichment keeps the full audit trail on the classification object', () => {
  const c = makeCandidate({ id: 'real-3', channelTitle: 'The Herald Examiner' });
  const enriched = enrichCandidates([c], CATALOG, [], NOW);
  assert.equal(enriched[0].classification.sourceType.value, 'publication');
  assert.ok(enriched[0].classification.sourceType.evidence.length > 0);
});

// ---------------------------------------------------------------------------
// Coverage map: counts describe the pool
// ---------------------------------------------------------------------------

test('coverage map counts pool representation across dimensions', () => {
  const candidates = [
    makeCandidate({ id: 'c1', topicIds: ['topic-aero'], narrativeClusterIds: ['narr-aero-reuse'], channelTitle: 'BoostersLab', channelId: 'MT-FX-ch-lab' }),
    makeCandidate({ id: 'c2', topicIds: ['topic-aero'], channelTitle: 'The Aurora Herald', channelId: 'ch-herald' }),
    makeCandidate({ id: 'c3', topicIds: [] }),
  ];
  const enriched = enrichCandidates(candidates, CATALOG, [], NOW);
  const lookup = (videoId: string) => enriched.find((c) => c.id === videoId)?.classification;
  const map = computeCoverageMap(candidates, lookup, emptyUserProfile(NOW), NOW);
  assert.equal(map.totalCandidates, 3);
  const aero = map.topics.find((b) => b.key === 'topic-aero');
  assert.equal(aero?.count, 2);
  const unknownTopics = map.topics.find((b) => b.key === 'unknown');
  assert.equal(unknownTopics?.count, 1);
  const publication = map.sourceTypes.find((b) => b.key === 'publication');
  assert.equal(publication?.count, 1);
  const lab = map.channels.find((b) => b.key === 'MT-FX-ch-lab');
  assert.equal(lab?.count, 1);
});

test('coverage map counts unknown dates and unclassified candidates honestly', () => {
  const candidates = [
    makeCandidate({ id: 'c1', publishedAt: UNKNOWN_DATE }),
    makeCandidate({ id: 'c2' }),
  ];
  const map = computeCoverageMap(candidates, () => undefined, emptyUserProfile(NOW), NOW);
  assert.equal(map.unknownDates, 1);
  assert.equal(map.unclassified, 2);
  const unknownBand = map.ageBands.find((b) => b.key === 'unknown');
  assert.equal(unknownBand?.count, 1);
});

test('coverage map familiarity counts explicit feedback over pool sightings', () => {
  const candidates = [
    makeCandidate({ id: 'c1', channelId: 'ch-a' }),
    makeCandidate({ id: 'c2', channelId: 'ch-a' }),
    makeCandidate({ id: 'c3', channelId: 'ch-b' }),
  ];
  const profile = profileWithFeedback(['watched'], ['c3']);
  const facts = familiarityFacts(candidates, profile);
  assert.equal(facts.get('ch-a')?.poolSightings, 2);
  assert.equal(facts.get('ch-a')?.explicitFeedbackCount, 0);
  assert.equal(facts.get('ch-b')?.explicitFeedbackCount, 1);
  // familiarity: ch-b has feedback -> familiar despite one sighting.
  const enriched = enrichCandidates(candidates, CATALOG, [], NOW);
  const lookup = (videoId: string) => enriched.find((c) => c.id === videoId)?.classification;
  const map = computeCoverageMap(candidates, lookup, profile, NOW);
  const familiar = map.channelFamiliarity.find((b) => b.key === 'familiar');
  assert.equal(familiar?.count, 1);
});

test('coverage map age bands: recent vs older than a year', () => {
  const candidates = [
    makeCandidate({ id: 'c1', publishedAt: '2026-09-10T00:00:00Z' }), // 8 days -> past-month window
    makeCandidate({ id: 'c2', publishedAt: '2026-09-16T00:00:00Z' }), // 2 days -> past-week
    makeCandidate({ id: 'c3', publishedAt: '2024-01-01T00:00:00Z' }), // ~990 days -> older
  ];
  const enriched = enrichCandidates(candidates, CATALOG, [], NOW);
  const lookup = (videoId: string) => enriched.find((c) => c.id === videoId)?.classification;
  const map = computeCoverageMap(candidates, lookup, emptyUserProfile(NOW), NOW);
  assert.equal(map.ageBands.find((b) => b.key === 'past-week')?.count, 1);
  assert.equal(map.ageBands.find((b) => b.key === 'past-month')?.count, 1);
  assert.equal(map.ageBands.find((b) => b.key === 'past-year')?.count, 0);
  assert.equal(map.ageBands.find((b) => b.key === 'older')?.count, 1);
});

// ---------------------------------------------------------------------------
// Viewpoint assumptions
// ---------------------------------------------------------------------------

test('assumptions default to empty and stay on the Viewpoint', () => {
  const vp = newViewpoint('vp-assume', 'Lens with premises', '', NOW, {
    assumptions: ['My normal information environment generally favors X.'],
  });
  assert.equal(vp.config.assumptions.length, 1);
  assert.equal(vp.config.assumptions[0], 'My normal information environment generally favors X.');
  // Defaults for a fresh config: no assumptions, nothing inferred.
  const fresh = newViewpoint('vp-fresh', 'Fresh', '', NOW);
  assert.deepEqual(fresh.config.assumptions, []);
});

test('assumptions never alter filtering or ranking — they are premises, not constraints', () => {
  const withAssumptions = newViewpoint('vp-a', 'A', '', NOW, {
    assumptions: ['I already see substantial coverage from large channels.'],
  });
  const without = newViewpoint('vp-b', 'B', '', NOW, {});
  const ia = interpretViewpoint(withAssumptions.config);
  const ib = interpretViewpoint(without.config);
  assert.deepEqual(ia.filters, ib.filters);
  assert.equal(ia.tuning.explorationPercent, ib.tuning.explorationPercent);
});