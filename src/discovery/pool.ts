/**
 * Candidate pool — the persistent cache of everything ever discovered.
 *
 * Responsibilities:
 *   - dedup by video id (first discovery wins; later sightings recorded as
 *     additional provenance)
 *   - persist via LocalStore KV keys so repeated Viewstream generation
 *     serves from cache and never refetches
 *   - cap refresh frequency per Viewpoint (TTL) so acquisition stays bounded
 *   - record failed acquisitions for the inspector (never silent)
 *   - adapt DiscoveredCandidate -> CandidateVideo for the ranking engine,
 *     never fabricating unavailable metadata
 *
 * The pool never scores anything and never consults YouTube's own
 * recommendations.
 */

import type { CandidateVideo } from '../model/types';
import type {
  AcquisitionMethod,
  CandidateProvenance,
  DiscoveredCandidate,
  DiscoveryPlan,
} from '../model/discovery';
import { deriveDiscoveryPlan } from '../model/discovery';
import { UNKNOWN_DATE } from '../model/discovery';
import type { LocalStore } from '../storage/local-store';
import type { StepReport } from './youtube-web';
import type { PlanCapableProvider } from './provider';
import type { TopicLabelResolver } from '../model/discovery';

const POOL_KEY = 'candidate-pool';

/**
 * KV flag selecting the fixture provider for development/test mode.
 * Absent/false = real acquisition (the default user experience).
 */
export const FIXTURE_MODE_KEY = 'use-fixture-provider';

/** How long a Viewpoint's discovery result stays fresh, in milliseconds. */
export const POOL_TTL_MS = 6 * 60 * 60 * 1000;

/** Max persisted candidates; oldest discoveredAt pruned first. */
export const MAX_POOL_SIZE = 600;

export interface PoolEntry {
  candidate: DiscoveredCandidate;
  /** Additional provenance from later sightings of the same video. */
  alsoDiscoveredVia: CandidateProvenance[];
}

export interface PoolRunLogEntry {
  viewpointId: string;
  runAt: string;
  ok: boolean;
  harvested: number;
  added: number;
  duplicates: number;
  steps: Array<Pick<StepReport, 'step' | 'status' | 'harvested' | 'error'>>;
}

export interface PoolState {
  entries: PoolEntry[];
  runLog: PoolRunLogEntry[];
}

/** A candidate as it flows into the ranking engine. */
export interface CandidateForRanking extends CandidateVideo {
  provenance: CandidateProvenance;
  alsoDiscoveredVia: CandidateProvenance[];
  metadataConfidence: DiscoveredCandidate['metadataConfidence'];
  /** View count as reported by the discovery source; null when unknown. */
  viewCount: number | null;
}

export function emptyPoolState(): PoolState {
  return { entries: [], runLog: [] };
}

export function loadPoolState(raw: unknown): PoolState {
  if (typeof raw !== 'object' || raw === null) return emptyPoolState();
  const entries = (raw as { entries?: unknown }).entries;
  const runLog = (raw as { runLog?: unknown }).runLog;
  return {
    entries: Array.isArray(entries) ? (entries as PoolEntry[]) : [],
    runLog: Array.isArray(runLog) ? (runLog as PoolRunLogEntry[]) : [],
  };
}

/** Merge freshly discovered candidates into the pool (pure). */
export function mergeIntoPool(
  state: PoolState,
  fresh: DiscoveredCandidate[],
): { state: PoolState; added: number; duplicates: number } {
  const byId = new Map(state.entries.map((e) => [e.candidate.videoId, e]));
  let added = 0;
  let duplicates = 0;
  for (const c of fresh) {
    const existing = byId.get(c.videoId);
    if (existing) {
      duplicates += 1;
      const sameStep = existing.alsoDiscoveredVia.some(
        (p) =>
          p.provider === c.provenance.provider &&
          p.method === c.provenance.method &&
          p.seed === c.provenance.seed,
      );
      const samePrimary =
        existing.candidate.provenance.provider === c.provenance.provider &&
        existing.candidate.provenance.method === c.provenance.method &&
        existing.candidate.provenance.seed === c.provenance.seed;
      if (!sameStep && !samePrimary) {
        existing.alsoDiscoveredVia.push(c.provenance);
      }
      continue;
    }
    byId.set(c.videoId, { candidate: c, alsoDiscoveredVia: [] });
    added += 1;
  }
  const entries = [...byId.values()];
  // Prune oldest first when over capacity.
  if (entries.length > MAX_POOL_SIZE) {
    entries.sort((a, b) => {
      const at = Date.parse(a.candidate.provenance.discoveredAt);
      const bt = Date.parse(b.candidate.provenance.discoveredAt);
      return (Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt);
    });
    entries.splice(0, entries.length - MAX_POOL_SIZE);
  }
  return { state: { entries, runLog: state.runLog }, added, duplicates };
}

/** Append a run record (pure). */
export function appendRunLog(state: PoolState, entry: PoolRunLogEntry): PoolState {
  const runLog = [...state.runLog, entry].slice(-40);
  return { entries: state.entries, runLog };
}

/** Is this Viewpoint's pool slice still fresh? */
export function isFresh(
  state: PoolState,
  viewpointId: string,
  now: number,
  ttlMs: number = POOL_TTL_MS,
): boolean {
  const last = state.runLog
    .filter((r) => r.viewpointId === viewpointId && r.ok && r.harvested >= 0)
    .pop();
  if (!last) return false;
  const t = Date.parse(last.runAt);
  if (Number.isNaN(t)) return false;
  return now - t < ttlMs;
}

/**
 * Adapter: DiscoveredCandidate -> CandidateVideo for the ranking engine.
 * Never fabricates: unknown dates become null; missing topics/narrative
 * clusters stay empty; discovery metadata maps to provenance.
 */
export function toCandidateVideo(entry: PoolEntry): CandidateForRanking {
  const c = entry.candidate;
  return {
    id: c.videoId,
    title: c.title ?? '(title unavailable)',
    channelId: c.channelId ?? 'unknown-channel',
    channelTitle: c.channelTitle ?? '(channel unknown)',
    description: c.description ?? '',
    publishedAt: c.publishedAt ?? UNKNOWN_DATE,
    durationSeconds: c.durationSeconds ?? 0,
    viewCount: c.viewCount,
    topicIds: [],
    narrativeClusterIds: [],
    discoveredVia: `${c.provenance.provider}:${c.provenance.method}`,
    alsoSeenVia: entry.alsoDiscoveredVia.map(
      (p) => `${p.provider}:${p.method}` as CandidateVideo['discoveredVia'],
    ),
    provenance: c.provenance,
    alsoDiscoveredVia: entry.alsoDiscoveredVia,
    metadataConfidence: c.metadataConfidence,
  };
}

export interface AcquireOptions {
  viewpointId: string;
  seedTopics: string[];
  seedConcepts: string[];
  explicitChannels: string[];
  seedPlaylists: string[];
  resolveTopicLabel: TopicLabelResolver;
  now: string;
  force?: boolean;
}

/**
 * Plan -> provider run -> merge -> persist, with TTL check so repeat
 * generation serves from cache. Returns the updated pool state plus the
 * run record.
 */
export async function acquireForViewpoint(
  store: LocalStore,
  provider: PlanCapableProvider,
  state: PoolState,
  options: AcquireOptions,
): Promise<{ state: PoolState; run?: PoolRunLogEntry; plan: DiscoveryPlan }> {
  const plan = deriveDiscoveryPlan(
    options.viewpointId,
    options.seedTopics,
    options.seedConcepts,
    options.now,
    options.explicitChannels,
    options.resolveTopicLabel,
    options.seedPlaylists,
  );
  if (plan.steps.length === 0) {
    const run: PoolRunLogEntry = {
      viewpointId: options.viewpointId,
      runAt: options.now,
      ok: true,
      harvested: 0,
      added: 0,
      duplicates: 0,
      steps: [],
    };
    return { state: appendRunLog(state, run), run, plan };
  }
  if (!options.force && isFresh(state, options.viewpointId, Date.parse(options.now))) {
    return { state, plan };
  }
  const result = await provider.runPlan(plan.steps, options.viewpointId, options.now);
  const merged = mergeIntoPool(state, result.candidates);
  const run: PoolRunLogEntry = {
    viewpointId: options.viewpointId,
    runAt: options.now,
    ok: result.steps.every((s) => s.status !== 'error'),
    harvested: result.candidates.length,
    added: merged.added,
    duplicates: merged.duplicates,
    steps: result.steps.map(({ step, status, harvested, error }) => ({
      step,
      status,
      harvested,
      error,
    })),
  };
  const nextState = appendRunLog(merged.state, run);
  await persistPoolState(store, nextState);
  return { state: nextState, run, plan };
}

export async function loadPool(store: LocalStore): Promise<PoolState> {
  const raw = await store.getKv(POOL_KEY);
  return loadPoolState(raw);
}

export async function persistPoolState(store: LocalStore, state: PoolState): Promise<void> {
  await store.putKv(POOL_KEY, state);
}

/** A snapshot of pool inspection facts (all counts, no opinions). */
export interface PoolInspectView {
  totalCandidates: number;
  byMethod: Array<{ method: AcquisitionMethod; count: number }>;
  byProvider: Array<{ provider: string; count: number }>;
  discoveringViewpoints: Array<{ viewpointId: string; count: number; lastRunAt: string | null }>;
  cacheAgeOldest: string | null;
  cacheAgeNewest: string | null;
  duplicateSuppressed: number;
  failedSteps: Array<{
    viewpointId: string;
    runAt: string;
    step: string;
    stepMethod: AcquisitionMethod;
    reason: string;
  }>;
  unknownDates: number;
  missingDuration: number;
  missingChannel: number;
}

/** Inspect the pool: counts, provenance, viewpoints, ages, failures. */
export function inspectPool(state: PoolState, now: string): PoolInspectView {
  const byMethod = new Map<AcquisitionMethod, number>();
  const byProvider = new Map<string, number>();
  const viewpoints = new Map<string, { count: number; lastRunAt: string | null }>();
  const discoveringVp = new Map<string, number>();
  let oldest: string | null = null;
  let newest: string | null = null;
  let unknownDates = 0;
  let missingDuration = 0;
  let missingChannel = 0;
  for (const e of state.entries) {
    const p = e.candidate.provenance;
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + 1);
    byProvider.set(p.provider, (byProvider.get(p.provider) ?? 0) + 1);
    if (p.viewpointId) {
      discoveringVp.set(p.viewpointId, (discoveringVp.get(p.viewpointId) ?? 0) + 1);
      const v = viewpoints.get(p.viewpointId) ?? { count: 0, lastRunAt: null };
      viewpoints.set(p.viewpointId, { count: v.count + 1, lastRunAt: p.discoveredAt });
    }
    if (e.candidate.publishedAt === null) unknownDates += 1;
    if (e.candidate.durationSeconds === null) missingDuration += 1;
    if (e.candidate.channelId === null) missingChannel += 1;
    const t = Date.parse(p.discoveredAt);
    if (!Number.isNaN(t)) {
      if (oldest === null || p.discoveredAt < oldest) oldest = p.discoveredAt;
      if (newest === null || p.discoveredAt > newest) newest = p.discoveredAt;
    }
  }
  const failedSteps: PoolInspectView['failedSteps'] = [];
  for (const r of state.runLog) {
    for (const s of r.steps) {
      if (s.status === 'error' || s.status === 'empty') {
        failedSteps.push({
          viewpointId: r.viewpointId,
          runAt: r.runAt,
          step: s.step.label,
          stepMethod: s.step.method,
          reason: s.error ?? s.status,
        });
      }
    }
  }
  return {
    totalCandidates: state.entries.length,
    byMethod: [...byMethod.entries()].map(([method, count]) => ({ method, count })),
    byProvider: [...byProvider.entries()].map(([provider, count]) => ({ provider, count })),
    discoveringViewpoints: [...discoveringVp.entries()].map(([viewpointId, count]) => ({
      viewpointId,
      count,
      lastRunAt: viewpoints.get(viewpointId)?.lastRunAt ?? null,
    })),
    cacheAgeOldest: oldest,
    cacheAgeNewest: newest,
    duplicateSuppressed: state.runLog.reduce((a, r) => a + r.duplicates, 0),
    failedSteps,
    unknownDates,
    missingDuration,
    missingChannel,
  };
}