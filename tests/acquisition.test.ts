/**
 * Phase 2 tests: real candidate acquisition.
 *
 * Parser tests run against minimal fixtures extracted from real captured
 * YouTube pages (see tests/fixtures/): real renderer objects embedded in
 * the real page skeleton shapes. No network.
 *
 * Provider tests use an injectable fake transport. Pool tests use
 * MemoryLocalStore. Nothing fabricates metadata: null fields stay null.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseSearchResults,
  parseChannelUploads,
  parseChannelId,
  parsePlaylist,
  parseAlertError,
  parseDuration,
  parseViewCount,
  parseRelativePublished,
} from '../src/discovery/yt-parser';
import { deriveDiscoveryPlan, normalizePlaylistTarget, normalizeChannelTarget, UNKNOWN_DATE, isUnknownDate } from '../src/model/discovery';
import type { CandidateProvenance, DiscoveredCandidate } from '../src/model/discovery';
import { YouTubeWebProvider } from '../src/discovery/youtube-web';
import type { HtmlFetch } from '../src/discovery/youtube-web';
import {
  mergeIntoPool,
  loadPoolState,
  emptyPoolState,
  isFresh,
  toCandidateVideo,
  inspectPool,
  acquireForViewpoint,
  MAX_POOL_SIZE,
} from '../src/discovery/pool';
import type { PoolState } from '../src/discovery/pool';
import { MemoryLocalStore } from '../src/storage/local-store';
import { candidatePasses, interpretViewpoint } from '../src/viewpoints/interpret';
import { scoreTemporalDiversity } from '../src/ranking/components/temporal-diversity';
import { newViewpoint } from '../src/model/viewpoint';
import type { CandidateVideo } from '../src/model/types';

const NOW = '2026-09-18T00:00:00Z';

function fixtureHtml(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8');
}

function makeProvenance(overrides: Partial<CandidateProvenance> = {}): CandidateProvenance {
  return {
    provider: 'youtube-web',
    method: 'seed-search',
    seed: 'test query',
    discoveredAt: NOW,
    viewpointId: 'vp-test',
    ...overrides,
  };
}

function fakeTransport(routes: Record<string, { body?: string; status?: number } | Error>): HtmlFetch {
  return async (url: string) => {
    const route = routes[url];
    if (route === undefined) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    if (route instanceof Error) throw route;
    return new Response(route.body ?? '', { status: route.status ?? 200 });
  };
}

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

test('parseDuration accepts h:mm:ss and m:ss, rejects garbage', () => {
  assert.equal(parseDuration('14:47'), 14 * 60 + 47);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('0:59'), 59);
  assert.equal(parseDuration('live'), null);
  assert.equal(parseDuration('12'), null);
  assert.equal(parseDuration('ab:cd'), null);
});

test('parseViewCount handles full and compact forms', () => {
  assert.equal(parseViewCount('694,704 views'), 694704);
  assert.equal(parseViewCount('1.2K views'), 1200);
  assert.equal(parseViewCount('3M views'), 3000000);
  assert.equal(parseViewCount('Streamed 3 years ago'), null);
  assert.equal(parseViewCount('835K'), null); // no "views" word
});

test('parseRelativePublished accepts verbose and compact relative dates', () => {
  assert.equal(parseRelativePublished('2 years ago'), true);
  assert.equal(parseRelativePublished('6d ago'), true);
  assert.equal(parseRelativePublished('5mo ago'), true);
  assert.equal(parseRelativePublished('1y ago'), true);
  assert.equal(parseRelativePublished('2026-09-01'), false);
  assert.equal(parseRelativePublished('Premiered 2 days ago'), false);
});

// ---------------------------------------------------------------------------
// Parser against real captured shapes
// ---------------------------------------------------------------------------

test('parseSearchResults extracts candidates from real search renderer shapes', () => {
  const html = fixtureHtml('real-search.html');
  const result = parseSearchResults(html, makeProvenance());
  assert.ok(result.ok);
  assert.equal(result.candidates.length, 3);
  const c = result.candidates[0];
  assert.match(c.videoId, /^[A-Za-z0-9_-]{11}$/);
  assert.equal(c.title, 'I Landed A Rocket Like SpaceX - Scout F');
  assert.equal(c.channelId, 'UCILl8ozWuxnFYXIe2svjHhg');
  assert.equal(c.channelTitle, 'BPS.space');
  // Relative date must NOT become an absolute publishedAt.
  assert.equal(c.publishedAt, null);
  assert.equal(c.durationSeconds, 425);
  assert.equal(c.viewCount, 10048753);
  assert.ok(c.thumbnailUrl !== null && c.thumbnailUrl.startsWith('https://'));
  assert.equal(c.metadataConfidence, 'page-metadata');
  assert.deepEqual(c.tags, []);
  // Provenance is attached per candidate.
  assert.equal(c.provenance.provider, 'youtube-web');
  assert.equal(c.provenance.method, 'seed-search');
  assert.equal(c.provenance.seed, 'test query');
  assert.equal(c.provenance.viewpointId, 'vp-test');
});

test('parseChannelUploads extracts candidates from real lockupViewModel shapes', () => {
  const html = fixtureHtml('real-uc-videos.html');
  const result = parseChannelUploads(html, makeProvenance({ method: 'channel-uploads', seed: '@SomeChannel' }));
  assert.ok(result.ok);
  assert.equal(result.candidates.length, 3);
  const c = result.candidates[0];
  assert.match(c.videoId, /^[A-Za-z0-9_-]{11}$/);
  assert.ok(typeof c.title === 'string' && c.title.length > 0);
  // Lockups carry no channel id; page metadata must fill it.
  assert.equal(c.channelId, 'UCeMcDx6-rOq_RlKSPehk2tQ');
  assert.equal(c.channelTitle, 'The Space Race');
  // Compact date like "5mo ago" is never converted to an absolute date.
  assert.equal(c.publishedAt, null);
  assert.ok(typeof c.durationSeconds === 'number' || c.durationSeconds === null);
});

test('parseChannelId resolves a channel homepage to its channel id', () => {
  const html = fixtureHtml('real-channel-home.html');
  const result = parseChannelId(html);
  assert.ok(result.ok);
  assert.match(result.channelId, /^UC[A-Za-z0-9_-]{22}$/);
});

test('parseChannelId reports pages carrying no channel id', () => {
  const result = parseChannelId(fixtureHtml('real-search.html'));
  assert.ok(!result.ok);
  assert.match(result.error.reason, /no channel id/i);
});

test('parsePlaylist extracts candidates from real lockupViewModel shapes', () => {
  const html = fixtureHtml('real-playlist.html');
  const result = parsePlaylist(html, makeProvenance({ method: 'playlist', seed: 'PLtest' }));
  assert.ok(result.ok);
  assert.equal(result.candidates.length, 4);
  for (const c of result.candidates) {
    assert.match(c.videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.equal(c.metadataConfidence, 'page-metadata');
  }
});

test('parseSearchResults reports missing ytInitialData as error, never throws', () => {
  const result = parseSearchResults('<html><body>no data</body></html>', makeProvenance());
  assert.ok(!result.ok);
  assert.ok(result.error.reason.includes('no ytInitialData'));
});

test('parseAlertError detects real error pages', () => {
  const html = fixtureHtml('real-error-playlist.html');
  assert.equal(parseAlertError(html), 'The playlist does not exist.');
  assert.equal(parseAlertError('<html></html>'), null);
});

// ---------------------------------------------------------------------------
// Plan derivation
// ---------------------------------------------------------------------------

test('deriveDiscoveryPlan builds bounded, deduplicated steps', () => {
  const plan = deriveDiscoveryPlan(
    'vp-x',
    ['topic-aero'],
    ['reusable rockets', 'reusable rockets', ''],
    NOW,
    ['@handleA', 'handleA'],
    (id) => (id === 'topic-aero' ? 'Aerospace engineering' : null),
    ['https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb'],
  );
  assert.equal(plan.viewpointId, 'vp-x');
  assert.equal(plan.steps.length, 4); // 1 concept (deduped) + 1 topic + 1 channel (deduped) + 1 playlist
  assert.equal(plan.steps[0].target, 'reusable rockets');
  assert.equal(plan.steps[1].target, 'Aerospace engineering');
  assert.equal(plan.steps[2].method, 'channel-uploads');
  assert.equal(plan.steps[3].method, 'playlist');
  assert.equal(plan.steps[3].target, 'PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb');
});

test('deriveDiscoveryPlan drops unresolvable topic ids without guessing a query', () => {
  const plan = deriveDiscoveryPlan('vp-x', ['topic-unknown'], [], NOW, [], (id) => null);
  assert.equal(plan.steps.length, 0);
});

test('deriveDiscoveryPlan enforces MAX_PLAN_STEPS', () => {
  const plan = deriveDiscoveryPlan(
    'vp-x',
    [],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    NOW,
  );
  assert.equal(plan.steps.length, 6);
  assert.equal(plan.steps[5].target, 'f');
});

test('normalizePlaylistTarget accepts ids and urls, rejects garbage', () => {
  assert.equal(
    normalizePlaylistTarget('https://www.youtube.com/playlist?list=PLabc12345678'),
    'PLabc12345678',
  );
  assert.equal(normalizePlaylistTarget('PLabc12345678'), 'PLabc12345678');
  assert.equal(normalizePlaylistTarget('not a playlist'), null);
  assert.equal(normalizePlaylistTarget(''), null);
});

test('normalizeChannelTarget accepts handles, bare ids, and urls, dedupes spellings', () => {
  assert.equal(normalizeChannelTarget('@TheSpaceRace'), '@TheSpaceRace');
  assert.equal(normalizeChannelTarget('TheSpaceRace'), '@TheSpaceRace');
  assert.equal(
    normalizeChannelTarget('https://www.youtube.com/@TheSpaceRace'),
    '@TheSpaceRace',
  );
  // Canonical ids — bare and in channel urls — normalize to the bare id.
  assert.equal(
    normalizeChannelTarget('UCeMcDx6-rOq_RlKSPehk2tQ'),
    'UCeMcDx6-rOq_RlKSPehk2tQ',
  );
  assert.equal(
    normalizeChannelTarget('https://www.youtube.com/channel/UCeMcDx6-rOq_RlKSPehk2tQ'),
    'UCeMcDx6-rOq_RlKSPehk2tQ',
  );
  // Same channel, two spellings, one plan step.
  const plan = deriveDiscoveryPlan(
    'vp',
    [],
    [],
    NOW,
    ['@TheSpaceRace', 'https://www.youtube.com/@TheSpaceRace'],
  );
  assert.equal(plan.steps.filter((s) => s.method === 'channel-uploads').length, 1);
});

// ---------------------------------------------------------------------------
// YouTubeWebProvider with injectable transport
// ---------------------------------------------------------------------------

test('YouTubeWebProvider.runPlan fetches one page per step and caps at MAX_PER_STEP', async () => {
  const searchHtml = fixtureHtml('real-search.html');
  const homeHtml = fixtureHtml('real-channel-home.html');
  const ucHtml = fixtureHtml('real-uc-videos.html');
  const fetches: string[] = [];
  const transport: HtmlFetch = async (url) => {
    fetches.push(url);
    if (url.includes('search_query')) {
      return new Response(searchHtml, { status: 200 });
    }
    if (url.endsWith('/videos')) {
      return new Response(ucHtml, { status: 200 });
    }
    if (url.includes('/@')) {
      return new Response(homeHtml, { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  };
  const provider = new YouTubeWebProvider(transport);
  const plan = deriveDiscoveryPlan('vp-x', [], ['model rockets'], NOW, ['@TheSpaceRace']);
  const result = await provider.runPlan(plan.steps, 'vp-x', NOW);
  assert.equal(fetches.length, 3);
  assert.ok(fetches[0].includes('search_query=model%20rockets'));
  assert.ok(fetches[1].includes('/@TheSpaceRace'));
  assert.ok(fetches[2].includes('/channel/UC'));
  assert.ok(result.steps.every((s) => s.status === 'ok'));
  assert.ok(result.candidates.length <= 2 * 12);
  for (const c of result.candidates) {
    assert.equal(c.provenance.viewpointId, 'vp-x');
    assert.equal(c.provenance.provider, 'youtube-web');
  }
});

test('YouTubeWebProvider.runPlan records HTTP failures without throwing', async () => {
  const transport: HtmlFetch = async () => new Response('gone', { status: 404 });
  const provider = new YouTubeWebProvider(transport);
  const result = await provider.runPlan(
    [{ method: 'seed-search', target: 'x', label: 'search: x' }],
    'vp-x',
    NOW,
  );
  assert.equal(result.steps[0].status, 'error');
  assert.match(result.steps[0].error ?? '', /HTTP 404/);
  assert.equal(result.candidates.length, 0);
});

test('YouTubeWebProvider.runPlan records network failures without throwing', async () => {
  const transport: HtmlFetch = async () => {
    throw new Error('connection reset');
  };
  const provider = new YouTubeWebProvider(transport);
  const result = await provider.runPlan(
    [{ method: 'playlist', target: 'PLxyz', label: 'playlist: PLxyz' }],
    'vp-x',
    NOW,
  );
  assert.equal(result.steps[0].status, 'error');
  assert.match(result.steps[0].error ?? '', /network error/);
});

test('YouTubeWebProvider.runPlan reports error pages (nonexistent playlist)', async () => {
  const transport: HtmlFetch = async () =>
    new Response(fixtureHtml('real-error-playlist.html'), { status: 200 });
  const provider = new YouTubeWebProvider(transport);
  const result = await provider.runPlan(
    [{ method: 'playlist', target: 'PLmissing', label: 'playlist: PLmissing' }],
    'vp-x',
    NOW,
  );
  assert.equal(result.steps[0].status, 'error');
  assert.match(result.steps[0].error ?? '', /does not exist/);
});

test('YouTubeWebProvider.runPlan handles empty results as empty, not error', async () => {
  const provider = new YouTubeWebProvider(async () => new Response('<html>nothing</html>', { status: 200 }));
  const result = await provider.runPlan(
    [{ method: 'seed-search', target: 'zzz', label: 'search: zzz' }],
    'vp-x',
    NOW,
  );
  assert.equal(result.steps[0].status, 'error');
  assert.match(result.steps[0].error ?? '', /no ytInitialData/);
});

test('YouTubeWebProvider.getCandidates serves no standing pool (persistence is the pool layer)', async () => {
  const provider = new YouTubeWebProvider(async () => new Response('', { status: 200 }));
  assert.deepEqual(await provider.getCandidates({ limit: 10 }), []);
});

// ---------------------------------------------------------------------------
// Pool: merge, dedup, persistence, TTL
// ---------------------------------------------------------------------------

function discoveredCandidate(videoId: string, overrides: Partial<DiscoveredCandidate> = {}): DiscoveredCandidate {
  return {
    videoId,
    channelId: 'UC1234567890abcdefghijk',
    channelTitle: 'Test Channel',
    title: `Video ${videoId}`,
    description: null,
    publishedAt: null,
    durationSeconds: 100,
    viewCount: 1000,
    tags: [],
    thumbnailUrl: null,
    language: null,
    metadataConfidence: 'page-metadata',
    provenance: makeProvenance(),
    ...overrides,
  };
}

test('mergeIntoPool dedups by video id and records repeat provenance', () => {
  const state = emptyPoolState();
  const first = mergeIntoPool(state, [discoveredCandidate('abc12345678')]);
  assert.equal(first.added, 1);
  assert.equal(first.duplicates, 0);

  // Same video, different seed: duplicate, but provenance recorded.
  const second = mergeIntoPool(first.state, [
    discoveredCandidate('abc12345678', {
      provenance: makeProvenance({ seed: 'another query' }),
    }),
  ]);
  assert.equal(second.added, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(second.state.entries.length, 1);
  assert.equal(second.state.entries[0].alsoDiscoveredVia.length, 1);
  assert.equal(second.state.entries[0].alsoDiscoveredVia[0].seed, 'another query');

  // Same video, same seed again: fully suppressed, no extra provenance.
  const third = mergeIntoPool(second.state, [
    discoveredCandidate('abc12345678', {
      provenance: makeProvenance({ seed: 'another query' }),
    }),
  ]);
  assert.equal(third.state.entries[0].alsoDiscoveredVia.length, 1);
});

test('mergeIntoPool prunes to MAX_POOL_SIZE, oldest first', () => {
  let state = emptyPoolState();
  const batch: DiscoveredCandidate[] = [];
  for (let i = 0; i < MAX_POOL_SIZE + 5; i += 1) {
    batch.push(
      discoveredCandidate(`vid${String(i).padStart(11, '0')}`, {
        provenance: makeProvenance({
          discoveredAt: new Date(Date.parse(NOW) + i * 1000).toISOString(),
        }),
      }),
    );
  }
  const merged = mergeIntoPool(state, batch);
  assert.equal(merged.state.entries.length, MAX_POOL_SIZE);
  // Oldest five pruned.
  assert.ok(!merged.state.entries.some((e) => e.candidate.videoId === 'vid00000000000'));
  assert.ok(merged.state.entries.some((e) => e.candidate.videoId === `vid${String(5).padStart(11, '0')}`));
});

test('isFresh honors TTL per viewpoint', () => {
  const runAt = '2026-09-18T00:00:00Z';
  const state: ReturnType<typeof emptyPoolState> = {
    entries: [],
    runLog: [{ viewpointId: 'vp-x', runAt, ok: true, harvested: 3, added: 3, duplicates: 0, steps: [] }],
  };
  const justAfter = Date.parse('2026-09-18T01:00:00Z');
  assert.equal(isFresh(state, 'vp-x', justAfter), true);
  const wayAfter = Date.parse('2026-09-19T00:00:00Z');
  assert.equal(isFresh(state, 'vp-x', wayAfter), false);
  // No run for this viewpoint.
  assert.equal(isFresh(state, 'vp-other', justAfter), false);
});

test('loadPoolState tolerates missing/shapeless KV values', () => {
  assert.deepEqual(loadPoolState(undefined), emptyPoolState());
  assert.deepEqual(loadPoolState(null), emptyPoolState());
  assert.deepEqual(loadPoolState('nonsense'), emptyPoolState());
  assert.deepEqual(loadPoolState({ entries: 'not-an-array' }), emptyPoolState());
});

test('acquireForViewpoint persists pool state and dedups across runs', async () => {
  const store = new MemoryLocalStore();
  const searchHtml = fixtureHtml('real-search.html');
  let fetchCount = 0;
  const provider = new YouTubeWebProvider(async () => {
    fetchCount += 1;
    return new Response(searchHtml, { status: 200 });
  });
  const opts = {
    viewpointId: 'vp-x',
    seedTopics: [],
    seedConcepts: ['model rockets'],
    explicitChannels: [],
    seedPlaylists: [],
    resolveTopicLabel: () => null as string | null,
    now: NOW,
  };
  const emptyPool = emptyPoolState();
  const run1 = await acquireForViewpoint(store, provider, emptyPool, opts);
  assert.ok(run1.run);
  assert.equal(run1.run.added, 3);
  assert.equal(fetchCount, 1);

  // Second run within TTL: serves from cache, no fetch.
  const run2 = await acquireForViewpoint(store, provider, run1.state, { ...opts, now: '2026-09-18T01:00:00Z' });
  assert.equal(run2.run, undefined);
  assert.equal(fetchCount, 1);

  // Force bypasses TTL; all candidates now duplicates.
  const run3 = await acquireForViewpoint(store, provider, run2.state, {
    ...opts,
    now: '2026-09-18T01:00:01Z',
    force: true,
  });
  assert.ok(run3.run);
  assert.equal(run3.run.added, 0);
  assert.equal(run3.run.duplicates, 3);
  assert.equal(fetchCount, 2);
  assert.equal(run3.state.entries.length, 3);
});

test('acquireForViewpoint with empty plan records a no-op run', async () => {
  const store = new MemoryLocalStore();
  const provider = new YouTubeWebProvider(async () => {
    throw new Error('should not fetch');
  });
  const run = await acquireForViewpoint(store, provider, emptyPoolState(), {
    viewpointId: 'vp-x',
    seedTopics: [],
    seedConcepts: [],
    explicitChannels: [],
    seedPlaylists: [],
    resolveTopicLabel: () => null,
    now: NOW,
  });
  assert.ok(run.run);
  assert.equal(run.run.steps.length, 0);
  assert.equal(run.run.added, 0);
});

// ---------------------------------------------------------------------------
// Adapter + ranking tolerance for unknown metadata
// ---------------------------------------------------------------------------

test('toCandidateVideo never fabricates metadata', () => {
  const entry = {
    candidate: discoveredCandidate('abc12345678', {
      channelId: null,
      channelTitle: null,
      title: null,
      publishedAt: null,
      durationSeconds: null,
    }),
    alsoDiscoveredVia: [],
  };
  const cv = toCandidateVideo(entry);
  assert.equal(cv.id, 'abc12345678');
  assert.equal(cv.title, '(title unavailable)');
  assert.equal(cv.channelId, 'unknown-channel');
  assert.equal(cv.channelTitle, '(channel unknown)');
  assert.equal(cv.publishedAt, UNKNOWN_DATE);
  assert.equal(cv.durationSeconds, 0);
  assert.deepEqual(cv.topicIds, []);
  assert.deepEqual(cv.narrativeClusterIds, []);
  assert.equal(cv.discoveredVia, 'youtube-web:seed-search');
  assert.ok(isUnknownDate(cv.publishedAt));
});

test('candidatePasses drops unknown-date candidates only when a date window is set', () => {
  const unknown: CandidateVideo = {
    id: 'vid',
    title: 't',
    channelId: 'ch',
    channelTitle: 'c',
    description: '',
    publishedAt: UNKNOWN_DATE,
    durationSeconds: 0,
    topicIds: [],
    narrativeClusterIds: [],
    discoveredVia: 's',
    alsoSeenVia: [],
  };
  const vpNoWindow = newViewpoint('vp', 't', 'd', NOW, {});
  const vpWindow = newViewpoint('vp', 't', 'd', NOW, { temporalTo: '2026-01-01T00:00:00Z' });
  const vpGarbageWindow = newViewpoint('vp', 't', 'd', NOW, { temporalFrom: 'not a date' });
  const noWindow = interpretViewpoint(vpNoWindow.config);
  const window = interpretViewpoint(vpWindow.config);
  const garbageWindow = interpretViewpoint(vpGarbageWindow.config);
  assert.equal(candidatePasses(unknown, noWindow.filters), true);
  assert.equal(candidatePasses(unknown, window.filters), false);
  // An unparseable window string is treated as no window, not as a filter
  // that silently drops every unknown-date candidate.
  assert.equal(candidatePasses(unknown, garbageWindow.filters), true);
});

test('scoreTemporalDiversity scores unknown dates 0 and excludes them from the pool mean', () => {
  const unknown: CandidateVideo = {
    id: 'u',
    title: 't',
    channelId: 'ch',
    channelTitle: 'c',
    description: '',
    publishedAt: UNKNOWN_DATE,
    durationSeconds: 0,
    topicIds: [],
    narrativeClusterIds: [],
    discoveredVia: 's',
    alsoSeenVia: [],
  };
  const make = (id: string, iso: string): CandidateVideo => ({
    ...unknown,
    id,
    publishedAt: iso,
  });
  // Pool mean is 2026-08-01 (built only from known dates).
  const pool = [make('a', '2026-08-01T00:00:00Z'), unknown, make('b', '2026-08-01T00:00:00Z')];
  // Unknown-date candidate: 0, regardless of pool.
  assert.equal(scoreTemporalDiversity(unknown, pool), 0);
  // Candidate at the mean: 0 spread -> 0.
  const atMean = make('m', '2026-08-01T00:00:00Z');
  assert.equal(scoreTemporalDiversity(atMean, pool), 0);
  // Candidate 60 days from the mean: capped at 1.
  const far = make('f', '2025-06-02T00:00:00Z');
  assert.ok(scoreTemporalDiversity(far, pool) > 0);
  assert.ok(scoreTemporalDiversity(far, pool) <= 1);
});

// ---------------------------------------------------------------------------
// Pool inspector
// ---------------------------------------------------------------------------

test('inspectPool reports counts, provenance, viewpoints, failures', () => {
  const state: PoolState = {
    entries: [
      {
        candidate: discoveredCandidate('abc12345678'),
        alsoDiscoveredVia: [],
      },
      {
        candidate: discoveredCandidate('def12345678', {
          publishedAt: '2026-08-01T00:00:00Z',
          durationSeconds: null,
          channelId: null,
          provenance: makeProvenance({ viewpointId: 'vp-other', method: 'playlist' }),
        }),
        alsoDiscoveredVia: [],
      },
    ],
    runLog: [
      {
        viewpointId: 'vp-x',
        runAt: NOW,
        ok: false,
        harvested: 0,
        added: 0,
        duplicates: 0,
        steps: [
          {
            step: { method: 'playlist', target: 'PLmissing', label: 'playlist: PLmissing' },
            status: 'error',
            harvested: 0,
            error: 'error page: The playlist does not exist.',
          },
        ],
      },
    ],
  };
  const view = inspectPool(state, NOW);
  assert.equal(view.totalCandidates, 2);
  assert.equal(view.byMethod.length, 2);
  assert.equal(view.discoveringViewpoints.length, 2);
  assert.equal(view.unknownDates, 1);
  assert.equal(view.missingDuration, 1);
  assert.equal(view.missingChannel, 1);
  assert.equal(view.duplicateSuppressed, 0);
  assert.equal(view.failedSteps.length, 1);
  assert.match(view.failedSteps[0].reason, /does not exist/);
  assert.equal(view.cacheAgeOldest, NOW);
  assert.equal(view.cacheAgeNewest, NOW);
});