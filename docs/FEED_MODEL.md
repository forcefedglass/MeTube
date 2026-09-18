# Feed model

## The feed

The MeTube feed is a **ranked slice of the discovery graph**, assembled per
view and persisted as an immutable `FeedSnapshot`. Assembly:

1. Fetch candidates from providers (over-fetch: 3× the target size).
2. Drop muted channels entirely (muting is exclusion, not down-ranking).
3. Score every remaining candidate with the ranking engine.
4. Take the top slice (target size: 8 at bootstrap).
5. Persist the snapshot; the snapshot is the audit record.

## The ranking engine

Additive and explainable. Every candidate's score is:

```
score = relevance
      + source_novelty
      + topic_novelty
      + narrative_novelty
      + temporal_diversity
      + controlled_exploration
      − repetition
      − source_concentration
```

(with each term weighted; see `src/ranking/components/weights.ts`).

### Components (bootstrap implementations)

| Component | Weight | Meaning (bootstrap fidelity) |
|---|---|---|
| `relevance` | 1.0 | Overlap between the candidate's topics and *explicitly declared* interests. Inferred preference is out of scope by design. |
| `sourceNovelty` | 0.7 | 1 if the discovery source has not surfaced this material to the user before, else 0. |
| `topicNovelty` | 0.7 | 1 if the candidate's topics are absent from the user's explicit history, else 0. |
| `narrativeNovelty` | 0.6 | Fraction of the candidate's narrative clusters not yet seen. |
| `temporalDiversity` | 0.4 | Distance of publication date from the pool mean (in ~30-day units, capped at 1). Rewards temporal spread. |
| `controlledExploration` | 0.15 | Constant bonus every candidate receives. Guarantees out-of-history candidates are never fully starved. |
| `repetition` | −0.6 (applied as negative) | −1 if the user already gave explicit watched/skipped feedback on this exact video, scaled. |
| `sourceConcentration` | −0.5 (applied as negative) | Penalty ramping from 0 at ≤10% pool share to −1 at ≥50% share for the candidate's channel. |

These are deliberately simple, inspectable placeholders. The contract that
must survive any future rework: **every component is named, every value is
recorded, every contribution is visible on the card.**

## "Why this appeared"

Every card carries a reason line derived from its strongest positive
weighted components. A `<details>` block exposes the full component table:
value and weighted contribution for all eight components, every card, every
time.

## Feed autopsy

A view that explains the shape of the whole feed, not just single items:
which sources, topics, narrative clusters, scale bands, and eras are
over/under-represented. **Status: not yet implemented.** The data required
(component values per candidate, discovery provenance) is already recorded
in each snapshot, so the autopsy is a rendering task, not a pipeline change.

## Feedback

Explicit only. The five feedback kinds — `watched`, `skipped`, `saved`,
`not-interested`, `more-like-this` — are recorded with a timestamp and
become part of the user profile. Clicks and watch time are **not signals**
and are never recorded. Muting a channel is exclusion (removed from
assembly), not down-ranking, and is always reversible.

## Weights

Weights live in `DEFAULT_WEIGHTS` (`src/ranking/components/weights.ts`) and
are passed explicitly through `RankContext`. Nothing hides them. Adjusting
weights must not require touching any component implementation.