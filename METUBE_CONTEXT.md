# MeTube — durable project context

**Public product name:** Slipgate · **Tagline:** Escape Your Walled Garden.
**Internal/project codename:** MeTube — repository name, package name,
IndexedDB DB `metube`, storage keys, `metube-*` DOM ids/CSS classes, export
format `metube-export`, gecko id `metube@metube.local`, and the
`METUBE_*.md` filenames all stay MeTube intentionally. Historical
references stay historically accurate. Renaming any internal identifier
breaks stored state, format compatibility, and E2E selectors — do not do
it. The repository remains `forcefedglass/MeTube` unless explicitly
changed in a future task. Public identity history: MeTube → YourTube →
Slipgate; do not restore an earlier name as the public identity.

## Authoritative state record

`METUBE_CRYSTALLIZATION.md` is the authoritative crystallized state of the
project (product identity, implemented system, verified runtime behavior,
fixtures/heuristics debt, settled decisions FROZEN/VERIFIED/IMPLEMENTED/
PROVISIONAL/OPEN/DEPRECATED, adversarial risk review, next frontier).
Read it first; do not re-investigate settled work. This file carries only
durable mechanics that do not belong in a state record: the thesis, the
toolchain facts, machine-specific validation recipes, and the decisions log.

## Thesis (FROZEN)

Slipgate (internal codename: MeTube) is an independent discovery and
recommendation layer for YouTube. Not an ad blocker, UI skin,
political-balance tool, or re-ranker of YouTube's Home feed. "Don't
predict what I want to believe. Help me see what I haven't seen."
Exploration must not contaminate the user's normal YouTube recommendation
profile. Full principle list: METUBE_CRYSTALLIZATION.md § Core Product
Principles.

## Toolchain facts (durable)

- Node 22 / npm. The machine's global npm config sets `omit=["dev"]`;
  plain `npm install` silently skips devDependencies — always install with
  `--include=dev`.
- `npm test` compiles CommonJS output into `dist-test/` (tsc
  -p tsconfig.test.json, fixtures copied by scripts/copy-test-fixtures.mjs)
  and runs `node --test`. Test files run as CommonJS: `import.meta` is
  illegal there — use `dirname(__filename)` and `require('../src/...')`.
- TypeScript strict; esbuild IIFE bundle; no frameworks, no backend.
- youtube.com enforces TrustedHTML — no `innerHTML` anywhere in DOM code;
  all UI built via `createElement`.
- Firefox E2E mechanics (this machine): Firefox ESR at
  `/opt/firefox/firefox/firefox`; geckodriver at `/usr/local/bin/geckodriver`;
  python selenium. ALWAYS: fresh profile dir per run + prefs.js
  (`xpinstall.signatures.required=false`,
  `extensions.autoDisableScopes=0`, `extensions.experiments.enabled=true`;
  for export checks also `browser.download.folderList=2` +
  `browser.download.dir`) → `install_addon(temporary=False)`.
  `install_addon(temporary=True)` is broken (content scripts never run);
  reinstalling over an existing profile hangs on a silent dialog.
- Firefox E2E interaction mechanics: enable fixture mode by writing
  `{key: 'use-fixture-provider', value: true}` into the `metube` IndexedDB
  `kv` store (with `onupgradeneeded` creating profile/feeds/kv) BEFORE
  opening the shell. Selenium python `execute_script` does NOT await
  Promises — use `execute_async_script` for async flows. Verify exports by
  reading the downloaded file from the profile download dir, never by
  intercepting URL.createObjectURL.
- Chromium E2E mechanics: Playwright at `/root/node_modules/playwright`,
  chromium at
  `/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`;
  `launchPersistentContext` with `--no-sandbox`, fresh profile dir per run
  (a stale profile skips onboarding), inject `dist/content.js` via
  `page.evaluate`.
- Validation matrices (in /tmp; recreate from this file's recipes if lost):
  Firefox `/tmp/metube-ff-matrix-final.py` (26 checks), Chromium
  `/tmp/metube-chromium-phase5.js`.
- Firefox re-executes content scripts on reload — `injectStyles()` is
  idempotent (guard by `document.getElementById('metube-styles')`) and nav
  re-insertion is guarded; keep it that way.

## Durable environmental facts

- Live YouTube layout drift already happened once (2026-09-18): anonymous
  `/{@handle}/videos` fetches serve the Playlists tab variant; the provider
  resolves @handle → canonical UC id via the channel homepage first.
  Handles can be reassigned by YouTube (empty channels); the pipeline
  reports empty steps honestly. Expect further drift; never fabricate.
- Storage lives on the youtube.com page origin (content-script IndexedDB).
  Clearing site data for youtube.com clears Slipgate state. Export/import
  is the backup path. Extension-origin storage is an open question.

## Decisions log

- 2026-09-18: Bootstrap. MV3 + TypeScript + esbuild + node:test. No
  frameworks, no backend. Explicit-feedback-only. Fixtures over network.
- 2026-09-18: Storage on youtube.com page origin via indexedDB (content
  script context). Extension-origin storage deferred (OPEN question 12).
- 2026-09-18: Node --test over CommonJS-compiled output in dist-test/.
- 2026-09-18 (Phase 1): Viewpoints/Viewlists persist as KV arrays rather
  than dedicated object stores — no schema migration, DB_VERSION stays 1.
  Activation stored as KV `active-viewpoint-id`; deleting/disabling the
  active Viewpoint deactivates explicitly (never a silent fallback lens).
  Assembly limits enforced greedily post-ranking, in rank order.
- 2026-09-18 (Phase 2): Candidate acquisition NEVER consumes YouTube Home
  recommendations (FROZEN architectural rule). Permitted starts: Viewpoint
  seed topics/concepts, explicit channels, explicit videos, searches,
  channel uploads, playlists, previously discovered relationships, future
  provider types.
- 2026-09-18 (Phase 2): Acquisition via same-origin page fetch +
  ytInitialData parsing — no API keys, no host permissions, no background
  crawling. Bounded: 6 steps/plan, 12 candidates/step, 600-pool cap, 6h
  TTL. Relative dates → null → UNKNOWN_DATE sentinel; missing metadata →
  explicit placeholders, never fabricated. Unparseable date windows are
  treated as no window, not as drop-all filters (found via live E2E).
- 2026-09-18 (Phase 2): FixtureCandidateProvider activates only behind the
  explicit `use-fixture-provider` KV flag; real acquisition is the default
  user experience.
- 2026-09-18 (Phase 3): Every machine-derived classification carries value,
  confidence, origin/method, evidence; UNKNOWN beats invented certainty;
  no political scoring dimension exists anywhere (FROZEN). Overrides stored
  under their own KV key and applied at read time so they survive pool
  regeneration. Viewpoint assumptions are display-only premises. Coverage
  map ships as counts + plain lists; it describes, never judges.
- 2026-09-18 (Phase 4): Exposure budgets are share-of-FINAL-FEED rules
  enforced in composition after ranking, never re-ranking weights. Honest
  degradation over manufactured satisfaction; unknown classifications never
  count toward diversity floors. Cooldowns are soft rules; a relief pass
  keeps the top-ranked candidate when soft rules would otherwise empty the
  feed, and the bypass is always reported. Perspective pairing is
  evidence-gated; no forced two-sided symmetry. Feedback taxonomy is
  explicit and closed: exposure facts never train preferences; the
  exploration firewall lenses every Viewpoint's training input.
- 2026-09-19 (Phase 5): Firefox is a first-class target, packaged via
  build:firefox / package:firefox with an unsigned xpi (documented pref
  requirement). No working-architecture rewrites for polish: new surfaces
  (autopsy, Time Machine, provenance, portability) are pure modules
  rendered by the existing UI pattern.
- 2026-09-19 (Phase 5): Onboarding states Slipgate does not attempt to
  determine what the user should believe; starters are generic and
  editable, never politically prescriptive. Time Machine never implies
  causal knowledge (standing note, test-enforced). Portability exports
  feedback history only by explicit opt-in. Trusted Types compliance — no
  innerHTML anywhere in DOM construction.
- 2026-09-19 (crystallization): Public-facing display name changed to
  YourTube across extension display name, YouTube nav entry, shell
  heading, onboarding, README, docs/PRODUCT.md, user-facing strings
  (familiarity labels, export/rejection messages, panel prose). Internal
  identifiers and historical references intentionally unchanged. Project
  state crystallized into METUBE_CRYSTALLIZATION.md; this file reduced to
  durable knowledge to avoid duplication.
- 2026-09-19 (Slipgate identity): Public product identity changed to
  Slipgate, tagline "Escape Your Walled Garden." — replaces YourTube
  (interim public name) on all current user-facing surfaces: extension
  display name + description (both manifests), YouTube nav entry +
  floating toggle, shell heading, onboarding (heading + tagline +
  body copy), Time Machine no-causal note, portability panel + export/
  rejection messages, coverage-map familiarity heading, autopsy
  familiarity detail, starter Viewpoint description, composer floor-rule
  text, channel-familiarity labels, playback iframe title, package.json
  description, README, docs/PRODUCT.md. Tagline shown only on onboarding
  and README (restrained use). Internal MeTube identifiers (DB `metube`,
  storage keys, `metube-*` DOM ids, export format `metube-export`,
  `MeTubeExportV1`, gecko id `metube@metube.local`, xpi filename,
  `METUBE_*.md` files, console prefixes, code comments) intentionally
  unchanged for compatibility. The public UI calls an export a "Slipgate
  export" while the underlying format identifier remains `metube-export`
  (documented in the portability panel). No functional change; no stored
  state, schema, or format compatibility affected.

## Verification commands

```sh
npm run typecheck
npm test                   # 160 tests
npm run build              # Chromium dist/
npm run build:firefox      # Firefox dist-firefox/
npm run package:firefox    # metube-firefox.xpi
# Firefox E2E (fresh profile per run, persistent install):
#   /tmp/metube-ff-matrix-final.py
# Chromium E2E (fresh profile per run):
#   /tmp/metube-chromium-phase5.js
```