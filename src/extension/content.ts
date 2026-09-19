/**
 * Content script entry point — Phase 5 product shell.
 *
 * Orchestration: nav entry -> tabbed shell -> per-tab surfaces ->
 * feedback -> persistence. The five product tabs are VIEWSTREAM /
 * VIEWPOINTS / VIEWLISTS / COVERAGE / SAVED; the active Viewpoint is
 * always visible in the shell header, with a rapid switcher.
 *
 * Runs on youtube.com pages only (see manifest). It never reads YouTube's
 * own recommendations, never touches the watch history, and never
 * propagates anything to any server.
 */

import { emptyUserProfile } from '../model/types';
import type { UserProfile } from '../model/types';
import { FixtureCandidateProvider } from '../discovery/fixture-provider';
import { YouTubeWebProvider } from '../discovery/youtube-web';
import { deriveDiscoveryPlan } from '../model/discovery';
import type { PlanCapableProvider } from '../discovery/provider';
import type { HtmlFetch } from '../discovery/youtube-web';
import { assembleFeed } from '../discovery/assemble-feed';
import {
  acquireForViewpoint,
  loadPool,
  FIXTURE_MODE_KEY,
} from '../discovery/pool';
import { toCandidateVideo } from '../discovery/pool';
import { assembleViewstream } from '../viewpoints/viewstream';
import { openLocalStore } from '../storage/local-store';
import type { LocalStore } from '../storage/local-store';
import { insertNavEntry, ensureMount } from '../youtube/nav';
import { renderFeedCard } from '../ui/feed-card';
import { FEED_STYLES } from '../ui/styles';
import { openViewpointRepository } from '../viewpoints/repository';
import type { Viewpoint, TimeMachineConfig } from '../model/viewpoint';
import { newViewpoint } from '../model/viewpoint';
import { renderViewpointManager } from '../ui/viewpoint-manager';
import { renderPoolInspector } from '../ui/pool-inspector';
import { renderWorkingSetPanel } from '../ui/workingset-panel';
import { viewpointWorkingSet, workingSetDiagnostics } from '../viewpoints/workingset';
import { renderCandidateInspector } from '../ui/candidate-inspector';
import { FIXTURE_TOPICS } from '../discovery/fixtures';
import { FIXTURE_CHANNELS } from '../discovery/fixtures';
import { FIXTURE_NARRATIVE_CLUSTERS } from '../discovery/fixtures';
import { buildCatalog } from '../model/catalog';
import { enrichCandidates } from '../classification/enrich';
import { loadOverrides, setOverride, clearOverride } from '../classification/overrides';
import type { ClassificationOverride } from '../model/classification';
import { computeCoverageMap } from '../discovery/coverage';
import type { ExposureReport, GenerationHistoryEntry } from '../model/exposure';
import { recordFeedbackThroughFirewall } from '../viewpoints/firewall';
import type { FeedCandidate } from '../model/types';
import { findPerspectivePairs, comparisonsForItem } from '../viewpoints/pairing';
import { computeBlindSpots } from '../viewpoints/blindspots';
import { renderExposurePanel } from '../ui/exposure-panel';
import { renderBlindSpotMap } from '../ui/blindspot-map';
import { renderCoverageMap } from '../ui/coverage-map';
import { renderShellHeader, renderTabBar } from '../ui/shell-header';
import type { ShellTab } from '../ui/shell-header';
import { renderAutopsyPanel } from '../ui/autopsy-panel';
import { renderTimeMachinePanel } from '../ui/time-machine-panel';
import { renderProvenancePanel } from '../ui/provenance-panel';
import { renderOnboardingPanel } from '../ui/onboarding-panel';
import { renderPortabilityPanel, renderPortabilityResult } from '../ui/portability-panel';
import { renderSavedPanel } from '../ui/saved-panel';
import { renderTourPanel } from '../ui/tour-panel';
import { simplifiedConfigOverlay } from '../ui/tour-panel';
import { renderHelpToggle, dismissHelpPopups } from '../ui/help-tooltips';
import type { TourStepId, TourState } from '../onboarding/tour-state';
import {
  readTourState,
  startTour,
  setTourStep,
  completeTour,
  skipTour,
  currentTourStep,
  TOUR_STEP_IDS,
} from '../onboarding/tour-state';
import {
  optInToDemos,
  removeDemoViewpoints,
  demoComparePair,
  isDemoViewpoint,
} from '../onboarding/demo-viewpoints';
import {
  readOnboardingState,
  markOnboarded,
  acceptStarters,
} from '../viewpoints/onboarding';
import { computeFeedAutopsy } from '../viewpoints/autopsy';
import { comparePeriods } from '../viewpoints/timemachine';
import { buildProvenanceChain } from '../viewpoints/provenance';
import type { InclusionBasis } from '../viewpoints/provenance';
import { buildExport, parseImport, mergeById, mergeFeedback } from '../viewpoints/portability';
import type { ImportMode } from '../viewpoints/portability';

const store: LocalStore = openLocalStore();

/**
 * Provider selection: real acquisition by default; fixtures behind an
 * explicit dev/test mode (KV flag `use-fixture-provider`).
 */
async function resolveProvider(): Promise<import('../discovery/provider').CandidateProvider> {
  const fixtureMode = await store.getKv(FIXTURE_MODE_KEY);
  if (fixtureMode === true) {
    return new FixtureCandidateProvider();
  }
  const fetchHtml: HtmlFetch = (url) => fetch(url, { credentials: 'omit' });
  return new YouTubeWebProvider(fetchHtml);
}

/**
 * Topic labels resolve through the fixture catalog; unresolvable ids yield
 * no search step (never a guessed query).
 */
function makeTopicLabelResolver(): import('../model/discovery').TopicLabelResolver {
  const labels = new Map<string, string>(
    FIXTURE_TOPICS.map((t) => [t.id, t.label] as const),
  );
  return (topicId) => labels.get(topicId) ?? null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * The working catalog for classification: fixture topic/cluster/channel
 * definitions. Real candidates classify against these definitions; ids that
 * do not resolve stay UNKNOWN rather than resolving to invented entries.
 */
function workingCatalog(): import('../model/catalog').Catalog {
  return buildCatalog({
    topics: FIXTURE_TOPICS,
    channels: FIXTURE_CHANNELS,
    narrativeClusters: FIXTURE_NARRATIVE_CLUSTERS,
    discoverySources: [],
  });
}

function loadProfile(): Promise<UserProfile> {
  return (store.getKv('user-profile') as Promise<UserProfile | undefined>).then(
    (p) => p ?? emptyUserProfile(nowIso()),
  );
}

/** Phase 4: generation history persistence for cooldown rules. */
const GENERATION_HISTORY_KEY = 'generation-history';

async function loadGenerationHistory(store: LocalStore): Promise<GenerationHistoryEntry[]> {
  const value = await store.getKv(GENERATION_HISTORY_KEY);
  if (!Array.isArray(value)) return [];
  return value as GenerationHistoryEntry[];
}

async function saveGenerationEntry(store: LocalStore, entry: GenerationHistoryEntry): Promise<void> {
  const history = await loadGenerationHistory(store);
  // Bounded: keep the most recent 64 generations (enough for any cooldown).
  const next = [...history, entry].slice(-64);
  await store.putKv(GENERATION_HISTORY_KEY, next);
}

/** Human-readable one-line summary of the configured budget rules. */
function summarizeExposureBudget(budget: import('../model/exposure').ExposureBudget): string {
  const parts: string[] = [];
  if (budget.maxSingleChannelShare !== undefined) parts.push(`≤${(budget.maxSingleChannelShare * 100).toFixed(0)}% from one channel`);
  if (budget.maxSingleNarrativeShare !== undefined) parts.push(`≤${(budget.maxSingleNarrativeShare * 100).toFixed(0)}% from one narrative cluster`);
  if (budget.maxSingleTopicShare !== undefined) parts.push(`≤${(budget.maxSingleTopicShare * 100).toFixed(0)}% on one topic`);
  if (budget.minUnfamiliarChannelShare !== undefined) parts.push(`≥${(budget.minUnfamiliarChannelShare * 100).toFixed(0)}% unfamiliar channels`);
  if (budget.minAlternateSourceTypeShare !== undefined) parts.push(`≥${(budget.minAlternateSourceTypeShare * 100).toFixed(0)}% alternate source types`);
  if (budget.minHistoricalShare !== undefined) parts.push(`≥${(budget.minHistoricalShare * 100).toFixed(0)}% historical material`);
  if (budget.explorationShare !== undefined) parts.push(`≥${(budget.explorationShare * 100).toFixed(0)}% wildcard/exploration`);
  if (budget.repeatedChannelCooldown !== undefined) parts.push(`${budget.repeatedChannelCooldown}-generation channel cooldown`);
  if (budget.repeatedNarrativeCooldown !== undefined) parts.push(`${budget.repeatedNarrativeCooldown}-generation narrative cooldown`);
  if (budget.minDistinctLanguages !== undefined) parts.push(`≥${budget.minDistinctLanguages} language(s) (awaiting evidenced data)`);
  if (budget.minDistinctRegions !== undefined) parts.push(`≥${budget.minDistinctRegions} region(s) (awaiting evidenced data)`);
  if (budget.minDistinctScaleBands !== undefined) parts.push(`≥${budget.minDistinctScaleBands} scale band(s)`);
  if (parts.length === 0) return 'no rules configured';
  return parts.join(', ');
}

let feedVisible = false;
let mounted = false;
let activeTab: ShellTab = 'viewstream';

/** Last composed context — reused by tabs without recomposing. */
interface ComposedContext {
  snapshot: import('../model/types').FeedSnapshot;
  exposureReport: ExposureReport | null;
  poolCandidates: import('../model/types').CandidateVideo[];
  lookup: (videoId: string) => import('../model/classification').VideoClassification | undefined;
  overrides: ClassificationOverride[];
  activeViewpoint: Viewpoint | null;
  /** Working-set diagnostics for the active Viewpoint (counts only). */
  workingSet: import('../viewpoints/workingset').WorkingSetDiagnostics | null;
}

let lastComposed: ComposedContext | null = null;

/**
 * Tour demo-change bookkeeping (in-memory only): whether the harmless
 * exploration-percent demo change is applied, and the prior value to
 * restore on undo. Not persisted — if the page reloads mid-change the
 * Viewpoint keeps the new value, which is an ordinary user-editable
 * setting visible in the Viewpoints tab.
 */
let demoChangeState = false;
let demoChangePrevious: number | null = null;

/** Switch the active Viewpoint, then regenerate through the new lens. */
async function switchViewpoint(viewpointId: string): Promise<void> {
  const repo = openViewpointRepository(store);
  try {
    await repo.setActive(viewpointId);
  } catch (err) {
    console.warn('[MeTube] could not activate Viewpoint', err);
    return;
  }
  lastComposed = null; // force recomposition through the new lens
  await showTab('viewstream');
}

/** Open the shell on a given tab (default viewstream). */
async function showTab(tab: ShellTab): Promise<void> {
  activeTab = tab;
  feedVisible = true;
  dismissHelpPopups(); // stale tooltips must not survive a re-render
  const mount = ensureMount();
  mount.className = 'metube-visible';
  if (!mounted) {
    mounted = true;
    injectStyles();
  }
  mount.replaceChildren();

  // First-run onboarding gate.
  const state = await readOnboardingState(store);
  if (!state.onboarded) {
    mount.append(renderOnboardingShell());
    return;
  }

  const repo = openViewpointRepository(store);
  const [viewpoints, viewlists, active] = await Promise.all([
    repo.list(),
    repo.listViewlists(),
    repo.getActive(),
  ]);

  const shell = document.createElement('div');
  shell.className = 'metube-shell';

  const header = document.createElement('header');
  header.className = 'metube-shell-header';
  const title = document.createElement('h2');
  title.className = 'metube-shell-title';
  title.textContent = 'Slipgate';
  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'metube-shell-help';
  help.textContent = 'Help';
  help.addEventListener('click', () => void toggleHelpMenu(help));
  header.append(title, help);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'metube-shell-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', hideFeed);
  header.append(closeBtn);
  shell.append(header);

  // Active Viewpoint always visible + rapid switcher.
  shell.append(
    renderShellHeader(viewpoints, active, {
      onSwitch: (id) => void switchViewpoint(id),
    }),
  );
  shell.append(
    renderTabBar(activeTab, {
      onSelect: (t) => void showTab(t),
    }),
  );

  const body = document.createElement('div');
  body.className = 'metube-shell-body';
  switch (activeTab) {
    case 'viewstream':
      body.append(await renderViewstreamTab(active));
      break;
    case 'viewpoints':
      body.append(await renderViewpointsTab(repo, viewpoints, viewlists, active));
      break;
    case 'viewlists':
      body.append(await renderViewlistsTab(repo, viewpoints, viewlists, active));
      break;
    case 'coverage':
      body.append(await renderCoverageTab(active));
      break;
    case 'saved':
      body.append(await renderSavedTab());
      break;
  }
  shell.append(body);
  mount.append(shell);

  // Guided tour overlay — rendered AFTER the tab body so the tour's step
  // facts read the freshly composed context (live runtime values, never
  // stale or fabricated ones).
  const tourState = await readTourState(store);
  if (tourState.status === 'in-progress') {
    mount.append(await renderTourOverlay(tourState));
  }
}

/** The onboarding screen wrapped as the whole shell. */
function renderOnboardingShell(): HTMLElement {
  return renderOnboardingPanel({
    onStartTour: () => {
      void (async () => {
        await markOnboarded(store);
        await startTour(store, nowIso());
        await showTab('viewstream');
      })();
    },
    onAcceptStarters: () => {
      void acceptStarters(store).then(async (added) => {
        await markOnboarded(store);
        console.info(`[MeTube] ${added} starter Viewpoint(s) added (editable)`);
        await showTab('viewstream');
      });
    },
    onDecline: () => {
      void markOnboarded(store).then(() => showTab('viewstream'));
    },
  });
}

// ---------------------------------------------------------------------------
// Guided tour overlay
// ---------------------------------------------------------------------------

/**
 * Render the tour overlay for the current tour state. The step body is
 * fed with RECORDED runtime facts (last composed context, acquisition
 * run log, autopsy metrics, coverage counts) — never fabricated numbers.
 */
async function renderTourOverlay(tourState: TourState): Promise<HTMLElement> {
  const step = currentTourStep(tourState);
  const repo = openViewpointRepository(store);
  const [viewpoints, active] = await Promise.all([repo.list(), repo.getActive()]);

  // Recorded facts for the step bodies. lastComposed may be null (nothing
  // generated yet) — the tour renders honestly without numbers then.
  const ctx = lastComposed;
  const [firstCard, buildFacts, autopsyMetrics, coverageFacts] = await Promise.all([
    Promise.resolve(firstCardFactsFrom(ctx)),
    Promise.resolve(buildFactsFrom(active)),
    autopsyMetricSummariesFrom(ctx),
    coverageFactsFrom(ctx),
  ]);
  // Compare step: the evidenced broad demo pair (marked instances only).
  const pair = demoComparePair();
  const demoCompare = pair
    ? {
        leftId: pair[0].id,
        leftTitle: pair[0].title,
        rightId: pair[1].id,
        rightTitle: pair[1].title,
      }
    : null;

  return renderTourPanel(
    step,
    {
      activeViewpoint: active,
      viewpoints,
      firstCard,
      buildFacts,
      autopsyMetricSummaries: autopsyMetrics,
      coverageFacts,
      demoCompare,
      demoChangeApplied: demoChangeState,
    },
    {
      onNext: () => void advanceTour(step, 1),
      onBack: () => void advanceTour(step, -1),
      onSkip: () => {
        void skipTour(store, nowIso()).then(() => showTab(activeTab));
      },
      onJump: (target) => {
        void setTourStep(store, target, nowIso()).then(() => showTab(activeTab));
      },
      onStartGeneralDemo: () => {
        // General path: seed the generic starter lenses, then activate
        // the first so the following steps walk a real Viewpoint.
        // Seeding is idempotent; activation here is part of the explicit
        // demo request, and the user can switch or deactivate at any time.
        void (async () => {
          await acceptStarters(store);
          const repo2 = openViewpointRepository(store);
          const listed = await repo2.list();
          const firstStarter = listed.find((v) => v.id.startsWith('vp-starter-')) ?? listed[0];
          if (firstStarter) {
            try {
              await repo2.setActive(firstStarter.id);
            } catch (err) {
              console.warn('[MeTube] tour: could not activate starter', err);
            }
          }
          lastComposed = null;
          await setTourStep(store, 'viewpoint-details', nowIso());
          await showTab('viewpoints');
        })();
      },
      onRequestPoliticalDemo: () => {
        // Explicit opt-in only — the disclaimer was shown and the user
        // confirmed. Seeds marked demo copies of the four test lenses;
        // user forks carry different ids and are never touched.
        void (async () => {
          await optInToDemos(repo);
          const repo2 = openViewpointRepository(store);
          const listed = await repo2.list();
          const demo = listed.find((v) => v.id.startsWith('vp-test-demo-'));
          if (demo) {
            try {
              await repo2.setActive(demo.id);
            } catch (err) {
              console.warn('[MeTube] tour: could not activate demo', err);
            }
          }
          lastComposed = null;
          await setTourStep(store, 'viewpoint-details', nowIso());
          await showTab('viewpoints');
        })();
      },
      onCompareViewpoint: (viewpointId) => {
        // "Change the instructions, not your identity": switch the lens,
        // regenerate, and come back to the compare step.
        void (async () => {
          try {
            await repo.setActive(viewpointId);
          } catch (err) {
            console.warn('[MeTube] tour compare: could not activate', err);
            return;
          }
          lastComposed = null;
          await setTourStep(store, 'compare-viewpoints', nowIso());
          await showTab('viewstream');
        })();
      },
      onCreateSimplified: (subject, changeType) => {
        // Simplified creator: plain question -> change-type choice ->
        // exact config preview shown -> save. The config saved is
        // EXACTLY the preview shown (both come from the same function).
        void (async () => {
          const now = nowIso();
          const vp = newViewpoint(
            `vp-${Date.now().toString(36)}`,
            `Another view of: ${subject}`,
            'Created during the guided tour — every field is editable in the Viewpoints tab.',
            now,
            simplifiedConfigOverlay(subject, changeType),
          );
          try {
            await repo.create(vp);
          } catch (err) {
            console.warn('[MeTube] simplified creator failed', err);
            return;
          }
          await setTourStep(store, 'done', nowIso());
          await showTab('viewpoints');
        })();
      },
      onToggleDemoChange: () => {
        // ONE harmless interactive config change with explicit undo. The
        // demo change edits explorationPercent on the active Viewpoint;
        // the raw config IS the change and stays visible in the editor.
        void (async () => {
          const active = await repo.getActive();
          if (!active) return;
          const current = await repo.get(active.id);
          if (!current) return;
          const applied = demoChangeState;
          try {
            if (applied) {
              await repo.update({
                ...current,
                config: {
                  ...current.config,
                  explorationPercent: demoChangePrevious ?? 0.2,
                },
                updatedAt: nowIso(),
              });
              demoChangeState = false;
            } else {
              demoChangePrevious = current.config.explorationPercent;
              await repo.update({
                ...current,
                config: { ...current.config, explorationPercent: 0.5 },
                updatedAt: nowIso(),
              });
              demoChangeState = true;
            }
          } catch (err) {
            console.warn('[MeTube] tour demo change failed', err);
            return;
          }
          lastComposed = null; // force recomposition through changed rules
          await setTourStep(store, 'change-something', nowIso());
          await showTab('viewstream');
        })();
      },
    },
  );
}

/** Move the tour one step forward or back; finish at the last step. */
async function advanceTour(from: TourStepId, delta: 1 | -1): Promise<void> {
  const idx = TOUR_STEP_IDS.indexOf(from);
  const next = idx + delta;
  if (next < 0) return;
  if (next >= TOUR_STEP_IDS.length) {
    await completeTour(store, nowIso());
  } else {
    await setTourStep(store, TOUR_STEP_IDS[next], nowIso());
    // Teach through USE: each step opens the surface it explains so the
    // step body reads real, freshly composed runtime values.
    const step = TOUR_STEP_IDS[next];
    const targetTab: ShellTab | null =
      step === 'what-is-a-viewpoint' || step === 'demo-choice' || step === 'viewpoint-details' || step === 'create-your-own'
        ? 'viewpoints'
        : step === 'build-viewstream' || step === 'first-card' || step === 'unknown-is-honest' || step === 'compare-viewpoints' || step === 'change-something'
          ? 'viewstream'
          : step === 'feed-autopsy' || step === 'coverage'
            ? 'coverage'
            : null;
    if (targetTab) {
      await showTab(targetTab);
      return;
    }
  }
  await showTab(activeTab);
}

/** First-card facts from the last composed context (recorded data only). */
function firstCardFactsFrom(
  ctx: ComposedContext | null,
): import('../ui/tour-panel').FirstCardFacts | null {
  if (!ctx || ctx.snapshot.feed.length === 0) return null;
  const item = ctx.snapshot.feed[0];
  const classification = ctx.lookup(item.candidate.id);
  // The same provenance chain the card inspector renders — recorded facts
  // only, UNKNOWN never speculated.
  const chain = buildProvenanceChain({
    item,
    viewpoint: ctx.activeViewpoint,
    classification,
    poolProvenance: null,
    inclusion: inclusionBasisFor(item, ctx),
  });
  return {
    viewpointTitle: chain.viewpointRule.viewpointTitle,
    foundBecauseOf: chain.discovery ? chain.discovery.seed : null,
    discoverySource: item.candidate.discoveredVia,
    sourceType: classification ? classification.sourceType.value : null,
    narrativeCluster: classification ? classification.narrativeCluster.value : null,
    reason: chain.inclusion ? chain.inclusion.statement : item.reason,
  };
}

/** Build facts from the active Viewpoint + its discovery plan (recorded). */
function buildFactsFrom(
  active: Viewpoint | null,
): import('../ui/tour-panel').BuildFacts | null {
  if (!active) return null;
  const seedIdeaCount =
    active.config.seedConcepts.length + active.config.seedTopics.length;
  const plan = deriveDiscoveryPlan(
    active.id,
    active.config.seedTopics,
    active.config.seedConcepts,
    nowIso(),
    active.config.seedChannels,
    makeTopicLabelResolver(),
    active.config.seedPlaylists,
  );
  const seedSearchSteps = plan.steps.filter(
    (s: import('../model/discovery').AcquisitionStep): boolean => s.method === 'seed-search',
  );
  const executedQueries = seedSearchSteps.map(
    (s: import('../model/discovery').AcquisitionStep): string => s.target,
  );
  const pool = lastComposed
    ? lastComposed.poolCandidates.length
    : 0;
  return {
    seedIdeaCount,
    executedStepCount: plan.steps.length,
    executedQueries,
    // Pool size is a recorded value when a Viewstream has been composed;
    // 0 honestly means "nothing generated yet" (the step body renders a
    // "generate first" hint in that case via firstCard/buildFacts presence).
    candidatesFound: pool,
    duplicatesRemoved: 0,
    retainedForComposition: lastComposed ? lastComposed.snapshot.feed.length : 0,
  };
}

/** Autopsy summaries (first 3-4) from the last composed context. */
async function autopsyMetricSummariesFrom(
  ctx: ComposedContext | null,
): Promise<Array<{ id: string; label: string; value: string }>> {
  if (!ctx || ctx.snapshot.feed.length === 0) return [];
  const profile = await loadProfile();
  // Computed from recorded feed + pool data — the same function the
  // Coverage tab uses. The tour shows the first few metrics; the full
  // autopsy stays on the Coverage tab.
  const autopsy = computeFeedAutopsy(
    ctx.snapshot.feed,
    ctx.poolCandidates,
    ctx.activeViewpoint,
    profile,
    ctx.lookup,
    ctx.exposureReport,
    nowIso(),
  );
  return autopsy.metrics.map((m) => ({ id: m.id, label: m.label, value: m.value }));
}

/** Coverage totals from the last composed context. */
async function coverageFactsFrom(
  ctx: ComposedContext | null,
): Promise<{ totalCandidates: number; unclassified: number; unknownDates: number } | null> {
  if (!ctx) return null;
  const profile = await loadProfile();
  const feedCands = ctx.snapshot.feed.map((f) => f.candidate);
  const coverage = computeCoverageMap(feedCands, ctx.lookup, profile, nowIso());
  return {
    totalCandidates: coverage.totalCandidates,
    unclassified: coverage.unclassified,
    unknownDates: coverage.unknownDates,
  };
}

// ---------------------------------------------------------------------------
// VIEWSTREAM tab
// ---------------------------------------------------------------------------

async function composeNow(active: Viewpoint | null): Promise<ComposedContext> {
  const provider = await resolveProvider();
  const profile = await loadProfile();
  if (active) {
    const pool = await loadPool(store);
    const { state: nextPool } = await acquireForViewpoint(
      store, provider as PlanCapableProvider, pool,
      {
        viewpointId: active.id,
        seedTopics: active.config.seedTopics,
        seedConcepts: active.config.seedConcepts,
        explicitChannels: active.config.seedChannels,
        seedPlaylists: active.config.seedPlaylists,
        resolveTopicLabel: makeTopicLabelResolver(),
        now: nowIso(),
      },
    );
    // Retrieval isolation: composition sees only the working set —
    // candidates whose recorded provenance ties them to THIS Viewpoint.
    // The global pool stays global for caching and deduplication.
    const repo = openViewpointRepository(store);
    const [allViewpointIds, overrides] = await Promise.all([
      repo.list().then((vps) => vps.map((v) => v.id)),
      loadOverrides(store),
    ]);
    const workingSetEntries = viewpointWorkingSet(nextPool.entries, active.id);
    const workingSet = workingSetDiagnostics(nextPool.entries, active.id, allViewpointIds);
    const candidates = workingSetEntries.map(toCandidateVideo);
    const catalog = workingCatalog();
    const enriched = enrichCandidates(candidates, catalog, overrides, nowIso());
    const lookup = classificationIndexFor(enriched);
    const feedCandidates = enriched.map(({ classification: _cls, ...c }) => c);
    const history = await loadGenerationHistory(store);
    const nextGeneration = history.length > 0
      ? Math.max(...history.map((h) => h.generation)) + 1
      : 0;
    const composed = await assembleViewstream(
      feedCandidates,
      { viewpoint: active, limit: 8, profile },
      nowIso(),
      { lookupClassification: lookup, history, generation: nextGeneration },
    );
    if (composed.snapshot.feed.length > 0) {
      await saveGenerationEntry(store, {
        generation: nextGeneration,
        composedAt: nowIso(),
        viewpointId: active.id,
        channels: [...new Set(composed.snapshot.feed.map((f) => f.candidate.channelId))],
        narrativeClusters: [
          ...new Set(composed.snapshot.feed.flatMap((f) => f.candidate.narrativeClusterIds)),
        ],
      });
    }
    return {
      snapshot: composed.snapshot,
      exposureReport: composed.report,
      poolCandidates: feedCandidates,
      lookup,
      overrides,
      activeViewpoint: active,
      workingSet,
    };
  }
  // Unlensed bootstrap feed.
  const snapshot = await assembleFeed(provider, { limit: 8, profile }, nowIso());
  await store.saveFeed(snapshot);
  return {
    snapshot,
    exposureReport: null,
    poolCandidates: [],
    lookup: () => undefined,
    overrides: [],
    activeViewpoint: null,
    workingSet: null,
  };
}

async function renderViewstreamTab(active: Viewpoint | null): Promise<HTMLElement> {
  const wrap = document.createElement('section');
  const ctx = lastComposed ?? (lastComposed = await composeNow(active));
  if (!active) {
    const note = document.createElement('p');
    note.textContent =
      'Unlensed bootstrap feed: local fixtures only. Every score component is shown per card. ' +
      'Activate a Viewpoint to generate a Viewstream.';
    wrap.append(note);
  } else {
    const banner = document.createElement('p');
    banner.className = 'metube-viewpoint-banner';
    banner.textContent = `This Viewstream was generated through "${active.title}".`;
    wrap.append(banner);
    if (active.forkedFrom) {
      const lineage = document.createElement('p');
      lineage.className = 'metube-fork-lineage';
      lineage.textContent =
        `Forked from "${active.forkedFrom.viewpointTitle}" — changed assumption: ${active.forkedFrom.changedAssumption}`;
      wrap.append(lineage);
    }
    if (active.config.assumptions.length > 0) {
      const assumptions = document.createElement('div');
      assumptions.className = 'metube-assumptions';
      const h4 = document.createElement('h4');
      h4.textContent = 'Assumptions for this Viewpoint (authored by you; never inferred)';
      h4.append(renderHelpToggle('assumption'));
      assumptions.append(h4);
      const ul = document.createElement('ul');
      for (const a of active.config.assumptions) {
        const li = document.createElement('li');
        li.textContent = a;
        ul.append(li);
      }
      assumptions.append(ul);
      wrap.append(assumptions);
    }
    // Retrieval-isolation diagnostics: what the working set contains,
    // next to the global catalog it was selected from.
    if (ctx.workingSet) {
      wrap.append(renderWorkingSetPanel(ctx.workingSet));
    }
  }

  const list = document.createElement('div');
  list.className = 'metube-feed-list';
  const pairingResult = active
    ? findPerspectivePairs(ctx.snapshot.feed.map((f) => f.candidate), ctx.lookup)
    : null;
  for (const item of ctx.snapshot.feed) {
    list.append(
      renderFeedCard(item, {
        onFeedback: (videoId, kind) => {
          // Phase 4 exploration firewall: feedback recorded inside a
          // Viewstream is scoped to the active Viewpoint when the kind is
          // a preference signal; exposure facts stay global.
          void loadProfile().then((current) => {
            const next = recordFeedbackThroughFirewall(
              current,
              videoId,
              kind,
              ctx.activeViewpoint ? ctx.activeViewpoint.id : null,
              nowIso(),
            );
            return store.putKv('user-profile', next);
          });
        },
        onMuteChannel: (channelId) => {
          void loadProfile().then((current) => {
            const next: UserProfile = {
              ...current,
              mutedChannelIds: [...new Set([...current.mutedChannelIds, channelId])],
              updatedAt: nowIso(),
            };
            return store.putKv('user-profile', next);
          });
        },
        // Phase 3: clicking a card opens the information-map inspector.
        // Phase 5: the inspector gains the full provenance chain.
        onInspect: (clicked, card) => {
          void openInspector(clicked, card, ctx);
        },
        // Phase 4: evidenced comparisons with other treatments of the
        // same subject. Absent when no evidence supports a pairing.
        onCompare: pairingResult
          && comparisonsForItem(item, pairingResult, ctx.poolCandidates).length > 0
          ? (card) => {
              void openComparePanel(item, card, pairingResult!, ctx.lookup, ctx.poolCandidates);
            }
          : undefined,
      }),
    );
  }
  wrap.append(list);

  const controls = document.createElement('div');
  controls.className = 'metube-portability-actions';
  if (active) {
    const regenerate = document.createElement('button');
    regenerate.type = 'button';
    regenerate.textContent = 'Regenerate Viewstream';
    regenerate.addEventListener('click', () => {
      void refreshAcquisition().then(() => {
        lastComposed = null;
        void showTab('viewstream');
      });
    });
    controls.append(regenerate);
  }
  wrap.append(controls);

  wrap.append(
    renderExposurePanel(
      ctx.exposureReport,
      active
        ? `Budget: ${summarizeExposureBudget(active.config.exposureBudget ?? {})}`
        : null,
    ),
  );
  return wrap;
}

// ---------------------------------------------------------------------------
// VIEWPOINTS tab
// ---------------------------------------------------------------------------

async function renderViewpointsTab(
  repo: ReturnType<typeof openViewpointRepository>,
  viewpoints: Viewpoint[],
  viewlists: import('../model/viewpoint').Viewlist[],
  active: Viewpoint | null,
): Promise<HTMLElement> {
  const wrap = document.createElement('section');
  wrap.append(
    renderViewpointManager(repo, viewpoints, viewlists, active ? active.id : null, {
      onActivate: () => {
        lastComposed = null;
        void showTab('viewstream');
      },
      onRefreshFeed: () => void showTab('viewpoints'),
    }),
  );

  // Demo-instance management: removal is always available when demo
  // instances exist. User forks carry different ids and are untouched.
  const demoInstances = viewpoints.filter((v) => isDemoViewpoint(v));
  if (demoInstances.length > 0) {
    const box = document.createElement('div');
    box.className = 'metube-demo-management';
    const note = document.createElement('p');
    note.textContent =
      `${demoInstances.length} demo Viewpoint${demoInstances.length === 1 ? '' : 's'} present (marked DEMO INSTANCE). ` +
      'They are ordinary Viewpoints — editable, duplicable, deletable. Removing the demos removes only the marked demo instances; any copies or forks you made keep their own ids and stay.';
    box.append(note);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove demo Viewpoints';
    removeBtn.addEventListener('click', () => {
      void (async () => {
        const removed = await removeDemoViewpoints(repo);
        if (active && removed.includes(active.id)) {
          lastComposed = null;
          await showTab('viewpoints');
        } else {
          await showTab('viewpoints');
        }
      })();
    });
    box.append(removeBtn);
    wrap.append(box);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// VIEWLISTS tab
// ---------------------------------------------------------------------------

async function renderViewlistsTab(
  repo: ReturnType<typeof openViewpointRepository>,
  viewpoints: Viewpoint[],
  viewlists: import('../model/viewpoint').Viewlist[],
  active: Viewpoint | null,
): Promise<HTMLElement> {
  // Grouped-by-subject surface: the manager's Viewlist section, plus
  // per-Viewpoint grouping of the user's Viewpoints into their lists.
  const wrap = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = 'Viewlists — groups of Viewpoints by subject';
  wrap.append(h);

  if (viewpoints.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No Viewpoints yet. Create Viewpoints first.';
    wrap.append(p);
    return wrap;
  }

  const assigned = new Set<string>();
  for (const list of viewlists) {
    for (const id of list.viewpointIds) assigned.add(id);
  }

  const unassignedBox = document.createElement('div');
  unassignedBox.className = 'metube-vp-viewlist';
  const unassignedTitle = document.createElement('div');
  unassignedTitle.className = 'metube-vp-viewlist-title';
  unassignedTitle.textContent = 'Unassigned Viewpoints';
  unassignedBox.append(unassignedTitle);
  for (const vp of viewpoints) {
    if (assigned.has(vp.id)) continue;
    const label = document.createElement('div');
    label.textContent = `${vp.title}${active && vp.id === active.id ? ' ●' : ''}`;
    unassignedBox.append(label);
  }
  if (assigned.size < viewpoints.length) wrap.append(unassignedBox);

  // Render the full interactive Viewlist management from the manager.
  const manager = renderViewpointManager(
    repo, viewpoints, viewlists, active ? active.id : null,
    {
      onActivate: () => {
        lastComposed = null;
        void showTab('viewstream');
      },
      onRefreshFeed: () => void showTab('viewlists'),
    },
  );
  // Keep only the Viewlist section from the manager (the first section is
  // the Viewpoint list, already shown on the VIEWPOINTS tab).
  const listSection = manager.querySelector('.metube-vp-viewlists')?.cloneNode(true) as HTMLElement | undefined;
  if (listSection) wrap.append(listSection);
  else {
    const p = document.createElement('p');
    p.textContent = 'No Viewlists yet.';
    wrap.append(p);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// COVERAGE tab (autopsy + blind spots + coverage map + time machine)
// ---------------------------------------------------------------------------

async function renderCoverageTab(active: Viewpoint | null): Promise<HTMLElement> {
  const wrap = document.createElement('section');

  const ctx = lastComposed ?? (lastComposed = await composeNow(active));
  const profile = await loadProfile();
  const feedCands = ctx.snapshot.feed.map((f) => f.candidate);

  // --- Feed autopsy --------------------------------------------------------
  const autopsy = computeFeedAutopsy(
    ctx.snapshot.feed,
    ctx.poolCandidates,
    ctx.activeViewpoint,
    profile,
    ctx.lookup,
    ctx.exposureReport,
    nowIso(),
  );
  wrap.append(renderAutopsyPanel(autopsy));

  // --- Blind spots --------------------------------------------------------
  if (active) {
    const blindSpots = computeBlindSpots(ctx.poolCandidates, feedCands, ctx.lookup, profile);
    wrap.append(
      renderBlindSpotMap(blindSpots, {
        onExplore: (spot) => {
          void exploreFromRegion(active, spot);
        },
      }),
    );
  }

  // --- Coverage map --------------------------------------------------------
  const coverage = computeCoverageMap(feedCands, ctx.lookup, profile, nowIso());
  wrap.append(renderCoverageMap(coverage));

  // --- Time Machine -------------------------------------------------------
  wrap.append(
    renderTimeMachinePanel(
      active ? active.config.timeMachine : undefined,
      active ? comparePeriods(ctx.poolCandidates, active.config.timeMachine ?? {
        anchorDate: nowIso(),
        preEventDays: 30,
        duringEventDays: 7,
        postEventDays: 30,
        retrospectiveAfterDays: 60,
      }, ctx.lookup) : null,
      active !== null,
      {
        onConfigChange: (config: TimeMachineConfig) => {
          void (async () => {
            const repo = openViewpointRepository(store);
            const current = active ? await repo.get(active.id) : undefined;
            if (!current) return;
            await repo.update({
              ...current,
              config: { ...current.config, timeMachine: config },
              updatedAt: nowIso(),
            });
            await showTab('coverage');
          })();
        },
      },
    ),
  );

  // --- Portability (lives with coverage data: it moves the lenses) ---------
  wrap.append(renderPortabilitySection());
  return wrap;
}

/** Portability surface with wired export/import. */
function renderPortabilitySection(): HTMLElement {
  const wrap = renderPortabilityPanel({
    onExport: (includeFeedback: boolean) => {
      void (async () => {
        const repo = openViewpointRepository(store);
        const [viewpoints, viewlists, overrides, activeId, profile] = await Promise.all([
          repo.list(),
          repo.listViewlists(),
          loadOverrides(store),
          store.getKv('active-viewpoint-id'),
          loadProfile(),
        ]);
        const doc = buildExport(
          {
            viewpoints,
            viewlists,
            classificationOverrides: overrides,
            preferences: {
              activeViewpointId: (activeId as string | null) ?? null,
              fixtureMode: (await store.getKv(FIXTURE_MODE_KEY)) === true,
            },
            feedback: profile.feedback,
          },
          { includeFeedback },
          nowIso(),
        );
        const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `metube-export-${nowIso().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      })();
    },
    onImport: (raw: unknown, mode: ImportMode) => {
      void (async () => {
        const result = parseImport(raw);
        const mount = document.getElementById('metube-mount');
        const section = mount?.querySelector('.metube-portability');
        if (!result.ok) {
          section?.querySelector('.metube-portability-result')?.remove();
          section?.append(renderPortabilityResult(`Import rejected: ${result.error.message}`));
          return;
        }
        const data = result.value;
        const repo = openViewpointRepository(store);
        const [myViewpoints, myViewlists, myOverrides, myProfile] = await Promise.all([
          repo.list(),
          repo.listViewlists(),
          loadOverrides(store),
          loadProfile(),
        ]);
        await (async () => {
          // Merge + persist viewpoints.
          const mergedVps = mergeById(myViewpoints, data.viewpoints, mode);
          await store.putKv('viewpoints', mergedVps);
          // Merge + persist viewlists.
          const mergedLists = mergeById(myViewlists, data.viewlists, mode);
          await store.putKv('viewlists', mergedLists);
          // Merge overrides (by videoId+dimension key).
          const overrideKey = (o: ClassificationOverride) => `${o.videoId}::${o.dimension}`;
          const mine = new Map(myOverrides.map((o) => [overrideKey(o), o] as const));
          const theirs = new Map(data.classificationOverrides.map((o) => [overrideKey(o), o] as const));
          if (mode === 'import-wins') {
            for (const [k, o] of mine) if (!theirs.has(k)) theirs.set(k, o);
            await store.putKv('classification-overrides', [...theirs.values()]);
          } else {
            for (const [k, o] of theirs) if (!mine.has(k)) mine.set(k, o);
            await store.putKv('classification-overrides', [...mine.values()]);
          }
          // Feedback: applied only when present in the import document.
          if (data.feedback.length > 0) {
            const merged = mergeFeedback(myProfile.feedback, data.feedback);
            await store.putKv('user-profile', { ...myProfile, feedback: merged, updatedAt: nowIso() });
          }
          // Preferences: active viewpoint applied only when it resolves.
          if (data.preferences.activeViewpointId) {
            const exists = mergedVps.some((v) => v.id === data.preferences.activeViewpointId);
            if (exists && mergedVps.find((v) => v.id === data.preferences.activeViewpointId)?.enabled) {
              await store.putKv('active-viewpoint-id', data.preferences.activeViewpointId);
            }
          }
        })();
        lastComposed = null;
        const message =
          `Imported (mode: ${mode}): ${data.viewpoints.length} Viewpoint(s), ${data.viewlists.length} Viewlist(s), ` +
          `${data.classificationOverrides.length} override(s)` +
          (data.feedback.length > 0 ? `, ${data.feedback.length} feedback record(s)` : '') + '.';
        // Re-render first: showTab wipes the mount, so the result line
        // must be appended AFTER the fresh render, never before it.
        await showTab('coverage');
        document
          .querySelector('#metube-mount .metube-portability')
          ?.append(renderPortabilityResult(message));
      })();
    },
  });
  return wrap;
}

// ---------------------------------------------------------------------------
// SAVED tab
// ---------------------------------------------------------------------------

async function renderSavedTab(): Promise<HTMLElement> {
  const profile = await loadProfile();
  // Saves are global exposure facts: resolve titles from the GLOBAL
  // candidate catalog, not the active Viewpoint's working set.
  const pool = await loadPool(store);
  const candidates = pool.entries.map(toCandidateVideo);
  return renderSavedPanel(profile, candidates);
}

// ---------------------------------------------------------------------------
// Inspector (with Phase 5 provenance chain)
// ---------------------------------------------------------------------------

/**
 * Lookup wrapper over enriched candidates (videoId -> classification).
 */
function classificationIndexFor(
  enriched: import('../classification/enrich').EnrichedCandidate[],
): (videoId: string) => import('../model/classification').VideoClassification | undefined {
  const index = new Map(enriched.map((c) => [c.id, c.classification]));
  return (videoId) => index.get(videoId);
}

/**
 * Open the candidate inspector below the clicked card. One inspector is
 * open at a time; overrides persist through the store (surviving pool
 * regeneration by design). Phase 5: the full five-step provenance chain
 * renders above the dimension panels.
 */
async function openInspector(
  item: import('../model/types').FeedCandidate,
  card: HTMLElement,
  ctx: ComposedContext,
): Promise<void> {
  const existing = document.querySelector('.metube-inspector-wrap');
  if (existing) existing.remove();
  const overrides = await loadOverrides(store);
  const classification = ctx.lookup(item.candidate.id);

  const chain = buildProvenanceChain({
    item,
    viewpoint: ctx.activeViewpoint,
    classification,
    poolProvenance: null, // pool provenance travels on PoolEntry; see note below
    inclusion: inclusionBasisFor(item, ctx),
  });

  const panel = document.createElement('div');
  panel.className = 'metube-inspector-wrap';
  const infoMapPanel = renderCandidateInspector(item, classification, overrides, {
    onSetOverride: (videoId, dimension, value, note) => {
      void setOverride(store, {
        videoId,
        dimension,
        value,
        setAt: nowIso(),
        note,
      }).then(() => openInspector(item, card, ctx));
    },
    onClearOverride: (videoId, dimension) => {
      void clearOverride(store, videoId, dimension).then(() =>
        openInspector(item, card, ctx),
      );
    },
    onClose: () => {
      panel.remove();
    },
  });
  panel.append(renderProvenancePanel(chain));
  panel.append(infoMapPanel);
  card.after(panel);
}

/**
 * Inclusion basis: the composer's per-rule report states which rules were
 * satisfied; the chain restates "main-walk" unless the item counts toward
 * a floor or the exploration reservation. The arithmetic is the
 * composer's; this maps it to the chain's vocabulary.
 */
function inclusionBasisFor(
  item: FeedCandidate,
  ctx: ComposedContext,
): InclusionBasis {
  if (!ctx.activeViewpoint) return { basis: 'main-walk' };
  const budget = ctx.activeViewpoint.config.exposureBudget ?? {};
  const positiveTopics = new Set(ctx.activeViewpoint.config.positiveTopicConstraints);
  const isExploration =
    positiveTopics.size > 0 &&
    !item.candidate.topicIds.some((t) => positiveTopics.has(t));
  if (isExploration && (budget.explorationShare ?? 0) > 0) {
    return { basis: 'exploration-reservation' };
  }
  if (budget.minUnfamiliarChannelShare !== undefined) {
    // Floor reservation is decided by the composer's reservation walk; the
    // per-item basis is not separately recorded in the snapshot, so the
    // chain reports the main walk and never invents a floor attribution.
    return { basis: 'main-walk' };
  }
  return { basis: 'main-walk' };
}

/**
 * Phase 4: user-initiated exploration from an underrepresented region.
 * Re-acquires candidates with the region's key as a seed concept for one
 * run, then regenerates the feed. No automatic retraining happens.
 */
async function exploreFromRegion(
  viewpoint: Viewpoint,
  spot: import('../viewpoints/blindspots').BlindSpot,
): Promise<void> {
  const seedLabel = spot.key.replace(/-/g, ' ');
  await store.putKv('exploration-seed', {
    viewpointId: viewpoint.id,
    regionKey: spot.key,
    regionLabel: spot.label,
    seedLabel,
    requestedAt: nowIso(),
  });
  lastComposed = null;
  await showTab('viewstream');
}

/**
 * Phase 4: compare-treatments panel. Opens below the clicked card and
 * lists evidenced same-subject different-position candidates with the
 * basis for each pairing. Evidence-only: nothing is invented.
 */
async function openComparePanel(
  item: FeedCandidate,
  card: HTMLElement,
  pairing: import('../viewpoints/pairing').PairingResult,
  lookup: (videoId: string) => import('../model/classification').VideoClassification | undefined,
  poolCandidates: import('../model/types').CandidateVideo[],
): Promise<void> {
  const existing = document.querySelector('.metube-compare');
  if (existing) existing.remove();
  const panel = document.createElement('div');
  panel.className = 'metube-compare';
  const heading = document.createElement('h4');
  heading.textContent = 'Compare treatments (evidenced pairings only)';
  panel.append(heading);
  const comparisons = comparisonsForItem(item, pairing, poolCandidates);
  if (comparisons.length === 0) {
    const none = document.createElement('p');
    none.textContent = 'No evidenced comparison exists for this item.';
    panel.append(none);
  }
  const ul = document.createElement('ul');
  for (const { other, basis } of comparisons) {
    const li = document.createElement('li');
    li.className = 'metube-compare-item';
    const title = document.createElement('span');
    title.textContent = other.title;
    const meta = document.createElement('span');
    meta.className = 'metube-compare-meta';
    meta.textContent = ` — ${other.channelTitle}`;
    const why = document.createElement('p');
    why.className = 'metube-compare-basis';
    why.textContent = `Evidence: ${basis}`;
    const st = lookup(other.id);
    if (st) {
      const stp = document.createElement('p');
      stp.className = 'metube-compare-classification';
      stp.textContent = `Classified source type: ${st.sourceType.value} (${st.sourceType.method}).`;
      li.append(stp);
    }
    li.append(title, meta, why);
    ul.append(li);
  }
  panel.append(ul);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => panel.remove());
  panel.append(close);
  card.after(panel);
}

/** Re-run acquisition for the active Viewpoint, bypassing the TTL cache. */
async function refreshAcquisition(): Promise<void> {
  const repo = openViewpointRepository(store);
  const active = await repo.getActive();
  if (!active) return;
  const provider = await resolveProvider();
  const pool = await loadPool(store);
  await acquireForViewpoint(store, provider as PlanCapableProvider, pool, {
    viewpointId: active.id,
    seedTopics: active.config.seedTopics,
    seedConcepts: active.config.seedConcepts,
    explicitChannels: active.config.seedChannels,
    seedPlaylists: active.config.seedPlaylists,
    resolveTopicLabel: makeTopicLabelResolver(),
    now: nowIso(),
    force: true,
  });
}

function hideFeed(): void {
  feedVisible = false;
  const mount = document.getElementById('metube-mount');
  if (mount) mount.className = 'metube-hidden';
}

function toggleFeed(): void {
  if (feedVisible) hideFeed();
  else void showTab('viewstream');
}

/**
 * Help menu — About + replay entry points. Explicit user action only;
 * replay never auto-starts and never resets onboarding.
 */
async function toggleHelpMenu(anchor: HTMLElement): Promise<void> {
  const existing = document.getElementById('metube-help-menu');
  if (existing) {
    existing.remove();
    return;
  }
  const menu = document.createElement('div');
  menu.id = 'metube-help-menu';
  menu.className = 'metube-help-menu';

  const about = document.createElement('p');
  about.textContent =
    'Slipgate — Escape Your Walled Garden. An independent exploration lens over YouTube: you author Viewpoints; discovery, classification, ranking, and inclusion are all inspectable. Slipgate never infers your identity from the Viewpoints you use.';
  menu.append(about);

  const tourState = await readTourState(store);
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.textContent =
    tourState.status === 'never-started' ? 'Start guided tour' : 'Replay guided tour';
  replay.addEventListener('click', () => {
    document.getElementById('metube-help-menu')?.remove();
    void (async () => {
      await startTour(store, nowIso());
      await showTab('viewstream');
    })();
  });
  menu.append(replay);

  anchor.after(menu);
}

function injectStyles(): void {
  // Idempotent: page reloads re-run the content script; a duplicate style
  // block would double-apply every rule (observed as styles:2 in Firefox).
  if (document.getElementById('metube-styles')) return;
  const style = document.createElement('style');
  style.id = 'metube-styles';
  style.textContent = FEED_STYLES;
  document.head.append(style);
}

function bootstrap(): void {
  injectStyles();
  const inserted = insertNavEntry(toggleFeed);
  if (inserted) {
    console.info('[MeTube] nav entry inserted');
  }
  // YouTube is a SPA; re-insert when navigation replaces the guide.
  const mo = new MutationObserver(() => {
    if (
      !document.getElementById('metube-nav-entry') &&
      !document.getElementById('metube-floating-toggle')
    ) {
      insertNavEntry(toggleFeed);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

bootstrap();