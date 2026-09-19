# Slipgate — Crystallized Project State

**Public product name:** Slipgate
**Tagline:** Escape Your Walled Garden.
**Internal/project codename:** MeTube (repository name, package name,
IndexedDB database `metube`, storage keys, `metube-*` DOM ids/CSS classes,
export format `metube-export`, gecko id `metube@metube.local`, file names
`METUBE_*.md` — all intentionally unchanged).

IDENTITY NOTE FOR FUTURE AGENTS: the public identity is **Slipgate** with
the tagline **"Escape Your Walled Garden."** Do not restore MeTube,
YourTube, or any previous name as the public identity, and do not change the
tagline. MeTube and YourTube are historical/internal codenames only.
"Slipgate" is the name; the walled-garden tagline refers to escaping an
algorithmically cultivated information environment — never to compromising
or bypassing computer security.

This document is the crystallized state as of Phase 5 (v0.6.0, commit
`bfdc6c5`, 2026-09-19). Read it before working on this repository. Do not
re-investigate settled work; do not treat provisional scaffolding as
verified systems (see "Fixtures / Heuristics / Approximation Debt").

## Product Identity

Slipgate is an independent discovery layer for large recommendation-driven
content ecosystems, beginning with YouTube. The platform supplies the
corpus; Slipgate supplies an alternate route through it. It is NOT an ad
blocker, UI skin, political-balance tool, or re-ranker of YouTube's Home
feed. It never reads YouTube's own recommendations. It does not promise
objective truth, does not determine what the user should believe, does not
define one canonical "other side", and does not represent a political
ideology. It exists for the exploration half of YouTube use: *help me see
what I haven't seen* — without contaminating the user's normal YouTube
recommendation profile. The walled-garden metaphor refers to escaping the
constraints of an algorithmically cultivated information environment; it
implies nothing about system compromise or unauthorized access.

## Product in One Paragraph

A local-first Firefox/Chromium browser extension. The user authors
**Viewpoints** — saved, inspectable discovery/ranking lenses with seeds,
constraints, temporal windows, and exposure budgets. Activating a Viewpoint
runs an independent acquisition pipeline (plan-driven providers that fetch
public youtube.com pages — search results, channel uploads, playlists — but
never Home recommendations), classifies every candidate across six
evidence-based dimensions, ranks with a named explainable engine, and
composes a **Viewstream** under the Viewpoint's exposure budget. Every card
states why it appeared via a five-step provenance chain; the Coverage tab
autopsies what the Viewstream contains and omits. Feedback is explicit-only
with declared semantics; an exploration firewall keeps Viewpoints from
training each other. State is local (page-origin IndexedDB); export/import
is versioned with private data opt-in.

## Core Product Principles

1. Independent discovery layer, not a Home-feed re-ranker. FROZEN.
2. YouTube is treated as a video corpus + player infrastructure.
3. Optimize for controlled exploration and informational diversity, not
   maximum engagement.
4. A click or completed watch is not agreement or desire for more.
5. Explicit feedback over inferred psychological preference.
6. Viewpoints are user-controlled sampling instructions, not declarations
   of truth.
7. Politics is only one application domain.
8. Political identity/party/ideology is never inferred and never a hidden
   ranking variable. No political classification exists anywhere in the
   codebase. FROZEN.
9. Perspectives are never reduced to binary opposition (pairing is
   evidence-gated; 1, 2, 3, 5 clusters are all honest outcomes).
10. Narrative diversity ≠ channel diversity (separate budget rules).
11. UNKNOWN classifications are preferable to fabricated certainty. FROZEN.
12. Recommendation logic stays inspectable: every inclusion decomposes
    into named, visible steps.
13. Exploration inside one Viewpoint never contaminates unrelated
    Viewpoints (exploration firewall).
14. Help the user see what they have not seen, rather than predict what
    they already prefer.

No implemented behavior contradicts these. The ranking weights are
deliberately simple, and the composer prefers reporting a violated floor
over manufacturing diversity.

## Current User Experience

On youtube.com a "Slipgate" entry is injected into YouTube's side guide
(floating toggle fallback when the guide is absent). Clicking it opens a
full-screen overlay shell:

- **VIEWSTREAM** — composed feed for the active Viewpoint. Active-Viewpoint
  strip (always visible) + rapid switcher select on every tab. Cards carry
  title/channel/duration, playback area, "why this appeared", full ranking
  components with weighted contributions, explicit feedback buttons,
  mute-channel, compare-treatments (when evidenced), and card inspector
  (five-step provenance chain + per-dimension audit trail + override
  controls). Assumptions banner + fork lineage when present. "Regenerate
  Viewstream" + exposure panel ("Why this Viewstream looks like this").
- **VIEWPOINTS** — manager: create/edit/enable/delete, fork ("Duplicate
  this Viewpoint and change one assumption"), viewlist membership.
- **VIEWLISTS** — named collections; unassigned-Viewpoint box.
- **COVERAGE** — feed autopsy (10 metrics), blind-spot map, coverage map,
  Time Machine (anchor date + four period spans, per-period profiles,
  standing no-causal note), portability (export/import).
- **SAVED** — explicit saves by captured-at.

First run shows a one-time onboarding gate stating Slipgate does not
attempt to determine what the user should believe, offering three
paths: the guided tour ("Show me how it works"), five generic editable
starter Viewpoints, or an empty start (fully working product either
way). The gate shows once (`onboarded` KV flag).

The guided tour is a 15-step overlay that teaches through use — each
step opens the surface it explains and reads live runtime values (real
provenance chain, real autopsy metrics, real coverage totals, honest
discovery-plan cap note), never fabricated numbers. Steps: welcome →
what is a Viewpoint → demo choice → Viewpoint details → build a
Viewstream → first card + provenance → Unknown is honest → feed
autopsy → coverage → compare Viewpoints (composition facts only) →
feedback semantics → exploration firewall → change something (real
config change with UNDO) → create your own (simplified creator) →
done. Next/Back/Skip on every step, no modal prison. Tour state
persists separately (`guided-tour-state` KV key) from Viewpoint
preference data; replay is available any time from the Help menu.
Political-perspective demos exist only behind an explicit confirmed
opt-in with a disclaimer ("These are test lenses, not truth labels.
…using one does not define your political identity."); they are marked
DEMO INSTANCE instances, removable in one action, and removal spares
user forks. Contextual (?) help toggles sit on every tab and major
panel heading.

## Implemented System

### End-to-End Data Flow

```
User selects/edits Viewpoint (VIEWPOINTS tab, repository)
        |
        v
deriveDiscoveryPlan(Viewpoint)  [discovery/plan.ts — seed searches,
        |                        channel ids, concepts, explicit videos]
        v
CandidateProvider.runPlan      [fixture-provider (dev) OR
        |                       youtube-web (live)]  --- EXTERNAL PAGE
        v                       FETCHES (same-origin, credentials:'omit')
AcquisitionStep reports (honest failures recorded, never retried)
        |
        v
Candidate pool (merge/prune/TTL, MAX_POOL_SIZE)   --- PERSISTED (IndexedDB)
        |
        v
Working-set selection by provenance (primary viewpointId or
alsoDiscoveredVia)  [viewpoints/workingset.ts]
        |
        v
Enrich: classify + merge classification into pool candidates,
        apply user overrides at READ time  [classification/enrich.ts]
        |
        v
interpretViewpoint → hard filters + weights  [viewpoints/interpret.ts]
        |
        v
rankCandidates (8 named components, deterministic)  [ranking/engine.ts]
        |
        v
assembleViewstream → composer when exposure budget configured
        [viewpoints/composer.ts: floors reserve, ceilings gate,
         cooldowns, relief pass, trim pass — per-rule report]
        |
        v
Viewstream snapshot (feed + embedded audit record)  --- PERSISTED
        |
        v
Render (feed cards) → user inspection (provenance chain, inspector)
        → explicit feedback → recorded through exploration firewall
        → per-Viewpoint / global state  --- PERSISTED
```

Persistence boundary: everything under the `metube` IndexedDB on the
youtube.com page origin (stores: `profile`, `feeds`, `kv`).
External boundary: only `youtube-web.ts` page fetches.
Local-only: all classification, ranking, composition, autopsy, Time
Machine, provenance, portability logic (pure, DOM-free modules).
Playback boundary: `youtube/player-frame.ts` sandboxed
`youtube-nocookie.com` iframe only.

### Viewpoint / Viewstream / Viewlist Model

- **Viewpoint** (`model/viewpoint.ts`): id, title, description, enabled,
  config (seeds: seedTopics/seedConcepts/seedChannels/seedPlaylists/
  seedVideos; constraints: positive/negative topic, source type, narrative,
  temporal window, unfamiliarity target; explorationPercent; repetitionLimit;
  sourceConcentrationLimit; weightOverrides; exposureBudget; timeMachine),
  assumptions (inert, displayed verbatim), forkedFrom lineage. Editable via
  prompt-based manager; every field inspectable.
- **Viewstream** (`viewpoints/viewstream.ts`): deterministic assembly —
  hard filters → mute → rank → repetition/concentration post-selection →
  snapshot with embedded Viewpoint audit record. With a budget, delegates
  selection to the composer.
- **Viewlist** (`model/viewpoint.ts`): named collection of Viewpoint ids.
  Grouping only today — no Viewlist-driven behaviors yet.
- **Fork flow** (`model/viewpoint.ts` + repository): duplicates config,
  records `forkedFrom{viewpointId, viewpointTitle, changedAssumption,
  forkedAt}`; the user then edits the changed assumption.

### Candidate Discovery

`discovery/plan.ts` derives an `AcquisitionPlan` from the Viewpoint (seed
searches from topics/concepts, channel ids, explicit videos, playlists).
`youtube-web.ts` (the only live provider) fetches ONE public youtube.com page
per step, parses `ytInitialData` with the pure `yt-parser.ts`, caps at
`MAX_PER_STEP`, and records every failure honestly (HTTP error, missing
data, zero candidates — never swallowed, never retried in-run). It never
fetches the Home feed. `fixture-provider.ts` implements the same
`runPlan` contract against a synthetic catalog for development mode
(gated by the explicit `use-fixture-provider` KV flag).

### Candidate Catalog vs Viewpoint Working Set

The candidate pool is the shared global CATALOG: one reusable cache for
deduplication and TTL-based reuse across Viewpoints (capped, pruned
oldest-first). Composition never reads the catalog directly. Each
Viewpoint composes from its WORKING SET (`viewpoints/workingset.ts`) —
the catalog subset selected by recorded provenance only:

- a candidate qualifies iff its primary provenance `viewpointId` equals
  that Viewpoint (originally discovered by it), OR
- its `alsoDiscoveredVia` array records an independent rediscovery by
  that Viewpoint.

Independently discovered candidates may therefore appear in several
Viewpoints' working sets — that is reuse, not leakage. Everything else
in the catalog stays cached but invisible to that Viewpoint. No
pin/save-into-Viewpoint mechanism exists yet; no such qualification path
is invented. Working-set selection is a pure read; the catalog is never
filtered per Viewpoint. Diagnostics (catalog size, working-set size,
shared with other Viewpoints, exclusive to active) are shown on the
Viewstream tab; the pool inspector still shows the global catalog.
Provenance dedup in `mergeIntoPool` includes the discovering Viewpoint
identity (same seed run by two Viewpoints = two recorded provenances),
and the duplicate-merge path replaces entries immutably (Firefox Xray
content scripts reject pushing sandbox objects onto wrapped arrays).

### Classification and Information Model

`classification/classify.ts` — deterministic, evidence-based, conservative.
Six dimensions, each with value + confidence + origin + method + evidence:
topics, source type (publication/independent/technical-analyst/…),
narrative cluster, temporal position, channel familiarity (pool sightings +
explicit feedback only; never YouTube history), provenance. UNKNOWN is a
real answer with a reason. No political inference anywhere (frozen).
`overrides.ts` — user overrides win over machine classification and are
applied at read time (survive pool regeneration and pruning).
`enrich.ts` — merges classification into pool candidates.

### Ranking and Exposure Budgets

`ranking/engine.ts` + 8 named components (relevance, source novelty, topic
novelty, narrative novelty, temporal diversity, controlled exploration,
repetition, source concentration) — additive, explainable, deterministic;
every score decomposes into visible components.

`viewpoints/composer.ts` — exposure budgets are ceilings and floors on
shares of the FINAL feed (never scores): max single channel/narrative/topic
share, min unfamiliar-channel / alternate-source-type / historical /
exploration share, repeated channel/narrative cooldowns (generations), min
distinct languages/regions/scale bands. Floors run as reservation passes;
the main walk is ceiling-gated; a relief pass keeps the top-ranked candidate
when soft rules would otherwise empty the feed (bypass reported in the
explanation); a final trim pass enforces ceilings. Every rule reports
satisfied / violated / not-applicable with an explanation; floors the pool
cannot satisfy report violated honestly — diversity is never manufactured by
misclassifying candidates, and unknown classifications never count toward
diversity floors.

### Feedback and Exploration Isolation

`model/feedback.ts` — 12 explicit kinds in three groups: exposure facts
(watched, skipped, saved) never train preference; preference signals
(good-recommendation, more-like-this, more/less-from-source, more/less-topic,
more-narrative-region, not-interested); representation notes
(interesting-no-extrapolate, cluster-overrepresented). Every signal comes
from a labeled button press.

`viewpoints/firewall.ts` — three state spaces, deliberately separated:
(1) global (candidate pool, overrides, saves, mutes); (2) per-Viewpoint
(preference signals, per-Viewpoint exposure facts such as watched);
(3) normal YouTube state — never read, never mutated. Feedback recorded
inside a Viewpoint never trains unrelated Viewpoints. Mutes and global
exposure facts (save, mute) stay global. Mutes exclude channels entirely
(exclusion, not down-ranking).

### Coverage / Feed Autopsy

- `viewpoints/blindspots.ts` — descriptive underrepresented regions (pool
  has candidates, feed has few/none) across topic / source type /
  narrative cluster / temporal dimensions, with counts and samples and
  user-initiated "Explore from here". No prescriptions; regions are never
  framed as perspectives to adopt. (Explore from a region records the
  request but does not yet drive acquisition — documented gap.)
- `ui/blindspot-map.ts` + `ui/coverage-map.ts` — pool counts per dimension.
- `viewpoints/autopsy.ts` — 10 metrics on the composed feed: source
  concentration, channel concentration, narrative concentration, topic
  distribution, source-type distribution, familiarity, temporal
  distribution, exploration percent, budget compliance, pool-vs-feed.
  Descriptive facts, no verdicts.

### Time Machine

`viewpoints/timemachine.ts` — per-Viewpoint `TimeMachineConfig` (anchorDate
+ preEventDays/duringEventDays/postEventDays/retrospectiveAfterDays).
`classifyTimePeriod` buckets each candidate into pre-event / during-event /
post-event / retrospective / before-window / unclassifiable (unknown dates
are unclassifiable, never guessed). `comparePeriods` builds per-period
profiles (topics, channels, source types) with a summary that carries the
standing note: publication timing alone is never causal evidence; no
causal language anywhere in the module (test-enforced). Config editable in
the manager + Coverage panel.

### Playback and Privacy Boundaries

`youtube/playback.ts` (decisions only) + `youtube/player-frame.ts` (DOM).
Real video ids embed in a sandboxed `youtube-nocookie.com` iframe
(`sandbox="allow-scripts allow-same-origin allow-presentation"`,
`referrerpolicy="no-referrer"`, credentials never sent to the embed).
Guarantee: SESSION isolation — playback is not attached to the logged-in
YouTube session or watch history. NOT guaranteed: anonymity — loading any
real video contacts YouTube servers. Fixture videos (synthetic `MT-FX-*`
ids) are honestly disabled with a note; no embed is attempted.

### Browser Support

- **Firefox** — first-class. `npm run build:firefox` → `dist-firefox/`
  (adds `browser_specific_settings.gecko.id: metube@metube.local`,
  strict_min_version 115.0); `npm run package:firefox` →
  `metube-firefox.xpi` (dependency-free zip writer, manifest first,
  integrity-checked). VERIFIED on Firefox ESR 140.16.0 + geckodriver 0.37.1:
  26/26 E2E checks. Unsigned xpi: install requires
  `xpinstall.signatures.required=false` (or Developer Edition/Nightly).
- **Chromium** — VERIFIED via Playwright E2E regression (full product
  matrix minus install mechanics). Loads unpacked from `dist/`.

### Persistence and Portability

`storage/local-store.ts` — IndexedDB `metube` (DB_VERSION 1), stores
`profile` / `feeds` / `kv`; in-memory fallback. Known limitation: lives on
the youtube.com page origin — clearing site data clears Slipgate state.

`viewpoints/portability.ts` — export format `metube-export` v1: viewpoints,
viewlists, classification overrides, preferences (active viewpoint id,
fixture-mode flag). Feedback history is PRIVATE DATA, excluded by default,
included only on explicit opt-in. Feed snapshots also opt-in (not currently
exported by the UI). Import validates format/version, rejects malformed
sections whole (unknown fields inside known sections preserved verbatim),
merges by explicit mode (keep-mine / import-wins), never silently drops
one-side-only records, applies the imported active Viewpoint only when it
resolves and is enabled.

### File / Module Map

```
src/
  model/          Domain types (DOM-free, pure).
    viewpoint.ts      Viewpoint/Viewlist/TimeMachineConfig, forkViewpoint
    exposure.ts       12 exposure-budget rule types
    feedback.ts       12 explicit feedback kinds + semantics
    classification.ts Classification dims, familiarity, override types
    discovery.ts      AcquisitionStep/plan/provenance types, MAX_PER_STEP
    catalog.ts        topic/source-type/narrative catalog ids
    types.ts          CandidateVideo, FeedSnapshot, UserProfile
  discovery/      Acquisition pipeline.
    provider.ts       CandidateProvider + PlanDrivenProvider contracts
    plan.ts           Viewpoint → AcquisitionPlan derivation
    youtube-web.ts    Live provider (one page fetch per step, honest errors)
    yt-parser.ts      Pure ytInitialData parsing (vs captured fixtures)
    fixture-provider.ts Dev provider (same runPlan contract, synthetic)
    pool.ts           Candidate pool: merge/prune/TTL/MAX_POOL_SIZE
    enrich.ts→(classification) assembly wiring in viewpoints
    coverage.ts       Pool coverage counts
  classification/ Evidence-based classification.
    classify.ts        Deterministic classifier (UNKNOWN > invention)
    enrich.ts          Classify pool + apply overrides at read time
    overrides.ts       User override store, regeneration survival
  ranking/        Explainable engine.
    engine.ts          Deterministic scorer
    components/        8 named components + weights
  viewpoints/     Viewpoint semantics (pure).
    repository.ts      CRUD + active Viewpoint + fork over LocalStore
    interpret.ts       Viewpoint config → filters/weights
    viewstream.ts      Deterministic assembly (no budget path)
    composer.ts        Exposure-budget composition (Phase 4 core)
    firewall.ts        Explicit feedback scoping
    blindspots.ts      Descriptive underrepresentation
    pairing.ts         Evidence-gated "Compare treatments"
    timemachine.ts     Period classification + comparison (no causal claims)
    autopsy.ts         10 feed metrics
    provenance.ts      Five-step why-this-appeared chain
    portability.ts     metube-export v1 build/parse/merge
    onboarding.ts      First-run gate state + text
    starters.ts        Five generic editable starters
    demo.ts            Legacy DEMO viewpoints (tests only)
  storage/
    local-store.ts     IndexedDB wrapper + in-memory fallback
  youtube/        Page integration (DOM-only).
    nav.ts             Guide entry + floating toggle, MutationObserver
    playback.ts        Playback decisions (pure)
    player-frame.ts     Sandboxed embed iframe
  ui/             Rendering (DOM construction only, no innerHTML —
                  youtube.com enforces TrustedHTML).
    shell-header.ts / onboarding-panel.ts / viewpoint-manager.ts /
    feed-card.ts / autopsy-panel.ts / time-machine-panel.ts /
    provenance-panel.ts / portability-panel.ts / saved-panel.ts /
    coverage-map.ts / blindspot-map.ts / candidate-inspector.ts /
    exposure-panel.ts / styles.ts
  extension/
    content.ts         Content-script entry: tabbed shell, wiring,
                       bootstrap, idempotent style injection
    manifest.json      MV3, NO permissions, youtube.com content script only
tests/            160 pure-logic tests (node:test, CJS, dist-test/)
  bootstrap(feed) / viewpoints / classification / acquisition /
  ranking / composer / phase4 (firewall, pairing, blindspots) / phase5
scripts/
  build-extension.mjs  --target=chromium|firefox, esbuild IIFE
  package-firefox.mjs   dependency-free zip → metube-firefox.xpi
  copy-test-fixtures.mjs
docs/            PRODUCT / ARCHITECTURE / DISCOVERY_MODEL / FEED_MODEL /
                 CLASSIFICATION / PRIVACY_AND_ISOLATION / OPEN_QUESTIONS
```

Layer rule (settled): model + viewpoints pure/DOM-free; youtube/ + ui/ +
extension/ may touch the DOM; nothing but `discovery/youtube-web.ts` and
`youtube/player-frame.ts` touches the network/playback.

## Verified Runtime Behavior

- `npm run typecheck` clean; `npm test` 160/160.
- Firefox E2E 26/26 (ESR 140.16.0, geckodriver 0.37.1, persistent install of
  the packaged xpi): single injection + single style block across SPA
  pushState, full navigation, reload, browser restart; onboarding gate both
  paths; five tabs; state across tab cycles; rapid Viewpoint switching
  recomposes; Viewpoint isolation (Deep History composes only pre-2026
  material); 10 autopsy metrics; Time Machine note + 5 inputs; default
  export (v1, 5 Viewpoints, no feedback key) and feedback opt-in export
  verified from disk; import round-trip through the real file input with
  result line; wrong-format import rejection; fixture playback honestly
  disabled with no embed; five-step provenance chain in the inspector;
  onboarding + active Viewpoint persist across reload and restart.
- Chromium E2E regression: same product matrix, all pass; no page errors.
- Live YouTube acquisition (Phase 2, headed Chromium): seed-search acquired
  12 real candidates; channel-uploads resolved @handle → UC id → uploads
  grid; playlist harvested 12; regeneration served from cache with 0 new
  fetches. Real videos embed through the sandboxed iframe.

Known Firefox E2E mechanics (this machine): `install_addon(temporary=True)`
is broken (content scripts never run) — always persistent install;
reinstalling over an existing profile hangs on a silent dialog — always a
fresh profile per run.

## Fixtures / Heuristics / Approximation Debt

Future agents must not mistake these for proven systems:

1. **Fixture provider + synthetic catalog** (`discovery/fixtures/`): the
   default dev experience runs on 8 synthetic candidates across 5 topics.
   Enabled ONLY behind the explicit `use-fixture-provider` KV flag. All
   "starter demonstrates its mechanism" claims hold against THIS catalog.
2. **Starter seed values are fixture-tuned** (e.g. Deep History seeds
   'jet age' because fixture MT-FX-v00007 predates 2026-01-01). On live
   YouTube the same starters produce different results — their quality
   depends on `youtube-web.ts` page parsing.
3. **Classifier lexicons are small and deliberately conservative**
   (`classification/classify.ts`): real-world UNKNOWN rates will be high,
   especially source type (a channel title alone evidences little).
4. **Narrative clusters**: no assignment process exists for real
   candidates — clusters come from provider-carried ids and user overrides
   only. The dimension is honest but nearly empty in live use.
5. **Inclusion basis in provenance**: the composer does not record
   per-item selection basis in snapshots; `inclusionBasisFor` honestly
   reports 'main-walk' in most cases and 'unknown' when evidence is absent.
   Never invent floor-attribution.
6. **Ranking weights are provisional** coefficients in
   `ranking/components/weights.ts` — untuned by any live usage data.
7. **Language/region/scale diversity rules** report not-applicable when
   candidates carry no such metadata ("never satisfied by guessing") — in
   practice live candidates rarely carry it.
8. **YouTube page parsing** depends on current youtube.com markup; layout
   drift has already broken one surface (the @handle/videos Playlists
   variant, worked around via UC-id resolution). Expect drift.
9. **Prompt-based Viewpoint editing**: every edit goes through
   `window.prompt`-style dialogs. Plain by design, provisional in product
   terms.
10. **No icons**; feed overlay is full-screen.
11. **`mt` bootstrapping** stores `MT-FX-*` synthetic ids only in fixture
    mode; playback is honestly disabled for them.

## Settled Decisions

### FROZEN

- Thesis: independent discovery layer; never consume YouTube Home
  recommendations; never re-rank the Home feed.
- No political classification, no political inference, no ideological
  scoring — anywhere, ever.
- UNKNOWN beats invented certainty (classification, familiarity, dates,
  provenance).
- Explicit feedback only; clicks/dwell/watch-time are never signals;
  exposure facts never train preference.
- Feedback scoping (exploration firewall): per-Viewpoint preference
  signals; global facts only where genuinely Viewpoint-independent.
- Budgets compose after ranking (floors reserve, ceilings gate) and soft
  rules never empty the feed (relief pass reports the bypass).
- Overrides survive regeneration (applied at read time, stored separately
  from the pool).
- Viewpoint assumptions are inert (displayed verbatim, never interpreted).
- Portability: feedback is private data, opt-in export only.
- Time Machine: no causal claims; standing note is test-enforced.
- Determinism: same Viewpoint + candidates + profile → same Viewstream.

### VERIFIED

(Each verified by tests + at least one browser E2E run.)

- Viewpoint model, editing, switching, active-Viewpoint persistence.
- Plan-driven acquisition via both providers (fixture E2E; live provider
  against captured real pages in unit tests + headed Chromium runs).
- Evidence-based classification + overrides + regeneration survival.
- Deterministic 8-component ranking with explanations.
- Exposure-budget composition incl. floors, ceilings, cooldowns, relief
  pass, honest per-rule violation reports.
- Exploration firewall (per-Viewpoint scoping; 'watched' recorded
  per-Viewpoint as an exposure fact).
- Evidence-gated perspective pairing; descriptive blind spots.
- Time Machine period math + no-causal summary; 10 autopsy metrics.
- Five-step provenance chain; card inspector; override controls.
- Portability round-trip, merge modes, feedback opt-out/in, rejections.
- Onboarding gate both paths, once-only.
- Fork flow with lineage.
- Firefox: install, single injection, no duplication (SPA/full nav, reload,
  restart), all tabs, persistence. Chromium: full product matrix.
- Playback isolation (sandboxed embed; fixture honestly disabled).

### IMPLEMENTED

(Exists; not yet validated at scale or in live long-term use.)

- `youtube-web.ts` live acquisition (verified on small headed runs; not
  exercised continuously; layout drift expected).
- Candidate pool TTL/prune policy (unit-tested; long-term growth behavior
  unobserved).
- Generation-history cooldown arithmetic across sessions (KV-capped 64).
- Saved tab; Viewlist grouping.
- Firefox packaging path (unsigned xpi; release-distribution not attempted).

### PROVISIONAL

- Ranking component weights (no tuning evidence).
- Classifier lexicons and evidence thresholds.
- Default feed size (8), repetition/concentration defaults,
  `MAX_POOL_SIZE`, `MAX_PER_STEP`, cache TTLs.
- Starter Viewpoint definitions and their fixture-tuned seeds.
- Prompt-based editor UX; full-screen overlay presentation.
- The five-tab information architecture (stable so far, not contractual).
- `metube-export` v1 field set (versioned; evolution expected).

### OPEN

See `docs/OPEN_QUESTIONS.md` (26 items). Highest-signal ones: citation-
following semantics; random-walk acquisition; narrative-cluster assignment
at scale; scale-band evidence source; weight tuning; familiarity
definition; storage origin (page IndexedDB vs browser.storage);
multi-profile support; exploration-seed acquisition integration.
Additional: Viewlist-driven behaviors (none); blind-spot "Explore from
here" does not yet drive acquisition; AMO signing/distribution.

### DEPRECATED

- `viewpoints/demo.ts` DEMO viewpoints (fixture-era political-demo
  constraints): kept for tests/history; starters replaced them in the
  first-run experience. Do not build on demo.ts.

## Adversarial Risk Review

Only risks that materially matter to this codebase:

1. **RISK: Search/provider bias becomes the hidden filter bubble.** All
   live acquisition flows through youtube.com search + channel pages;
   YouTube's ranking of THOSE pages shapes the candidate pool invisibly.
   CURRENT MITIGATION: provenance records provider/method/seed; autopsy
   reports source concentration; multiple seed types spread the funnel.
   REMAINING GAP: nothing measures or surfaces search-result bias itself;
   pool-level "what did the provider not show us" is invisible.

2. **RISK: Live candidate starvation makes budgets deceptive.** With tiny
   pools (the common live case — one seed search = ~12 candidates), floors
   report satisfied/violated over a feed of 8 that carries little meaning;
   users may read budget compliance as robustness it doesn't have.
   CURRENT MITIGATION: composer reports pool sizes and honest violation
   reasons; pool-vs-feed autopsy metric exposes the ratio.
   REMAINING GAP: no minimum-pool warning before composition; no
   "this budget is untestable at this pool size" surface.

3. **RISK: Narrative clustering collapses distinct arguments together.**
   With provider-carried ids + user overrides only, the dimension is thin;
   if future automation groups framings coarsely, narrative floors would
   measure the grouping, not real diversity.
   CURRENT MITIGATION: no automated cluster assignment exists — honest
   emptiness; unknown never counts toward floors.
   REMAINING GAP: cluster assignment process is an open question (OQ-19).

4. **RISK: Explicit feedback quietly becomes an engagement optimizer.**
   'more-like-this' etc. feed similarity/relevance weights; a user pressing
   them like a "like" button recreates a preference loop inside Slipgate.
   CURRENT MITIGATION: firewall scopes signals per Viewpoint; semantics
   declared per kind; exposure facts never train; interpretation of
   signals is inspectable.
   REMAINING GAP: no long-term study of how preference signals actually
   drift the feed within one Viewpoint.

5. **RISK: Page-origin storage loss.** youtube.com site-data clear (or
   consent-tool cleanup) silently erases all Viewpoints.
   CURRENT MITIGATION: export/import; documented limitation.
   REMAINING GAP: no automatic export reminder; no schema migration story
   beyond DB_VERSION=1.

6. **RISK: YouTube layout drift breaks acquisition/injection silently.**
   Already observed once (@handle Playlists variant). CURRENT MITIGATION:
   honest empty steps with failure reports; floating toggle fallback for
   nav loss. REMAINING GAP: user-facing surface for "acquisition produced
   nothing this run" exists (step reports) but is easy to miss.

7. **RISK: Firefox/Chromium divergence.** Two build targets, two E2E
   harnesses. CURRENT MITIGATION: shared source, single manifest template,
   both E2E matrices pass at v0.6.0. REMAINING GAP: Firefox-only manifest
   keys drift unnoticed if only Chromium E2E runs.

8. **RISK: Playback isolation overstated by users.** Session isolation ≠
   anonymity. CURRENT MITIGATION: exact wording in onboarding, README,
   playback.ts header, and this document. REMAINING GAP: none beyond
   continued honest wording.

9. **RISK: Viewpoints harden into ideology labels.** A saved Viewpoint
   with rigid constraints becomes a camp identifier rather than a lens.
   CURRENT MITIGATION: starters are mechanism demos, politically neutral,
   fork flow encourages changing one assumption; assumptions inert.
   REMAINING GAP: nothing nudges periodic re-examination of constraints.

## Known Limitations

- Unsigned xpi; pref change required for release Firefox.
- Page-origin IndexedDB (see risk 5).
- Prompt-based editing; no icons; full-screen overlay.
- Starter seeds fixture-tuned.
- Live acquisition depends on youtube.com markup (drift risk).
- Narrative clusters near-empty in live use.
- Viewlist grouping only — no cycling/comparison behaviors.
- Blind-spot "Explore from here" records intent but does not drive
  acquisition.
- Single provider (youtube-web) besides fixtures; no editorial/community/
  citation/random-walk sources yet.

## Next Implementation Frontier

### NEXT

1. **Pool-size honesty gate for budgets.** Objective: before composition,
   surface "pool is too small to test this budget meaningfully" when
   pool size is under a threshold relative to feed size.
   Why: budget compliance is the core product promise; at live pool sizes
   it currently risks being decorative. Touches: composer report + exposure
   panel UI. Prerequisite: none.

2. **Real editor forms for Viewpoints.** Objective: replace prompt-based
   editing with in-shell forms (per-field validation, cancel without
   mutation). Why: prompts are the biggest daily-use friction and block
   non-trivial config (12-rule budgets, time windows). Touches: ui/
   viewpoint-manager.ts, extension/content.ts. Prerequisite: none.

3. **Acquisition outcome surface.** Objective: a visible per-run summary
   of acquisition steps (which seeds ran, how many candidates, which
   failed) — data already recorded, just not surfaced on Viewstream.
   Why: closes the honest-failure gap (risk 6); cheap — the reports exist.
   Touches: content.ts Viewstream tab, discovery step reports. 
   Prerequisite: none.

4. **Blind-spot "Explore from here" → acquisition wiring.** Objective:
   record-and-act: feed the chosen region into an acquisition plan
   (e.g., topic-seeded search). Why: makes Coverage actionable, which is
   its entire product purpose. Touches: viewpoints/blindspots.ts consumer
   in content.ts, discovery/plan.ts. Prerequisite: acquisition surface (3)
   helps validate.

5. **Second live provider (editorial/community list import).** Objective:
   a provider over user-supplied lists (channel lists, playlist URLs) —
   the provider interface already supports it. Why: reduces
   search-bias risk (risk 1) and pool starvation (risk 2); the
   CandidateProvider contract makes this additive. Touches: discovery/
   provider implementations + repository. Prerequisite: none technically;
   product decision on which list format first.

### LATER

- Narrative-cluster assignment research → implementation (OQ-19); the
   biggest information-model gap.
- AMO signing / release packaging.
- Storage migration to extension origin (chrome.storage /
   browser.storage) or schema-versioned page storage (risk 5; OQ-8).
- Viewlist-driven behaviors (cycling, A/B composition).
- Blind-spot visualization beyond text lists.
- Duplicate/repost detection in the pool.
- Multi-profile (exploration moods) support.

### RESEARCH

- How to measure provider/search bias without consuming recommendations
   (risk 1) — currently no design.
- Weight tuning evidence sources that do not recreate engagement
   optimization.
- Familiarity definition beyond pool sightings (OQ-6).
- Cross-device sync without a backend (or a principled decision never to).

## Validation Snapshot

- typecheck: clean. tests: 214/214 (178 baseline + 23 guided-tour
  tests in `tests/tour.test.ts` + 13 retrieval-isolation tests in
  `tests/workingset.test.ts`). build (Chromium): ok.
  build:firefox + package:firefox: ok (manifest name "Slipgate", gecko id
  `metube@metube.local`, v0.7.0, zip integrity ok).
- Firefox E2E: Phase 5 regression matrix 26/26 (includes rapid
  Viewpoint-switch recomposition through isolated working sets);
  guided-onboarding walkthrough (fresh profile, persistent install)
  64/64 — three-path gate, full tour with live values,
  disclaimer-before-opt-in, demo add/remove isolation, fork survival,
  mid-tour skip, replay, SPA-nav and reload non-duplication.
- Chromium E2E: Phase 5 regression clean; onboarding E2E 38/38, no page
  errors.
- Identity audit: all current user-facing surfaces say "Slipgate";
  internal identifiers, storage keys, format ids, and file names retain
  "MeTube" intentionally; historical changelog entries unchanged.
- Current identity (post-Slipgate pass): manifest name "Slipgate" in both
  build targets; public tagline "Escape Your Walled Garden." shown on
  onboarding, tour welcome, help menu, and README only.

## Current Commit

This record describes the repository after the retrieval-isolation pass
(Viewpoint working sets, 2026-09-19). Phase 6 (guided first-use
onboarding, v0.7.0) stood at `817ef3c`; Phase 5 at `bfdc6c5` ("Phase 5:
daily-use product (v0.6.0)", branch main). Public identity history:
MeTube (internal codename and original public name) → YourTube (interim
public name, 2026-09-19) → Slipgate (current public name, with tagline
"Escape Your Walled Garden."). Internal identifiers have been "MeTube"
throughout and remain so.