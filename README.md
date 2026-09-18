# MeTube

An independent discovery and recommendation layer for YouTube.

MeTube is **not** an ad blocker, a UI skin, a political-balance tool, or a
re-ranker of YouTube's Home feed. It is a separate discovery pipeline that
surfaces videos from independent sources, builds its own discovery graph,
and plays them in an isolated session.

**Core principle:** *Don't predict what I want to believe. Help me see what
I haven't seen.*

## Status

Bootstrap (v0.1.0). The pipeline runs end-to-end on local fixture data.
No network calls, no backend, no scraping. See `METUBE_CONTEXT.md` for
durable project state.

## What it does today

- Injects a "MeTube" entry into YouTube's side navigation.
- Assembles a feed from a local fixture candidate pool (10 synthetic videos).
- Scores every candidate with 8 named, explainable components.
- Shows, on every card: title, channel, duration, "why this appeared" reason,
  all 8 ranking components with values and weighted contributions, and the
  discovery source that surfaced it.
- Accepts explicit feedback only (watched / skipped / saved / not
  interested / more like this) plus channel muting.
- Stores everything locally (IndexedDB, with in-memory fallback).
- Disables playback for fixture videos; real candidates would play in a
  sandboxed `youtube-nocookie.com` embed with cookies blocked.

## Install (development, Chromium)

```sh
npm install
npm run build     # bundles dist/content.js + dist/manifest.json
```

Then in Chromium: `chrome://extensions` → Developer mode → Load unpacked →
select `dist/`. Navigate to youtube.com; a "MeTube" entry appears in the
guide. Click it to open the feed.

## Development

```sh
npm run typecheck  # tsc --noEmit
npm test           # compile + node --test
npm run build      # build extension into dist/
```

Firefox: not yet tested; MV3 content scripts are broadly compatible but
manifest keys may need adjustment (`browser_specific_settings`).

## Layout

```
src/
  model/        provisional domain types + catalog
  discovery/    candidate acquisition, fixture pool, feed assembly
  ranking/      named scoring components + engine
  storage/      IndexedDB wrapper with in-memory fallback
  youtube/      nav injection, playback boundary
  ui/           feed card rendering, styles
  extension/    content-script entry point, manifest.json
tests/          pure-logic tests (node:test)
docs/           product + architecture documents
```

## License

MIT