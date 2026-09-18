import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, catalogSize, checkIntegrity } from '../src/model/catalog';
import {
  ALL_FIXTURE_CANDIDATES,
  FIXTURE_CHANNELS,
  FIXTURE_NARRATIVE_CLUSTERS,
  FIXTURE_DISCOVERY_SOURCES,
  FIXTURE_TOPICS,
} from '../src/discovery/fixtures';
import { rankCandidates } from '../src/ranking/engine';
import { DEFAULT_WEIGHTS, RANK_COMPONENT_ORDER } from '../src/ranking/components';
import { emptyUserProfile } from '../src/model/types';

test('fixture catalog is internally consistent (integrity check passes)', () => {
  const catalog = buildCatalog({
    topics: FIXTURE_TOPICS,
    channels: FIXTURE_CHANNELS,
    narrativeClusters: FIXTURE_NARRATIVE_CLUSTERS,
    discoverySources: FIXTURE_DISCOVERY_SOURCES,
  });
  const issues = checkIntegrity(catalog, ALL_FIXTURE_CANDIDATES);
  assert.deepEqual(issues, [], 'fixture ids must all resolve');
  const size = catalogSize(catalog);
  assert.ok(size.topics >= 5);
  assert.ok(size.channels >= 6);
});

test('rankCandidates returns explainable output for every candidate', () => {
  const profile = emptyUserProfile('2026-09-18T00:00:00Z');
  const ranked = rankCandidates(ALL_FIXTURE_CANDIDATES, {
    pool: ALL_FIXTURE_CANDIDATES,
    profile,
    weights: DEFAULT_WEIGHTS,
  });
  assert.equal(ranked.length, ALL_FIXTURE_CANDIDATES.length);
  for (const item of ranked) {
    assert.ok(item.reason.length > 0, 'every card must have a reason');
    for (const name of RANK_COMPONENT_ORDER) {
      assert.equal(typeof item.components[name], 'number');
      assert.equal(typeof item.weighted[name], 'number');
      assert.equal(typeof item.explanations[name], 'string');
      assert.ok(item.explanations[name].length > 0);
    }
  }
  // Sort order must be non-increasing by score.
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].score >= ranked[i].score);
  }
});

test('repetition lowers score for watched videos', () => {
  const base = emptyUserProfile('2026-09-18T00:00:00Z');
  const watched = {
    ...base,
    feedback: [
      { id: 'fb-1', videoId: 'MT-FX-v00001', kind: 'watched', capturedAt: '2026-09-17T00:00:00Z' },
    ],
  } as typeof base;
  const neutral = rankCandidates(ALL_FIXTURE_CANDIDATES, {
    pool: ALL_FIXTURE_CANDIDATES, profile: base, weights: DEFAULT_WEIGHTS,
  }).find((i) => i.candidate.id === 'MT-FX-v00001');
  const repeated = rankCandidates(ALL_FIXTURE_CANDIDATES, {
    pool: ALL_FIXTURE_CANDIDATES, profile: watched, weights: DEFAULT_WEIGHTS,
  }).find((i) => i.candidate.id === 'MT-FX-v00001');
  assert.ok(neutral && repeated);
  assert.ok(repeated.score < neutral.score, 'watched video must score lower when repeated');
  assert.ok(repeated.components.repetition < 0, 'repetition component must go negative');
});

test('integrity check flags a dangling reference', () => {
  const catalog = buildCatalog({
    topics: FIXTURE_TOPICS,
    channels: FIXTURE_CHANNELS,
    narrativeClusters: FIXTURE_NARRATIVE_CLUSTERS,
    discoverySources: FIXTURE_DISCOVERY_SOURCES,
  });
  const broken = [
    {
      ...ALL_FIXTURE_CANDIDATES[0],
      topicIds: ['topic-does-not-exist'],
    },
  ];
  const issues = checkIntegrity(catalog, broken);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'topic');
  assert.equal(issues[0].id, 'topic-does-not-exist');
});