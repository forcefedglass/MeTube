/**
 * TEST-SEED Viewpoint tests — the four DEMO / TEST VIEWPOINTS for US
 * political discovery behavior.
 *
 * These tests assert structure and honesty of the definitions, never
 * political meaning. The Viewpoints are user-controlled sampling lenses;
 * no test here states or implies that any source, argument, or tradition
 * is correct, representative, moderate, extreme, or authoritative, and
 * no test infers political identity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

import { MemoryLocalStore } from '../src/storage/local-store';
import { openViewpointRepository } from '../src/viewpoints/repository';
import { deriveDiscoveryPlan, MAX_PLAN_STEPS } from '../src/model/discovery';
import { summarizeViewpoint } from '../src/model/viewpoint';

const HERE = dirname(__filename);

function makeRepo(): { repo: ReturnType<typeof openViewpointRepository>; store: MemoryLocalStore } {
  const store = new MemoryLocalStore();
  return { repo: openViewpointRepository(store), store };
}

const EXPECTED_IDS = [
  'vp-test-left-broad',
  'vp-test-right-broad',
  'vp-test-left-policy',
  'vp-test-right-policy',
] as const;

const EXPECTED_TITLES: Record<string, string> = {
  'vp-test-left-broad': 'US Political Left — Broad Sample',
  'vp-test-right-broad': 'US Political Right — Broad Sample',
  'vp-test-left-policy': 'US Political Left — Policy / Primary Sources',
  'vp-test-right-policy': 'US Political Right — Policy / Primary Sources',
};

const EXPECTED_SEED_CONCEPTS: Record<string, string[]> = {
  'vp-test-left-broad': [
    'US progressive politics',
    'US liberal politics',
    'progressive policy analysis',
    'Democratic policy debate',
    'labor politics United States',
    'social democratic politics US',
    'progressive economics',
    'progressive foreign policy',
    'progressive healthcare policy',
    'progressive housing policy',
    'progressive criminal justice policy',
    'progressive climate policy',
    'progressive technology policy',
  ],
  'vp-test-right-broad': [
    'US conservative politics',
    'US right wing politics',
    'conservative policy analysis',
    'Republican policy debate',
    'libertarian politics United States',
    'conservative economics',
    'conservative foreign policy',
    'conservative healthcare policy',
    'conservative housing policy',
    'conservative criminal justice policy',
    'conservative energy policy',
    'conservative technology policy',
  ],
  'vp-test-left-policy': [
    'progressive policy proposal',
    'Democratic policy proposal',
    'progressive legislation',
    'Democratic legislation',
    'progressive policy hearing',
    'labor policy proposal',
    'progressive economic policy',
    'progressive healthcare proposal',
    'progressive housing proposal',
    'progressive climate proposal',
    'progressive technology regulation',
    'progressive foreign policy proposal',
  ],
  'vp-test-right-policy': [
    'conservative policy proposal',
    'Republican policy proposal',
    'conservative legislation',
    'Republican legislation',
    'conservative policy hearing',
    'libertarian policy proposal',
    'conservative economic policy',
    'conservative healthcare proposal',
    'conservative housing proposal',
    'conservative energy proposal',
    'conservative technology regulation',
    'conservative foreign policy proposal',
  ],
};

test('the four test viewpoints exist with the exact titles, ids, and TEST marker', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  const vps = testViewpoints();
  assert.equal(vps.length, 4);
  assert.deepEqual(vps.map((v) => v.id), [...EXPECTED_IDS]);
  for (const vp of vps) {
    assert.ok(vp.id.startsWith('vp-test-'), `${vp.id} not prefixed`);
    assert.equal(vp.title, EXPECTED_TITLES[vp.id], `${vp.id} title differs`);
    assert.ok(vp.description.includes('TEST-SEED'), `${vp.id} description not marked TEST-SEED`);
    assert.ok(vp.description.includes('DEMO / TEST VIEWPOINT'), `${vp.id} description not marked DEMO`);
    assert.ok(vp.description.includes('sampling lens'), `${vp.id} description not framed as a sampling lens`);
    assert.ok(
      vp.description.includes('NOT a statement that any source or argument is correct, representative, moderate, extreme, or authoritative'),
      `${vp.id} missing honest framing sentence`,
    );
  }
});

test('each test viewpoint carries its exact seed concepts', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  for (const vp of testViewpoints()) {
    assert.deepEqual(vp.config.seedConcepts, EXPECTED_SEED_CONCEPTS[vp.id], `${vp.id} seed concepts differ`);
  }
});

test('no test viewpoint hard-codes channels or playlists', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  for (const vp of testViewpoints()) {
    assert.equal(vp.config.seedChannels.length, 0, `${vp.id} has seed channels`);
    assert.equal(vp.config.seedPlaylists.length, 0, `${vp.id} has seed playlists`);
  }
});

test('all four share the exact specified test settings', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  for (const vp of testViewpoints()) {
    assert.equal(vp.config.unfamiliarityTarget, 'strictly-unfamiliar');
    assert.equal(vp.config.explorationPercent, 0.35);
    assert.deepEqual(vp.config.locale, { language: 'en', region: 'US' });
    assert.equal(vp.config.temporal, 'wide-window');
    assert.equal(vp.config.temporalFrom, undefined);
    assert.equal(vp.config.temporalTo, undefined);
    assert.deepEqual(vp.config.exposureBudget, {
      maxSingleChannelShare: 0.12,
      maxSingleNarrativeShare: 0.34,
      repeatedChannelCooldown: 1,
      repeatedNarrativeCooldown: 1,
      minAlternateSourceTypeShare: 0.25,
      minDistinctScaleBands: 3,
    });
  }
});

test('sourceTypePreferences exist only on the policy variants', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  for (const vp of testViewpoints()) {
    if (vp.id.endsWith('-policy')) {
      assert.deepEqual(
        [...vp.config.sourceTypePreferences].sort(),
        ['official', 'primary-source', 'publication'],
        `${vp.id} sourceTypePreferences differ`,
      );
    } else {
      assert.equal(vp.config.sourceTypePreferences.length, 0, `${vp.id} must not set sourceTypePreferences`);
    }
  }
});

test('left and right variants are structurally symmetric', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  const byId = new Map(testViewpoints().map((v) => [v.id, v]));
  const pairs: Array<[string, string]> = [
    ['vp-test-left-broad', 'vp-test-right-broad'],
    ['vp-test-left-policy', 'vp-test-right-policy'],
  ];
  for (const [leftId, rightId] of pairs) {
    const left = byId.get(leftId)!;
    const right = byId.get(rightId)!;
    // Every behavioral setting must be identical.
    assert.equal(left.config.unfamiliarityTarget, right.config.unfamiliarityTarget);
    assert.equal(left.config.narrativeDiversityTarget, right.config.narrativeDiversityTarget);
    assert.equal(left.config.explorationPercent, right.config.explorationPercent);
    assert.equal(left.config.temporal, right.config.temporal);
    assert.deepEqual(left.config.locale, right.config.locale);
    assert.deepEqual(left.config.exposureBudget, right.config.exposureBudget);
    assert.deepEqual(left.config.sourceTypePreferences, right.config.sourceTypePreferences);
    assert.equal(left.config.seedChannels.length, right.config.seedChannels.length);
    assert.equal(left.config.seedPlaylists.length, right.config.seedPlaylists.length);
    // No seed concept may be shared across the left/right pair.
    const shared = left.config.seedConcepts.filter((c) => right.config.seedConcepts.includes(c));
    assert.equal(shared.length, 0, `${leftId}/${rightId} share seed concepts: ${shared.join(', ')}`);
  }
});

test('assumptions are present, first assumption verbatim, honesty notes included', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  const firstAssumption: Record<string, string> = {
    'vp-test-left-broad': 'This Viewpoint intentionally samples material associated with multiple US left-of-center political traditions. It does not assume those traditions agree with one another or that any candidate represents the political left as a whole.',
    'vp-test-right-broad': 'This Viewpoint intentionally samples material associated with multiple US right-of-center political traditions. It does not assume those traditions agree with one another or that any candidate represents the political right as a whole.',
    'vp-test-left-policy': 'This Viewpoint emphasizes concrete policy and primary-source material associated with US left-of-center politics. Source type is descriptive, not a quality or truth ranking.',
    'vp-test-right-policy': 'This Viewpoint emphasizes concrete policy and primary-source material associated with US right-of-center politics. Source type is descriptive, not a quality or truth ranking.',
  };
  for (const vp of testViewpoints()) {
    assert.ok(vp.config.assumptions.length >= 6, `${vp.id} has too few assumptions`);
    assert.equal(vp.config.assumptions[0], firstAssumption[vp.id], `${vp.id} first assumption not verbatim`);
    const all = vp.config.assumptions.join('\n');
    assert.ok(all.includes('query-driven'), `${vp.id} missing query-driven honesty note`);
    assert.ok(all.includes('soft recorded preference'), `${vp.id} missing locale honesty note`);
    assert.ok(all.includes('never dropped'), `${vp.id} missing temporal honesty note`);
    assert.ok(all.includes('UNKNOWN'), `${vp.id} missing unknown-classification honesty note`);
    assert.ok(all.includes('reported honestly as violated'), `${vp.id} missing honest-violation note`);
  }
});

test('no shared mutable state between testViewpoints() calls or within one call', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  const a = testViewpoints();
  const b = testViewpoints();
  // Mutate everything mutable on copy A; copies B must be unaffected...
  a[0].config.seedConcepts.push('MUTATION');
  a[0].config.exposureBudget.maxSingleChannelShare = 0.99;
  a[0].config.assumptions.push('MUTATION');
  a[0].config.locale.language = 'xx';
  for (const vp of b) {
    assert.ok(!vp.config.seedConcepts.includes('MUTATION'), `${vp.id} shares seedConcepts array`);
    assert.ok(!vp.config.assumptions.includes('MUTATION'), `${vp.id} shares assumptions array`);
    assert.equal(vp.config.exposureBudget.maxSingleChannelShare, 0.12, `${vp.id} shares exposureBudget object`);
    assert.equal(vp.config.locale.language, 'en', `${vp.id} shares locale object`);
  }
  // ...and within copy A itself, no sibling may share a nested object.
  const others = a.slice(1);
  for (const vp of others) {
    assert.ok(!vp.config.seedConcepts.includes('MUTATION'), `${vp.id} shares seedConcepts array`);
    assert.ok(!vp.config.assumptions.includes('MUTATION'), `${vp.id} shares assumptions array`);
    assert.equal(vp.config.exposureBudget.maxSingleChannelShare, 0.12, `${vp.id} shares exposureBudget object`);
    assert.equal(vp.config.locale.language, 'en', `${vp.id} shares locale object`);
  }
  const [l1, r1, l2, r2] = a;
  assert.notEqual(l1.config.sourceTypePreferences, l2.config.sourceTypePreferences);
  assert.notEqual(r1.config.sourceTypePreferences, r2.config.sourceTypePreferences);
  assert.equal(r1.config.sourceTypePreferences.length, 0);
  assert.ok(r2.config.sourceTypePreferences.length > 0);
});

test('each test viewpoint activates independently (setActive round-trip)', async () => {
  const { repo } = makeRepo();
  const { seedTestViewpoints } = await import('../src/viewpoints/test-viewpoints');
  await seedTestViewpoints(repo);
  for (const id of EXPECTED_IDS) {
    await repo.setActive(id);
    const active = await repo.getActive();
    assert.ok(active);
    assert.equal(active!.id, id, `activation round-trip failed for ${id}`);
  }
});

test('discovery plans differ materially across all four viewpoints', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  const vps = testViewpoints();
  const plans = vps.map((vp) =>
    deriveDiscoveryPlan(vp.id, vp.config.seedTopics, vp.config.seedConcepts, vp.createdAt),
  );
  for (const p of plans) {
    assert.ok(p.steps.length > 0);
    assert.ok(p.steps.length <= MAX_PLAN_STEPS);
    assert.ok(p.steps.every((s) => s.method === 'seed-search'));
  }
  const signatures = plans.map((p) => p.steps.map((s) => s.target).join('|'));
  const unique = new Set(signatures);
  assert.equal(unique.size, 4, 'discovery plans are not pairwise distinct');
  const [leftBroad, rightBroad, leftPolicy, rightPolicy] = signatures;
  assert.notEqual(leftBroad, rightBroad);
  assert.notEqual(leftBroad, leftPolicy);
  assert.notEqual(rightBroad, rightPolicy);
  assert.notEqual(leftPolicy, rightPolicy);
  assert.notEqual(leftBroad, rightPolicy);
  assert.notEqual(rightBroad, leftPolicy);
});

test('discovery plans carry the exact seed concepts as step targets, capped at MAX_PLAN_STEPS', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  for (const vp of testViewpoints()) {
    const plan = deriveDiscoveryPlan(vp.id, vp.config.seedTopics, vp.config.seedConcepts, vp.createdAt);
    const targets = plan.steps.map((s) => s.target);
    assert.equal(plan.steps.length, Math.min(vp.config.seedConcepts.length, MAX_PLAN_STEPS));
    assert.deepEqual(targets, vp.config.seedConcepts.slice(0, MAX_PLAN_STEPS));
    assert.ok(plan.steps.every((s) => s.label.startsWith('search: ')));
    assert.ok(plan.steps.every((s) => s.method === 'seed-search'));
  }
});

test('seedTestViewpoints is idempotent', async () => {
  const { repo } = makeRepo();
  const { seedTestViewpoints } = await import('../src/viewpoints/test-viewpoints');
  await seedTestViewpoints(repo);
  const count1 = (await repo.list()).length;
  await seedTestViewpoints(repo);
  const count2 = (await repo.list()).length;
  assert.equal(count1, 4);
  assert.equal(count2, 4);
});

test('seedTestViewpoints lists sorted by title', async () => {
  const { repo } = makeRepo();
  const { seedTestViewpoints } = await import('../src/viewpoints/test-viewpoints');
  await seedTestViewpoints(repo);
  const listed = await repo.list();
  const idsByTitle = listed.map((v) => v.id);
  // repository.list() sorts by title; verify the same order holds for ids sorted by their titles.
  const expected = [...EXPECTED_IDS].sort((x, y) => {
    const tx = EXPECTED_TITLES[x];
    const ty = EXPECTED_TITLES[y];
    return tx < ty ? -1 : tx > ty ? 1 : 0;
  });
  assert.deepEqual(idsByTitle, expected);
});

test('acceptStarters never seeds the test viewpoints', async () => {
  const { store } = makeRepo();
  const { acceptStarters } = await import('../src/viewpoints/onboarding');
  await acceptStarters(store);
  const repo = openViewpointRepository(store);
  const listed = await repo.list();
  assert.ok(listed.length > 0, 'acceptStarters seeded nothing');
  for (const vp of listed) {
    assert.ok(!vp.id.startsWith('vp-test-'), `starter seeding produced ${vp.id}`);
    assert.ok(!vp.description.includes('TEST-SEED'), `starter ${vp.id} carries the TEST marker`);
  }
});

test('starter definitions contain no test-viewpoint ids or markers', async () => {
  const { starterViewpoints } = await import('../src/viewpoints/starters');
  for (const vp of starterViewpoints()) {
    assert.ok(!vp.id.startsWith('vp-test-'), `starter ${vp.id} uses the test id prefix`);
    assert.ok(!vp.description.includes('TEST-SEED'), `starter ${vp.id} carries the TEST marker`);
  }
});

test('summarizeViewpoint describes each test viewpoint without editorializing', async () => {
  const { testViewpoints } = await import('../src/viewpoints/test-viewpoints');
  for (const vp of testViewpoints()) {
    const s = summarizeViewpoint(vp);
    assert.ok(s.length > 0);
    // All four set concrete behavioral settings, so the summary must show them.
    assert.ok(s.includes('strictly-unfamiliar'), `${vp.id} summary missing unfamiliarity target`);
    assert.ok(s.includes('wide-window'), `${vp.id} summary missing temporal sampling`);
    assert.ok(s.includes('assumption(s), shown below'), `${vp.id} summary missing assumptions note`);
    assert.ok(s.includes('exposure budget'), `${vp.id} summary missing exposure budget note`);
    // The summary must not judge the political material.
    assert.ok(!s.includes('correct'), `${vp.id} summary editorializes correctness`);
    assert.ok(!s.includes('extreme'), `${vp.id} summary editorializes extremeness`);
    assert.ok(!s.includes('authoritative'), `${vp.id} summary editorializes authority`);
  }
});

test('the test viewpoint module is not imported by the extension content path', () => {
  // Tests run compiled from dist-test/tests/, so source lives two levels up.
  const srcRoot = join(HERE, '..', '..');
  const content = readFileSync(join(srcRoot, 'src', 'extension', 'content.ts'), 'utf8');
  assert.ok(!content.includes('test-viewpoints'), 'content.ts references the test module');
  const onboarding = readFileSync(join(srcRoot, 'src', 'viewpoints', 'onboarding.ts'), 'utf8');
  assert.ok(!onboarding.includes('test-viewpoints'), 'onboarding.ts references the test module');
});

test('the starter set stays free of political vocabulary (frozen rule)', async () => {
  const { starterViewpoints } = await import('../src/viewpoints/starters');
  const banned = ['left', 'right', 'liberal', 'conservative', 'counter political', 'counter-viewpoint'];
  for (const vp of starterViewpoints()) {
    const text = `${vp.title} ${vp.description} ${vp.config.assumptions.join(' ')} ${vp.config.seedConcepts.join(' ')}`;
    const lowered = text.toLowerCase();
    for (const word of banned) {
      assert.ok(!lowered.includes(word), `starter ${vp.id} mentions "${word}"`);
    }
  }
});