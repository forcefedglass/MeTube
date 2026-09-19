/**
 * Content script entry point. Orchestration lives here:
 *   nav entry -> feed assembly -> card rendering -> feedback -> persistence.
 *
 * Runs on youtube.com pages only (see manifest). It never reads YouTube's
 * own recommendations, never touches the watch history, and never
 * propagates anything to any server.
 */

import { emptyUserProfile } from '../model/types';
import type { FeedbackKind, UserFeedback, UserProfile } from '../model/types';
import { PHASE4_FEEDBACK_KINDS, FEEDBACK_LABELS } from '../model/feedback';
import { FixtureCandidateProvider } from '../discovery/fixture-provider';
import { YouTubeWebProvider } from '../discovery/youtube-web';
import type { PlanCapableProvider } from '../discovery/provider';
import type { HtmlFetch } from '../discovery/youtube-web';
import { assembleFeed } from '../discovery/assemble-feed';
import {
  acquireForViewpoint,
  loadPool,
  FIXTURE_MODE_KEY,
} from '../discovery/pool';
import type { PoolState } from '../discovery/pool';
import { toCandidateVideo } from '../discovery/pool';
import { assembleViewstream } from '../viewpoints/viewstream';
import { openLocalStore } from '../storage/local-store';
import type { LocalStore } from '../storage/local-store';
import { insertNavEntry, ensureMount } from '../youtube/nav';
import { renderFeedCard } from '../ui/feed-card';
import { FEED_STYLES } from '../ui/styles';
import { openViewpointRepository, VIEWPOINT_SEEDED_KEY } from '../viewpoints/repository';
import { seedDemoViewpoints } from '../viewpoints/demo';
import { summarizeViewpoint } from '../model/viewpoint';
import { renderViewpointManager } from '../ui/viewpoint-manager';
import { renderPoolInspector } from '../ui/pool-inspector';
import { renderCandidateInspector } from '../ui/candidate-inspector';
import { renderCoverageMap } from '../ui/coverage-map';
import { FIXTURE_TOPICS } from '../discovery/fixtures';
import { FIXTURE_CHANNELS } from '../discovery/fixtures';
import { FIXTURE_NARRATIVE_CLUSTERS } from '../discovery/fixtures';
import { buildCatalog } from '../model/catalog';
import { enrichCandidates } from '../classification/enrich';
import { loadOverrides, setOverride, clearOverride } from '../classification/overrides';
import type { ClassificationOverride } from '../model/classification';
import { computeCoverageMap } from '../discovery/coverage';
import type { ExposureReport } from '../model/exposure';
import type { GenerationHistoryEntry } from '../model/exposure';
import { recordFeedbackThroughFirewall } from '../viewpoints/firewall';
import type { FeedCandidate } from '../model/types';
import {
  findPerspectivePairs,
  comparisonsForItem,
} from '../viewpoints/pairing';
import { computeBlindSpots } from '../viewpoints/blindspots';
import { renderExposurePanel } from '../ui/exposure-panel';
import { renderBlindSpotMap } from '../ui/blindspot-map';

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
let panelMode: 'feed' | 'manager' = 'feed';

async function ensureSeeded(): Promise<void> {
  const seeded = await store.getKv(VIEWPOINT_SEEDED_KEY);
  if (seeded === true) return;
  const repo = openViewpointRepository(store);
  await seedDemoViewpoints(repo);
  await store.putKv(VIEWPOINT_SEEDED_KEY, true);
}

async function showFeed(): Promise<void> {
  feedVisible = true;
  panelMode = 'feed';
  const mount = ensureMount();
  mount.className = 'metube-visible';
  if (!mounted) {
    mounted = true;
    injectStyles();
  }
  mount.replaceChildren();
  const header = document.createElement('h2');
  header.textContent = 'MeTube feed';
  mount.append(header);

  await ensureSeeded();
  const repo = openViewpointRepository(store);
  const active = await repo.getActive();
  const provider = await resolveProvider();

  let snapshot: import('../model/types').FeedSnapshot;
  let lookup: (videoId: string) => import('../model/classification').VideoClassification | undefined =
    () => undefined;
  let overrides: ClassificationOverride[] = [];
  let exposureReport: ExposureReport | null = null;
  let poolCandidates: import('../model/types').CandidateVideo[] = [];
  let pairingResult: import('../viewpoints/pairing').PairingResult | null = null;
  if (active) {
    // Viewstream: acquire (or serve from pool cache), then compose through
    // the active Viewpoint. Phase 4: composition runs under the
    // Viewpoint's exposure budget with an honest per-rule report.
    const profile = await loadProfile();
    const pool = await loadPool(store);
    const { state: nextPool } = await acquireForViewpoint(store, provider as PlanCapableProvider, pool, {
      viewpointId: active.id,
      seedTopics: active.config.seedTopics,
      seedConcepts: active.config.seedConcepts,
      explicitChannels: active.config.seedChannels,
      seedPlaylists: active.config.seedPlaylists,
      resolveTopicLabel: makeTopicLabelResolver(),
      now: nowIso(),
    });
    const candidates = nextPool.entries.map(toCandidateVideo);
    // Phase 3: classify + override -> enrichment. Topic and narrative
    // cluster ids become real, Viewpoint filters and ranking start working
    // on real candidates, and every classification carries its audit trail.
    overrides = await loadOverrides(store);
    const catalog = workingCatalog();
    const enriched = enrichCandidates(candidates, catalog, overrides, nowIso());
    lookup = classificationIndexFor(enriched);
    const feedCandidates = enriched.map(({ classification: _cls, ...c }) => c);
    poolCandidates = feedCandidates;
    // Phase 4: generation history for cooldowns (survives sessions).
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
    snapshot = composed.snapshot;
    exposureReport = composed.report;
    // Record the generation entry for cooldown arithmetic on the next run.
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
    // Phase 4: perspective pairing over the composed feed (evidence-gated).
    pairingResult = findPerspectivePairs(
      composed.snapshot.feed.map((f) => f.candidate),
      lookup,
    );
    const banner = document.createElement('p');
    banner.className = 'metube-viewpoint-banner';
    banner.textContent = `Active Viewpoint: ${active.title} — this Viewstream was generated through it.`;
    mount.append(banner);
    const summary = document.createElement('p');
    summary.className = 'metube-viewpoint-summary';
    summary.textContent = `Constraints: ${summarizeViewpoint(active)}`;
    mount.append(summary);
    if (active.config.assumptions.length > 0) {
      const assumptions = document.createElement('div');
      assumptions.className = 'metube-assumptions';
      const h4 = document.createElement('h4');
      h4.textContent = 'Assumptions for this Viewpoint (authored by you; never inferred)';
      assumptions.append(h4);
      const ul = document.createElement('ul');
      for (const a of active.config.assumptions) {
        const li = document.createElement('li');
        li.textContent = a;
        ul.append(li);
      }
      assumptions.append(ul);
      mount.append(assumptions);
    }
  } else {
    const note = document.createElement('p');
    note.textContent = 'Unlensed bootstrap feed: local fixtures only. Every score component is shown per card. Activate a Viewpoint to generate a Viewstream.';
    mount.append(note);
    const profile = await loadProfile();
    snapshot = await assembleFeed(provider, { limit: 8, profile }, nowIso());
  }
  await store.saveFeed(snapshot);
  const list = document.createElement('div');
  list.className = 'metube-feed-list';
  for (const item of snapshot.feed) {
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
              active ? active.id : null,
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
        onInspect: (clicked, card) => {
          void openInspector(clicked, card, lookup, overrides);
        },
        // Phase 4: evidenced comparisons with other treatments of the
        // same subject. Absent when no evidence supports a pairing.
        onCompare: pairingResult
          && comparisonsForItem(item, pairingResult, poolCandidates).length > 0
          ? (card) => {
              void openComparePanel(item, card, pairingResult, lookup, poolCandidates);
            }
          : undefined,
      }),
    );
  }
  mount.append(list);

  // Link to the manager from the feed itself: Viewpoints must be inspectable.
  const manage = document.createElement('button');
  manage.type = 'button';
  manage.textContent = 'Manage Viewpoints';
  manage.addEventListener('click', () => void showManager());
  mount.append(manage);

  // Phase 4: explicit regeneration. Re-runs acquisition (bypassing the
  // pool TTL) and composes a fresh Viewstream through the same budget.
  // Cooldowns and exposure budgets apply honestly; repeated regeneration
  // never Manufactures new diversity.
  if (active) {
    const regenerate = document.createElement('button');
    regenerate.type = 'button';
    regenerate.textContent = 'Regenerate Viewstream';
    regenerate.addEventListener('click', () => void refreshAcquisition().then(() => showFeed()));
    mount.append(regenerate);
  }

  // Phase 4: "Why this Viewstream looks like this" — exposure budget
  // satisfaction and violations, fully visible, never hidden behind ML.
  mount.append(
    renderExposurePanel(
      exposureReport,
      active
        ? `Budget: ${summarizeExposureBudget(active.config.exposureBudget ?? {})}`
        : null,
    ),
  );

  // Phase 4: coverage / blind-spot view for the active Viewpoint.
  if (active) {
    const blindSpots = computeBlindSpots(
      poolCandidates,
      snapshot.feed.map((f) => f.candidate),
      lookup,
      await loadProfile(),
    );
    mount.append(
      renderBlindSpotMap(blindSpots, {
        // User-initiated exploration from an underrepresented region:
        // regenerate the feed seeded from that region. The region is a
        // descriptive fact, not a recommendation to adopt a perspective.
        onExplore: (spot) => {
          void exploreFromRegion(active, spot);
        },
      }),
    );
  }

  // Phase 3: the coverage map lives on the feed — representation is
  // quantified every time the pool is inspected, never hidden.
  const coverage = computeCoverageMap(
    snapshot.feed.map((f) => f.candidate),
    lookup,
    await loadProfile(),
    nowIso(),
  );
  mount.append(renderCoverageMap(coverage));
}

/**
 * Phase 4: user-initiated exploration from an underrepresented region.
 * Re-acquires candidates with the region's key as a seed concept for one
 * run, then regenerates the feed. No automatic retraining happens.
 */
async function exploreFromRegion(
  viewpoint: import('../model/viewpoint').Viewpoint,
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
  await showFeed();
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
    li.prepend(title, meta);
    li.append(why);
    ul.append(li);
  }
  panel.append(ul);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => panel.remove());
  panel.append(close);
  card.after(panel);
  void lookup;
}

/** Lookup wrapper over enriched candidates (videoId -> classification). */
function classificationIndexFor(
  enriched: import('../classification/enrich').EnrichedCandidate[],
): (videoId: string) => import('../model/classification').VideoClassification | undefined {
  const index = new Map(enriched.map((c) => [c.id, c.classification]));
  return (videoId) => index.get(videoId);
}

/**
 * Open the candidate inspector below the clicked card. One inspector is
 * open at a time; overrides persist through the store (surviving pool
 * regeneration by design).
 */
async function openInspector(
  item: import('../model/types').FeedCandidate,
  card: HTMLElement,
  lookup: (videoId: string) => import('../model/classification').VideoClassification | undefined,
  initialOverrides: ClassificationOverride[],
): Promise<void> {
  const existing = document.querySelector('.metube-inspector');
  if (existing) existing.remove();
  const overrides = await loadOverrides(store);
  const classification = lookup(item.candidate.id);
  const panel = renderCandidateInspector(item, classification, overrides, {
    onSetOverride: (videoId, dimension, value, note) => {
      void setOverride(store, {
        videoId,
        dimension,
        value,
        setAt: nowIso(),
        note,
      }).then(() => openInspector(item, card, lookup, overrides));
    },
    onClearOverride: (videoId, dimension) => {
      void clearOverride(store, videoId, dimension).then(() =>
        openInspector(item, card, lookup, overrides),
      );
    },
    onClose: () => {
      panel.remove();
    },
  });
  card.after(panel);
  void initialOverrides;
}

async function showManager(): Promise<void> {
  feedVisible = true;
  panelMode = 'manager';
  const mount = ensureMount();
  mount.className = 'metube-visible';
  if (!mounted) {
    mounted = true;
    injectStyles();
  }
  mount.replaceChildren();
  await ensureSeeded();
  const repo = openViewpointRepository(store);
  const [viewpoints, viewlists, activeId] = await Promise.all([
    repo.list(),
    repo.listViewlists(),
    store.getKv('active-viewpoint-id'),
  ]);
  const activeVp = await repo.getActive();
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back to feed';
  back.addEventListener('click', () => void showFeed());
  mount.append(back);
  mount.append(
    renderViewpointManager(repo, viewpoints, viewlists, activeVp ? activeVp.id : (activeId as string | null), {
      onActivate: () => void showFeed(),
      onRefreshFeed: () => void showManager(),
    }),
  );

  // Pool inspector: acquisition is observable, always.
  const pool = await loadPool(store);
  mount.append(
    renderPoolInspector(pool, nowIso(), () => {
      void refreshAcquisition().then(() => showManager());
    }),
  );
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
  else void showFeed();
}

function injectStyles(): void {
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