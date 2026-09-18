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

Bootstrap ships one provider: `FixtureCandidateProvider` over synthetic
fixtures. Real providers (editorial, community, citation-follow, random
walk) implement the same interface; nothing downstream changes when they
land.

## Familiarity

Familiarity is a property of the *user's graph*, not of the video. A video
is unfamiliar if its topics, narrative clusters, channels, and sources are
under-represented in what the user has seen. At bootstrap, familiarity is
approximated by explicit-feedback history only (see `FEED_MODEL.md`).