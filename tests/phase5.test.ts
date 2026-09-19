/**
 * Phase 5 tests — Time Machine, feed autopsy, provenance chain,
 * portability, fork flow. All pure-logic tests: no DOM, no storage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import {
  classifyTimePeriod,
  comparePeriods,
  timePeriodBounds,
} from '../src/viewpoints/timemachine';
import { computeFeedAutopsy } from '../src/viewpoints/autopsy';
import { buildProvenanceChain } from '../src/viewpoints/provenance';
import {
  buildExport,
  parseImport,
  mergeById,
  mergeFeedback,
  EXPORT_VERSION,
} from '../src/viewpoints/portability';
import { forkViewpoint, newViewpoint } from '../src/model/viewpoint';
import { emptyUserProfile } from '../src/model/types';
import type { FeedCandidate } from '../src/model/types';
import { unknownClassification } from '../src/model/classification';

const HERE = dirname(__filename);

function candidate(over: Partial<FeedCandidate['candidate']>): FeedCandidate['candidate'] {
  return {
    id: 'v-test',
    title: 'Test video',
    channelId: 'ch-1',
    channelTitle: 'Channel One',
    description: '',
    publishedAt: '2026-06-01T00:00:00Z',
    durationSeconds: 600,
    topicIds: [],
    narrativeClusterIds: [],
    discoveredVia: 'seed-search',
    alsoSeenVia: [],
    ...over,
  };
}

function feedItem(c: FeedCandidate['candidate']): FeedCandidate {
  return {
    candidate: c,
    score: 1,
    components: {
      relevance: 0, sourceNovelty: 0, topicNovelty: 0, narrativeNovelty: 0,
      temporalDiversity: 0, controlledExploration: 0, repetition: 0,
      sourceConcentration: 0,
    },
    weighted: {
      relevance: 0, sourceNovelty: 0, topicNovelty: 0, narrativeNovelty: 0,
      temporalDiversity: 0, controlledExploration: 0, repetition: 0,
      sourceConcentration: 0,
    },
    reason: 'test',
    explanations: {
      relevance: '', sourceNovelty: '', topicNovelty: '', narrativeNovelty: '',
      temporalDiversity: '', controlledExploration: '', repetition: '',
      sourceConcentration: '',
    },
  };
}

const NOW = '2026-09-19T00:00:00Z';

function tmConfig() {
  return {
    anchorDate: '2026-06-01T00:00:00Z',
    preEventDays: 30,
    duringEventDays: 7,
    postEventDays: 30,
    retrospectiveAfterDays: 60,
  };
}

// ---------------------------------------------------------------------------
// Time Machine
// ---------------------------------------------------------------------------

test('classifyTimePeriod assigns periods relative to the user-authored anchor', () => {
  const cfg = tmConfig();
  // anchor = 2026-06-01. pre = [05-02, 06-01), during = [06-01, 06-08),
  // post = [06-08, 07-08), retrospective = [07-31, inf)
  const cases: [string, ReturnType<typeof classifyTimePeriod>][] = [
    ['2026-05-15T00:00:00Z', 'pre-event'],
    ['2026-06-01T00:00:00Z', 'during-event'],
    ['2026-06-07T23:00:00Z', 'during-event'],
    ['2026-06-10T00:00:00Z', 'post-event'],
    ['2026-08-05T00:00:00Z', 'retrospective'],
    ['2025-01-01T00:00:00Z', 'before-window'],
  ];
  for (const [date, expected] of cases) {
    const key = classifyTimePeriod(candidate({ publishedAt: date }), cfg);
    assert.equal(key, expected, `${date} should be ${expected}`);
  }
});

test('classifyTimePeriod is evidence-gated: unknown dates are unclassifiable, never guessed', () => {
  const cfg = tmConfig();
  assert.equal(classifyTimePeriod(candidate({ publishedAt: 'unknown' }), cfg), 'unclassifiable');
  assert.equal(classifyTimePeriod(candidate({ publishedAt: 'not a date' }), cfg), 'unclassifiable');
});

test('timePeriodBounds returns the four windows from the config', () => {
  const bounds = timePeriodBounds(tmConfig());
  assert.equal(bounds.length, 4);
  assert.deepEqual(
    bounds.map((b) => b.key),
    ['pre-event', 'during-event', 'post-event', 'retrospective'],
  );
  // during-event starts at the anchor
  assert.equal(bounds[1].from, Date.parse('2026-06-01T00:00:00Z'));
  // retrospective is open-ended
  assert.equal(bounds[3].to, null);
});

test('comparePeriods is descriptive and refuses causal language', () => {
  const cfg = tmConfig();
  const pool = [
    candidate({ id: 'a', publishedAt: '2026-05-15T00:00:00Z' }),
    candidate({ id: 'b', publishedAt: '2026-06-02T00:00:00Z' }),
    candidate({ id: 'c', publishedAt: '2026-06-20T00:00:00Z' }),
    candidate({ id: 'd', publishedAt: '2026-09-01T00:00:00Z' }),
    candidate({ id: 'e', publishedAt: 'unknown' }),
  ];
  const cmp = comparePeriods(pool, cfg, () => undefined);
  assert.equal(cmp.total, 5);
  assert.equal(cmp.unclassifiable, 1);
  const pre = cmp.profiles.find((p) => p.key === 'pre-event')!;
  assert.equal(pre.candidates.length, 1);
  // No causal vocabulary anywhere in the summary.
  assert.ok(!/because|caused?|led to|resulted in|due to/i.test(cmp.summary));
  assert.ok(/does not establish or imply any causal relationship/.test(cmp.summary));
});

test('comparePeriods includes empty periods honestly', () => {
  const cmp = comparePeriods([], tmConfig(), () => undefined);
  assert.equal(cmp.profiles.length, 6);
  for (const p of cmp.profiles) assert.equal(p.candidates.length, 0);
});

// ---------------------------------------------------------------------------
// Feed autopsy
// ---------------------------------------------------------------------------

test('feed autopsy reports all metric groups from recorded data', () => {
  const vp = newViewpoint('vp-1', 'Autopsy VP', 'd', NOW, {
    positiveTopicConstraints: ['topic-aero'],
  });
  const feed = [
    feedItem(candidate({ id: 'v1', channelId: 'ch-a', topicIds: ['topic-aero'], discoveredVia: 'seed-search' })),
    feedItem(candidate({ id: 'v2', channelId: 'ch-a', topicIds: ['topic-aero'], discoveredVia: 'seed-search' })),
    feedItem(candidate({ id: 'v3', channelId: 'ch-b', topicIds: ['topic-cooking'], discoveredVia: 'channel-uploads' })),
  ];
  const lookup = (videoId: string) => {
    if (videoId !== 'v3') return unknownClassification(videoId);
    const cls = unknownClassification(videoId);
    return { ...cls, sourceType: { ...cls.sourceType, value: 'publication' as const } };
  };
  const profile = emptyUserProfile(NOW);
  const autopsy = computeFeedAutopsy(
    feed, feed.map((f) => f.candidate), vp, profile, lookup,
    { feedSize: 3, poolSize: 3, rules: [], satisfied: 0, violated: 0, channelsFeatured: [], narrativesFeatured: [] },
    NOW,
  );
  const ids = autopsy.metrics.map((m) => m.id);
  for (const expected of [
    'source-concentration', 'channel-concentration', 'narrative-concentration',
    'topic-distribution', 'source-type-distribution', 'familiarity',
    'temporal-distribution', 'exploration-percent', 'budget-compliance',
    'pool-vs-feed',
  ]) {
    assert.ok(ids.includes(expected), `missing metric ${expected}`);
  }
  // Exploration percent: 1 of 3 items (v3) is outside positive topic constraints.
  const exploration = autopsy.metrics.find((m) => m.id === 'exploration-percent')!;
  assert.ok(exploration.value.includes('33%'), `exploration value: ${exploration.value}`);
});

test('feed autopsy on empty feed reports emptiness honestly', () => {
  const autopsy = computeFeedAutopsy(
    [], [], null, emptyUserProfile(NOW), () => undefined, null, NOW,
  );
  assert.equal(autopsy.metrics.length, 0);
  assert.ok(/empty/i.test(autopsy.summary));
});

// ---------------------------------------------------------------------------
// Provenance chain
// ---------------------------------------------------------------------------

test('provenance chain traces all five links for an included item', () => {
  const vp = newViewpoint('vp-1', 'Chain VP', 'd', NOW, {
    positiveTopicConstraints: ['topic-aero'],
  });
  const c = candidate({ id: 'v1', topicIds: ['topic-aero'] });
  const item = feedItem(c);
  const chain = buildProvenanceChain({
    item,
    viewpoint: vp,
    classification: unknownClassification('v1'),
    poolProvenance: {
      provider: 'youtube-web',
      method: 'seed-search',
      seed: 'aerospace engineering',
      discoveredAt: NOW,
      viewpointId: 'vp-1',
      alsoSeenVia: [{ provider: 'youtube-web', method: 'channel-uploads', seed: 'ch-2' }],
    },
    inclusion: { basis: 'main-walk' },
  });
  assert.equal(chain.videoId, 'v1');
  assert.ok(chain.viewpointRule.statement.includes('Chain VP'));
  assert.ok(chain.viewpointRule.passed.some((p) => p.includes('positive topic constraint')));
  assert.ok(chain.discovery!.statement.includes('seed-search'));
  assert.ok(chain.discovery!.statement.includes('aerospace engineering'));
  assert.ok(chain.classification!.statement.includes('origin'));
  assert.ok(chain.ranking.statement.includes('every component'));
  assert.ok(chain.inclusion.statement.includes('main walk'));
});

test('provenance chain says unknown where evidence is missing, never invents', () => {
  const item = feedItem(candidate({ id: 'vX' }));
  const chain = buildProvenanceChain({
    item,
    viewpoint: null,
    classification: undefined,
    poolProvenance: null,
    inclusion: null,
  });
  assert.ok(chain.viewpointRule.statement.includes('No Viewpoint'));
  assert.ok(chain.discovery!.statement.includes('was not recorded'));
  assert.equal(chain.classification, null);
  assert.ok(chain.inclusion.basis.includes('unknown'));
});

// ---------------------------------------------------------------------------
// Portability
// ---------------------------------------------------------------------------

test('export v1 includes lenses and preferences, excludes private data by default', () => {
  const vp1 = newViewpoint('vp-1', 'One', 'd', NOW);
  const vp2 = newViewpoint('vp-2', 'Two', 'd', NOW);
  const doc = buildExport(
    {
      viewpoints: [vp1, vp2],
      viewlists: [],
      classificationOverrides: [],
      preferences: { activeViewpointId: 'vp-1', fixtureMode: false },
      feedback: [{ id: 'fb-1', videoId: 'v1', kind: 'watched', capturedAt: NOW }],
    },
    {},
    NOW,
  );
  assert.equal(doc.format, 'metube-export');
  assert.equal(doc.version, EXPORT_VERSION);
  assert.equal(doc.viewpoints.length, 2);
  assert.equal(doc.feedback, undefined);
  assert.ok(doc.contents.includes('Feedback history excluded'));
});

test('export v1 can include feedback when explicitly selected', () => {
  const doc = buildExport(
    {
      viewpoints: [],
      viewlists: [],
      classificationOverrides: [],
      preferences: { activeViewpointId: null, fixtureMode: true },
      feedback: [{ id: 'fb-1', videoId: 'v1', kind: 'watched', capturedAt: NOW }],
    },
    { includeFeedback: true },
    NOW,
  );
  assert.equal(doc.feedback!.length, 1);
  assert.ok(doc.contents.includes('explicitly selected'));
});

test('parseImport rejects wrong format, wrong version, and malformed sections', () => {
  assert.equal(parseImport(null).ok, false);
  assert.equal(parseImport({ format: 'other', version: 1 }).ok, false);
  assert.equal(parseImport({ format: 'metube-export', version: 99 }).ok, false);
  const bad = parseImport({ format: 'metube-export', version: 1, viewpoints: 'nope' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.error.message.includes('viewpoints'));
});

test('parseImport round-trips a valid document', () => {
  const vp = newViewpoint('vp-1', 'One', 'd', NOW);
  const doc = buildExport(
    {
      viewpoints: [vp],
      viewlists: [{ id: 'vl-1', title: 'L', description: '', viewpointIds: ['vp-1'], createdAt: NOW, updatedAt: NOW }],
      classificationOverrides: [],
      preferences: { activeViewpointId: 'vp-1', fixtureMode: false },
      feedback: [],
    },
    {},
    NOW,
  );
  const parsed = parseImport(JSON.parse(JSON.stringify(doc)));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.viewpoints.length, 1);
    assert.equal(parsed.value.viewlists.length, 1);
    assert.equal(parsed.value.preferences.activeViewpointId, 'vp-1');
    assert.equal(parsed.value.feedback.length, 0);
  }
});

test('mergeById honors both explicit modes and never drops one-side-only records', () => {
  const mine = [{ id: 'a', v: 'mine' }, { id: 'b', v: 'mine' }];
  const imported = [{ id: 'b', v: 'theirs' }, { id: 'c', v: 'theirs' }];
  const keep = mergeById(mine, imported, 'keep-mine');
  assert.deepEqual(keep.map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(keep.find((x) => x.id === 'b')!.v, 'mine');
  const wins = mergeById(mine, imported, 'import-wins');
  assert.deepEqual(wins.map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(wins.find((x) => x.id === 'b')!.v, 'theirs');
});

test('mergeFeedback deduplicates by id and never drops records', () => {
  const mine = [{ id: 'fb-1', videoId: 'v1', kind: 'watched' as const, capturedAt: NOW }];
  const theirs = [
    { id: 'fb-1', videoId: 'v1', kind: 'watched' as const, capturedAt: NOW },
    { id: 'fb-2', videoId: 'v2', kind: 'saved' as const, capturedAt: NOW },
  ];
  const merged = mergeFeedback(mine, theirs);
  assert.deepEqual(merged.map((f) => f.id), ['fb-1', 'fb-2']);
});

// ---------------------------------------------------------------------------
// Fork flow
// ---------------------------------------------------------------------------

test('forkViewpoint duplicates and records lineage + the changed assumption verbatim', () => {
  const source = newViewpoint('vp-src', 'Source', 'd', NOW, { explorationPercent: 0.1 });
  const fork = forkViewpoint(source, 'vp-fork', 'Fork', 'changed explorationPercent to 0.4', NOW);
  assert.equal(fork.id, 'vp-fork');
  assert.equal(fork.config.explorationPercent, 0.1); // config copied; the CHANGE is applied by the caller
  assert.equal(fork.forkedFrom!.viewpointId, 'vp-src');
  assert.equal(fork.forkedFrom!.viewpointTitle, 'Source');
  assert.equal(fork.forkedFrom!.changedAssumption, 'changed explorationPercent to 0.4');
  assert.ok(fork.forkedFrom!.forkedAt);
  // source is untouched
  assert.equal(source.forkedFrom, undefined);
});

test('starter viewpoints exist, are generic, and are not politically prescriptive', () => {
  // Import through require to keep the CJS test build simple.
  const { starterViewpoints } = require('../src/viewpoints/starters.js') as
    typeof import('../src/viewpoints/starters');
  const starters = starterViewpoints();
  assert.ok(starters.length >= 4, 'expected several starters');
  const allText = starters
    .map((v) => `${v.title} ${v.description} ${JSON.stringify(v.config)}`)
    .join(' ')
    .toLowerCase();
  // Generic-mechanism language present; editability stated.
  assert.ok(/edit/i.test(starters[0].description));
  // No political prescription anywhere in the starter set.
  for (const banned of ['left', 'right', 'liberal', 'conservative', 'counter political', 'counter-viewpoint']) {
    assert.ok(!allText.includes(banned), `starter set must not mention "${banned}"`);
  }
  // Every starter is an ordinary viewpoint: fully inspectable config.
  for (const s of starters) {
    assert.ok(s.config);
    assert.equal(s.enabled, true);
  }
});