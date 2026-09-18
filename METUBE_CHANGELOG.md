# MeTube changelog

All notable changes to MeTube. Dates are system dates.

## 2026-09-18 — Phase 2: real candidate acquisition (v0.3.0)

### Added

- Discovery model (`src/model/discovery.ts`): acquisition methods, bounded
  discovery plans (≤6 steps, ≤12 candidates/step), `CandidateProvenance`
  (provider, method, seed, timestamp, originating Viewpoint, parent),
  `DiscoveredCandidate` with every metadata field nullable,
  `UNKNOWN_DATE` sentinel + `isUnknownDate`, `deriveDiscoveryPlan` (seed
  concepts → resolvable seed topics → explicit channels → explicit
  playlists; unresolvable topic ids produce no step — never a guessed
  query), `normalizeChannelTarget` (handles, bare handles, handle URLs,
  canonical UC ids, channel URLs all dedupe to one step),
  `normalizePlaylistTarget`.
- Pure YouTube page parsers (`src/discovery/yt-parser.ts`):
  `ytInitialData` extraction, search results (`videoRenderer`), channel
  uploads and playlists (`lockupViewModel`, LOCKUP_CONTENT_TYPE_VIDEO
  only), channel-id resolution from a channel homepage, alert/error-page
  detection, duration + view-count parsing, relative-date parsing
  (verbose + compact; always → null, never a guessed absolute date).
- `YouTubeWebProvider` (`src/discovery/youtube-web.ts`): the first real
  candidate provider. Plan-driven; one page fetch per step (two for
  @handle channels: resolve canonical id, then fetch uploads). Same-origin
  fetch with `credentials: 'omit'`; no extra permissions; no API keys; no
  background crawling; never touches YouTube Home recommendations. HTTP
  errors, network errors, error pages, and empty pages are all recorded
  per step — never swallowed, never retried in-run. Injectable transport
  for tests.
- Candidate pool (`src/discovery/pool.ts`): persistent KV cache with TTL
  (6h) so repeated Viewstream generation serves from cache and does not
  refetch; forced refresh bypasses TTL; 600-candidate cap with
  oldest-first pruning; first discovery wins, later sightings append
  provenance; `toCandidateVideo` converts for ranking with explicit
  placeholders for missing metadata (never fabricated values);
  `inspectPool` snapshot for the UI.
- Pool inspector UI (`src/ui/pool-inspector.ts`): candidate count, methods
  and providers, discovering Viewpoints, cache age, duplicate
  suppression, unknown publication dates, missing duration/channel,
  failed steps, and a "Refresh acquisition now" control.
- Viewpoint config gained `seedChannels` + `seedPlaylists`; the manager
  editor and constraint summaries cover them.
- Discovery-plan-driven Viewstream generation: active Viewpoint → load
  pool → acquire (TTL-bounded) → rank pool candidates → assemble.
  Unlensed feeds still state so explicitly.
- DEMO Viewpoints updated for real acquisition: "Gaming Outside My Usual
  Bubble" now seeds search concepts; new "Aerospace Engineering (real
  acquisition)" seeds a topic id and acquires live. Fixture-era
  constraint-mechanism DEMOs (Counter A/B, Technical, Historical) remain.
- Repository read-time config migration: pre-Phase-2 Viewpoints get new
  default fields merged on read.
- Fixture-based test suite for real acquisition (`tests/acquisition.test.ts`
  + `tests/fixtures/*.html` extracted from real captured pages; fixtures
  copied to dist-test via `scripts/copy-test-fixtures.mjs`).

### Changed

- `FixtureCandidateProvider` now activates in the extension only behind
  the explicit `use-fixture-provider` KV flag; real acquisition is the
  default user experience.
- `interpretViewpoint` treats unparseable temporal-window strings as no
  window (previously they became NaN bounds that silently dropped every
  unknown-date candidate — found via live end-to-end verification).
- Viewpoint editor: empty temporal from/to inputs clear the window
  (previously stored `''`).
- `temporalDiversity` excludes unknown-date candidates from the pool mean
  (they score 0).

### Verified

- typecheck clean; tests 59/59; extension builds; manifest carries NO
  permissions. Real-Chromium (headed) end-to-end, fresh profile per run:
  - seed-search: 12 real candidates, 8 playable cards, nocookie sandbox
    embeds (`referrerpolicy="no-referrer"`), provenance on every card;
  - channel-uploads via `@veritasium` handle: 2 fetches (id resolution +
    uploads), 12 real candidates; via canonical UC id: 1 fetch;
  - playlist: 12 real candidates from a playlist page;
  - TTL cache: regeneration performed 0 acquisition fetches;
  - pool inspector facts render under the manager.
- Firefox NOT tested; no Firefox compatibility claimed.

### Not implemented (intentional)

- Narrative-AI classification (Phase 3 by instruction).
- Explicit-video page-fetch acquisition path (model accepts the method;
  reported as empty, never guessed).
- Feed autopsy view. Firefox support. Icons. Onboarding.

## 2026-09-18 — Phase 1: Viewpoints (v0.2.0)

### Added

- Viewpoint domain model (`src/model/viewpoint.ts`): a user-controlled
  discovery/ranking lens. Full inspectable config: title, description,
  seed topics + concepts, positive/negative topic constraints, source
  constraints, source-type preferences, unfamiliarity target, narrative
  diversity target, temporal sampling + window, channel-size preferences,
  locale preference, exploration percent, repetition limit,
  source-concentration limit, explicit weight overrides, user-authored
  baseline context, enabled flag.
- Viewlist domain model: named collections of Viewpoints, membership by
  id, pruned on read after deletion.
- Deterministic interpretation (`src/viewpoints/interpret.ts`): pure
  config → hard filters (topics OR/NOT, sources, temporal window,
  unfamiliarity via explicit feedback only) + derived weights + assembly
  limits. Same input → same output, always.
- Viewstream generation (`src/viewpoints/viewstream.ts`): hard filters →
  channel muting → ranking with Viewpoint weights → greedy repetition and
  concentration limits → snapshot embedding the Viewpoint ref.
- Viewpoint repository (`src/viewpoints/repository.ts`): create, edit,
  delete, duplicate (stable `-copy` id sequencing), enable/disable,
  activation with explicit deactivation on delete/disable; Viewlist CRUD
  + assign/unassign. Persistence via LocalStore KV.
- 8 DEMO Viewpoints over the fixtures (`src/viewpoints/demo.ts`),
  `vp-demo-` prefixed and DEMO-marked, seeded idempotently on first open.
- Manager UI (`src/ui/viewpoint-manager.ts`): list all Viewpoints with
  constraint summaries, activate/deactivate, full-config editing,
  duplicate, delete, enable/disable, Viewlist creation + membership
  checkboxes.
- Feed integration: Active Viewpoint banner naming the generating
  Viewpoint + constraint restatement on every Viewstream; unlensed feeds
  state so explicitly. "Manage Viewpoints" reachable from the feed.
- `FeedSnapshot.viewpoint: ViewpointRef | null` — every snapshot records
  which lens (if any) produced it.
- Tests: 22 new (28/28 total) covering persistence, duplication,
  deletion, activation, Viewlist membership, and deterministic constraint
  interpretation.

### Fixed

- `IdbLocalStore.getKv` returned the stored `{key, value}` wrapper record
  instead of the payload; the in-memory fallback returned the bare value.
  Reads-after-write on IndexedDB produced the wrong shape (found via
  Viewpoint seeding in a real browser; MemoryLocalStore masked it in
  tests).

### Verified

- typecheck clean; tests 28/28; build ~64 KB; real-Chromium (headed)
  end-to-end: unlensed feed → manager with 8 DEMO rows → activate →
  Viewstream banner + constraint-respecting cards → duplicate/delete via
  UI → deactivate back to unlensed. Firefox NOT tested; no Firefox
  compatibility claimed.

### Not implemented (intentional)

- Binding of seed topics/concepts, source-type preferences, temporal
  modes, channel-size preferences, locale, narrative diversity target,
  and exploration percent into actual assembly behavior — recorded and
  inspectable now, they need real acquisition/ranking signals.
- Viewpoint editor beyond sequential prompts. Viewlist-driven behaviors
  (cycling, comparison). Feed autopsy. Real acquisition. Firefox
  support.

## 2026-09-18 — bootstrap (v0.1.0)

### Added

- Repository scaffold: `package.json` (TS, esbuild, node:test; no runtime
  dependencies), `tsconfig.json`, `tsconfig.test.json`, `.gitignore`,
  `.editorconfig`.
- Provisional domain model (`src/model/`): candidate videos, channels with
  scale bands, topics, narrative clusters, discovery sources, explicit
  feedback (5 kinds), user profile, feed snapshots, 8 named ranking
  components. Catalog with integrity checking.
- Discovery layer (`src/discovery/`): `CandidateProvider` interface,
  fixture pool (10 candidates / 6 channels / 5 topics / 7 narrative
  clusters / 3 sources), pool statistics, feed assembly with over-fetch
  and channel-mute exclusion.
- Ranking engine (`src/ranking/`): 8 pure component functions, additive
  scoring, per-candidate component values + weighted contributions +
  reason line + per-component explanations. Weights inspectable and
  adjustable.
- Storage (`src/storage/`): IndexedDB wrapper with in-memory fallback.
- YouTube integration (`src/youtube/`): nav-entry injection (SPA-aware),
  pure playback-decision boundary (session isolation via nocookie embed,
  fixtures disabled), DOM player construction.
- UI (`src/ui/`): feed card (title, channel, reason, component table,
  source, 5 feedback buttons, channel mute), scoped styles.
- Extension (`src/extension/`): MV3 manifest, content-script entry.
- Build (`scripts/build-extension.mjs`): esbuild bundle + manifest copy +
  validation.
- Tests: 6 passing (catalog integrity, rank explainability + ordering,
  repetition penalty, dangling-reference detection, feed assembly +
  muting, playback isolation).
- Docs: PRODUCT, ARCHITECTURE, DISCOVERY_MODEL, FEED_MODEL,
  PRIVACY_AND_ISOLATION, OPEN_QUESTIONS.
- README, METUBE_CONTEXT.md (durable state), METUBE_CHANGELOG.md.

### Verified

- typecheck clean; tests 6/6; extension builds; loads in real Chromium
  (headed) with nav entry, feed overlay, 8 explainable cards, feedback
  controls working; fixture playback correctly disabled.

### Not implemented (intentional)

- Real candidate acquisition (network/API/scraping). No real providers.
- Narrative-cluster assignment process. Feed autopsy view. Firefox
  support. Icons. Onboarding. Weight tuning.