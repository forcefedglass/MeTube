# Product

## Thesis

MeTube is an independent discovery and recommendation layer for YouTube.

People use YouTube for two different things: (1) consuming what they already
like, and (2) finding what they don't yet know. YouTube's recommendation
system is optimized for (1) — it predicts the next thing you'll click. MeTube
exists for (2). It helps a person explore YouTube **without contaminating
their normal YouTube recommendation profile**, and without being pulled back
toward the familiar.

> Don't predict what I want to believe. Help me see what I haven't seen.

## What MeTube is not

- Not an ad blocker.
- Not a UI skin for YouTube.
- Not a political-balance tool. MeTube deliberately does not classify
  content along political axes, does not measure "both-sides-ness", and does
  not optimize for ideological coverage.
- Not a re-ranker of YouTube's Home feed. MeTube never consumes YouTube's
  own recommendations as input.

## Users

People who (a) watch a lot of YouTube, (b) feel their recommendations have
collapsed into a narrow groove, and (c) want to explore without polluting
the profile that their everyday viewing depends on.

## Core product loop

1. **Collect candidates from independent sources.** Editorial lists,
   community-vetted lists, citation-following from video descriptions, search,
   and deliberate random walks. Never YouTube's own recommendation output.
2. **Analyze metadata**: topics, sources, scale, narrative structure.
   Narrative clusters describe *how a story is told* and *what it takes for
   granted* — never who is right.
3. **Build the discovery graph** (see `DISCOVERY_MODEL.md`).
4. **Rank with the explainable engine** (see `FEED_MODEL.md`). Every
   candidate's score decomposes into named components, always visible.
5. **Present the MeTube feed**, with "why this appeared" on every card and a
   feed autopsy view.
6. **Collect explicit feedback only.** Clicks and watch time are
   deliberately not signals. The user says what they think; MeTube does not
   guess.
7. **Play in isolation** (see `PRIVACY_AND_ISOLATION.md`).

## Diversity goals (ranked priorities)

The feed should be diverse along these axes, in rough priority order:

1. **Source** — not everything from one channel or one discovery source.
2. **Narrative** — multiple framings of the same subject.
3. **Topic** — beyond the topics the user already watches.
4. **Familiarity** — mostly unfamiliar material; familiar material mainly
   as anchor points.
5. **Temporal** — older material, not just recent uploads.
6. **Scale** — small and obscure channels alongside larger ones.
7. **Perspective** — different vantage points on the same subject.
8. **Commercial/source-relationship** — awareness of who pays whom.

## Non-goals

- Inferring preference from behavior.
- "Balance" as ideological both-sides-ism.
- Consuming YouTube recommendations.
- Any backend service at bootstrap.

## Success looks like

A user can open MeTube, see material they would never have found via
YouTube's own system, understand exactly why each item appeared, give
explicit feedback that visibly changes the next feed, and trust that none of
this leaked into their normal YouTube session.