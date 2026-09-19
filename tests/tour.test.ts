/**
 * Guided-tour tests — first-use onboarding (Phase: guided tour).
 *
 * These tests assert the SPEC contract for the onboarding mechanism:
 *   - tour state persistence and transitions
 *   - demo opt-in only through explicit action
 *   - political demos never imply political identity
 *   - demo Viewpoints are isolated, marked, and removable
 *   - user forks survive demo removal
 *   - no automatic activation outside the user's explicit tour choice
 *   - starter onboarding still works (regression)
 *
 * Pure-logic where possible: no DOM, no browser. The UI layers are
 * exercised through the state machine and repository only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

import { MemoryLocalStore } from '../src/storage/local-store';
import { openViewpointRepository } from '../src/viewpoints/repository';
import type { ViewpointRepository } from '../src/viewpoints/repository';
import {
  readTourState,
  startTour,
  setTourStep,
  completeTour,
  skipTour,
  replayTour,
  currentTourStep,
  tourIsVisible,
  TOUR_STATE_KEY,
  TOUR_STEP_IDS,
} from '../src/onboarding/tour-state';
import {
  demoViewpointInstances,
  isDemoViewpoint,
  isCanonicalTestViewpoint,
  demoComparePair,
  optInToDemos,
  removeDemoViewpoints,
  DEMO_INSTANCE_MARKER,
  DEMO_VIEWPOINT_ID_PREFIX,
} from '../src/onboarding/demo-viewpoints';
import { acceptStarters, readOnboardingState, markOnboarded } from '../src/viewpoints/onboarding';
import { testViewpoints, TEST_VIEWPOINT_MARKER } from '../src/viewpoints/test-viewpoints';
import { simplifiedConfigOverlay, SIMPLIFIED_CHANGE_TYPES } from '../src/ui/tour-panel';
import { defaultViewpointConfig } from '../src/model/viewpoint';
import { HELP_TOPIC_TEXT } from '../src/ui/help-tooltips';

const HERE = dirname(__filename);
// Tests run compiled from dist-test/tests/, so source lives two levels up.
const SRC_ROOT = join(HERE, '..', '..');

function makeStore(): MemoryLocalStore {
  return new MemoryLocalStore();
}

function makeRepo(store?: MemoryLocalStore): { repo: ViewpointRepository; store: MemoryLocalStore } {
  const s = store ?? makeStore();
  return { repo: openViewpointRepository(s), store: s };
}

// ---------------------------------------------------------------------------
// Tour state machine
// ---------------------------------------------------------------------------

test('fresh state reads as never-started with the first step', async () => {
  const { store } = makeRepo();
  const state = await readTourState(store);
  assert.equal(state.status, 'never-started');
  assert.equal(currentTourStep(state), TOUR_STEP_IDS[0]);
  assert.equal(tourIsVisible(state), false);
});

test('tour state survives garbage reads (normalize tolerates corruption)', async () => {
  const { store } = makeRepo();
  await store.putKv(TOUR_STATE_KEY, { nonsense: true } as never);
  const state = await readTourState(store);
  assert.equal(state.status, 'never-started');
});

test('startTour marks in-progress at step 1; setTourStep persists the current step', async () => {
  const { store } = makeRepo();
  await startTour(store, '2026-01-01T00:00:00Z');
  let state = await readTourState(store);
  assert.equal(state.status, 'in-progress');
  assert.equal(currentTourStep(state), 'welcome');
  assert.equal(tourIsVisible(state), true);

  await setTourStep(store, 'feed-autopsy', '2026-01-01T00:01:00Z');
  state = await readTourState(store);
  assert.equal(currentTourStep(state), 'feed-autopsy');

  // setTourStep is a no-op outside in-progress
  await completeTour(store, '2026-01-01T00:02:00Z');
  await setTourStep(store, 'welcome', '2026-01-01T00:03:00Z');
  state = await readTourState(store);
  assert.equal(state.status, 'completed');
});

test('skipTour works from any in-progress step', async () => {
  const { store } = makeRepo();
  await startTour(store, '2026-01-01T00:00:00Z');
  await setTourStep(store, 'compare-viewpoints', '2026-01-01T00:01:00Z');
  await skipTour(store, '2026-01-01T00:02:00Z');
  const state = await readTourState(store);
  assert.equal(state.status, 'skipped');
  assert.equal(tourIsVisible(state), false);
});

test('replayTour returns a completed or skipped tour to step 1 in-progress', async () => {
  const { store } = makeRepo();
  await completeTour(store, '2026-01-01T00:00:00Z');
  await replayTour(store, '2026-01-02T00:00:00Z');
  let state = await readTourState(store);
  assert.equal(state.status, 'in-progress');
  assert.equal(currentTourStep(state), 'welcome');

  await skipTour(store, '2026-01-02T00:01:00Z');
  await replayTour(store, '2026-01-03T00:00:00Z');
  state = await readTourState(store);
  assert.equal(state.status, 'in-progress');
});

test('tour state is stored under its own key, separate from Viewpoint preference data', async () => {
  const { store } = makeRepo();
  await startTour(store, '2026-01-01T00:00:00Z');
  // Tour data lives in the kv store, not in Viewpoint records.
  const raw = (await store.getKv(TOUR_STATE_KEY)) as Record<string, unknown> | null;
  assert.ok(raw, 'tour state record missing');
  // Viewpoint storage untouched by tour transitions.
  const repo = openViewpointRepository(store);
  assert.equal((await repo.list()).length, 0);
});

// ---------------------------------------------------------------------------
// Demo mechanism: opt-in, isolation, removal
// ---------------------------------------------------------------------------

test('demo instances exist only after explicit opt-in (no automatic seeding)', async () => {
  const { repo, store } = makeRepo();
  assert.equal((await repo.list()).length, 0, 'something was seeded without opt-in');

  await optInToDemos(repo);
  const listed = await repo.list();
  assert.equal(listed.length, 4);
  for (const vp of listed) {
    assert.ok(vp.id.startsWith(`${DEMO_VIEWPOINT_ID_PREFIX}demo-`), `unexpected id ${vp.id}`);
    assert.ok(vp.description.includes(DEMO_INSTANCE_MARKER), `${vp.id} missing demo marker`);
    assert.ok(!isCanonicalTestViewpoint(vp), `${vp.id} must be a marked copy, not the canonical test Viewpoint`);
  }

  // No active Viewpoint set by the mechanism itself.
  assert.equal((await repo.getActive()), null);
});

test('optInToDemos is idempotent', async () => {
  const { repo } = makeRepo();
  await optInToDemos(repo);
  await optInToDemos(repo);
  assert.equal((await repo.list()).length, 4);
});

test('demo instances carry no shared references with the test module definitions', () => {
  const demos = demoViewpointInstances();
  const canonical = testViewpoints();
  assert.equal(demos.length, canonical.length);
  for (let i = 0; i < demos.length; i++) {
    assert.notEqual(demos[i].config, canonical[i].config, 'config object shared with test module');
    assert.notEqual(demos[i].id, canonical[i].id, 'id shared with test module');
  }
});

test('removing demos removes only demo instances; user forks are preserved', async () => {
  const { repo } = makeRepo();
  await optInToDemos(repo);

  // User duplicates one demo (fork path: repo.duplicate gives a new id).
  const demos = await repo.list();
  const forked = await repo.duplicate(demos[0].id, 'My own fork of the demo');
  assert.ok(forked.id !== demos[0].id, 'fork must carry a different id');

  // User-authored Viewpoint coexists.
  const myOwn = {
    ...demos[0],
    id: 'vp-my-own',
    title: 'My own lens',
    description: 'Not a demo',
  };
  await repo.create(myOwn);

  const removed = await removeDemoViewpoints(repo);
  assert.equal(removed.length, 4, 'all four demo instances removed');
  assert.ok(removed.every((id) => id.startsWith(`${DEMO_VIEWPOINT_ID_PREFIX}demo-`)));

  const remaining = await repo.list();
  assert.equal(remaining.length, 2, 'fork + own lens must survive');
  const remainingIds = remaining.map((v) => v.id);
  assert.ok(remainingIds.includes(forked.id), 'user fork lost');
  assert.ok(remainingIds.includes('vp-my-own'), 'user-authored Viewpoint lost');
});

test('demoComparePair returns the broad left+right pair, not policy lenses', async () => {
  const { repo } = makeRepo();
  await optInToDemos(repo);
  const pair = demoComparePair();
  assert.ok(pair, 'pair missing after opt-in');
  // Titles come from the canonical test Viewpoints (broad pair first).
  assert.ok(pair[0].title.includes('Left — Broad'), `first pair member "${pair[0].title}" not left-broad`);
  assert.ok(pair[1].title.includes('Right — Broad'), `second pair member "${pair[1].title}" not right-broad`);
});

test('political demo vocabulary check: no truth claims, no balance ranking', () => {
  const demos = demoViewpointInstances();
  assert.ok(demos.length === 4);
  // Banned words may appear ONLY inside an explicit disclaimer clause
  // ("NOT a statement that ... is correct, ... extreme, ..."). A claim
  // ("this Viewpoint is balanced") is what the spec forbids.
  const banned = [
    'more balanced', 'extreme', 'moderate', 'accurate', 'correct',
    'truthful', 'representative', 'recommended', 'worse', 'better',
  ];
  const disclaimerPattern = /NOT a statement|not a verdict|never a quality/i;
  for (const vp of demos) {
    const text = `${vp.title} ${vp.description}`;
    for (const word of banned) {
      const idx = text.toLowerCase().indexOf(word);
      if (idx === -1) continue;
      // The occurrence must sit inside a disclaiming sentence.
      const sentence = text.slice(Math.max(0, text.lastIndexOf('.', idx) ), Math.max(idx, text.indexOf('.', idx) + 1));
      assert.ok(
        disclaimerPattern.test(sentence),
        `demo ${vp.id} uses "${word}" outside a disclaimer: …${sentence}…`,
      );
    }
  }
  // No political identity recording anywhere in the demo module.
  const src = readFileSync(join(SRC_ROOT, 'src', 'onboarding', 'demo-viewpoints.ts'), 'utf8');
  assert.ok(!src.includes('political identity'), 'demo module records political identity');
  assert.ok(!src.includes('userProfile') && !src.includes('user-profile'), 'demo module touches the user profile');
});

// ---------------------------------------------------------------------------
// Starter onboarding regression (still works)
// ---------------------------------------------------------------------------

test('existing starter onboarding still works (regression)', async () => {
  const { store } = makeRepo();
  const state = await readOnboardingState(store);
  assert.equal(state.onboarded, false);

  const added = await acceptStarters(store);
  assert.ok(added > 0, 'starters seeded nothing');

  // acceptStarters seeds only; onboarding completion is the caller's
  // explicit markOnboarded call (unchanged contract).
  const seededButNotMarked = await readOnboardingState(store);
  assert.equal(seededButNotMarked.onboarded, false);
  await markOnboarded(store);
  assert.equal((await readOnboardingState(store)).onboarded, true);

  // Starters are not test Viewpoints.
  const repo = openViewpointRepository(store);
  for (const vp of await repo.list()) {
    assert.ok(!vp.id.startsWith('vp-test-'), `starter set produced ${vp.id}`);
    assert.ok(!vp.description.includes(TEST_VIEWPOINT_MARKER));
  }
});

test('markOnboarded does not seed anything', async () => {
  const { store } = makeRepo();
  await markOnboarded(store);
  const repo = openViewpointRepository(store);
  assert.equal((await repo.list()).length, 0);
});

// ---------------------------------------------------------------------------
// First-run gate: three paths
// ---------------------------------------------------------------------------

test('onboarding panel offers three paths (source check)', async () => {
  const src = readFileSync(join(SRC_ROOT, 'src', 'ui', 'onboarding-panel.ts'), 'utf8');
  assert.ok(src.includes('Show me how it works'), 'guided-tour path missing');
  assert.ok(src.includes('Start with starter Viewpoints'), 'starter path missing');
  assert.ok(src.includes('Start empty'), 'empty path missing');
});

test('first-run explanation text present (source check)', async () => {
  const src = readFileSync(join(SRC_ROOT, 'src', 'ui', 'tour-panel.ts'), 'utf8');
  assert.ok(
    src.includes('Your normal recommendation feed decides which small part of a huge video library you see.'),
    'first-run explanation missing',
  );
  // Political demo disclaimer (exact wording contract).
  assert.ok(
    src.includes('These are test lenses, not truth labels.'),
    'political demo disclaimer missing',
  );
  // Unknown honesty.
  assert.ok(
    src.includes('Unknown does not mean bad. It means Slipgate does not currently have enough evidence to classify it confidently.'),
    'unknown-honesty wording missing',
  );
  // Firewall wording: no false isolation promise. (The source string is
// single-quoted, so the raw file text contains a backslash before the
// apostrophe — match the raw text.)
  assert.ok(
    src.includes("Separation from YouTube\\'s profile is the design goal; it is not an anonymity promise."),
    'firewall honesty wording missing',
  );
});

// ---------------------------------------------------------------------------
// Tour steps and honest runtime values
// ---------------------------------------------------------------------------

test('tour covers the full step list in order', () => {
  assert.equal(TOUR_STEP_IDS.length, 15);
  assert.equal(TOUR_STEP_IDS[0], 'welcome');
  assert.equal(TOUR_STEP_IDS[2], 'demo-choice');
  assert.equal(TOUR_STEP_IDS[14], 'done');
});

test('build step reports the real plan cap honestly (MAX_PLAN_STEPS = 6)', async () => {
  const { deriveDiscoveryPlan, MAX_PLAN_STEPS } = await import('../src/model/discovery');
  assert.equal(MAX_PLAN_STEPS, 6);
  // A Viewpoint with more than 6 seed ideas gets exactly 6 steps.
  const plan = deriveDiscoveryPlan(
    'vp-x',
    [],
    ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
    '2026-01-01T00:00:00Z',
  );
  assert.equal(plan.steps.length, MAX_PLAN_STEPS);
  // And the tour's BuildFacts counts mirror those numbers.
  const src = readFileSync(join(SRC_ROOT, 'src', 'ui', 'tour-panel.ts'), 'utf8');
  assert.ok(src.includes('discovery ideas'), 'step-cap honesty note missing');
});

// ---------------------------------------------------------------------------
// Simplified creator
// ---------------------------------------------------------------------------

test('simplifiedConfigOverlay maps plain answers to config fields exactly', () => {
  for (const ct of SIMPLIFIED_CHANGE_TYPES) {
    const overlay = simplifiedConfigOverlay('subject x', ct.id);
    assert.deepEqual(overlay.seedConcepts, ['subject x']);
    const merged = { ...defaultViewpointConfig(), ...overlay };
    // Every merged config is a valid ViewpointConfig shape.
    assert.ok(Array.isArray(merged.seedConcepts));
  }
  assert.deepEqual(
    simplifiedConfigOverlay('s', 'unfamiliar-channels').unfamiliarityTarget,
    'strictly-unfamiliar',
  );
  assert.deepEqual(simplifiedConfigOverlay('s', 'unfamiliar-channels').explorationPercent, 0.5);
  assert.deepEqual(simplifiedConfigOverlay('s', 'source-spread').exposureBudget, {
    maxSingleChannelShare: 0.2,
    maxSingleNarrativeShare: 0.4,
  });
  assert.deepEqual(simplifiedConfigOverlay('s', 'wide-window').temporal, 'wide-window');
  assert.deepEqual(simplifiedConfigOverlay('s', 'primary-sources').sourceTypePreferences, [
    'primary-source',
    'official-source',
  ]);
  assert.deepEqual(simplifiedConfigOverlay('s', 'plain').unfamiliarityTarget, undefined);
});

// ---------------------------------------------------------------------------
// Contextual help
// ---------------------------------------------------------------------------

test('help topics cover the required terms with short explanations', () => {
  const required = [
    'viewpoint', 'viewstream', 'viewlist', 'coverage', 'autopsy',
    'time-machine', 'exposure-budget', 'assumption', 'narrative-cluster',
    'source-type', 'exploration', 'provenance',
  ] as const;
  for (const topic of required) {
    assert.ok(HELP_TOPIC_TEXT[topic], `missing help topic: ${topic}`);
    const sentences = HELP_TOPIC_TEXT[topic].split('.').filter((s) => s.trim().length > 0).length;
    assert.ok(sentences <= 3 && sentences >= 1, `${topic} explanation not 1-3 sentences`);
  }
  // Help text must not editorialize perspectives.
  const all = Object.values(HELP_TOPIC_TEXT).join(' ').toLowerCase();
  for (const word of ['balanced', 'extreme', 'moderate', 'accurate', 'correct']) {
    assert.ok(!all.includes(word), `help text editorializes: "${word}"`);
  }
});

// ---------------------------------------------------------------------------
// Architecture guards
// ---------------------------------------------------------------------------

test('content.ts does not import the test-viewpoints module directly', () => {
  // The deliberate promotion route is src/onboarding/demo-viewpoints.ts
  // (explicit opt-in only). content.ts must never touch test-viewpoints.
  const content = readFileSync(join(SRC_ROOT, 'src', 'extension', 'content.ts'), 'utf8');
  assert.ok(!content.includes('test-viewpoints'), 'content.ts references the test module');
});

test('demo-viewpoints.ts is only reachable through explicit user action (source audit)', () => {
  // The demo module must never be called from bootstrap or onboarding auto paths.
  const demoSrc = readFileSync(join(SRC_ROOT, 'src', 'onboarding', 'demo-viewpoints.ts'), 'utf8');
  assert.ok(demoSrc.includes('optInToDemos'), 'opt-in entry missing');
  assert.ok(!demoSrc.includes('bootstrap'), 'demo module hooks bootstrap');

  const onboardingSrc = readFileSync(join(SRC_ROOT, 'src', 'viewpoints', 'onboarding.ts'), 'utf8');
  assert.ok(!onboardingSrc.includes('demo-viewpoints'), 'auto-onboarding path seeds demos');
});

test('tour panel is Trusted-Types safe (no innerHTML)', () => {
  const files = ['ui/tour-panel.ts', 'ui/help-tooltips.ts', 'ui/onboarding-panel.ts'];
  for (const f of files) {
    const src = readFileSync(join(SRC_ROOT, 'src', f), 'utf8');
    assert.ok(!src.includes('innerHTML'), `${f} uses innerHTML`);
  }
});