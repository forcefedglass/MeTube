# MeTube changelog

All notable changes to MeTube. Dates are system dates.

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