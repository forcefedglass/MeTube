# MeTube — durable project context

This file is the durable memory of the MeTube project. Update it whenever
state changes. Labels: `VERIFIED` (tested as stated), `IMPLEMENTED` (built,
not fully tested), `PROVISIONAL` (expected to change), `OPEN` (undecided),
`FROZEN` (do not change), `DEPRECATED` (kept for reference only).

## Thesis (FROZEN)

MeTube is an independent discovery and recommendation layer for YouTube.
Not an ad blocker, UI skin, political-balance tool, or re-ranker of
YouTube's Home feed. "Don't predict what I want to believe. Help me see
what I haven't seen." Exploration must not contaminate the user's normal
YouTube recommendation profile.

## State (2026-09-18, Phase 4 Viewstream composer complete)

### VERIFIED

- **Toolchain**: Node 22 / npm with `--include=dev` (the machine's global
  npm config sets `omit=["dev"]`; plain `npm install` silently skips
  devDependencies — always install with `--include=dev`).
- **Typecheck**: `npm run typecheck` (tsc --noEmit) passes clean.
- **Tests**: `npm test` → 143/143 pass (bootstrap 6 + Phase 1 22 + Phase 2 31
  + Phase 3 35 + Phase 4 49: composer budgets 25, feedback semantics +
  firewall + pairing + blind spots 24). Phase 4 coverage: exposure
  ceilings/floors on the final feed, honest per-rule violation reports,
  cooldown scoping, relief pass (soft rules never empty the feed),
  exploration wildcard pool bypass, feedback semantics taxonomy, exploration
  firewall (per-Viewpoint scoping; 'watched' recorded per-Viewpoint but
  stays an exposure fact), evidence-gated perspective pairing, descriptive
  blind spots (no prescriptions). Prior phases: classification
  explainability/determinism, UNKNOWN over invention, no political
  inference, override win + regeneration survival, enrichment → filter
  path, coverage map counts, assumptions inertness, yt-parser vs real
  captured fixtures, plan derivation, provider transport, pool
  merge/prune/TTL, toCandidateVideo sentinels, unknown-date window,
  temporal diversity exclusion, inspectPool, channel normalization,
  channel-id resolution, unparseable-window tolerance.
- **Extension build**: `npm run build` produces `dist/content.js` (IIFE,
  esbuild) + `dist/manifest.json` (MV3). Manifest carries NO permissions;
  acquisition fetches are same-origin from the youtube.com content script
  with `credentials: 'omit'`.
- **Phase 2 browser verification** (headed Chromium via xvfb-run, fresh
  profile each run; scripts under /tmp, e.g. `/tmp/verify-p2run4.mjs`,
  `/tmp/verify-p2chan9.mjs`, `/tmp/verify-p2cache.mjs`):
  - seed-search: activating "Aerospace Engineering (real acquisition)"
    acquired 12 real candidates (live search page), rendered 8 playable
    cards with real titles/channels and provenance
    `youtube-web:seed-search`; regeneration served from cache (0 new
    acquisition fetches).
  - channel-uploads: `@veritasium` → homepage fetch resolves
    `UCHnyfMqiRRG1u-2MsSQLbXA` → `/channel/UC.../videos` harvests 12 real
    candidates, 1 card (repetitionLimit=1 by design); canonical UC-id seed
    fetches `/channel/UC.../videos` directly (1 fetch).
  - playlist: `PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb` → 12 real candidates.
  - playback: real video ids embed through `youtube-nocookie.com` sandbox
    iframes (`sandbox="allow-scripts allow-same-origin allow-presentation"`,
    `referrerpolicy="no-referrer"`).
- **Live-page layout drift (2026-09-18)**: anonymous same-origin fetches of
  `/{@handle}/videos` now return the channel's *Playlists* tab variant (no
  video lockups). Verified workaround in the provider: resolve `@handle` →
  canonical `UC` id via the channel homepage
  (`metadata.channelMetadataRenderer.externalId`), then fetch
  `/channel/{UC id}/videos`, which serves the uploads grid (30 video
  lockups observed on The Space Race). Also observed: handles can be
  reassigned by YouTube (`@TheSpaceRace` → "Brad Lantz", a channel with zero
  public videos); the pipeline reports this honestly as an empty step, it
  does not fabricate.
- **Storage round-trip**: feed snapshots persist via the IndexedDB wrapper
  (MemoryLocalStore fallback used in tests; IdbLocalStore exercised in
  browser verification). Viewpoints/Viewlists/candidate pool persist via
  the KV store (arrays under `viewpoints` / `viewlists` / `candidate-pool`
  keys). Classification overrides persist under their own
  `classification-overrides` KV key (separate from the pool so they survive
  pool regeneration and MAX_POOL_SIZE pruning). No DB_VERSION bump.
- **Phase 3 browser verification** (headed Chromium via xvfb-run, fresh
  profile; script `/tmp/verify-p3.mjs`): with "Aerospace Engineering (real
  acquisition)" active, the feed rendered 8 cards with enrichment-derived
  topic ids (filter pass now operates on real classification output);
  clicking a card opened the candidate inspector showing why-this-appeared,
  topics/source type/narrative cluster/temporal position with confidence +
  origin + method + evidence, and working set/clear override controls; a
  set override reappeared verbatim after pool regeneration (TTL force
  refresh); the coverage map listed pool counts across all dimensions;
  Viewpoint assumptions display as a verbatim banner.

- **Phase 4 browser verification** (headless Chromium, persistent context,
  fresh profile, fixture provider mode via `use-fixture-provider` KV; script
  `/tmp/e2e-phase4.mjs`, 16/16 checks): with the "Deliberate Exposure Mix"
  demo Viewpoint active, the feed composed under a 6-rule exposure budget
  and the "Why this Viewstream looks like this" panel reported every rule
  with satisfied/violated status + explanation (3 satisfied, 3 honestly
  violated with degradation reasons on the tiny fixture pool); blind-spot
  map rendered (honest none-note when no region is underrepresented; no
  prescriptive language in any spot description); "Compare treatments"
  buttons appeared only where evidenced pairings exist; feedback buttons
  split into exposure-fact vs preference groups; a preference signal
  recorded through the firewall carried the active Viewpoint id;
  generation history persisted for cooldown arithmetic; explicit
  "Regenerate Viewstream" re-composed (with cooldowns honestly reported as
  bypassed via the relief pass when soft rules would otherwise empty the
  feed).

### IMPLEMENTED

- **Viewstream composer** (`src/viewpoints/composer.ts`): Phase 4 core.
  `composeViewstream(candidates, ComposerContext)` → `{snapshot, report}`.
  Budget rules are ceilings/floors on shares of the FINAL composed feed
  (not of the limit): select from a ranked pool via reservation passes for
  floors (unfamiliar channels, alternate source types, historical material,
  exploration wildcards — each through take() so counters stay consistent),
  a main walk gated by ceilings + cooldowns, a relief pass (soft rules
  never empty the feed while hard-filter-passing candidates exist; the
  bypass is reported in the cooldown rule's explanation), and a final trim
  pass enforcing ceilings against the ACTUAL feed size (never below 1
  item). Deterministic. Honest degradation everywhere: a floor that cannot
  be met within ceilings reports violated; unknown classifications never
  count toward diversity floors; language/region rules report
  not-applicable ("recorded and inspectable but cannot be evaluated;
  never satisfied by guessing"). Exploration candidates bypass ONLY the
  positive-topic pool filter (they exist precisely to admit out-of-topic
  material; negative topics, source and unfamiliarity filters still
  apply). `ExposureBudget` on ViewpointConfig; every rule user-editable
  via the manager's budget fields; per-rule statuses shown on the feed.
- **Exposure budgets** (`src/model/exposure.ts`): maxSingleChannelShare,
  maxSingleNarrativeShare, maxSingleTopicShare, minUnfamiliarChannelShare,
  minAlternateSourceTypeShare, minHistoricalShare, explorationShare,
  repeatedChannelCooldown, repeatedNarrativeCooldown,
  minDistinctLanguages, minDistinctRegions, minDistinctScaleBands
  (all optional; {} = no budget rules → legacy assembly path).
  GenerationHistoryEntry (generation, composedAt, viewpointId, channels,
  narrativeClusters) persisted under KV `generation-history` (capped 64);
  cooldowns are computed per-Viewpoint from that history.
- **Feedback semantics** (`src/model/feedback.ts`): 12 explicit kinds —
  exposure facts (watched, skipped, saved), preference-positive
  (good-recommendation, more-like-this, more-from-source, more-topic,
  more-narrative-region),
  preference-negative (less-from-source, less-topic, not-interested),
  representation-notes (interesting-no-extrapolate,
  cluster-overrepresented). `FEEDBACK_SEMANTICS` declares each kind's
  class; `countsAsFamiliar` (exposure facts + more-like-this); `isViewpointScoped`
  (everything except saved/skipped — watched is recorded per-Viewpoint as
  an audit trail but remains an exposure fact globally).
- **Exploration firewall** (`src/viewpoints/firewall.ts`):
  `feedbackVisibleTo(profile, viewpointId)`, `recordFeedbackThroughFirewall`,
  `trainingFeedbackFor` (the lens a Viewpoint trains on: global exposure
  facts + this Viewpoint's scoped signals). Feedback inside one Viewpoint
  never trains unrelated Viewpoints; the unlensed bootstrap path and
  normal YouTube stay untouched. `assembleViewstream` routes the LENSED
  profile into both ranking and composition.
- **Perspective pairing** (`src/viewpoints/pairing.ts`):
  `findPerspectivePairs(candidates, lookup)` → pairs over the composed
  feed where candidates share topic ids AND differ in narrative cluster
  ids or source type (unknown classifications never form a pairing basis).
  `buildComparisonGroups` = connected components (2..n members; 1 and 2+
  clusters are both honest outcomes — no forced two-sided symmetry).
  "Compare treatments" per card only when a pairing exists; the panel
  shows each member + the evidential basis.
- **Blind-spot view** (`src/viewpoints/blindspots.ts`):
  `computeBlindSpots(pool, feed, lookup, profile)` → descriptive regions
  where the pool offers material the feed underrepresents
  (feedCount*2 < poolCount) across topic / source type / narrative cluster
  / temporal position dimensions. Unknown regions are skipped (a fact, not
  a gap to fill). Every spot carries counts + a sample of pool candidates
  for user-initiated "Explore from here" (writes an exploration-seed KV
  entry; acquisition integration is future work). Descriptions state
  facts; they never prescribe adopting a perspective.
- **Exposure panel UI** (`src/ui/exposure-panel.ts`): "Why this
  Viewstream looks like this" — per-rule status, observed values,
  explanations; honest violated/not-applicable states.
- **Blind-spot map UI** (`src/ui/blindspot-map.ts`): descriptive spot
  list + Explore-from-here buttons; honest none-note when fully covered.
- **Feed-card feedback UI**: exposure-fact group (watched/skipped/saved)
  kept visually and semantically separate from the preference group (all
  12 kinds labeled).
- **Floating toggle fallback** (`src/youtube/nav.ts`): when YouTube's
  guide is absent (compact layouts, consent walls), a fixed-position
  toggle button keeps MeTube reachable. Styles injected at bootstrap.
- **Fixture provider plan support**: `FixtureCandidateProvider.runPlan`
  implements the same plan-driven pipeline as the real provider (word-level
  seed-search matching, honest empty steps) so development mode exercises
  the full pipeline. `PlanCapableProvider` interface in
  `src/discovery/provider.ts`; `acquireForViewpoint` accepts it (the hard
  YouTubeWebProvider cast removed — found via live E2E crash).
- **DEMO viewpoint**: "Deliberate Exposure Mix" seeds topics +
  6 budget rules (channel ≤30%, narrative ≤40%, ≥25% unfamiliar,
  ≥25% alternate source types, 15% exploration, channel cooldown 1) so
  the composer is observable out of the box.
- **Information-map model** (`src/model/classification.ts`): source-type
  taxonomy (official, publication, independent-creator,
  enthusiast-community, technical-analyst, academic-expert, primary-source,
  promotional-sponsored-only-where-evidenced, unknown), temporal positions
  (contemporary, historical, pre-event, post-event, retrospective,
  unknown), `ClassifiedValue` (value + confidence + origin + method +
  evidence), channel familiarity bands, provenance edge kinds, coverage-map
  types. No political dimension exists anywhere in the model.
- **Classifier** (`src/classification/classify.ts`): deterministic
  evidence-based lexicons. Source type fires only on explicit markers
  (channel-title or title/description text); sponsorship only where
  disclosed in text. Temporal position from explicit framing only —
  publication age NEVER establishes position relative to subject.
  Narrative clusters: provider-carried ids only (resolved in catalog), NO
  lexical fallback (would fabricate framing relationships). Topics:
  provider pass-through (confidence 0.9) + one-per-candidate lexical
  fallback (0.5). `buildProvenanceEdges`: evidenced edges only.
- **Overrides** (`src/classification/overrides.ts`): per videoId+dimension;
  own KV key `classification-overrides`; applied at read/enrich time so
  they survive pool regeneration and pruning by design; user value always
  wins with confidence 1 and origin `user-override`, note shown verbatim.
- **Enrichment** (`src/classification/enrich.ts`): classifies pool
  candidates, applies overrides, injects topicIds/narrativeClusterIds onto
  candidates so Viewpoint filters + ranking operate on real classification
  output; full audit trail kept on `classification` property;
  catalog-resolving cluster ids only.
- **Coverage map** (`src/discovery/coverage.ts`): pool counts per topic /
  source type / narrative cluster / temporal position / age band (fixed
  taxonomy incl. zero counts) / channel familiarity / channel, plus
  unknown-date and unclassified totals. Counts describe, never judge.
- **Candidate inspector UI** (`src/ui/candidate-inspector.ts`): opens on
  feed-card click; shows why-this-appeared (reason + per-component
  explanations), discovery provenance (primary + also-seen-via), every
  dimension with value/confidence/origin/method/evidence verbatim, override
  set/clear controls. One inspector open at a time.
- **Coverage map UI** (`src/ui/coverage-map.ts`): plain fact lists on the
  feed (deliberately not a polished visualization, per Phase 3 scope).
- **Viewpoint assumptions**: `assumptions: string[]` on ViewpointConfig
  (defaults []); free-text premises authored by the user, displayed
  verbatim as a feed banner, editable via the manager field; never
  influence filtering/ranking/classification.
- **Phase 3 tests** (`tests/classification.test.ts`): 35 tests covering
  explainability invariants, determinism, UNKNOWN-over-invention,
  no-political-inference, override precedence + regeneration survival,
  enrichment → Viewpoint filter path, coverage counting, assumptions
  inertness.
- **Discovery model** (`src/model/discovery.ts`): acquisition methods
  (seed-search, channel-uploads, explicit-video, playlist), discovery
  plans (MAX_PLAN_STEPS=6, MAX_PER_STEP=12), `CandidateProvenance`,
  `DiscoveredCandidate` (all metadata nullable), `UNKNOWN_DATE` sentinel +
  `isUnknownDate`, `deriveDiscoveryPlan` (concepts → resolvable topics →
  channels → playlists; unresolvable topic ids produce no step, never a
  guessed query), `normalizeChannelTarget` (@handle/bare handle/handle URL/
  UC id/channel URL all dedupe), `normalizePlaylistTarget`.
- **Pure page parsers** (`src/discovery/yt-parser.ts`): `parseYtInitialData`
  (regex + JSON.parse), search results (`videoRenderer` deep-walk), channel
  uploads + playlists (`lockupViewModel` deep-walk, LOCKUP_CONTENT_TYPE_VIDEO
  only), `parseChannelId` (handle homepage → canonical UC id),
  `parseAlertError`, `parseDuration`, `parseViewCount`, `parseRelativePublished`
  (verbose + compact forms; relative dates → null, never guessed absolutes).
- **YouTubeWebProvider** (`src/discovery/youtube-web.ts`): plan-driven real
  acquisition. One page fetch per step (two for @handle channels: resolve →
  uploads). Injectable `HtmlFetch` transport. HTTP/network error + alert-page
  handling; per-step cap + in-run dedup; every step reported, never
  retried within a run. `getCandidates` returns [] (pool owns persistence).
- **Candidate pool** (`src/discovery/pool.ts`): persistent KV cache
  (POOL_TTL_MS=6h, MAX_POOL_SIZE=600, oldest pruned), `mergeIntoPool`
  (first discovery wins; different seed+method appends provenance),
  `toCandidateVideo` (null → sentinel/fallbacks, never fabricates),
  `acquireForViewpoint` (TTL skip unless force), `inspectPool` (counts,
  methods, providers, discovering Viewpoints, cache age, duplicate
  suppression, failed steps, unknown dates, missing duration/channel).
- **Pool inspector UI** (`src/ui/pool-inspector.ts`): read-only facts panel
  rendered under the Viewpoint manager + "Refresh acquisition now"
  (bypasses TTL).
- **Extension wiring** (`src/extension/content.ts`): provider resolution
  (fixture mode only via `use-fixture-provider` KV flag; real provider is the
  default), Viewstream generation through the pool, topic-label resolver
  from the fixture topic table.
- **DEMO Viewpoints**: 9 seeded. Phase 2 DEMOs use real acquisition: "Gaming
  Outside My Usual Bubble" seeds search concepts (no topic constraints real
  candidates can't satisfy); "Aerospace Engineering (real acquisition)"
  seeds a topic id. Constraint-mechanism DEMOs (Counter A/B, Technical,
  Historical, etc.) still demonstrate against fixtures.
- Ranking: 8 named components (relevance, sourceNovelty, topicNovelty,
  narrativeNovelty, temporalDiversity, controlledExploration, repetition,
  sourceConcentration), each a pure function in its own module; additive
  engine with per-candidate component values, weighted contributions, reason
  line, per-component explanations.
- Feed assembly: over-fetch (3×), channel muting (exclusion, not
  down-rank), top-8 slice, FeedSnapshot persistence. Snapshots record
  `viewpoint: ViewpointRef | null`.
- Playback boundary: pure decision module (fixtures disabled, real ids →
  nocookie embed constants); DOM player construction separated.
- YouTube integration: nav entry injection with MutationObserver
  re-insertion (YouTube SPA nav), feed overlay mount.
- UI: feed card with reason, component table, source line, 5 explicit
  feedback buttons + channel mute; scoped styles.
- **Viewpoint domain model** (`src/model/viewpoint.ts`): full config
  (seed topics/concepts/channels/playlists, positive/negative topic
  constraints, source constraints, source-type preferences,
  unfamiliarity/narrative/temporal targets, channel-size preferences,
  locale, exploration %, repetition limit, concentration limit, weight
  overrides, baselineContext, enabled).
- **Viewlist domain model**: named collections, membership by id, pruned
  on read after Viewpoint deletion.
- **Repository** (`src/viewpoints/repository.ts`): create/update/delete/
  duplicate Viewpoints, create/update/delete Viewlists, assign/unassign,
  activation with disabled/missing guards; read-time config migration for
  pre-Phase-2 Viewpoints (defaults merged).
- **Interpretation** (`src/viewpoints/interpret.ts`): pure deterministic
  config → filters/weights/limits. Unparseable date windows are treated as
  no window (never a silent drop-everything filter).
- **Viewstream generation** (`src/viewpoints/viewstream.ts`): hard
  filters → muting → ranking with derived weights → greedy repetition/
  concentration limits → snapshot with embedded Viewpoint ref.
- **Manager UI** (`src/ui/viewpoint-manager.ts`): list, activate/
  deactivate, edit all config fields (prompt-based; empty temporal fields
  clear the window), duplicate, delete, enable/disable, Viewlist creation
  + assignment.
- **Feed integration**: Active Viewpoint banner + constraint summary on
  Viewstreams; unlensed feeds say so explicitly.
- **Tests** (`tests/acquisition.test.ts` + fixtures): parsers run against
  minimal fixtures extracted from real captured pages
  (`tests/fixtures/*.html`, copied to dist-test by
  `scripts/copy-test-fixtures.mjs`); provider tests use a fake transport;
  pool tests use MemoryLocalStore. Nothing fabricates metadata.

### PROVISIONAL

- All domain types in `src/model/types.ts` and `src/model/viewpoint.ts`
  are provisional pending the real discovery graph.
- Bootstrap scoring functions are deliberately simple placeholders
  (see docs/FEED_MODEL.md for exact semantics). The contract that must
  survive: every component named, every value recorded, every
  contribution visible on the card. Real candidates currently score via
  source novelty + topic novelty (empty topics → unknown-topic novelty);
  richer ranking signals are later phases.
- YouTube page shape is not an API. `ytInitialData` structures
  (videoRenderer, lockupViewModel, channelMetadataRenderer) are parsed
  defensively with deep-walks; layout drift (already observed once on
  `/{@handle}/videos`) degrades to honest empty steps, never wrong data.
- Feed overlay placement (fixed full-screen) is a bootstrap simplification.
- Viewpoint editing uses sequential `prompt()` dialogs — deliberately
  plain; visual polish deferred by instruction.
- Config fields that do not yet affect assembly: `sourceTypePreferences`,
  `temporal` mode (only the explicit from/to window is enforced),
  `channelSizePreferences`, `locale`, `narrativeDiversityTarget`,
  `explorationPercent`. They are recorded, inspectable, and editable; they
  bind to richer ranking in later phases. The feed states what it did.
  (Phase 4 note: `exposureBudget` rules DO bind — in composition, not
  ranking; `explorationPercent` binds at the pool-filter bypass only via
  `explorationShare`.)
- Political DEMO Viewpoints ("Counter A/B") demonstrate only the
  constraint mechanism over fixture topics/narratives. `baselineContext`
  is empty in DEMOs because a user baseline is user-authored by
  definition. No political classification exists anywhere in MeTube.
- Phase 3 classifier lexicons are deliberately small and conservative;
  real-world UNKNOWN rates will be high (especially source type, where a
  plain channel title evidences nothing). Raising evidenced coverage
  (e.g., channel about pages as source-type evidence) is OPEN question 18.
- Coverage map is counts only; no visualization (Phase 3 scope decision).

### OPEN

- docs/OPEN_QUESTIONS.md (26 items): citation-following semantics,
  random-walk design, narrative clustering process, scale-band data
  source, weight tuning evidence, feed autopsy contents, familiarity
  definition, "more-like-this" semantics, storage origin (chrome.storage
  vs page IndexedDB), playback isolation limits, Firefox compat, feed
  placement, onboarding, multi-profile, Phase 3 additions (classifier
  honesty vs. usefulness, cluster assignment at scale, temporal evidence
  beyond text framing, coverage visualization, assumption effects,
  override discovery/bulk tools), Phase 4 additions (exploration-seed
  acquisition integration, budget rule UX beyond prompt dialogs, richer
  familiarity signals for floor qualification).
- Viewpoint UX beyond prompts (real editor forms, per-field validation).
- Viewlist-driven behaviors (cycling, comparison views) — none yet.
- Explicit-video acquisition (accepted by the model, no page-fetch path).
- Narrative-cluster assignment for real candidates beyond
  provider-carried ids and user overrides (OPEN question 19).

### Known gaps (intentionally unimplemented)

- No narrative-AI classification (Phase 3 classifier is deterministic
  lexicons + provider passthrough by instruction; "narrative-AI" remains
  out of scope).
- No feed autopsy view (snapshot data already recorded for it).
- Exploration from a blind-spot region records the request but does not
  yet drive acquisition (future work; OPEN question 24).
- No coverage-map visualization (counts + plain lists only, per Phase 3
  scope).
- No Firefox testing or manifest adjustments. Firefox compatibility has
  NOT been verified and is not claimed.
- No icons (extension loads without them).
- No oEmbed/short-circuit metadata fetch for explicit-video seeds.

## Decisions log

- 2026-09-18: Bootstrap. MV3 + TypeScript + esbuild + node:test. No
  frameworks, no backend. Explicit-feedback-only. Fixtures over network.
- 2026-09-18: Storage on youtube.com page origin via indexedDB (content
  script context). Extension-origin storage deferred (OPEN question 12).
- 2026-09-18: Node --test over CommonJS-compiled output in dist-test/
  (tsc -p tsconfig.test.json). ESM test runner not used to keep the
  runtime contract simple.
- 2026-09-18 (Phase 1): Viewpoints/Viewlists persist as KV arrays rather
  than dedicated object stores — no schema migration, DB_VERSION stays 1.
  Revisit if Viewpoint count grows large.
- 2026-09-18 (Phase 1): Activation stored as KV `active-viewpoint-id`.
  Deleting or disabling the active Viewpoint deactivates explicitly
  (never a silent fallback lens).
- 2026-09-18 (Phase 1): Viewstream assembly limits (repetition,
  concentration) enforced greedily post-ranking, in rank order — simple,
  deterministic, inspectable. Smarter enforcement (swap-in candidates that
  fit limits) deferred.
- 2026-09-18 (Phase 2): Candidate acquisition NEVER consumes YouTube Home
  recommendations (FROZEN architectural rule). Permitted starts: Viewpoint
  seed topics/concepts, explicit channels, explicit videos, searches,
  channel uploads, playlists, previously discovered relationships, future
  provider types.
- 2026-09-18 (Phase 2): Acquisition via same-origin page fetch + ytInitialData
  parsing — no API keys, no host permissions, no background crawling. One
  page fetch per plan step (two for @handle channels: resolve id, then
  uploads). Bounded: 6 steps/plan, 12 candidates/step, 600-pool cap, 6h
  TTL.
- 2026-09-18 (Phase 2): Metadata honesty — relative dates → null →
  UNKNOWN_DATE sentinel at ranking boundary; unknown dates pass date
  filters only when no window is set; missing channels/titles/durations →
  explicit placeholders. Unparseable date windows are treated as no window,
  not as silent drop-all filters (found via live E2E).
- 2026-09-18 (Phase 2): @handle channel resolution via channel homepage
  externalId → /channel/UC.../videos. Driven by observed layout drift:
  anonymous /{handle}/videos fetches now serve the Playlists tab.
- 2026-09-18 (Phase 2): FixtureCandidateProvider stays for tests; in the
  extension it activates only behind the explicit `use-fixture-provider`
  KV flag (development/test mode). Real acquisition is the default user
  experience.
- 2026-09-18 (Phase 3): Every machine-derived classification is a
  ClassifiedValue carrying value, confidence, origin/method, evidence;
  UNKNOWN beats invented certainty (narrative clusters never inferred
  from keywords; temporal position never from publication age; sponsorship
  only where disclosed). No political scoring dimension exists — political
  labels only as user-authored Viewpoint criteria or explicit
  public-organization descriptions (FROZEN).
- 2026-09-18 (Phase 3): User overrides stored under their own
  `classification-overrides` KV key and applied at read/enrich time —
  never written into the pool — so they survive pool regeneration and
  MAX_POOL_SIZE pruning by construction.
- 2026-09-18 (Phase 3): Viewpoint assumptions are display-only premises
  (user-authored, verbatim, never influencing assembly); they belong to
  the Viewpoint, never to a user identity.
- 2026-09-18 (Phase 3): Coverage map ships as counts + plain lists, not a
  polished visualization (scope decision); coverage describes the pool,
  never judges it.
- 2026-09-18 (Phase 4): Exposure budgets are share-of-FINAL-FEED rules
  enforced in composition after ranking, never re-ranking weights —
  visible, inspectable, user-editable. Honest degradation over
  manufactured satisfaction: a rule that cannot be satisfied reports
  violated with an explanation; unknown classifications never count toward
  diversity floors; language/region rules report not-applicable rather
  than guessing.
- 2026-09-18 (Phase 4): Cooldowns are soft rules; floors may outrank them
  via reservations, and a relief pass keeps the top-ranked candidate when
  soft rules would otherwise empty the feed — the bypass is always
  reported in the cooldown rule's explanation.
- 2026-09-18 (Phase 4): Perspective pairing is evidence-gated (shared
  topics + differing evidenced cluster or source type); no forced
  two-sided symmetry — 1, 2, 3, 5 clusters are all honest outcomes.
- 2026-09-18 (Phase 4): Feedback taxonomy is explicit and closed: exposure
  facts never train preferences; 'watched' ≠ 'I want more like this'.
  The exploration firewall lenses every Viewpoint's training input (global
  exposure facts + own-Viewpoint signals only).

## Verification commands

```sh
npm run typecheck
npm test
npm run build
# browser verification (this machine, headed Chromium under xvfb):
# pattern: launchPersistentContext(fresh profile, ignoreDefaultArgs:
# ['--disable-extensions'], viewport 1920x1080,
# --load-extension=/root/MeTube/dist) → goto youtube.com → #metube-nav-entry
# → "Manage Viewpoints" → activate → observe Viewstream + pool inspector.
# 1280x720 collapses YouTube's guide; Playwright defaults pass
# --disable-extensions and must be ignored.
```