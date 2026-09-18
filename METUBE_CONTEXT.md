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

## State (2026-09-18, Phase 1 Viewpoints complete)

### VERIFIED

- **Toolchain**: Node 22 / npm with `--include=dev` (the machine's global
  npm config sets `omit=["dev"]`; plain `npm install` silently skips
  devDependencies — always install with `--include=dev`).
- **Typecheck**: `npm run typecheck` (tsc --noEmit) passes clean.
- **Tests**: `npm test` → 28/28 pass (bootstrap 6 + Phase 1 22: config
  defaults, create/list/update, duplication incl. id sequencing, deletion +
  Viewlist pruning, activation incl. disabled + missing ids, Viewlist
  CRUD + assignment, deterministic interpretation, positive/negative
  topic enforcement, temporal window enforcement, Viewstream generation
  with embedded Viewpoint ref, repetition limit, concentration limit,
  disabled-Viewpoint empty Viewstream, strictly-unfamiliar gate, DEMO
  markers, idempotent seeding, summarize).
- **Extension build**: `npm run build` produces `dist/content.js` (IIFE,
  esbuild, ~64 KB) + `dist/manifest.json` (MV3).
- **Phase 1 browser verification** (`/tmp/metube-verify/phase1-check.mjs`
  + `p1-delcheck.mjs`, headed Chromium via xvfb-run, fresh profile):
  unlensed feed renders with explicit "Unlensed" note; manager lists 8
  seeded DEMO Viewpoints; activating "Gaming Outside My Usual Bubble"
  produces a Viewstream whose banner names the Viewpoint and restates
  constraints, with only topic-aero candidates; duplicate via UI adds a
  row; delete via UI removes it; deactivation returns to unlensed feed.
- **Storage round-trip**: feed snapshots persist via the IndexedDB wrapper
  (MemoryLocalStore fallback used in tests; IdbLocalStore exercised in
  browser verification). Viewpoints/Viewlists persist via the KV store
  (arrays under `viewpoints` / `viewlists` keys).

### IMPLEMENTED

- Discovery pipeline: `CandidateProvider` interface, `FixtureCandidateProvider`
  (10 synthetic candidates, 6 channels, 5 topics, 7 narrative clusters, 3
  discovery sources), pool stats.
- Ranking: 8 named components (relevance, sourceNovelty, topicNovelty,
  narrativeNovelty, temporalDiversity, controlledExploration, repetition,
  sourceConcentration), each a pure function in its own module; additive
  engine with per-candidate component values, weighted contributions, reason
  line, per-component explanations.
- Feed assembly: over-fetch (3×), channel muting (exclusion, not
  down-rank), top-8 slice, FeedSnapshot persistence. Snapshots now record
  `viewpoint: ViewpointRef | null`.
- Playback boundary: pure decision module (fixtures disabled, real ids →
  nocookie embed constants); DOM player construction separated.
- YouTube integration: nav entry injection with MutationObserver
  re-insertion (YouTube SPA nav), feed overlay mount.
- UI: feed card with reason, component table, source line, 5 explicit
  feedback buttons + channel mute; scoped styles.
- **Viewpoint domain model** (`src/model/viewpoint.ts`): full config
  (seed topics/concepts, positive/negative topic constraints, source
  constraints, source-type preferences, unfamiliarity/narrative/temporal
  targets, channel-size preferences, locale, exploration %, repetition
  limit, concentration limit, weight overrides, baselineContext,
  enabled).
- **Viewlist domain model**: named collections, membership by id, pruned
  on read after Viewpoint deletion.
- **Persistence**: Viewpoints + Viewlists via LocalStore KV (no schema
  migration needed; DB_VERSION unchanged).
- **Repository** (`src/viewpoints/repository.ts`): create/update/delete/
  duplicate Viewpoints, create/update/delete Viewlists, assign/unassign,
  activation with disabled/missing guards.
- **Interpretation** (`src/viewpoints/interpret.ts`): pure deterministic
  config → filters/weights/limits.
- **Viewstream generation** (`src/viewpoints/viewstream.ts`): hard
  filters → muting → ranking with derived weights → greedy repetition/
  concentration limits → snapshot with embedded Viewpoint ref.
- **Manager UI** (`src/ui/viewpoint-manager.ts`): list, activate/
  deactivate, edit all config fields (prompt-based), duplicate, delete,
  enable/disable, Viewlist creation + assignment.
- **Feed integration**: Active Viewpoint banner + constraint summary on
  Viewstreams; unlensed feeds say so explicitly.
- **DEMO Viewpoints** (`src/viewpoints/demo.ts`): 8 seeded, `vp-demo-`
  prefix + DEMO-marked descriptions, idempotent seeding.

### PROVISIONAL

- All domain types in `src/model/types.ts` and `src/model/viewpoint.ts`
  are provisional pending the real discovery graph.
- Bootstrap scoring functions are deliberately simple placeholders
  (see docs/FEED_MODEL.md for exact semantics). The contract that must
  survive: every component named, every value recorded, every
  contribution visible on the card.
- Feed overlay placement (fixed full-screen) is a bootstrap simplification.
- Viewpoint editing uses sequential `prompt()` dialogs — deliberately
  plain; visual polish deferred by instruction.
- Config fields that do not yet affect assembly: `seedTopics`,
  `seedConcepts`, `sourceTypePreferences`, `temporal` mode (only the
  explicit from/to window is enforced), `channelSizePreferences`,
  `locale`, `narrativeDiversityTarget`, `explorationPercent`. They are
  recorded, inspectable, and editable; they bind to real acquisition and
  richer ranking in later phases. The feed states what it did.
- Political DEMO Viewpoints ("Counter A/B") demonstrate only the
  constraint mechanism over fixture topics/narratives. `baselineContext`
  is empty in DEMOs because a user baseline is user-authored by
  definition. No political classification exists anywhere in MeTube.

### OPEN

- docs/OPEN_QUESTIONS.md (17 items): first real discovery sources,
  citation-following semantics, random-walk design, narrative clustering
  process, scale-band data source, weight tuning evidence, feed autopsy
  contents, familiarity definition, "more-like-this" semantics, storage
  origin (chrome.storage vs page IndexedDB), playback isolation limits,
  Firefox compat, feed placement, onboarding, multi-profile.
- Viewpoint UX beyond prompts (real editor forms, per-field validation).
- Viewlist-driven behaviors (cycling, comparison views) — none yet.

### Known gaps (intentionally unimplemented)

- No real candidate acquisition (no network, no scraping, no API use).
- No narrative-cluster assignment process (fixtures only).
- No feed autopsy view (snapshot data already recorded for it).
- No Firefox testing or manifest adjustments. Firefox compatibility has
  NOT been verified and is not claimed.
- No icons (extension loads without them).

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

## Verification commands

```sh
npm run typecheck
npm test
npm run build
# browser verification (this machine):
xvfb-run -a node /tmp/metube-verify/phase1-check.mjs
xvfb-run -a node /tmp/metube-verify/p1-delcheck.mjs
```