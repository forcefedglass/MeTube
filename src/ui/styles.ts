/**
 * Isolated UI styles for the MeTube feed overlay. Scoped via metube-*
 * class names; no global selectors that could collide with YouTube's CSS.
 */

export const FEED_STYLES = `
.metube-hidden { display: none; }
.metube-visible {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: #101418;
  color: #e8eaed;
  overflow-y: auto;
  padding: 24px;
  font-family: system-ui, -apple-system, sans-serif;
}
#metube-nav-entry {
  display: block;
  padding: 8px 12px;
  margin: 4px 0;
  color: #e8eaed;
  text-decoration: none;
  font: 500 14px/1.2 system-ui, sans-serif;
  border-radius: 10px;
}
#metube-nav-entry:hover { background: #272727; }
.metube-feed-list {
  display: grid;
  gap: 16px;
  max-width: 680px;
  margin: 0 auto;
}
.metube-card {
  background: #1c1f24;
  border: 1px solid #2a2f36;
  border-radius: 12px;
  padding: 16px;
}
.metube-card h3 { margin: 0 0 4px; font-size: 16px; }
.metube-card-channel { color: #9aa0a6; font-size: 13px; }
.metube-card-reason { color: #8ab4f8; font-size: 13px; margin: 8px 0 2px; }
.metube-card-source { color: #9aa0a6; font-size: 12px; margin: 0 0 8px; }
.metube-component-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.metube-component-table th, .metube-component-table td {
  text-align: left; padding: 3px 8px 3px 0;
}
.metube-component-table th { color: #9aa0a6; font-weight: 500; }
.metube-card-player { margin-top: 10px; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; overflow: hidden; }
.metube-card-player iframe { width: 100%; height: 100%; }
.metube-card-playback-note { color: #9aa0a6; font-size: 12px; padding: 8px; margin: 0; }
.metube-card-feedback { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.metube-card-feedback button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.metube-card-feedback button:hover { background: #3a4048; }
`;