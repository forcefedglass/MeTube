import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleFeed } from '../src/discovery/assemble-feed';
import { FixtureCandidateProvider } from '../src/discovery/fixture-provider';
import { emptyUserProfile } from '../src/model/types';
import type { UserProfile } from '../src/model/types';
import {
  decidePlayback,
  isolatedEmbedUrl,
  ISOLATED_SANDBOX,
  ISOLATED_REFERRER_POLICY,
} from '../src/youtube/playback';

test('assembleFeed produces snapshot with muted channels excluded', async () => {
  const provider = new FixtureCandidateProvider();
  const profile: UserProfile = {
    ...emptyUserProfile('2026-09-18T00:00:00Z'),
    mutedChannelIds: ['MT-FX-ch-obs'],
  };
  const snapshot = await assembleFeed(provider, { limit: 5, profile }, '2026-09-18T00:00:00Z');
  assert.ok(snapshot.feed.length > 0);
  assert.ok(snapshot.feed.length <= 5);
  for (const item of snapshot.feed) {
    assert.notEqual(item.candidate.channelId, 'MT-FX-ch-obs');
    assert.ok(item.reason.length > 0);
  }
  assert.ok(snapshot.consideredCount + snapshot.mutedCount >= snapshot.feed.length);
});

test('playback isolation: fixtures are never playable, real ids embed', () => {
  const fixtureDecision = decidePlayback('MT-FX-v00001');
  assert.equal(fixtureDecision.kind, 'disabled');
  if (fixtureDecision.kind === 'disabled') {
    assert.equal(fixtureDecision.reason, 'fixture');
  }

  const realDecision = decidePlayback('dQw4w9WgXcQ');
  assert.equal(realDecision.kind, 'embedded');

  const url = isolatedEmbedUrl('dQw4w9WgXcQ');
  assert.ok(url.startsWith('https://www.youtube-nocookie.com/embed/'));
  assert.ok(ISOLATED_SANDBOX.includes('allow-scripts'));
  assert.equal(ISOLATED_REFERRER_POLICY, 'no-referrer');
});