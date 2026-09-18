/**
 * Phase 1 tests: Viewpoints, Viewlists, persistence, activation,
 * duplication, deletion, and deterministic constraint interpretation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryLocalStore } from '../src/storage/local-store';
import { openViewpointRepository } from '../src/viewpoints/repository';
import {
  defaultViewpointConfig,
  newViewpoint,
  duplicateViewpoint,
  summarizeViewpoint,
} from '../src/model/viewpoint';
import {
  interpretViewpoint,
  candidatePasses,
  passesUnfamiliarity,
} from '../src/viewpoints/interpret';
import { generateViewstream } from '../src/viewpoints/viewstream';
import { FixtureCandidateProvider } from '../src/discovery/fixture-provider';
import { emptyUserProfile } from '../src/model/types';
import type { Viewpoint } from '../src/model/viewpoint';

const NOW = '2026-09-18T00:00:00Z';

function makeStore(): MemoryLocalStore {
  return new MemoryLocalStore();
}

function makeRepo(): { repo: ReturnType<typeof openViewpointRepository>; store: MemoryLocalStore } {
  const store = makeStore();
  return { repo: openViewpointRepository(store), store };
}

function makeViewpoint(id: string, title: string, partial?: Parameters<typeof newViewpoint>[4]): Viewpoint {
  return newViewpoint(id, title, 'test viewpoint', NOW, partial);
}

test('defaultViewpointConfig has no constraints and sane limits', () => {
  const cfg = defaultViewpointConfig();
  assert.equal(cfg.seedTopics.length, 0);
  assert.equal(cfg.positiveTopicConstraints.length, 0);
  assert.equal(cfg.explorationPercent, 0.15);
  assert.equal(cfg.repetitionLimit, 1);
  assert.equal(cfg.sourceConcentrationLimit, 0.5);
  assert.equal(cfg.baselineContext, '');
});

test('newViewpoint applies partial config over defaults', () => {
  const vp = makeViewpoint('vp-1', 'One', { seedTopics: ['topic-aero'] });
  assert.equal(vp.config.seedTopics.length, 1);
  assert.equal(vp.config.explorationPercent, 0.15); // default retained
  assert.equal(vp.enabled, true);
});

test('repository create + list round-trips through persistence', async () => {
  const { repo } = makeRepo();
  await repo.create(makeViewpoint('vp-a', 'A'));
  await repo.create(makeViewpoint('vp-b', 'B'));
  const listed = await repo.list();
  assert.equal(listed.length, 2);
  assert.deepEqual(listed.map((v) => v.id).sort(), ['vp-a', 'vp-b']);
});

test('repository update changes fields and persists', async () => {
  const { repo } = makeRepo();
  const vp = await repo.create(makeViewpoint('vp-a', 'A'));
  await repo.update({ ...vp, title: 'A2', updatedAt: NOW });
  const got = await repo.get('vp-a');
  assert.ok(got);
  assert.equal(got.title, 'A2');
});

test('duplicate copies config under a new id', async () => {
  const { repo } = makeRepo();
  await repo.create(makeViewpoint('vp-a', 'A', { seedTopics: ['topic-aero'], explorationPercent: 0.3 }));
  const copy = await repo.duplicate('vp-a', 'A (copy)');
  assert.equal(copy.id, 'vp-a-copy');
  assert.equal(copy.title, 'A (copy)');
  assert.equal(copy.config.seedTopics.length, 1);
  assert.equal(copy.config.explorationPercent, 0.3);
  assert.notEqual(copy.id, 'vp-a');
  // Original untouched
  const orig = await repo.get('vp-a');
  assert.equal(orig?.title, 'A');
  // Duplicating the same source again gets a distinct, numbered id
  const copy2 = await repo.duplicate('vp-a', 'A (copy 2)');
  assert.equal(copy2.id, 'vp-a-copy2');
  assert.notEqual(copy2.id, copy.id);
});

test('duplicate on missing id throws', async () => {
  const { repo } = makeRepo();
  await assert.rejects(() => repo.duplicate('nope', 'X'), /No such Viewpoint/);
});

test('delete removes the Viewpoint and prunes Viewlist membership', async () => {
  const { repo } = makeRepo();
  await repo.create(makeViewpoint('vp-a', 'A'));
  await repo.create(makeViewpoint('vp-b', 'B'));
  await repo.createViewlist({
    id: 'vl-1', title: 'List', description: '', viewpointIds: ['vp-a', 'vp-b'],
    createdAt: NOW, updatedAt: NOW,
  });
  await repo.remove('vp-a');
  const listed = await repo.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'vp-b');
  const lists = await repo.listViewlists();
  assert.equal(lists[0].viewpointIds.length, 1);
  assert.equal(lists[0].viewpointIds[0], 'vp-b');
});

test('delete of the active Viewpoint deactivates it', async () => {
  const { repo } = makeRepo();
  await repo.create(makeViewpoint('vp-a', 'A'));
  await repo.setActive('vp-a');
  assert.equal((await repo.getActive())?.id, 'vp-a');
  await repo.remove('vp-a');
  assert.equal(await repo.getActive(), null);
});

test('activation requires an enabled Viewpoint', async () => {
  const { repo } = makeRepo();
  const vp = await repo.create(makeViewpoint('vp-a', 'A'));
  await repo.setActive('vp-a');
  assert.equal((await repo.getActive())?.id, 'vp-a');
  await repo.update({ ...vp, enabled: false, updatedAt: NOW });
  assert.equal(await repo.getActive(), null);
  await assert.rejects(() => repo.setActive('vp-a'), /disabled/);
});

test('setActive with unknown id throws; null clears', async () => {
  const { repo } = makeRepo();
  await assert.rejects(() => repo.setActive('nope'), /No such Viewpoint/);
  await repo.setActive(null);
  assert.equal(await repo.getActive(), null);
});

test('Viewlist CRUD and assignment', async () => {
  const { repo } = makeRepo();
  await repo.create(makeViewpoint('vp-a', 'A'));
  await repo.create(makeViewpoint('vp-b', 'B'));
  const list = await repo.createViewlist({
    id: 'vl-1', title: 'My list', description: '', viewpointIds: [],
    createdAt: NOW, updatedAt: NOW,
  });
  await repo.assignViewpoint('vl-1', 'vp-a');
  await repo.assignViewpoint('vl-1', 'vp-a'); // idempotent
  let lists = await repo.listViewlists();
  assert.equal(lists[0].viewpointIds.length, 1);
  await repo.assignViewpoint('vl-1', 'vp-b');
  lists = await repo.listViewlists();
  assert.equal(lists[0].viewpointIds.length, 2);
  await repo.unassignViewpoint('vl-1', 'vp-a');
  lists = await repo.listViewlists();
  assert.deepEqual(lists[0].viewpointIds, ['vp-b']);
  await repo.removeViewlist('vl-1');
  lists = await repo.listViewlists();
  assert.equal(lists.length, 0);
});

test('interpretViewpoint is deterministic and pure', () => {
  const cfg = defaultViewpointConfig();
  cfg.positiveTopicConstraints = ['topic-aero'];
  cfg.negativeTopicConstraints = ['topic-cooking'];
  cfg.sourceConstraints = ['src-fixture-editorial'];
  cfg.temporalFrom = '2026-01-01T00:00:00Z';
  cfg.temporalTo = '2026-06-01T00:00:00Z';
  cfg.explorationPercent = 0.5;
  cfg.sourceConcentrationLimit = 0.25;
  cfg.weightOverrides = [{ component: 'relevance', value: 2 }];

  const a = interpretViewpoint(cfg);
  const b = interpretViewpoint(cfg);
  assert.deepEqual(a, b);
  assert.equal(a.filters.positiveTopics.has('topic-aero'), true);
  assert.equal(a.filters.negativeTopics.has('topic-cooking'), true);
  assert.equal(a.filters.sources.size, 1);
  assert.ok(a.filters.from !== undefined && a.filters.to !== undefined);
  assert.equal(a.limits.repetitionLimit, 1);
  assert.equal(a.limits.sourceConcentrationLimit, 0.25);
  assert.equal(a.tuning.weights.relevance, 2);
  assert.equal(a.tuning.explorationPercent, 0.5);
});

test('candidatePasses enforces positive topics (OR), negatives (NOT)', async () => {
  const provider = new FixtureCandidateProvider();
  const all = await provider.getCandidates({ limit: 100 });
  const filters = interpretViewpoint({
    ...defaultViewpointConfig(),
    positiveTopicConstraints: ['topic-aero'],
    negativeTopicConstraints: ['topic-urban'],
  }).filters;
  const passing = all.filter((c) => candidatePasses(c, filters));
  assert.ok(passing.length > 0);
  for (const c of passing) {
    assert.ok(c.topicIds.includes('topic-aero'));
    assert.ok(!c.topicIds.includes('topic-urban'));
  }
});

test('candidatePasses enforces temporal windows deterministically', async () => {
  const provider = new FixtureCandidateProvider();
  const all = await provider.getCandidates({ limit: 100 });
  const filters = interpretViewpoint({
    ...defaultViewpointConfig(),
    temporalTo: '2026-01-01T00:00:00Z',
  }).filters;
  assert.equal(filters.to, Date.parse('2026-01-01T00:00:00Z'));
  const passing = all.filter((c) => candidatePasses(c, filters));
  assert.ok(passing.length > 0);
  for (const c of passing) {
    assert.ok(Date.parse(c.publishedAt) <= Date.parse('2026-01-01T00:00:00Z'));
  }
});

test('generateViewstream embeds the Viewpoint in the snapshot and respects constraints', async () => {
  const provider = new FixtureCandidateProvider();
  const vp = makeViewpoint('vp-aero', 'Aero only', {
    positiveTopicConstraints: ['topic-aero'],
  });
  const profile = emptyUserProfile(NOW);
  const snap = await generateViewstream(provider, { viewpoint: vp, limit: 8, profile }, NOW);
  assert.equal(snap.viewpoint?.id, 'vp-aero');
  assert.equal(snap.viewpoint?.title, 'Aero only');
  assert.ok(snap.feed.length > 0);
  for (const item of snap.feed) {
    assert.ok(item.candidate.topicIds.includes('topic-aero'));
  }
});

test('generateViewstream respects repetition limit (max items per channel)', async () => {
  const provider = new FixtureCandidateProvider();
  const vp = makeViewpoint('vp-rep', 'Rep limit', {
    repetitionLimit: 1,
  });
  const snap = await generateViewstream(
    provider, { viewpoint: vp, limit: 8, profile: emptyUserProfile(NOW) }, NOW,
  );
  const perChannel = new Map<string, number>();
  for (const item of snap.feed) {
    perChannel.set(item.candidate.channelId, (perChannel.get(item.candidate.channelId) ?? 0) + 1);
  }
  for (const count of perChannel.values()) {
    assert.ok(count <= 1, `channel appeared ${count} times`);
  }
});

test('generateViewstream respects source concentration limit', async () => {
  const provider = new FixtureCandidateProvider();
  const vp = makeViewpoint('vp-conc', 'Concentration', {
    sourceConcentrationLimit: 0.3,
    repetitionLimit: 10,
  });
  const snap = await generateViewstream(
    provider, { viewpoint: vp, limit: 8, profile: emptyUserProfile(NOW) }, NOW,
  );
  const perChannel = new Map<string, number>();
  for (const item of snap.feed) {
    perChannel.set(item.candidate.channelId, (perChannel.get(item.candidate.channelId) ?? 0) + 1);
  }
  const maxAllowed = Math.max(1, Math.floor(8 * 0.3));
  for (const [ch, count] of perChannel) {
    assert.ok(count <= maxAllowed, `channel ${ch} appeared ${count} > ${maxAllowed}`);
  }
});

test('disabled Viewpoint generates an empty Viewstream with the Viewpoint still recorded', async () => {
  const provider = new FixtureCandidateProvider();
  const vp = { ...makeViewpoint('vp-off', 'Off'), enabled: false };
  const snap = await generateViewstream(
    provider, { viewpoint: vp, limit: 8, profile: emptyUserProfile(NOW) }, NOW,
  );
  assert.equal(snap.feed.length, 0);
  assert.equal(snap.viewpoint?.id, 'vp-off');
});

test('strictly-unfamiliar excludes candidates with watched/saved/more-like-this feedback', async () => {
  const provider = new FixtureCandidateProvider();
  const all = await provider.getCandidates({ limit: 100 });
  const target = all[0];
  const profile = emptyUserProfile(NOW);
  profile.feedback = [
    { id: 'fb-1', videoId: target.id, kind: 'watched', capturedAt: NOW },
  ];
  const vp = makeViewpoint('vp-strict', 'Strict', {
    unfamiliarityTarget: 'strictly-unfamiliar',
  });
  const snap = await generateViewstream(
    provider, { viewpoint: vp, limit: 8, profile }, NOW,
  );
  assert.ok(snap.feed.length > 0);
  for (const item of snap.feed) {
    assert.notEqual(item.candidate.id, target.id);
  }
  // And the pure gate agrees
  assert.equal(passesUnfamiliarity(target, profile, 'strictly-unfamiliar'), false);
});

test('demo viewpoints are marked DEMO and use the vp-demo- prefix', async () => {
  const { demoViewpoints } = await import('../src/viewpoints/demo');
  const demos = demoViewpoints();
  assert.ok(demos.length >= 3);
  for (const d of demos) {
    assert.ok(d.id.startsWith('vp-demo-'), `${d.id} not prefixed`);
    assert.ok(d.description.includes('DEMO'), `${d.id} description not marked`);
  }
});

test('seedDemoViewpoints is idempotent', async () => {
  const { repo } = makeRepo();
  const { seedDemoViewpoints } = await import('../src/viewpoints/demo');
  await seedDemoViewpoints(repo);
  const count1 = (await repo.list()).length;
  await seedDemoViewpoints(repo);
  const count2 = (await repo.list()).length;
  assert.equal(count1, count2);
});

test('summarizeViewpoint restates constraints without editorializing', () => {
  const vp = makeViewpoint('vp-s', 'S', {
    positiveTopicConstraints: ['topic-aero'],
    negativeTopicConstraints: ['topic-urban'],
  });
  const s = summarizeViewpoint(vp);
  assert.ok(s.includes('topic-aero'));
  assert.ok(s.includes('topic-urban'));
});