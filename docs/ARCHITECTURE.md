# Architecture

## Principle

MeTube is a local-first browser extension. All state lives on the user's
machine. No backend, no accounts. The only network activity is bounded
same-origin acquisition fetches (Phase 2) and isolated playback embeds.

## Pipeline (one direction, no feedback into acquisition)

```
Viewpoint (user-authored lens)
        │
        ▼
discovery plan (seed-derived, bounded, never Home recommendations)
        │
        ▼
independent candidate acquisition (providers: youtube-web, fixtures)
        │
        ▼
candidate pool (persistent, deduplicated, provenance-complete)
        │
        ▼
classification / enrichment (six-dimension information map; UNKNOWN over
invented certainty; overrides survive regeneration)
        │
        ▼
MeTube ranking engine (explainable, additive, named components; lensed
through the exploration firewall — each Viewpoint trains on its own signals
plus global exposure facts only)
        │
        ▼
Viewstream composition (Phase 4: exposure budgets — ceilings/floors on
shares of the final feed; floors reserve, ceilings gate, cooldowns are
soft; honest per-rule violation reports; never Manufactured diversity)
        │
        ▼
Viewstream / MeTube feed (assembly, muting, snapshot persistence,
evidence-gated perspective pairing, descriptive blind spots)
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
| `src/model/discovery.ts` | Discovery-plan model: acquisition methods, provenance, `DiscoveredCandidate`, `UNKNOWN_DATE`, plan derivation. Never fetches. | model |
| `src/discovery/provider.ts` | `CandidateProvider` interface + pool stats. | model |
| `src/discovery/fixtures/*` | Synthetic fixture pool (topics, channels, narratives, sources, candidates). | model |
| `src/discovery/fixture-provider.ts` | Development/test provider serving fixtures. | discovery |
| `src/discovery/yt-parser.ts` | Pure parsers for real page shapes: `videoRenderer` (search) and `lockupViewModel` (channel/playlist). No DOM, no network. | model |
| `src/discovery/youtube-web.ts` | Real provider: plan-driven same-origin page fetches (injectable transport), bounded harvest, per-step reporting. | discovery, model |
| `src/discovery/pool.ts` | Persistent candidate pool: dedup, provenance merge, TTL, prune, adapter to ranking candidates, inspection view. | discovery, storage, model |
| `src/discovery/assemble-feed.ts` | Feed assembly: fetch, mute, rank, snapshot. | discovery, ranking |
| `src/model/classification.ts` | Information-map types: source-type taxonomy, temporal positions, `ClassifiedValue`, familiarity, provenance edges, coverage map. No politics. | model |
| `src/classification/classify.ts` | Deterministic evidence-based classifier: lexicons + provider passthrough; conservative, UNKNOWN over invention. | model |
| `src/classification/overrides.ts` | User overrides of machine classification; own KV key so they survive pool regeneration. | model, storage |
| `src/classification/enrich.ts` | Enrichment bridge: classify pool candidates, apply overrides, inject topic/cluster ids into the ranking path. | classification, model |
| `src/discovery/coverage.ts` | Coverage map computation: pool representation across the six dimensions, counts only. | model, classification |
| `src/model/viewpoint.ts` | Viewpoint/Viewlist domain model (PROVISIONAL), including user-authored assumptions. Zero project deps beyond `model/types`. | model |
| `src/viewpoints/interpret.ts` | Pure deterministic Viewpoint-config → filters/weights/limits interpretation. | model, ranking |
| `src/viewpoints/viewstream.ts` | Viewstream generation: `generateViewstream` (provider-backed) and `assembleViewstream` (pool-backed); routes the firewalled profile into ranking and composition. | viewpoints, discovery, ranking |
| `src/viewpoints/composer.ts` | Phase 4 composer: budget-gated selection over the ranked pool (reservations, ceilings, cooldowns, relief pass, trim), honest per-rule exposure report. Pure, deterministic. | viewpoints, model, ranking |
| `src/model/exposure.ts` | Exposure-budget rule types + generation history; share-of-final-feed semantics. | model |
| `src/model/feedback.ts` | Explicit feedback taxonomy: 12 kinds with declared semantics (exposure fact / preference / representation note), familiarity and scoping predicates. | model |
| `src/viewpoints/firewall.ts` | Exploration firewall: feedback visibility per Viewpoint, firewall-scoped recording, per-Viewpoint training lens. | viewpoints, model |
| `src/viewpoints/pairing.ts` | Evidence-gated perspective pairing over the composed feed (shared topics + differing evidenced positions). Pure. | viewpoints, model |
| `src/viewpoints/blindspots.ts` | Descriptive coverage gaps: pool regions underrepresented in the feed. Pure. | viewpoints, model, classification |
| `src/viewpoints/repository.ts` | Viewpoint/Viewlist CRUD, duplication, activation over LocalStore. | viewpoints, model, storage |
| `src/viewpoints/demo.ts` | DEMO Viewpoints over fixtures; idempotent seeding. | viewpoints, model |
| `src/ranking/components/*` | One pure function per named score component. | model |
| `src/ranking/engine.ts` | `rankCandidates`: components → weights → reason. | ranking, model |
| `src/storage/local-store.ts` | IndexedDB wrapper + in-memory fallback. | — |
| `src/youtube/nav.ts` | DOM injection of the MeTube nav entry. | — |
| `src/youtube/playback.ts` | Pure playback decisions + isolation constants. | — |
| `src/youtube/player-frame.ts` | DOM construction of the isolated player. | youtube |
| `src/ui/feed-card.ts` | Card rendering: reason, components, feedback; click opens the candidate inspector. | model, ranking, youtube |
| `src/ui/viewpoint-manager.ts` | Viewpoint/Viewlist management UI (plain DOM), incl. assumptions field. | model, viewpoints |
| `src/ui/pool-inspector.ts` | Read-only candidate-pool facts UI. | discovery |
| `src/ui/candidate-inspector.ts` | Candidate inspector: why-this-appeared, all dimensions with audit trail, override controls. | model, classification |
| `src/ui/coverage-map.ts` | Coverage map rendered as plain facts lists (visualization later). | model |
| `src/ui/exposure-panel.ts` | "Why this Viewstream looks like this": per-rule budget status with explanations. | model |
| `src/ui/blindspot-map.ts` | Descriptive blind-spot list + user-initiated exploration buttons. | viewpoints |
| `src/ui/styles.ts` | Scoped styles for the feed overlay. | — |
| `src/extension/content.ts` | Content-script orchestration entry; provider mode switch (real default, fixtures behind KV flag). | everything |

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
5. **Classification is explainable or UNKNOWN.** Every machine-derived
   classification carries value, confidence, origin/method, and evidence;
   where evidence is absent the answer is UNKNOWN, never a guess. No
   hidden political scoring anywhere. See `docs/CLASSIFICATION.md`.
6. **Provisional types stay provisional.** Domain types live in
   `model/types.ts` and are marked provisional until the discovery graph is
   real. Renames are expected; downstream code must not hard-code
   assumptions about final shape.
7. **Budgets compose after ranking.** Exposure-budget rules are enforced
   in composition as share-of-final-feed ceilings/floors — never as
   ranking weights that quietly reshape relevance. Every rule is visible,
   editable, and reported per rule. Unknown classifications never count
   toward diversity floors; degradation is reported, never padded.
8. **Soft rules never empty the feed.** Cooldowns are soft: floors may
   outrank them via reservations, and a relief pass keeps the top-ranked
   candidate when soft rules would otherwise empty the feed; the bypass is
   always reported in the rule's explanation.
9. **Feedback is scoped.** The exploration firewall keeps Viewpoint
   training inputs independent: one Viewpoint's preference feedback never
   trains another Viewpoint, and normal YouTube state is never mutated.
   Exposure facts stay global; "I watched this" never means "I want more
   of this."

## Build

- TypeScript, strict. `tsc --noEmit` for typecheck.
- Extension bundled by esbuild (`scripts/build-extension.mjs`) into `dist/`:
  `content.js` + `manifest.json`. Loadable as an unpacked MV3 extension.
- Tests compiled as CommonJS to `dist-test/` and run with `node --test`.

## Extension surface (MV3)

- `content_scripts`: `https://www.youtube.com/*` only, `document_idle`.
- No permissions beyond content-script injection. No `host_permissions`.
  Acquisition fetches ride the page's own origin (same-origin `fetch`,
  `credentials: 'omit'`); playback uses `youtube-nocookie.com` embeds.
- Storage via `indexedDB` in the page origin (youtube.com). The in-memory
  fallback covers non-DOM contexts and tests.