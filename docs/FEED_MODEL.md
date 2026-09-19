# Feed model

## The feed

The MeTube feed is a **ranked slice of the discovery graph**, assembled per
view and persisted as an immutable `FeedSnapshot`. Assembly:

1. Acquire candidates (real acquisition via the candidate pool, or fixtures
   in development/test mode; over-fetch: 3× the target size).
2. Drop muted channels entirely (muting is exclusion, not down-ranking).
3. Score every remaining candidate with the ranking engine.
4. Take the top slice (target size: 8 at bootstrap).
5. Persist the snapshot; the snapshot is the audit record.

Every snapshot records `viewpoint: {id, title} | null` — which Viewpoint
generated it, or that it is unlensed.

## Viewstreams

A **Viewstream** is a feed assembled through an active Viewpoint. Two
generation paths share one assembly pipeline:

- `generateViewstream` (provider-backed): asks the provider directly —
  the fixture path and the Phase 1 default.
- `assembleViewstream` (pool-backed): the Phase 2 extension path. The
  caller acquires through `acquireForViewpoint` (TTL-bounded, persistent,
  deduplicated) and passes the adapted candidates in. Repeated generation
  serves from the pool cache; no refetch.

The lens applies before ranking:

1. **Hard filters** (deterministic, `src/viewpoints/interpret.ts`):
   positive topic constraints (OR), negative topic constraints (NOT),
   discovery source constraints, temporal window, and — for
   `strictly-unfamiliar` targets — explicit-feedback familiarity.
   Candidates whose publication date is unknown (the source gave only a
   relative date) pass when no temporal window is set and are dropped when
   one is — the date cannot be verified, and inventing it is never an
   option.
2. **Channel muting** — unchanged: exclusion, not down-ranking.
3. **Ranking with the Viewpoint's derived weights** — `weightOverrides`
   replace per-component defaults; everything else is the same engine.
   Unknown publication dates score 0 on temporal diversity and are
   excluded from the pool mean.
4. **Post-selection limits** (deterministic, greedy in rank order):
   `repetitionLimit` caps items per channel; `sourceConcentrationLimit`
   caps one channel's share of the feed.
5. **Composition under exposure budgets** (Phase 4, deterministic,
   `src/viewpoints/composer.ts`): when the Viewpoint carries an
   `exposureBudget`, selection runs through the composer instead of the
   greedy slice. Budget rules are ceilings and floors on shares of the
   FINAL feed:
   - ceilings: max share from one channel / one narrative cluster / one
     topic;
   - floors: min share from unfamiliar channels, alternate source types,
     historical material, exploration wildcards;
   - cooldowns: repeated-channel / repeated-narrative gaps in generations,
     computed per-Viewpoint from persisted generation history;
   - recorded-but-not-evaluable rules (distinct languages, regions,
     channel-scale bands) report `not-applicable` — never satisfied by
     guessing.
   Selection order: reservation passes for floors → main walk gated by
   ceilings + cooldowns → relief pass (soft rules never empty the feed
   while hard-filter-passing candidates exist; the bypass is reported) →
   trim pass enforcing ceilings against the actual feed size. Unknown
   classifications never count toward diversity floors; degradation is
   always reported per rule with an explanation ("Why this Viewstream
   looks like this" panel). Diversity is never Manufactured by
   misclassifying candidates.
6. **Snapshot** embeds the Viewpoint ref. The feed header names the Active
   Viewpoint and restates its constraints.

## Exposure budgets (Phase 4)

All rules are optional; `{}` means no budget and the legacy assembly path
applies. Every rule is visible and editable in the Viewpoint manager
(never inferred, never hidden behind ML) and reported per rule on the
feed. See `src/model/exposure.ts` for the full rule set.

## Explicit feedback semantics (Phase 4)

Twelve kinds with declared semantics (`src/model/feedback.ts`):

- **Exposure facts** (global): watched, skipped, saved. "I watched this"
  is never "I want more of this."
- **Preference-positive** (Viewpoint-scoped): good-recommendation,
  more-like-this, more-from-source, more-topic, more-narrative-region.
- **Preference-negative** (Viewpoint-scoped): less-from-source, less-topic,
  not-interested.
- **Representation notes** (Viewpoint-scoped): interesting-no-extrapolate,
  cluster-overrepresented.

The exploration firewall (`src/viewpoints/firewall.ts`) lenses what each
Viewpoint trains on: global exposure facts plus that Viewpoint's own
scoped signals. Feedback inside one Viewpoint never trains unrelated
Viewpoints; normal YouTube state is never mutated.

## Perspective pairing (Phase 4)

Where the evidence supports it, candidates addressing substantially the
same subject (shared topics) from materially different positions (disjoint
evidenced narrative clusters, or differing evidenced source types) are
offered as "Compare treatments". Pairings are evidence-gated: unknown
classifications never form a basis. There is no forced two-sided symmetry —
one, two, three, or five meaningful clusters are all honest outcomes, and
opposition is never invented for balance.

## Coverage / blind spots (Phase 4)

The blind-spot view (`src/viewpoints/blindspots.ts`) describes regions
where the pool offers material the composed feed underrepresents, across
topic / source type / narrative cluster / temporal position dimensions.
Spots are descriptive facts with counts and samples — never judgments
about which perspectives are correct or worth adopting. "Explore from
here" is user-initiated.

Interpretation is pure: same config + candidates + profile → same result.
`explorationPercent`, `unfamiliarityTarget`, `narrativeDiversityTarget`,
`temporal` (mode), `channelSizePreferences`, `locale`, `sourceTypePreferences`
are recorded and inspectable but do not yet change assembly — they bind to
real acquisition and ranking signals in later phases. Since Phase 2,
`seedTopics`, `seedConcepts`, `seedChannels`, and `seedPlaylists` drive
real acquisition (search queries, channel uploads, playlists) before
assembly. The feed says what it did; nothing is inferred.

Since Phase 3, candidates are **classified and enriched before assembly**
(`src/classification/enrich.ts`): the information map supplies
`topicIds` and `narrativeClusterIds` on real candidates, so the hard
filters above finally operate on real classification output instead of
empty arrays. Every classification carries value, confidence,
origin/method, and evidence; user overrides are applied at enrichment
time and always win. Where the map says UNKNOWN, the candidate keeps
empty arrays — filters treat UNKNOWN as UNKNOWN, never as a guess. See
`docs/CLASSIFICATION.md`.

A Viewpoint may also carry user-authored **assumptions** — temporary
premises like "My normal information environment generally favors X."
Assumptions are shown verbatim on the feed and never influence assembly;
they document what the user premised, nothing more.

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