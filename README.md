# YourTube

An independent discovery and recommendation layer for YouTube.

**Product display name:** YourTube · **Internal project codename:** MeTube

YourTube is **not** an ad blocker, a UI skin, a political-balance tool, or a
re-ranker of YouTube's Home feed. It is a separate discovery pipeline that
surfaces videos from independent sources, builds its own discovery graph,
and plays them in an isolated session.

**Core principle:** *Don't predict what I want to believe. Help me see what
I haven't seen.*

## Status

v0.6.0 (Phase 5, daily-use product). The full product surface runs on both
Firefox and Chromium: Viewpoint-driven discovery, exposure-budget
composition, feed autopsy, Time Machine, provenance chains, portability,
and a tabbed shell. See `METUBE_CHANGELOG.md` for history,
`METUBE_CRYSTALLIZATION.md` for the current-state record, and
`METUBE_CONTEXT.md` for durable state.

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
- **Portability** — versioned export/import (`metube-export` v1);
  feedback history is private and exported only by explicit opt-in.
- **Playback isolation** — real videos play in a sandboxed
  `youtube-nocookie.com` embed with cookies blocked and referrers
  suppressed. Session isolation, not anonymity (loading a video still
  contacts YouTube).

YourTube does **not** attempt to determine what you should believe.
Viewpoints are user-controlled lenses for sampling information differently
— nothing more.

## Install (Firefox)

The packaged extension is `metube-firefox.xpi`, built by
`npm run package:firefox`. It is **unsigned**; Firefox release builds
require a one-time preference change to install it:

1. Build (or download the repository and run):
   ```sh
   npm install --include=dev
   npm run build:firefox     # dist-firefox/ with gecko manifest settings
   npm run package:firefox   # metube-firefox.xpi
   ```
2. Open `about:config` and set `xpinstall.signatures.required` → `false`.
   (On Firefox Developer Edition or Nightly this is already allowed.)
3. Open `about:addons` → gear icon → "Install Add-on From File…" →
   select `metube-firefox.xpi` → confirm the one-time warning.
4. Navigate to youtube.com. A "YourTube" entry appears in the guide (plus
   a floating toggle if the guide is absent). Click it to open YourTube.

First run shows the onboarding gate: accept five generic, fully editable
starter Viewpoints, or start empty and author your own.

## Install (Chromium, development)

```sh
npm install --include=dev
npm run build     # bundles dist/content.js + dist/manifest.json
```

Then in Chromium: `chrome://extensions` → Developer mode → Load unpacked →
select `dist/`. Navigate to youtube.com; a "YourTube" entry appears in the
guide.

## Development

```sh
npm run typecheck        # tsc --noEmit
npm test                 # compile + node --test (160 tests)
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
  clears YourTube state. Export/import is the backup and migration path.
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

## Layout

```
src/
  model/        domain types (viewpoint, exposure, feedback, classification)
  viewpoints/   starters, composer, timemachine, autopsy, provenance,
                portability, repository, interpretation, firewall, pairing
  discovery/    plan-driven acquisition, yt parsers, candidate pool, coverage
  classification/ evidence-based classifier, overrides, enrichment
  ranking/      named scoring components + engine
  storage/      IndexedDB wrapper with in-memory fallback
  youtube/      nav injection, playback boundary
  ui/           shell, panels, cards, styles
  extension/    content-script entry point, manifest.json
tests/          pure-logic tests (node:test)
docs/           product + architecture documents
```

## License

MIT