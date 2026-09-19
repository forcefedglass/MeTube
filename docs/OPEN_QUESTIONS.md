# Open questions

Design questions deliberately left open at bootstrap. Nothing here is
decided; the bootstrap avoids pre-empting any answer.

## Acquisition

1. **What are the first real discovery sources?** Editorial lists and
   community lists are the obvious candidates. Which specific lists, with
   what licensing, at what refresh cadence?
2. **Citation-following:** video descriptions reference channels, papers,
   articles, people. What counts as a citation edge? How are false
   positives (promos, sponsor reads) distinguished from genuine references?
3. **Random walks:** how deliberate should they be? Walks from
   under-explored graph regions vs. uniformly random? How is walk budget
   bounded so it never becomes scraping?
4. **API vs. scraping:** YouTube's public Data API has quotas and does not
   serve "editorial quality" lists. Where does real metadata come from
   without violating terms of service or building fragile scrapers?

## Discovery graph

5. **Reference and entity nodes:** the long-term model wants
   SOURCES/REFERENCES → PEOPLE/COMPANIES/COMMUNITIES. What extraction
   fidelity is achievable without heavyweight NLP? Is a manual-first,
   assist-later approach better at bootstrap scale?
6. **Narrative clustering:** who or what assigns narrative clusters at
   scale? Manual curation per topic area? Community proposals with
   moderation? How is cluster drift handled as narratives evolve?
7. **Scale bands:** channel scale (obscure→mega) needs a definition and a
   data source. Subscriber counts are one option; is there a better proxy?

## Ranking and feed

8. **Weight tuning:** the eight weights are placeholder values. What
   evidence would justify changing them? Should the user see and adjust
   weights directly?
9. **Feed autopsy:** what exactly should it show — distribution vs. the
   diversity goals (source, narrative, topic, familiarity, temporal,
   scale, perspective, commercial)? Which deviations warrant surfacing?
10. **Familiarity:** bootstrap approximates it via explicit feedback only.
    Is that the durable definition, or should familiarity live in the
    graph (e.g., degrees from frequently-seen nodes)?
11. **"More like this":** what does it mean without inferred preference?
    More from the same discovery source? Same topic but different
    narrative cluster? Needs a crisp semantic before implementation.

## Isolation

12. **Storage origin:** content-script IndexedDB lives on youtube.com.
    Should state move to `chrome.storage` (extension origin) for stronger
    isolation guarantees? What breaks in the in-memory fallback?
13. **Playback isolation limits:** the nocookie embed is session isolation,
    not anonymity (see PRIVACY_AND_ISOLATION.md). Is that acceptable as
    the durable boundary, or should playback options (e.g., proxying) be
    explored despite complexity?
14. **Firefox:** MV3 content scripts are broadly compatible. What
    manifest adjustments and testing does Firefox need, and is
    youtube-nocookie embed behavior identical?

## Product

15. **Feed placement:** overlay vs. inline replacement vs. separate
    extension page. Overlay was chosen for bootstrap simplicity; is that
    right long-term?
16. **Onboarding:** how does a user declare initial interests without
    importing their YouTube profile (which would violate the thesis)?
17. **Multi-profile:** should MeTube support multiple exploration moods
    (e.g., "deep dive" vs. "survey") as separate profiles over the same
    graph?

## Classification (added Phase 3)

18. **Classifier honesty vs. usefulness:** the Phase 3 lexicons are
    deliberately conservative (UNKNOWN beats invented certainty). At what
    point does an UNKNOWN rate so high that the information map stops
    being useful, and what evidenced signals (not guesses) could raise
    classification coverage — e.g., channel-about pages as source-type
    evidence?
19. **Narrative cluster assignment at scale:** the classifier only
    passes through provider-carried clusters (fixtures today). Who or what
    assigns clusters to real candidates? Manual curation, user override
    first, community definition lists? How does the catalog grow beyond
    fixtures?
20. **Temporal position evidence:** text framing is the only current
    evidence. Should other establishable evidence count (e.g., explicit
    event dates in descriptions), and what would let a *pre-event* claim
    be verified after the fact rather than trusted?
21. **Coverage map visualization:** Phase 3 ships counts as plain lists.
    What visualization (if any) communicates representation without
    implying judgment — and how are UNKNOWN shares best shown?
22. **Assumption effects:** Viewpoint assumptions are display-only
    premises today. Should they ever influence anything (e.g., a
    reminder banner when pool coverage contradicts a stated premise), and
    if so, how is that kept explicit rather than silent scoring?
23. **Override discovery:** overrides are per-video and per-dimension.
    Should bulk tools exist (e.g., override a channel's source type), and
    would that undermine per-video evidence discipline?
## Composer (added Phase 4)

24. **Exploration-seed acquisition:** "Explore from here" records the
    request (region key + label) but does not yet drive acquisition.
    Should the next run merge the region label into the Viewpoint's seed
    concepts temporarily (one generation) or create a derived Viewpoint
    so the exploration stays inspectable and reversible?
25. **Budget rule UX:** exposure-budget rules are edited through prompt
    dialogs like every other Viewpoint field. Does a per-rule editor with
    inline satisfaction previews (e.g., "this pool can satisfy 4 of 6
    rules") change how users set budgets — and does that preview risk
    nudging users toward "gameable" budgets?
26. **Familiarity signals for floors:** `minUnfamiliarChannelShare`
    qualifies candidates by MeTube-only familiarity (pool sightings +
    explicit feedback). Should channel subscriptions ever count as a
    familiarity signal (they are user-declared, not behavior-inferred),
    given the isolation thesis — and would counting them require reading
    YouTube state that MeTube deliberately never reads?
