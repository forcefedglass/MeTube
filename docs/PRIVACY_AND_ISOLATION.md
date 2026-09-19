# Privacy and isolation

## What stays on the machine

Everything. MeTube keeps all state in the user's browser:

- feedback history and muted channels — IndexedDB on the youtube.com origin,
- feed snapshots and the candidate pool — IndexedDB, same origin,
- classification results and user classification overrides — IndexedDB,
  same origin, under their own key (`classification-overrides`),
- Viewpoint assumptions (user-authored premises) — stored with the
  Viewpoint in MeTube's own storage,
- exposure budgets, generation history for cooldowns, and per-Viewpoint
  feedback (exploration-firewall scope) — IndexedDB, same origin, under
  their own keys,
- fixture data — bundled with the extension.

No backend. No accounts. The only network activity is the acquisition
fetches and embedded playback described below. `src/storage/local-store.ts`
is the only persistence layer; it exposes IndexedDB with an in-memory
fallback for non-DOM contexts. Nothing else in the codebase constructs a
network request.

## Acquisition fetches (Phase 2)

Real candidate acquisition fetches YouTube search, channel-uploads, and
playlist pages. Facts:

- Fetches are same-origin requests from the youtube.com content script
  (the extension declares no host permissions; it rides the page's own
  origin) with `credentials: 'omit'`, so no cookies are sent.
- YouTube sees each request (IP, TLS fingerprint, query terms). This is the
  same exposure as the user typing the same search into YouTube directly;
  it is not anonymized and is not claimed to be.
- Fetches are bounded by the plan: at most 6 steps per Viewpoint run, at
  most 12 candidates harvested per step, and per-Viewpoint refresh is
  TTL-capped (6 hours) with results cached locally — repeated Viewstream
  generation does not refetch. There is no crawling, no page following,
  no recommendation traversal.
- Only seed-driven surfaces are fetched: searches from the user's own
  concepts/topics, explicit channel uploads, explicit playlists. YouTube
  Home recommendations are never consumed at any stage.
- Explicit videos cannot be fetched this way yet; the plan reports the gap
  instead of guessing a page.

## Isolation from the user's YouTube session

MeTube's promise: exploring via MeTube must not contaminate the user's
normal YouTube recommendation profile.

### What MeTube guarantees

- MeTube never reads YouTube's own recommendations, watch history, or
  subscriptions. The content script injects a nav entry and renders an
  overlay; page data is read only from the acquisition surfaces above.
- Feedback and the candidate pool are stored only in MeTube's own IndexedDB
  database. Nothing touches YouTube cookies or localStorage.
- Acquisition fetches send no credentials (`credentials: 'omit'`).
- Playback of real videos goes through `youtube-nocookie.com` embeds in a
  sandboxed iframe (`sandbox="allow-scripts allow-same-origin
  allow-presentation"`, `referrerpolicy="no-referrer"`): no cookie
  pass-through from the user's session, referrers suppressed. This is
  *session isolation* for playback.

### What MeTube cannot guarantee (stated plainly)

- **Playback requests are visible to YouTube.** Loading any real video
  contacts YouTube servers. The embed blocks cookies and referrers, but
  YouTube sees the request (IP, TLS fingerprint, video id). The isolation
  is *session* isolation, not anonymity. The boundary module
  (`src/youtube/playback.ts`) states this and is the only place playback
  decisions are made.
- **Acquisition requests are visible to YouTube.** See above: search terms
  and fetched pages are observable by the server. No anonymity is claimed.
- **The extension itself loads on youtube.com pages.** YouTube could
  observe the extension's presence in principle. Content scripts run in an
  isolated world, but this is browser-enforced, not cryptographically
  guaranteed.
- **No anonymity against traffic analysis** is claimed or attempted.
- **Playback isolation is session isolation, not perfection.** It is not
  claimed to isolate playback from every possible signal (IP, fingerprint,
  timing); only from session cookies and referrers.

### Known limits

- Storage is keyed to the youtube.com page origin (content scripts share
  the page's IndexedDB). A future move to a dedicated extension origin
  (via `chrome.storage` or an extension page) would strengthen isolation.
- Fixture videos are never playable; they run only in development/test mode
  (KV flag `use-fixture-provider`). Real candidates play through the
  isolated embed path above.

## Classification (Phase 3) adds no network surface

The entire information map — topics, source types, narrative clusters,
temporal positions, channel familiarity, provenance edges, coverage maps —
is computed locally from already-acquired candidate data. Classification
issues no fetches, contacts no service, and sends nothing anywhere. In
particular:

- **No political inference.** Nothing in the classifier inspects viewing
  behavior for ideology, party, or political identity. No such dimension
  exists. Political labels appear only when the user authored them into
  a Viewpoint or when describing an explicitly public organization/argument
  — and then as source-type facts, never as scores.
- **Channel familiarity counts only MeTube's own sightings** (pool
  appearances + explicit feedback). It never reads YouTube watch history
  or subscriptions.
- **User overrides stay local** and are never synchronized anywhere.

## The composer (Phase 4) adds no network surface

Exposure budgets, perspective pairing, blind-spot detection, and feedback
semantics are all computed locally from already-acquired candidate data.
The composer issues no fetches and sends nothing anywhere. In particular:

- **The exploration firewall keeps Viewpoints independent.** Feedback
  recorded inside one Viewpoint is scoped to that Viewpoint's training
  lens; it never trains unrelated Viewpoints. Exposure facts ("I watched
  this") are the only global signals, and they are never preference
  signals.
- **Normal YouTube state is never mutated.** MeTube records what the user
  said inside its own storage; it does not touch YouTube's own watch
  history, subscriptions, or recommendation profile.
- **Blind spots are computed, never uploaded.** The coverage view
  describes representation gaps in the local pool; nothing about the
  user's interests leaves the machine.

## Telemetry

None. No analytics, no crash reporting, no update pings beyond the
extension store's own mechanism (this build is unpacked; even that does
not apply).