# MeTube changelog

All notable changes to MeTube. Dates are system dates.

## 2026-09-19 — US political discovery test viewpoints

### Changed

- Added four clearly marked **DEMO / TEST VIEWPOINTS** for testing
  Slipgate's political discovery behavior in the United States
  (`src/viewpoints/test-viewpoints.ts`):
  `US Political Left — Broad Sample`, `US Political Right — Broad
  Sample`, `US Political Left — Policy / Primary Sources`, and
  `US Political Right — Policy / Primary Sources`.
- The four Viewpoints are user-controlled sampling lenses, not statements
  that any source or argument is correct, representative, moderate,
  extreme, or authoritative. Their descriptions and first assumptions
  say so verbatim, and none of them infers political identity.
- Each is marked `TEST-SEED` in its description and carries the
  `vp-test-` id prefix.
- Acquisition is query-driven from seed concepts only; no individual
  political channels are hard-coded into the definitions, so the live
  pool's findings are the test signal.
- Settings are structurally symmetric across left/right pairs (identical
  unfamiliarityTarget, explorationPercent, locale, temporal, exposure
  budget; policy variants additionally carry identical
  sourceTypePreferences). Only seed concepts and assumption wording
  differ between the left and right versions of a shape.
- Schema honesty is recorded in assumptions: locale (en/US) is a soft
  recorded preference never enforced as a filter; temporal is the
  wide-window request with no from/to window so unknown publication
  dates are never dropped; no political classification exists in
  Slipgate, so political dimensions are UNKNOWN; exposure-budget floors
  that live acquisition cannot satisfy are reported honestly as
  violated, never manufactured.

### Unchanged (intentional)

- No architecture, ranking behavior, classification logic, or
  persistence design changed.
- The starter set is untouched: the test viewpoints are NOT starters,
  are never seeded by `acceptStarters`/onboarding, and no existing
  user receives them automatically. `seedTestViewpoints` must be
  invoked deliberately.
- No existing Viewpoint (starter, demo, or user-created) was modified.
- `sourceTypePreferences` remains recorded and editable but not
  enforced by ranking.

### Verified

- `npm run typecheck` clean.
- `npm test`: 178/178 passing (160 baseline + 18 new tests in
  `tests/test-viewpoints.test.ts` covering markers, ids, titles, exact
  seed concepts, shared settings, left/right structural symmetry,
  assumption honesty notes, absence of shared mutable state,
  independent activation, distinct and MAX_PLAN_STEPS-capped discovery
  plans, idempotent deliberate seeding, starter-set isolation, and
  non-editorial summaries).
- `npm run build`, `npm run build:firefox`, `npm run package:firefox`
  all succeed; both manifests still identify Slipgate.

## 2026-09-19 — Slipgate product identity

### Changed

- Public product identity is now **Slipgate** (tagline: **Escape Your
  Walled Garden.**), replacing the interim public name YourTube. The
  walled-garden tagline refers to escaping the constraints of an
  algorithmically cultivated information environment; it implies nothing
  about compromising, attacking, or bypassing computer security, and
  nothing about account or system compromise.
- Updated user-facing surfaces: extension display name + description
  (both build targets' manifests), YouTube sidebar nav entry + floating
  toggle, shell heading, onboarding (heading, tagline, body copy),
  Time Machine no-causal note, portability panel prose + export/rejection
  messages, coverage-map familiarity heading, autopsy familiarity detail,
  starter Viewpoint description, composer floor-rule text,
  channel-familiarity labels, playback iframe title, package.json
  description, README (retitled), docs/PRODUCT.md.
- Tagline used selectively: onboarding first-run presentation and README
  only; the normal working interface identifies the product simply as
  "Slipgate".
- README states explicitly that Slipgate is the public product identity
  of the project internally developed under the MeTube codename (same
  application, not separate products).
- METUBE_CRYSTALLIZATION.md Product Identity section + identity note
  updated so future agents cannot restore MeTube, YourTube, or a previous
  tagline as the public identity; METUBE_CONTEXT.md records the identity
  decision and history.
- Portability panel now documents the legacy `metube-export` v1 format
  identifier as an internal compatibility identifier (a "Slipgate export"
  uses the `metube-export` format unchanged).

### Unchanged (intentional)

- Internal/project codename MeTube: repository name/URL, package name
  (`metube`), IndexedDB database `metube`, storage keys, `metube-*` DOM
  ids/CSS classes, export format identifier `metube-export`,
  `MeTubeExportV1` interface, gecko id `metube@metube.local`, xpi filename
  `metube-firefox.xpi`, `METUBE_*.md` file names, code comments, console
  prefixes, historical changelog entries. Renaming any of these would
  break stored user state, format compatibility, or E2E selectors.
- No discovery/ranking behavior change; no stored user state, schema, or
  export/import compatibility change; version stays 0.6.0.

### Verified

- typecheck clean; tests 160/160; Chromium build, Firefox build, and xpi
  packaging succeed; generated manifests in dist/ and dist-firefox/ and
  the packaged xpi present the extension publicly as "Slipgate" with the
  internal gecko id unchanged.
- Firefox E2E 26/26 and Chromium E2E regression all-pass with the Slipgate
  build (both matrices assert on `metube-*` DOM ids, not display strings).
- Identity audit: no current user-facing surface presents MeTube or
  YourTube as the current product name; remaining occurrences are
  internal/compatibility identifiers or accurate historical records.

## 2026-09-19 — crystallization pass

### Added

- `METUBE_CRYSTALLIZATION.md`: the authoritative crystallized project-state
  record — product identity, implemented system, verified runtime
  behavior, fixtures/heuristics/approximation debt inventory, settled
  decisions (FROZEN / VERIFIED / IMPLEMENTED / PROVISIONAL / OPEN /
  DEPRECATED), adversarial risk review, known limitations, and the next
  implementation frontier (NEXT / LATER / RESEARCH).

### Changed

- Public-facing display name is now **YourTube**. Applies to: extension
  display name (manifest `name` in dist/ and dist-firefox/ and the
  packaged xpi), YouTube sidebar nav entry + floating toggle, shell
  heading, onboarding text, Time Machine no-causal note, portability panel
  and export/rejection messages, coverage-map familiarity heading, autopsy
  familiarity detail, starter Viewpoint description, composer floor-rule
  text, channel-familiarity labels, playback iframe title, package.json
  description, README, docs/PRODUCT.md. No functional change.
- METUBE_CONTEXT.md reduced to durable knowledge (thesis, toolchain
  facts, machine-specific validation mechanics, decisions log) and now
  refers to METUBE_CRYSTALLIZATION.md as the authoritative state record;
  content duplicated there was removed.
- METUBE_CHANGELOG.md: this entry. Earlier entries remain as originally
  written (they describe the product under its internal codename MeTube,
  which is historically accurate).

### Unchanged (intentional)

- Internal/project codename MeTube: repository name, package name
  (`metube`), IndexedDB database `metube`, storage keys, `metube-*` DOM
  ids/CSS classes, export format `metube-export`, `MeTubeExportV1`
  interface, gecko id `metube@metube.local`, xpi filename
  `metube-firefox.xpi`, `METUBE_*.md` file names, code comments, console
  prefixes. Renaming any of these would break stored state, format
  compatibility, or E2E selectors.
- Version stays 0.6.0; no code behavior changed in this pass.

### Verified

- typecheck clean; tests 160/160; Chromium build, Firefox build, and xpi
  packaging all succeed; packaged manifests carry `"name": "YourTube"`
  with the internal gecko id unchanged.
- Firefox E2E 26/26 and Chromium E2E regression all-pass with the renamed
  build (both matrices assert on `metube-*` ids, not display strings).
- Display-name audit: every current user-facing surface says YourTube; no
  internal identifier was renamed.

## 2026-09-19 — Phase 5: daily-use product (v0.6.0)

> Superseded in part by the crystallization entry above: the display-name
> change (MeTube → YourTube) and the Phase 5 verification snapshot are
> restated there. The entry below is kept as originally written.

### Added

- Firefox-first packaging: `npm run build:firefox` (dist-firefox/ with
  `browser_specific_settings.gecko.id`, strict_min_version 115.0) and
  `npm run package:firefox` (dependency-free zip writer →
  `metube-firefox.xpi`, manifest.json first, integrity-checked). Chromium
  path unchanged (`npm run build`).
- Tabbed product shell: VIEWSTREAM / VIEWPOINTS / VIEWLISTS / COVERAGE /
  SAVED — one mount, one persistent active-Viewpoint strip with a rapid
  switcher (select) on every tab. No duplicate UI under SPA navigation,
  full page loads, content-script re-execution (idempotent style
  injection), or extension reload.
- Onboarding gate (first run only): concise statement that MeTube does
  not attempt to determine what the user should believe, an explanation
  of Viewpoints as user-controlled sampling lenses, and two paths — add
  five generic, fully editable starter Viewpoints, or start empty.
  Starters are subject-mechanism demonstrations, not political
  prescriptions.
- Fork flow: "Duplicate this Viewpoint and change one assumption" —
  `forkViewpoint` records `forkedFrom` lineage (source id, title, the
  changed-assumption text, timestamp); lineage renders on the feed and
  the manager.
- Time Machine: per-Viewpoint temporal sampling around an anchor date —
  pre-event / during-event / post-event / retrospective windows
  (config: anchor date + four day-spans). `comparePeriods` produces
  per-period candidate groups with an enforced standing note: MeTube
  does not imply knowledge of causal relationships; it samples periods
  as the user defines them.
- Feed Autopsy (Coverage tab): 10 concentration/distribution metrics on
  the composed feed — source, channel, narrative, topic, source-type
  distribution, familiarity, temporal distribution, exploration percent,
  budget compliance, pool-vs-feed. Descriptive facts, no verdicts.
- Provenance chain: "Why this appeared" expanded to a five-step chain —
  Viewpoint rule → discovery seed/provider/method → classification
  (with confidence + evidence) → ranking components → final inclusion.
  Unrecorded facts are stated as unrecorded; nothing is back-filled.
- Portability: versioned export/import (`metube-export` v1). Default
  export excludes feedback history (private data); feedback is an
  explicit opt-in second export. Import validates format/version, merges
  by explicit mode (keep-mine / import-wins), merges classification
  overrides by videoId+dimension, applies the imported active Viewpoint
  only when it resolves and is enabled. Wrong-format documents are
  rejected with the observed format stated.
- SAVED tab: explicit saves with captured-at ordering.
- Starter Viewpoint set: Wide Open Sampling, Outside My Bubble, Mixed
  Source Types, One Subject Many Angles, Deep History (temporal window
  demonstration).

### Changed

- Import result reporting renders after tab re-render (previously the
  result line was wiped by the tab refresh that followed it).
- `feed-card` component table header built via DOM construction — no
  `innerHTML` anywhere (youtube.com enforces TrustedHTML; one remaining
  use broke the whole shell in Firefox/Chromium until removed).
- `injectStyles` is idempotent (guards on the existing style element):
  Firefox re-executes content scripts on reload; styles previously
  duplicated each reload.
- Version 0.6.0.

### Verified

- 160/160 tests pass (Phase 5 adds 17: time machine period math + no
  causal language, autopsy metric invariants, provenance chain shape,
  portability round-trip + merge modes + feedback opt-out/in + rejection
  paths, fork lineage, onboarding state machine, starter seeding).
- Firefox E2E (headless Firefox ESR 140.16.0 + geckodriver 0.37.1,
  persistent-profile install of the packaged xpi), 26/26 checks:
  persistent install; single injection + single style block; no
  duplication across SPA pushState, full navigation, reload, and full
  browser restart; onboarding gate with the no-belief statement; both
  onboarding paths; five tabs; state preserved across tab cycles; rapid
  Viewpoint switching recomposes per Viewpoint; Viewpoint isolation
  (Deep History composes only pre-2026 material); 10 autopsy metrics;
  Time Machine note + 5 config inputs; export default document
  (format metube-export v1, 5 Viewpoints, no feedback key) read from
  the download dir; feedback opt-in export carries a feedback array;
  import round-trip through the real file input with result line;
  wrong-format import rejected honestly; playback honestly disabled for
  fixtures with no embed attempted; five-step provenance chain in the
  card inspector; onboarding + active Viewpoint survive reload and
  browser restart.
- Chromium E2E regression (headless Playwright, dist build), all checks
  pass: same matrix minus install mechanics (injection, onboarding,
  tabs, switching, isolation, autopsy, Time Machine, provenance, fork,
  export/import, SPA navigation, reload, no page errors).

### Known limitations (honest)

- The xpi is unsigned; installation requires
  `xpinstall.signatures.required=false` (or Developer Edition /
  Nightly). Firefox displays a one-time warning. No AMO listing.
- Storage lives in IndexedDB on the youtube.com page origin (content
  script context), not extension-origin storage — clearing site data
  for youtube.com clears MeTube state. Export/import exists for
  migration and backup.
- Starter Viewpoint seed values are tuned so each mechanism is
  demonstrable against the development fixture catalog; live YouTube
  acquisition quality depends on `YouTubeWebProvider` page parsing,
  which degrades to honest empty steps when layouts drift.
- Fixture (development) mode activates only behind the explicit
  `use-fixture-provider` KV flag; it is never the default user
  experience.
- Viewpoint editing remains prompt-based dialogs (deliberately plain);
  no icons; feed overlay is full-screen.

## 2026-09-18 — Phase 4: the Viewstream composer (v0.5.0)

### Added

- Viewstream composer (`src/viewpoints/composer.ts`): composition under
  EXPOSURE BUDGETS — ceilings and floors on shares of the final composed
  feed, enforced after ranking. Reservation passes for floors (unfamiliar
  channels, alternate source types, historical material, exploration
  wildcards), a main walk gated by ceilings and cooldowns, a relief pass
  that keeps the top-ranked candidate when soft rules would otherwise
  empty the feed (the bypass is reported in the cooldown explanation),
  and a final trim pass enforcing ceilings against the actual feed size.
  Deterministic; every rule's satisfaction is reported with an
  explanation. The engine degrades honestly: a floor that cannot be met
  within ceilings reports violated; unknown classifications never count
  toward diversity floors; language/region diversity rules report
  not-applicable ("never satisfied by guessing"). Diversity is never
  Manufactured by misclassifying candidates.
- Exposure-budget model (`src/model/exposure.ts`): 12 optional rules —
  max single-channel/narrative/topic share, min unfamiliar-channel /
  alternate-source-type / historical / exploration share, repeated
  channel/narrative cooldowns (generations), min distinct
  languages/regions/scale bands. All user-editable in the Viewpoint
  manager; all reported per rule on the feed.
- Explicit feedback semantics (`src/model/feedback.ts`): 12 kinds with
  declared semantics — exposure facts (watched, skipped, saved) kept
  strictly separate from preference signals (good-recommendation,
  more-like-this, more/less-from-source, more/less-topic,
  more-narrative-region, not-interested) and representation notes
  (interesting-no-extrapolate, cluster-overrepresented). "I watched this"
  never means "I want more of this."
- Exploration firewall (`src/viewpoints/firewall.ts`): feedback is scoped
  global vs per-Viewpoint. Feedback inside one Viewpoint never trains
  unrelated Viewpoints; mutes and exposure facts stay global; normal
  YouTube state is never mutated by MeTube.
- Perspective pairing (`src/viewpoints/pairing.ts`): evidence-gated
  "Compare treatments" — candidates addressing the same topics from
  materially different evidenced positions (narrative cluster or source
  type). No forced two-sided symmetry; 1, 2, 3, 5 meaningful clusters
  are all honest outcomes; no invented opposition for balance.
- Coverage / blind-spot view (`src/viewpoints/blindspots.ts` +
  `src/ui/blindspot-map.ts`): descriptive underrepresented regions across
  topic / source type / narrative cluster / temporal position dimensions,
  with counts, samples, and user-initiated "Explore from here". Regions
  are described factually — never framed as perspectives to adopt.
- Exposure panel UI (`src/ui/exposure-panel.ts`): "Why this Viewstream
  looks like this" — per-rule status, observed values, and explanations
  for satisfied, violated, and not-applicable rules.
- Generation history (KV `generation-history`, capped 64): per-Viewpoint
  cooldown arithmetic that survives sessions.
- "Regenerate Viewstream" control: explicit regeneration with honest
  budget/cooldown reporting.
- DEMO viewpoint "Deliberate Exposure Mix": composer observable out of the
  box (channel ≤30%, narrative ≤40%, ≥25% unfamiliar, ≥25% alternate
  source types, 15% exploration, channel cooldown 1).
- Floating toggle fallback (`src/youtube/nav.ts`): MeTube stays reachable
  when YouTube's guide is absent (compact layouts, consent walls).

### Changed

- Viewstream assembly routes the exploration-firewalled profile into
  ranking and composition (was: raw profile — one Viewpoint's preference
  feedback could train another's ranking).
- `FixtureCandidateProvider` implements `runPlan` (same plan-driven
  pipeline as the real provider, word-level search matching, honest empty
  steps) so development mode exercises the full pipeline; new
  `PlanCapableProvider` interface replaces the hard `YouTubeWebProvider`
  cast in acquisition (found via live E2E crash).
- Feed cards expose the full 12-kind feedback vocabulary, grouped
  exposure facts vs preferences.

### Verified

- 143/143 tests pass (Phase 4 adds 49: composer budgets 25 + feedback /
  firewall / pairing / blind spots 24, including the pathological cases —
  one channel dominating the pool, one narrative dominating, insufficient
  candidates for quotas, unknown classifications, conflicting constraints,
  sparse historical material, muted sources, repeated regeneration, and
  the relief pass pinning that soft rules never empty the feed).
- Live-browser E2E 16/16: composer + per-rule exposure panel, blind-spot
  map (descriptive only), evidence-gated pairing, feedback groups, firewall
  scoping via storage inspection, generation history persistence,
  regeneration with honest cooldown bypass reporting.

## 2026-09-18 — Phase 3: the information map (v0.4.0)

### Added

- Information-map model (`src/model/classification.ts`): six-dimension
  classification types — source-type taxonomy (official, publication,
  independent-creator, enthusiast-community, technical-analyst,
  academic-expert, primary-source, promotional-sponsored only where
  evidenced, unknown), temporal positions (contemporary, historical,
  pre-event, post-event, retrospective, unknown), `ClassifiedValue`
  carrying value + confidence + origin/method + evidence on every
  machine-derived classification, channel-familiarity bands derived from
  countable MeTube-only facts, evidenced-only provenance edge kinds, and
  CoverageMap data types. No political dimension exists anywhere in the
  model.
- Classifier (`src/classification/classify.ts`): deterministic,
  conservative, evidence-based. Source type fires only on explicit text
  markers; sponsorship only where disclosed in the text. Temporal
  position classified from explicit framing only — publication age never
  establishes a video's relation to its subject. Narrative clusters pass
  through provider-carried ids (resolved in the catalog) with no lexical
  fallback — clusters are never inferred from keywords. Topics pass through
  provider ids plus a one-per-candidate lexical fallback.
  `buildProvenanceEdges` emits only relationships evidenced in candidate
  data.
- Classification overrides (`src/classification/overrides.ts`): users
  override any dimension of any video; overrides live under their own
  `classification-overrides` KV key and are applied at read/enrich time,
  so they survive pool regeneration and MAX_POOL_SIZE pruning by
  construction; user values always win (confidence 1, origin
  `user-override`, note shown verbatim).
- Enrichment bridge (`src/classification/enrich.ts`): classifies pool
  candidates, applies overrides, and injects topicIds/narrativeClusterIds
  onto real candidates so Viewpoint hard filters and ranking finally
  operate on real classification output; full audit trail kept alongside
  each candidate.
- Coverage map (`src/discovery/coverage.ts` + `src/ui/coverage-map.ts`):
  pool representation quantified as plain counts across topics, source
  types, narrative clusters, temporal positions, age bands (fixed
  taxonomy, zero counts included), channel familiarity, and channels;
  rendered as fact lists. Data model first; the polished visualization is
  deliberately deferred.
- Candidate inspector (`src/ui/candidate-inspector.ts`): clicking any
  feed card opens the information map for that candidate — why this
  appeared (reason + per-component explanations), discovery provenance,
  every dimension with value/confidence/origin/method/evidence verbatim,
  and set/clear override controls.
- Viewpoint assumptions: user-authored temporary premises
  (`assumptions: string[]` on the config) displayed verbatim on the feed
  and editable through the manager; they never influence filtering,
  ranking, or classification, and belong to the Viewpoint, never to a
  user identity.
- Phase 3 tests (`tests/classification.test.ts`): 35 tests enforcing
  classification explainability, determinism, UNKNOWN-over-invented-
  certainty, no-political-inference, override precedence and regeneration
  survival, enrichment reaching the Viewpoint filter path, coverage-map
  counting, and assumption inertness.
- Documentation: new `docs/CLASSIFICATION.md`; ARCHITECTURE layer table
  and rules, FEED_MODEL, PRODUCT, PRIVACY_AND_ISOLATION, and
  OPEN_QUESTIONS updated for the information map.

### Changed

- Feed cards are now clickable and open the candidate inspector (buttons,
  links, and the player keep their own behavior).
- Viewstream assembly in the extension now classifies and enriches pool
  candidates before filtering/ranking, so topic-constrained Viewpoints
  work against real acquired candidates.

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