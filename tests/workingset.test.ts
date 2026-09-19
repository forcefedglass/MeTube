/**
 * Retrieval isolation tests: the Viewpoint working-set boundary.
 *
 * The rule under test (FROZEN): a candidate composes into a Viewpoint's
 * Viewstream exactly when recorded provenance ties it to that Viewpoint —
 * original discovery or later re-surfacing. Global catalog existence
 * alone never qualifies a candidate.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CandidateProvenance, DiscoveredCandidate } from '../src/model/discovery';
import type { PoolEntry } from '../src/discovery/pool';
import { mergeIntoPool, emptyPoolState } from '../src/discovery/pool';
import {
  entryInWorkingSet,
  viewpointWorkingSet,
  workingSetDiagnostics,
} from '../src/viewpoints/workingset';
import { toCandidateVideo } from '../src/discovery/pool';
import { assembleViewstream } from '../src/viewpoints/viewstream';
import { trainingFeedbackFor } from '../src/viewpoints/firewall';
import { newViewpoint } from '../src/model/viewpoint';
import { emptyUserProfile } from '../src/model/types';
import type { CandidateVideo } from '../src/model/types';

const NOW = '2026-09-20T00:00:00Z';

function provenance(viewpointId: string | null, seed = 'test query'): CandidateProvenance {
  return {
    provider: 'youtube-web',
    method: 'seed-search',
    seed,
    discoveredAt: NOW,
    viewpointId,
  };
}

function discovered(
  videoId: string,
  viewpointId: string | null,
  overrides: Partial<DiscoveredCandidate> = {},
): DiscoveredCandidate {
  return {
    videoId,
    channelId: `UC-${videoId}`,
    channelTitle: `Channel ${videoId}`,
    title: `Video ${videoId}`,
    description: null,
    publishedAt: null,
    durationSeconds: 100,
    viewCount: 1000,
    tags: [],
    thumbnailUrl: null,
    language: null,
    metadataConfidence: 'page-metadata',
    provenance: provenance(viewpointId),
    ...overrides,
  };
}

/** Build a pool through the real merge path so provenance recording is
 * exercised exactly as production does it. */
function poolFrom(batches: DiscoveredCandidate[][]): { entries: PoolEntry[] } {
  let state = emptyPoolState();
  for (const batch of batches) {
    state = mergeIntoPool(state, batch).state;
  }
  return { entries: state.entries };
}

// ---------------------------------------------------------------------------
// 1. Viewpoint A candidates do not leak into Viewpoint B
// ---------------------------------------------------------------------------

test('working set: Viewpoint A candidates do not leak into Viewpoint B', () => {
  const { entries } = poolFrom([
    [discovered('vidAAAAAAA01', 'vp-a'), discovered('vidAAAAAAA02', 'vp-a')],
    [discovered('vidBBBBBBB01', 'vp-b')],
  ]);
  assert.equal(entries.length, 3);

  const setA = viewpointWorkingSet(entries, 'vp-a');
  const idsA = setA.map((e) => e.candidate.videoId);
  assert.equal(idsA.length, 2);
  assert.ok(!idsA.includes('vidBBBBBBB01'), 'vp-b candidate leaked into vp-a working set');

  const setB = viewpointWorkingSet(entries, 'vp-b');
  const idsB = setB.map((e) => e.candidate.videoId);
  assert.deepEqual(idsB, ['vidBBBBBBB01']);
  assert.ok(!idsB.includes('vidAAAAAAA01'), 'vp-a candidate leaked into vp-b working set');
});

// ---------------------------------------------------------------------------
// 2. A candidate discovered independently by A and B may appear in both
// ---------------------------------------------------------------------------

test('working set: a candidate independently discovered by A and B appears in both', () => {
  const shared = 'vidSHARED001';
  const { entries } = poolFrom([
    [discovered(shared, 'vp-a'), discovered('vidONLYA00001', 'vp-a')],
    // vp-b independently finds the same video: duplicate, provenance recorded.
    [discovered(shared, 'vp-b', { title: 'same video' }), discovered('vidONLYB00001', 'vp-b')],
  ]);
  assert.equal(entries.length, 3);

  const setA = viewpointWorkingSet(entries, 'vp-a');
  const setB = viewpointWorkingSet(entries, 'vp-b');
  const idsA = new Set(setA.map((e) => e.candidate.videoId));
  const idsB = new Set(setB.map((e) => e.candidate.videoId));
  assert.ok(idsA.has(shared));
  assert.ok(idsB.has(shared));
  assert.ok(!idsB.has('vidONLYA00001'));
  assert.ok(!idsA.has('vidONLYB00001'));
});

// ---------------------------------------------------------------------------
// 3. Global cache reuse still works
// ---------------------------------------------------------------------------

test('working set: global cache reuse still works (re-discovery dedups and records provenance)', () => {
  const shared = 'vidCACHED0001';
  const { entries } = poolFrom([
    [discovered(shared, 'vp-a')],
    [discovered(shared, 'vp-b')],
  ]);
  // One catalog entry, two provenance records.
  assert.equal(entries.length, 1);
  assert.equal(entries[0].alsoDiscoveredVia.length, 1);
  assert.equal(entries[0].alsoDiscoveredVia[0].viewpointId, 'vp-b');

  // Both working sets resolve it from the single cached entry.
  assert.ok(viewpointWorkingSet(entries, 'vp-a').length === 1);
  assert.ok(viewpointWorkingSet(entries, 'vp-b').length === 1);
});

// ---------------------------------------------------------------------------
// 4. Duplicate suppression still works
// ---------------------------------------------------------------------------

test('working set: same-video re-sighting by the same Viewpoint stays one entry', () => {
  const { entries } = poolFrom([
    [discovered('vidDUP0000001', 'vp-a', { provenance: provenance('vp-a', 'first seed') })],
    [discovered('vidDUP0000001', 'vp-a', { provenance: provenance('vp-a', 'second seed') })],
  ]);
  assert.equal(entries.length, 1);
  const setA = viewpointWorkingSet(entries, 'vp-a');
  assert.equal(setA.length, 1);
  // The second sighting IS recorded as additional provenance.
  assert.equal(entries[0].alsoDiscoveredVia.length, 1);
  assert.equal(entries[0].alsoDiscoveredVia[0].seed, 'second seed');
});

// ---------------------------------------------------------------------------
// 5. Switching Viewpoints does not contaminate the other working set
// ---------------------------------------------------------------------------

test('working set: switching Viewpoints never contaminates the other working set', () => {
  const { entries } = poolFrom([
    [discovered('vidSWITCHA001', 'vp-a')],
    [discovered('vidSWITCHB001', 'vp-b')],
    // vp-a later finds one more (exercises appended provenance).
    [discovered('vidSWITCHA002', 'vp-a')],
  ]);
  const idsA1 = viewpointWorkingSet(entries, 'vp-a').map((e) => e.candidate.videoId);
  const idsB = viewpointWorkingSet(entries, 'vp-b').map((e) => e.candidate.videoId);
  const idsA2 = viewpointWorkingSet(entries, 'vp-a').map((e) => e.candidate.videoId);

  assert.deepEqual(idsA1, idsA2, 're-selecting vp-a changed its working set');
  assert.deepEqual(idsB, ['vidSWITCHB001']);
  assert.equal(idsA1.length, 2);
  assert.ok(!idsB.includes('vidSWITCHA001'));
  assert.ok(!idsB.includes('vidSWITCHA002'));
});

// ---------------------------------------------------------------------------
// 6. Existing feedback isolation remains intact (firewall lens on the
//    working set path)
// ---------------------------------------------------------------------------

test('working set: feedback isolation remains intact across Viewpoints', () => {
  const profile = emptyUserProfile(NOW);
  profile.feedback = [
    // A preference signal recorded under vp-b must not train vp-a.
    { id: 'fb-1', videoId: 'vidFBA000001', kind: 'more-like-this', capturedAt: NOW, viewpointId: 'vp-b' },
    // An exposure fact stays global.
    { id: 'fb-2', videoId: 'vidFBW000001', kind: 'watched', capturedAt: NOW, viewpointId: 'vp-a' },
  ];
  const lensedA = trainingFeedbackFor(profile, { id: 'vp-a' } as never);
  const idsA = lensedA.map((f) => f.videoId);
  assert.ok(!idsA.includes('vidFBA000001'), 'vp-b preference leaked into vp-a feedback lens');
  assert.ok(idsA.includes('vidFBW000001'), 'global exposure fact lost from vp-a lens');
  const lensedB = trainingFeedbackFor(profile, { id: 'vp-b' } as never);
  assert.ok(lensedB.some((f) => f.videoId === 'vidFBA000001'));
});

// ---------------------------------------------------------------------------
// 7. Candidate provenance remains inspectable
// ---------------------------------------------------------------------------

test('working set: provenance remains inspectable on working-set entries', () => {
  const { entries } = poolFrom([
    [discovered('vidPROV000001', 'vp-a')],
    [discovered('vidPROV000002', 'vp-a')],
  ]);
  const setA = viewpointWorkingSet(entries, 'vp-a');
  for (const entry of setA) {
    assert.equal(entry.candidate.provenance.provider, 'youtube-web');
    assert.equal(entry.candidate.provenance.method, 'seed-search');
    assert.equal(entry.candidate.provenance.viewpointId, 'vp-a');
    assert.ok(typeof entry.candidate.provenance.discoveredAt === 'string');
  }
  // Adapter preserves the chain for the inspector.
  const cv = toCandidateVideo(setA[0]);
  assert.ok(cv.discoveredVia.startsWith('youtube-web:'));
});

// ---------------------------------------------------------------------------
// 8. Composition + autopsy consume the working set, not the global catalog
// ---------------------------------------------------------------------------

test('working set: composition consumes only the working set (A candidates, not B)', async () => {
  const { entries } = poolFrom([
    [discovered('vidCOMP000001', 'vp-a'), discovered('vidCOMP000002', 'vp-a')],
    [discovered('vidCOMPB00001', 'vp-b')],
  ]);
  const vpA = newViewpoint('vp-a', 'A', 'desc', NOW);
  const workingA = viewpointWorkingSet(entries, 'vp-a').map(toCandidateVideo);
  assert.equal(workingA.length, 2);

  const { snapshot } = await assembleViewstream(
    workingA,
    { viewpoint: vpA, limit: 8, profile: emptyUserProfile(NOW) },
    NOW,
  );
  const feedIds = snapshot.feed.map((f) => f.candidate.id);
  assert.equal(feedIds.length, 2);
  assert.ok(!feedIds.includes('vidCOMPB00001'), 'vp-b candidate composed into vp-a Viewstream');
  // consideredCount reflects the working set, not the global catalog.
  assert.equal(snapshot.consideredCount, 2);
});

test('working set: autopsy pool-vs-feed reflects the working set, not the global catalog', async () => {
  const { entries } = poolFrom([
    [discovered('vidAUT0000001', 'vp-a'), discovered('vidAUT0000002', 'vp-a')],
    [discovered('vidAUTB000001', 'vp-b')],
  ]);
  const vpA = newViewpoint('vp-a', 'A', 'desc', NOW);
  const workingA = viewpointWorkingSet(entries, 'vp-a').map(toCandidateVideo);

  const { snapshot } = await assembleViewstream(
    workingA,
    { viewpoint: vpA, limit: 8, profile: emptyUserProfile(NOW) },
    NOW,
  );
  // The autopsy's "pool" input is the working set (what the composer
  // saw). A vp-b-only candidate must not appear anywhere in it.
  assert.equal(snapshot.consideredCount, 2);
  assert.ok(!snapshot.feed.some((f) => f.candidate.id === 'vidAUTB000001'));
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

test('working set diagnostics: counts globals, actives, shared, exclusive', () => {
  const shared = 'vidDIAG000001';
  const { entries } = poolFrom([
    [
      discovered('vidDIAGA00001', 'vp-a'),
      discovered(shared, 'vp-a'),
      discovered('vidDIAGA00002', 'vp-a'),
    ],
    [discovered('vidDIAGB00001', 'vp-b'), discovered(shared, 'vp-b')],
    [discovered('vidDIAGC00001', 'vp-c')],
  ]);
  const view = workingSetDiagnostics(entries, 'vp-a', ['vp-a', 'vp-b', 'vp-c']);
  assert.equal(view.globalCandidateCount, 5);
  assert.equal(view.activeViewpointCount, 3);
  assert.equal(view.sharedWithOtherViewpoints, 1, 'shared candidate not detected');
  assert.equal(view.exclusiveToActiveViewpoint, 2);
});

test('working set diagnostics: unviewpointed/manual provenance never qualifies', () => {
  const { entries } = poolFrom([
    [discovered('vidMAN00000001', null), discovered('vidDIAGA00003', 'vp-a')],
  ]);
  assert.ok(!entryInWorkingSet(entries[0], 'vp-a'));
  const view = workingSetDiagnostics(entries, 'vp-a', ['vp-a']);
  assert.equal(view.globalCandidateCount, 2);
  assert.equal(view.activeViewpointCount, 1);
  assert.equal(view.sharedWithOtherViewpoints, 0);
  assert.equal(view.exclusiveToActiveViewpoint, 1);
});

test('working set diagnostics: deleted Viewpoints do not count as sharers', () => {
  const { entries } = poolFrom([
    [discovered('vidDIAGA00004', 'vp-a')],
    [discovered('vidDIAGA00004', 'vp-deleted')],
  ]);
  const view = workingSetDiagnostics(entries, 'vp-a', ['vp-a']);
  assert.equal(view.activeViewpointCount, 1);
  assert.equal(view.sharedWithOtherViewpoints, 0, 'deleted Viewpoint counted as sharer');
  assert.equal(view.exclusiveToActiveViewpoint, 1);
});

// ---------------------------------------------------------------------------
// Boundary: a candidate found via a DIFFERENT Viewpoint's seed qualifies
// only when THAT Viewpoint's plan surfaced it (alsoDiscoveredVia).
// ---------------------------------------------------------------------------

test('working set: later alsoDiscoveredVia sighting by another Viewpoint extends both sets', () => {
  const { entries } = poolFrom([
    [discovered('vidLATER00001', 'vp-a')],
    [discovered('vidLATER00001', 'vp-b')],
  ]);
  // The single entry now belongs to both working sets.
  assert.ok(entryInWorkingSet(entries[0], 'vp-a'));
  assert.ok(entryInWorkingSet(entries[0], 'vp-b'));
  assert.equal(viewpointWorkingSet(entries, 'vp-a').length, 1);
  assert.equal(viewpointWorkingSet(entries, 'vp-b').length, 1);
});