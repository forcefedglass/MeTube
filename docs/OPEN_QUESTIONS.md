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