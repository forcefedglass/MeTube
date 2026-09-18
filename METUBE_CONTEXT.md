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

## State (2026-09-18, Phase 2 real candidate acquisition complete)

### VERIFIED

- **Toolchain**: Node 22 / npm with `--include=dev` (the machine's global
  npm config sets `omit=["dev"]`; plain `npm install` silently skips
  devDependencies — always install with `--include=dev`).
- **Typecheck**: `npm run typecheck` (tsc --noEmit) passes clean.
- **Tests**: `npm test` → 59/59 pass (bootstrap 6 + Phase 1 22 + Phase 2
  31: yt-parser vs real captured fixtures, plan derivation, provider
  transport, pool merge/prune/TTL, toCandidateVideo sentinels, unknown-date
  window, temporal diversity exclusion, inspectPool, channel normalization,
  channel-id resolution, unparseable-window tolerance).
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
  keys). No DB_VERSION bump.

### IMPLEMENTED

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
- Political DEMO Viewpoints ("Counter A/B") demonstrate only the
  constraint mechanism over fixture topics/narratives. `baselineContext`
  is empty in DEMOs because a user baseline is user-authored by
  definition. No political classification exists anywhere in MeTube.

### OPEN

- docs/OPEN_QUESTIONS.md (17 items): citation-following semantics,
  random-walk design, narrative clustering process, scale-band data
  source, weight tuning evidence, feed autopsy contents, familiarity
  definition, "more-like-this" semantics, storage origin (chrome.storage
  vs page IndexedDB), playback isolation limits, Firefox compat, feed
  placement, onboarding, multi-profile.
- Viewpoint UX beyond prompts (real editor forms, per-field validation).
- Viewlist-driven behaviors (cycling, comparison views) — none yet.
- Explicit-video acquisition (accepted by the model, no page-fetch path).
- Narrative-cluster assignment for real candidates (Phase 3; explicitly not
  done here).

### Known gaps (intentionally unimplemented)

- No narrative-AI classification (Phase 3 by instruction).
- No feed autopsy view (snapshot data already recorded for it).
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