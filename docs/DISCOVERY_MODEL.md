# Discovery model

## The discovery graph

The long-term shape of MeTube's knowledge (all provisional, all local):

```
VIDEO ──(published by)──▶ CHANNEL
VIDEO ──(covers)─────────▶ TOPICS
VIDEO ──(tells)───────────▶ NARRATIVE CLUSTERS
VIDEO ──(surfaced by)─────▶ DISCOVERY SOURCES
VIDEO ──(references)──────▶ SOURCES/REFERENCES ──▶ PEOPLE / COMPANIES / COMMUNITIES
NARRATIVE CLUSTERS ───────▶ RELATED MATERIAL
```

### Node kinds

- **VIDEO** — a candidate. Enters the graph only via discovery sources.
- **CHANNEL** — who publishes. Carries a *scale band*: obscure / small /
  mid / large / mega. Scale is descriptive, never a quality judgment.
- **TOPICS** — what the material is about. Multiple topics per video.
- **NARRATIVE CLUSTERS** — how a story is told: what it takes for granted,
  what it treats as central, what it never mentions. A narrative cluster is
  *not* a position and *not* a side. Two videos on the same topic can sit
  in different narrative clusters without either being "the balanced one."
  Political classification is explicitly out of scope.
- **DISCOVERY SOURCES** — how material entered MeTube: editorial list,
  community list, citation-follow, search, or deliberate random walk.
  Every candidate records its primary source and any others that surfaced it.
- **SOURCES / REFERENCES → PEOPLE / COMPANIES / COMMUNITIES** — who is
  cited, who funded whom, who works where. Future node kinds; not yet in
  the bootstrap model.

### Edges at bootstrap fidelity

The current `src/model/types.ts` implements a flat slice of the graph:
candidates carry `topicIds`, `narrativeClusterIds`, `discoveredVia`, and
`alsoSeenVia`; channels carry `scaleBand`. The catalog resolves ids to
definitions and `checkIntegrity` verifies that every id referenced by a
candidate resolves. Deeper edges (references, people, communities) are
open design work — see `OPEN_QUESTIONS.md`.

## Candidate acquisition

`CandidateProvider` (in `src/discovery/provider.ts`) is the only door into
the graph. Providers:

- never consume YouTube's own recommendations,
- surface material without scoring it (scoring belongs to the ranking
  engine alone),
- are passive and side-effect free.

Phase 2 ships two providers:

- **`YouTubeWebProvider`** (`src/discovery/youtube-web.ts`) — real
  acquisition. Given a discovery plan it fetches YouTube search results
  pages, channel uploads pages, and playlist pages from the page's own
  origin (same-origin `fetch` from the youtube.com content script, no extra
  permissions, `credentials: 'omit'`), parses the embedded `ytInitialData`
  JSON, and emits candidates with page-metadata confidence. Every step is
  capped and reported; every failure is recorded, never swallowed.
- **`FixtureCandidateProvider`** — synthetic fixtures, the entire basis of
  the test suite. In the extension it runs only when the `use-fixture-provider`
  KV flag is explicitly set (development/test mode); real acquisition is the
  default user experience.

### Permitted acquisition starts

A Viewpoint's discovery plan is derived from its own configuration, never
from YouTube Home:

1. **Seed concepts** — user-authored free text → search queries.
2. **Seed topics** — topic ids resolved to labels the user controls;
   unresolvable ids produce no step (never a guessed query).
3. **Explicit channels** — `@handle`, bare handle, handle URL, canonical
   `UC` id, or `/channel/` URL. `@handle` seeds resolve through the channel
   homepage (one fetch reading
   `metadata.channelMetadataRenderer.externalId`), then fetch
   `/channel/{UC id}/videos` — the uploads page anonymous visitors get.
   Exactly two fetches per handle step, one per canonical-id step.
4. **Explicit playlists** — playlist id or URL → the playlist page.
5. **Explicit videos** — accepted by the model layer; page-fetch
   acquisition has no path for them yet (reported as empty, never guessed).

Plans are bounded: at most 6 steps, at most 12 candidates harvested per
step. Duplicate steps (same method + normalized target) collapse before
fetching.

### Provenance

Every candidate records where it came from: provider, acquisition method,
seed, discovery timestamp, originating Viewpoint. Re-sighting the same video
through a different path appends provenance; it never overwrites the first
discovery. The candidate pool is inspectable: counts by method and
provider, discovering Viewpoints, cache age, duplicate suppression, and
failed/missing metadata (see `src/ui/pool-inspector.ts`).

### Unknown metadata is never fabricated

Search and channel pages expose relative publication dates ("2 years ago",
"5mo ago"). These are recorded as `null` — never converted to guessed
absolute dates. At the ranking boundary, unknown dates become the
`UNKNOWN_DATE` sentinel: they pass date filters only when no window is set,
and score 0 temporal diversity. A window that is set but unparseable is
treated as no window, never as a silent drop-everything filter. Missing
channels, titles, and durations become explicit placeholders
(`unknown-channel`, `(title unavailable)`), never invented values. See
`PRIVACY_AND_ISOLATION.md` for what acquisition fetches and what it does
not.

### The candidate pool

The pool (`src/discovery/pool.ts`) is the persistent cache: repeated
Viewstream generation serves from it and does not refetch. Per-Viewpoint
runs are TTL-bounded (6 hours); a forced refresh bypasses the TTL. The pool
caps at 600 candidates, pruning oldest-first.

## Familiarity

Familiarity is a property of the *user's graph*, not of the video. A video
is unfamiliar if its topics, narrative clusters, channels, and sources are
under-represented in what the user has seen. At bootstrap, familiarity is
approximated by explicit-feedback history only (see `FEED_MODEL.md`).