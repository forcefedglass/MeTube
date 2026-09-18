# MeTube changelog

All notable changes to MeTube. Dates are system dates.

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