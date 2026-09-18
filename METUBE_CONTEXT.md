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

## State (2026-09-18, bootstrap complete)

### VERIFIED

- **Toolchain**: Node 22 / npm with `--include=dev` (the machine's global
  npm config sets `omit=["dev"]`; plain `npm install` silently skips
  devDependencies — always install with `--include=dev`).
- **Typecheck**: `npm run typecheck` (tsc --noEmit) passes clean.
- **Tests**: `npm test` → 6/6 pass (catalog integrity, rank explainability,
  repetition penalty, dangling-reference detection, feed assembly with
  muting, playback isolation decisions).
- **Extension build**: `npm run build` produces `dist/content.js` (IIFE,
  esbuild, ~34 KB) + `dist/manifest.json` (MV3).
- **Extension loads in real Chromium**: verified with playwright-core
  (chromium-1223, headed via xvfb-run — extensions do NOT load in
  headless mode; `--headless=new` included). On a youtube.com page: nav
  entry inserts ("MeTube"), click opens feed overlay with 8 cards, each
  card shows reason line, full 8-component score table, discovery source,
  feedback buttons (5 kinds + channel mute). Fixture videos correctly show
  "Playback disabled" notes, zero iframes.
- **Storage round-trip**: feed snapshots persist via the IndexedDB wrapper
  (MemoryLocalStore fallback used in tests; IdbLocalStore exercised in
  browser verification).

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
  down-rank), top-8 slice, FeedSnapshot persistence.
- Playback boundary: pure decision module (fixtures disabled, real ids →
  nocookie embed constants); DOM player construction separated.
- YouTube integration: nav entry injection with MutationObserver
  re-insertion (YouTube SPA nav), feed overlay mount.
- UI: feed card with reason, component table, source line, 5 explicit
  feedback buttons + channel mute; scoped styles.

### PROVISIONAL

- All domain types in `src/model/types.ts` are provisional pending the
  real discovery graph.
- Bootstrap scoring functions are deliberately simple placeholders
  (see docs/FEED_MODEL.md for exact semantics). The contract that must
  survive: every component named, every value recorded, every
  contribution visible on the card.
- Feed overlay placement (fixed full-screen) is a bootstrap simplification.

### OPEN

- docs/OPEN_QUESTIONS.md (17 items): first real discovery sources,
  citation-following semantics, random-walk design, narrative clustering
  process, scale-band data source, weight tuning evidence, feed autopsy
  contents, familiarity definition, "more-like-this" semantics, storage
  origin (chrome.storage vs page IndexedDB), playback isolation limits,
  Firefox compat, feed placement, onboarding, multi-profile.

### Known gaps (intentionally unimplemented at bootstrap)

- No real candidate acquisition (no network, no scraping, no API use).
- No narrative-cluster assignment process (fixtures only).
- No feed autopsy view (snapshot data already recorded for it).
- No Firefox testing or manifest adjustments.
- No icons (extension loads without them).

## Decisions log

- 2026-09-18: Bootstrap. MV3 + TypeScript + esbuild + node:test. No
  frameworks, no backend. Explicit-feedback-only. Fixtures over network.
- 2026-09-18: Storage on youtube.com page origin via indexedDB (content
  script context). Extension-origin storage deferred (OPEN question 12).
- 2026-09-18: Node --test over CommonJS-compiled output in dist-test/
  (tsc -p tsconfig.test.json). ESM test runner not used to keep the
  runtime contract simple.

## Verification commands

```sh
npm run typecheck
npm test
npm run build
# browser verification (this machine):
xvfb-run -a node /tmp/metube-verify/final-check.mjs
```