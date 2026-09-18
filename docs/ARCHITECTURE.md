# Architecture

## Principle

MeTube is a local-first browser extension. All state lives on the user's
machine. No backend, no accounts, no network calls at bootstrap fidelity.

## Pipeline (one direction, no feedback into acquisition)

```
independent candidate collection
        │
        ▼
metadata / topic / source analysis
        │
        ▼
MeTube discovery graph (catalog + graph, grows over time)
        │
        ▼
MeTube ranking engine (explainable, additive, 8 named components)
        │
        ▼
MeTube feed (assembly, muting, snapshot persistence)
        │
        ▼
isolated / private playback
```

This is deliberately NOT "YouTube recommendations → MeTube re-ranking."
YouTube's recommendation output never enters the pipeline at any stage.

## Module map

| Path | Responsibility | Depends on |
|---|---|---|
| `src/model/types.ts` | Provisional domain types. Zero dependencies. | — |
| `src/model/catalog.ts` | Catalog: id → definition lookup + integrity check. | model |
| `src/discovery/provider.ts` | `CandidateProvider` interface + pool stats. | model |
| `src/discovery/fixtures/*` | Synthetic fixture pool (topics, channels, narratives, sources, candidates). | model |
| `src/discovery/fixture-provider.ts` | Bootstrap provider serving fixtures. | discovery |
| `src/discovery/assemble-feed.ts` | Feed assembly: fetch, mute, rank, snapshot. | discovery, ranking |
| `src/ranking/components/*` | One pure function per named score component. | model |
| `src/ranking/engine.ts` | `rankCandidates`: components → weights → reason. | ranking, model |
| `src/storage/local-store.ts` | IndexedDB wrapper + in-memory fallback. | — |
| `src/youtube/nav.ts` | DOM injection of the MeTube nav entry. | — |
| `src/youtube/playback.ts` | Pure playback decisions + isolation constants. | — |
| `src/youtube/player-frame.ts` | DOM construction of the isolated player. | youtube |
| `src/ui/feed-card.ts` | Card rendering: reason, components, feedback. | model, ranking, youtube |
| `src/ui/styles.ts` | Scoped styles for the feed overlay. | — |
| `src/extension/content.ts` | Content-script orchestration entry. | everything |

## Rules that keep the architecture honest

1. **No upward imports.** `model` imports nothing from the project. Each
   layer imports only from layers above it in the module map (model →
   discovery/ranking → youtube/ui → extension).
2. **Decisions are pure.** Anything that decides (scoring, playback,
   feed assembly) is DOM-free and testable in Node. DOM work (nav, cards,
   iframes) is separated into its own modules.
3. **Every score component has a name.** No opaque scoring. If a component
   cannot be named and explained, it does not ship.
4. **Explicit feedback only.** The profile records what the user said, not
   what they clicked or how long they watched.
5. **Provisional types stay provisional.** Domain types live in
   `model/types.ts` and are marked provisional until the discovery graph is
   real. Renames are expected; downstream code must not hard-code
   assumptions about final shape.

## Build

- TypeScript, strict. `tsc --noEmit` for typecheck.
- Extension bundled by esbuild (`scripts/build-extension.mjs`) into `dist/`:
  `content.js` + `manifest.json`. Loadable as an unpacked MV3 extension.
- Tests compiled as CommonJS to `dist-test/` and run with `node --test`.

## Extension surface (MV3)

- `content_scripts`: `https://www.youtube.com/*` only, `document_idle`.
- No permissions beyond content-script injection. No `host_permissions`.
- Storage via `indexedDB` in the page origin (youtube.com). The in-memory
  fallback covers non-DOM contexts and tests.