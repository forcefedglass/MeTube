# Classification model — the information map

Phase 3 turns MeTube's raw candidate pool into an inspectable
**information map**: how videos differ, represented across six dimensions,
without reducing everything to left/right ideology.

## The six dimensions

| Dimension | Question | Values |
|---|---|---|
| Topics | What is this materially about? | fixture topic ids; UNKNOWN |
| Source type | What kind of source produced it? | official, publication, independent-creator, enthusiast-community, technical-analyst, academic-expert, primary-source, promotional-sponsored (only where evidenced), unknown |
| Narrative cluster | Which claim/framing family does it belong to? | cluster ids resolvable in the catalog; UNKNOWN |
| Temporal position | Where does it sit relative to its subject? | contemporary, historical, pre-event, post-event, retrospective, unknown |
| Channel familiarity | How often has this source appeared *within MeTube*? | never-seen, seen-once, seen-few, seen-often, familiar, unknown |
| Provenance | How do video/channel/topic/source actually relate? | evidenced edges only |

## Every classification is a ClassifiedValue

No dimension ever returns a bare label. Every machine-derived value
carries its full audit trail:

```ts
{
  value: 'publication',            // the classified value ('unknown' is real)
  confidence: 0.6,                // [0,1]; user overrides are 1
  origin: 'classifier',           // 'classifier' | 'provider' | 'user-override'
  method: 'source-type-lexicon',  // which rule produced it
  evidence: 'Channel title contains "Herald".',  // cited, not invented
}
```

This is what the candidate inspector surfaces (click any feed card).

## UNKNOWN beats invented certainty

- **Narrative clusters are never inferred from keywords.** A cluster id is
  only assigned when the provider carried it AND it resolves in the
  catalog. There is deliberately no lexical fallback: inventing a
  "framing family" from words would fabricate a relationship.
- **Temporal position never comes from publication age.** A video's
  position is its relation to its *subject*; only explicit framing in the
  title/description ("retrospective", "aftermath", "archival", …)
  evidences it. A week-old video can be a retrospective; a decade-old one
  was contemporary with its events.
- **Sponsorship is only classified where disclosed** — "sponsored by",
  "#ad", "paid promotion" in the text. Nothing else is "promotional".
- Provider-carried topic/cluster ids pass through with origin `provider`
  (confidence 0.9); lexical topic matches are one-per-candidate at 0.5.

## No political scoring

There is no ideology dimension, no party dimension, no left/right
spectrum anywhere in the classification model. Political labels appear
only in two places: (a) user-authored Viewpoint criteria, verbatim, and
(b) descriptions of explicitly public organizations/arguments — and even
then as *source type* (production and standing), never as a scored
identity. Nothing about viewing behavior is used to infer politics.

## User overrides

The user can override any dimension of any video (including setting it
to `unknown`). Overrides:

- always win over machine classification (confidence 1, origin
  `user-override`, note shown verbatim),
- live under their own KV key `classification-overrides`, **not** in the
  candidate pool — so they survive pool regeneration and MAX_POOL_SIZE
  pruning by design (applied at read time in enrichment, never written
  into pool entries),
- are keyed by videoId + dimension; one opinion per dimension.

## Channel familiarity

Familiarity counts only what MeTube itself has seen:

- pool sightings: distinct candidates per channel in the current pool,
- explicit feedback: watched / saved / more-like-this on any video of
  that channel.

Never watch history, never clicks, never watch time, never YouTube's
own signals.

## Provenance edges

The provenance graph records only evidenced relationships:
`surfaced-by` (video → discovery source), `published-by` (video →
channel), `discusses-topic`, `belongs-to-cluster`, `found-through`
(acquisition path), `discovered-by-viewpoint`, `feedback-on`, and the
Viewpoint seed edges. Every edge carries cited evidence. If the
underlying data does not evidence a relationship, the edge does not
exist. Do NOT fabricate relationships is a frozen rule.

## Coverage map

`computeCoverageMap` quantifies representation across the pool: counts
per topic, source type, narrative cluster, temporal position, age band
(fixed taxonomy, zero counts included), channel familiarity band, and
channel. It describes the pool; it never judges or scores it. Phase 3
delivers the data model plus a plain list rendering — the polished
visualization is deliberately out of scope.

## Viewpoint assumptions

A Viewpoint may carry user-authored `assumptions`: temporary premises
like "My normal information environment generally favors X." They are
shown verbatim on the feed, editable through the Viewpoint editor, and
never influence filtering, ranking, or classification. Assumptions
belong to the Viewpoint, never to a user identity.

## Layer placement

Classification is a decision/pure layer: `src/model/classification.ts`
(types), `src/classification/` (classifier, overrides, enrichment), and
`src/discovery/coverage.ts` (coverage). No DOM in the model/classify
layers; UI rendering lives in `src/ui/candidate-inspector.ts` and
`src/ui/coverage-map.ts`. No new network surfaces: classification runs
entirely on already-acquired candidate data.