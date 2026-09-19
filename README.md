# Slipgate

**Escape Your Walled Garden.**

Slipgate is the public product identity of the project internally developed
under the **MeTube** codename (same application, same repository — MeTube is
the internal/project name, not a separate product).

Slipgate is an independent discovery layer for large recommendation-driven
content ecosystems, beginning with YouTube. It gives the user another route
through an information environment that would otherwise be selected and
ordered by an opaque recommendation system: the platform supplies the
corpus, Slipgate supplies an alternate route through it, Viewpoints
determine how that route is constructed, Viewstreams expose material
through those Viewpoints, and the user can inspect and control the
selection logic.

Slipgate is **not** an ad blocker, a UI skin, a political-balance tool, or
a re-ranker of YouTube's Home feed. It never reads YouTube's own
recommendations. The tagline refers to escaping the constraints of an
algorithmically cultivated information environment — not compromising,
attacking, or bypassing computer security.

**Product principle:** *Don't predict what I want to believe. Help me see
what I haven't seen.*

## Status

v0.7.0 (Phase 6, guided first-use onboarding). Everything from Phase 5 plus
a three-path first-run gate, a 15-step guided tour that teaches through use
with live runtime values, an opt-in demo mechanism (including explicitly
disclaimed political-perspective test lenses), contextual (?) help on every
tab and panel, and a simplified Viewpoint creator. See
`METUBE_CRYSTALLIZATION.md` for the current-state record,
`METUBE_CHANGELOG.md` for history, `METUBE_CONTEXT.md` for durable state.

## What it does

- **Viewpoints** — user-authored sampling lenses. Each Viewpoint carries
  seeds (topics, concepts, channels, playlists), constraints, temporal
  windows, and exposure budgets. The active Viewpoint is always visible;
  a rapid switcher recomposes the Viewstream.
- **Viewstream** — a composed feed, never YouTube Home re-ranked. Every
  card states why it appeared: discovery provenance, classification with
  evidence, all ranking components, and budget status.
- **Exposure budgets** — user-set ceilings and floors (channel share,
  narrative share, unfamiliar channels, alternate source types, historical
  material, exploration). Floors reserve; ceilings gate; soft rules never
  empty the feed.
- **Coverage** — feed autopsy (10 distribution metrics), blind-spot map,
  coverage map, Time Machine (period comparison with an explicit
  no-causal-knowledge note).
- **SAVED** — explicit saves, ordered by capture time.
- **Feedback** — explicit only, 12 kinds with declared semantics; exposure
  facts ("I watched this") never train preferences. The exploration
  firewall scopes every Viewpoint's training input.
- **Portability** — versioned export/import (a "Slipgate export" uses the
  internal `metube-export` v1 format, kept for compatibility with existing
  exports); feedback history is private and exported only by explicit
  opt-in.
- **Playback isolation** — real videos play in a sandboxed
  `youtube-nocookie.com` embed with cookies blocked and referrers
  suppressed. Session isolation, not anonymity (loading a video still
  contacts YouTube).
- **Guided first-use tour** — a three-path first run: watch a 15-step
  guided tour that teaches each mechanism through use (real provenance
  chains, real autopsy numbers, a real config change with UNDO), start
  with five generic starter Viewpoints, or start empty. The tour is
  skippable, resumable, and replayable from Help. Political-perspective
  demos exist only behind an explicit opt-in with a disclaimer; they are
  sampling lenses, not user profiling, and using one does not define
  anyone's political identity.

Slipgate does **not** attempt to determine what you should believe, does
not promise objective truth, does not define one canonical "other side",
and does not represent a political ideology. Viewpoints are user-controlled
lenses for sampling information differently — nothing more.

## Install (Firefox)

The packaged extension is `metube-firefox.xpi` (internal filename kept for
compatibility), built by `npm run package:firefox`. It is **unsigned**;
Firefox release builds require a one-time preference change to install it:

1. Build (or download the repository and run):
   ```sh
   npm install --include=dev
   npm run build:firefox     # dist-firefox/ with gecko manifest settings
   npm run package:firefox  # metube-firefox.xpi
   ```
2. Open `about:config` and set `xpinstall.signatures.required` → `false`.
   (On Firefox Developer Edition or Nightly this is already allowed.)
3. Open `about:addons` → gear icon → "Install Add-on From File…" →
   select `metube-firefox.xpi` → confirm the one-time warning.
4. Navigate to youtube.com. A "Slipgate" entry appears in the guide (plus
   a floating toggle if the guide is absent). Click it to open Slipgate.

First run shows the onboarding gate with three paths: "Show me how it
works" (the guided tour), "Start with starter Viewpoints" (five generic,
fully editable starters), or "Start empty — I will author my own".
Onboarding shows once; the tour can be replayed any time from Help.

## Install (Chromium, development)

```sh
npm install --include=dev
npm run build     # bundles dist/content.js + dist/manifest.json
```

Then in Chromium: `chrome://extensions` → Developer mode → Load unpacked →
select `dist/`. Navigate to youtube.com; a "Slipgate" entry appears in the
guide.

## Development

```sh
npm run typecheck        # tsc --noEmit
npm test                 # compile + node --test (201 tests)
npm run build            # extension into dist/ (Chromium)
npm run build:firefox    # extension into dist-firefox/
npm run package:firefox  # metube-firefox.xpi
```

Fixture mode (synthetic catalog, no network) activates only behind an
explicit `use-fixture-provider` flag in the `metube` IndexedDB store —
never the default user experience.

## Known limitations (honest)

- **Unsigned xpi**: installation needs
  `xpinstall.signatures.required=false` (or Developer Edition / Nightly).
  No AMO listing.
- **Storage lives on the youtube.com page origin** (content-script
  IndexedDB), not extension storage: clearing site data for youtube.com
  clears Slipgate state. Export/import is the backup and migration path.
- **Starter Viewpoint seeds are tuned to the development fixture catalog**
  so each mechanism is demonstrable in dev mode; live acquisition quality
  depends on YouTube page parsing, which degrades to honest empty steps
  when layouts drift (already observed once).
- **Viewpoint editing is prompt-based dialogs** — deliberately plain;
  real editor forms are future work. No icons.
- **Playback isolation is session isolation, not anonymity**: loading any
  real video contacts YouTube servers.
- **Feedback is explicit only**: no behavioral inference, no watch-history
  import, no political classification of any kind.
- **Demo Viewpoints are test lenses, not truth labels**: the
  political-perspective demos are sampling lenses over material associated
  with different US political traditions; using one does not define your
  political identity, and no Viewpoint is scored as more balanced or
  accurate than another. Tour state is stored separately from Viewpoint
  data (its own IndexedDB key), so tour progress never touches preference
  data.

## Layout

```
src/
  model/        domain types (viewpoint, exposure, feedback, classification)
  viewpoints/   starters, composer, timemachine, autopsy, provenance,
                portability, repository, interpretation, firewall, pairing
  onboarding/   guided-tour state machine, opt-in demo mechanism
  discovery/    plan-driven acquisition, yt parsers, candidate pool, coverage
  classification/ evidence-based classifier, overrides, enrichment
  ranking/      named scoring components + engine
  storage/      IndexedDB wrapper with in-memory fallback
  youtube/      nav injection, playback boundary
  ui/           shell, panels, cards, tour overlay, help tooltips, styles
  extension/    content-script entry point, manifest.json
tests/          pure-logic tests (node:test)
docs/           product + architecture documents
```

## License

MIT