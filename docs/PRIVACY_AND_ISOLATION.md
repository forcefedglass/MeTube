# Privacy and isolation

## What stays on the machine

Everything. MeTube keeps all state in the user's browser:

- feedback history and muted channels — IndexedDB on the youtube.com origin,
- feed snapshots — IndexedDB, same origin,
- fixture data — bundled with the extension.

No backend. No accounts. No network calls. `src/storage/local-store.ts`
is the only persistence layer; it exposes IndexedDB with an in-memory
fallback for non-DOM contexts. Nothing in the codebase constructs a
network request except the embedded player described below.

## Isolation from the user's YouTube session

MeTube's promise: exploring via MeTube must not contaminate the user's
normal YouTube recommendation profile.

### What MeTube guarantees

- MeTube never reads YouTube's own recommendations, watch history, or
  subscriptions. The content script injects a nav entry and renders an
  overlay; it does not touch page data.
- Feedback is stored only in MeTube's own IndexedDB database. It never
  touches YouTube cookies, localStorage, or any Google service.
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
- **The extension itself loads on youtube.com pages.** YouTube could
  observe the extension's presence in principle. Content scripts run in an
  isolated world, but this is browser-enforced, not cryptographically
  guaranteed.
- **No anonymity against traffic analysis** is claimed or attempted.

### Bootstrap simplifications (known limits)

- Storage is keyed to the youtube.com page origin (content scripts share
  the page's IndexedDB). A future move to a dedicated extension origin
  (via `chrome.storage` or an extension page) would strengthen isolation;
  not done at bootstrap because fixtures carry nothing sensitive.
- Fixture videos are never playable; the "isolated playback" path for real
  candidates is implemented and unit-tested but exercised only via
  constants, since no real candidates exist yet.

## Telemetry

None. No analytics, no crash reporting, no update pings beyond the
extension store's own mechanism (this build is unpacked; even that does
not apply).