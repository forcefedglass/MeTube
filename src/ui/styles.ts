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
.metube-viewpoint-banner {
  color: #8ab4f8;
  font-size: 14px;
  margin: 8px 0 2px;
}
.metube-viewpoint-summary {
  color: #9aa0a6;
  font-size: 13px;
  margin: 0 0 8px;
}
.metube-vp-manager { max-width: 680px; margin: 0 auto; }
.metube-vp-manager h3 { margin: 16px 0 8px; }
.metube-vp-active-line { color: #8ab4f8; font-size: 14px; }
.metube-vp-list { list-style: none; padding: 0; display: grid; gap: 12px; }
.metube-vp-row {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 12px; padding: 12px;
}
.metube-vp-title { font-weight: 600; font-size: 15px; }
.metube-vp-summary { color: #9aa0a6; font-size: 13px; margin: 4px 0; }
.metube-vp-desc { color: #9aa0a6; font-size: 12px; margin: 2px 0 8px; }
.metube-vp-controls { display: flex; flex-wrap: wrap; gap: 6px; }
.metube-vp-controls button, .metube-vp-manager > button, .metube-vp-viewlists button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.metube-vp-controls button:hover { background: #3a4048; }
.metube-vp-viewlist {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 12px;
  padding: 12px; margin: 8px 0; display: grid; gap: 4px;
}
.metube-vp-viewlist-title { font-weight: 600; }
.metube-vp-viewlist label { font-size: 13px; display: block; }
#metube-mount > button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
#metube-mount > button:hover { background: #3a4048; }
#metube-floating-toggle {
  position: fixed; left: 12px; bottom: 12px; z-index: 2200;
  background: #1c1f24; color: #8ab4f8; border: 1px solid #3a4048;
  border-radius: 18px; padding: 6px 14px; font-size: 13px; cursor: pointer;
}
#metube-floating-toggle:hover { border-color: #8ab4f8; }
.metube-pool-inspector {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 12px;
  padding: 12px; margin: 12px 0; display: grid; gap: 4px;
}
.metube-pool-inspector h3 { margin: 0 0 4px; font-size: 14px; }
.metube-pool-inspector h4 { margin: 8px 0 2px; font-size: 13px; color: #9aa0a6; }
.metube-pool-facts { list-style: none; margin: 0; padding: 0; font-size: 12px; color: #e8eaed; }
.metube-pool-facts li { padding: 2px 0; }
.metube-pool-facts strong { color: #8ab4f8; font-weight: 600; }
.metube-pool-failures li { color: #f28b82; }
.metube-pool-note { color: #9aa0a6; font-size: 12px; margin: 2px 0; }
.metube-pool-inspector > button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 4px 10px; font-size: 12px; cursor: pointer;
  justify-self: start; margin-top: 8px;
}
.metube-pool-inspector > button:hover { background: #3a4048; }
.metube-card-inspectable { cursor: pointer; }
.metube-card-inspectable:hover { border-color: #8ab4f8; }
.metube-inspector {
  border: 1px solid #3ea6ff55;
  border-radius: 10px;
  padding: 12px;
  margin: 10px 0;
  background: #0f0f0f;
}
.metube-inspector-wrap {
  border: 1px dashed #3ea6ff44;
  border-radius: 10px;
  padding: 12px;
  margin: 10px 0;
}
  background: #14161a; border: 1px solid #8ab4f8; border-radius: 12px;
  padding: 12px; margin: 12px 0; display: grid; gap: 10px;
}
.metube-inspector-header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.metube-inspector-header h3 { margin: 0; font-size: 15px; flex: 1 1 auto; }
.metube-inspector-header button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.metube-inspector-why h4, .metube-inspector-provenance h4,
.metube-inspector-dimension h4 {
  margin: 0; font-size: 12px; color: #8ab4f8; text-transform: uppercase;
  letter-spacing: 0.04em;
}
.metube-inspector-why p, .metube-inspector-provenance p,
.metube-inspector-dimension > p {
  margin: 4px 0 0; font-size: 13px;
}
.metube-inspector-audit { color: #9aa0a6; font-size: 12px; }
.metube-inspector-unknown { color: #fdd663; }
.metube-inspector-dimension {
  border-top: 1px solid #2a2f36; padding-top: 8px; display: grid; gap: 4px;
}
.metube-inspector-override {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 8px;
  padding: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.metube-inspector-override p { margin: 0; font-size: 12px; color: #9aa0a6; flex: 1 1 auto; }
.metube-inspector-override button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 3px 10px; font-size: 12px; cursor: pointer;
}
.metube-assumptions {
  background: #14161a; border: 1px solid #2a2f36; border-radius: 12px;
  padding: 10px 12px; margin: 10px 0;
}
.metube-assumptions h4 {
  margin: 0 0 4px; font-size: 12px; color: #8ab4f8;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.metube-assumptions ul { margin: 0; padding-left: 18px; font-size: 13px; color: #e8eaed; }
.metube-coverage {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 12px;
  padding: 12px; margin: 12px 0; display: grid; gap: 8px;
}
.metube-coverage h3 { margin: 0; font-size: 14px; }
.metube-coverage-intro { margin: 0; font-size: 12px; color: #9aa0a6; }
.metube-coverage-group { border-top: 1px solid #2a2f36; padding-top: 8px; }
.metube-coverage-group h4 { margin: 0 0 4px; font-size: 13px; color: #9aa0a6; }
.metube-coverage-list { list-style: none; margin: 0; padding: 0; font-size: 12px; }
.metube-coverage-list li { padding: 2px 0; }

/* --- Phase 4: exposure budgets, blind spots, pairing, feedback groups --- */
.metube-exposure {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 12px;
  padding: 12px; margin: 12px 0; display: grid; gap: 8px;
}
.metube-exposure h3 { margin: 0; font-size: 14px; }
.metube-exposure-intro { margin: 0; font-size: 12px; color: #9aa0a6; }
.metube-exposure-budget-summary {
  margin: 0; font-size: 12px; color: #8ab4f8; font-family: ui-monospace, monospace;
}
.metube-exposure-rules { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.metube-exposure-rule {
  border: 1px solid #2a2f36; border-radius: 8px; padding: 8px 10px;
  display: grid; gap: 2px; background: #14161a;
}
.metube-exposure-rule-satisfied { border-color: #2f5d3a; }
.metube-exposure-rule-violated { border-color: #6b3a3a; }
.metube-exposure-rule-not-applicable { border-color: #3a3f46; opacity: 0.8; }
.metube-exposure-rule p { margin: 0; font-size: 13px; color: #e8eaed; }
.metube-exposure-status { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.metube-exposure-rule-satisfied .metube-exposure-status { color: #81c995; }
.metube-exposure-rule-violated .metube-exposure-status { color: #f28b82; }
.metube-exposure-rule-not-applicable .metube-exposure-status { color: #9aa0a6; }
.metube-exposure-observed {
  margin: 0; font-size: 12px; color: #9aa0a6;
  font-family: ui-monospace, monospace;
}
.metube-exposure-explanation { margin: 0; font-size: 12px; color: #9aa0a6; }
.metube-exposure-none { margin: 0; font-size: 13px; color: #9aa0a6; }

.metube-blindspots {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 12px;
  padding: 12px; margin: 12px 0; display: grid; gap: 8px;
}
.metube-blindspots h3 { margin: 0; font-size: 14px; }
.metube-blindspots-intro { margin: 0; font-size: 12px; color: #9aa0a6; }
.metube-blindspots-none { margin: 0; font-size: 13px; color: #81c995; }
.metube-blindspot-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.metube-blindspot {
  border: 1px solid #3a4048; border-radius: 8px; padding: 8px 10px;
  display: grid; gap: 4px; background: #14161a;
}
.metube-blindspot-counts {
  margin: 0; font-size: 12px; color: #e8eaed;
  font-family: ui-monospace, monospace;
}
.metube-blindspot-description { margin: 0; font-size: 12px; color: #9aa0a6; }
.metube-blindspot-explore {
  justify-self: start;
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 3px 12px; font-size: 12px; cursor: pointer;
}
.metube-blindspot-explore:hover { border-color: #8ab4f8; }

.metube-card-compare {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 8px;
  padding: 6px 10px; font-size: 12px; color: #8ab4f8; cursor: pointer;
  align-self: flex-start;
}
.metube-card-compare:hover { border-color: #8ab4f8; }
.metube-compare {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 12px;
  padding: 12px; margin: 12px 0; display: grid; gap: 10px;
}
.metube-compare h3 { margin: 0; font-size: 14px; }
.metube-compare-meta { margin: 0; font-size: 12px; color: #9aa0a6; }
.metube-compare-item {
  border: 1px solid #2a2f36; border-radius: 8px; padding: 8px 10px;
  display: grid; gap: 4px; background: #14161a;
}
.metube-compare-item p { margin: 0; font-size: 13px; color: #e8eaed; }
.metube-compare-basis { margin: 0; font-size: 12px; color: #9aa0a6; }
.metube-compare-classification {
  margin: 0; font-size: 11px; color: #9aa0a6;
  font-family: ui-monospace, monospace;
}

.metube-feedback-group {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
}
.metube-feedback-group + .metube-feedback-group { margin-top: 4px; }
.metube-feedback-exposure button,
.metube-feedback-preference button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 14px; padding: 2px 10px; font-size: 11px; cursor: pointer;
}
.metube-feedback-exposure button:hover,
.metube-feedback-preference button:hover { border-color: #8ab4f8; }

/* ---------------------------------------------------------------------------
 * Phase 5 product shell: tabs, quick switcher, active-Viewpoint header,
 * autopsy, time machine, provenance chain, onboarding, portability.
 * ------------------------------------------------------------------------- */
.metube-shell { max-width: 760px; margin: 0 auto; }
.metube-shell-header {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  justify-content: space-between; margin-bottom: 6px;
}
.metube-shell-title { margin: 0; font-size: 20px; }
.metube-shell-close {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 16px; padding: 4px 14px; font-size: 13px; cursor: pointer;
}
.metube-shell-close:hover { border-color: #8ab4f8; }
.metube-active-strip {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  background: #14181d; border: 1px solid #2a2f36; border-radius: 10px;
  padding: 8px 12px; margin-bottom: 12px; font-size: 13px;
}
.metube-active-strip .metube-active-name { color: #8ab4f8; font-weight: 600; }
.metube-active-strip .metube-active-summary { color: #9aa0a6; flex: 1 1 200px; }
.metube-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.metube-tab {
  background: transparent; color: #9aa0a6; border: 1px solid transparent;
  border-radius: 18px; padding: 5px 14px; font-size: 13px; cursor: pointer;
}
.metube-tab:hover { color: #e8eaed; background: #1c2128; }
.metube-tab[data-active="true"] {
  color: #8ab4f8; border-color: #8ab4f8; background: #14181d;
}
.metube-switcher { margin-bottom: 14px; }
.metube-switcher select {
  width: 100%; background: #1c1f24; color: #e8eaed;
  border: 1px solid #3a4048; border-radius: 10px; padding: 8px 10px;
  font-size: 13px;
}
.metube-autopsy { display: grid; gap: 10px; }
.metube-autopsy-metric {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 10px;
  padding: 10px 12px;
}
.metube-autopsy-metric h4 { margin: 0 0 4px; font-size: 13px; }
.metube-autopsy-metric .metube-metric-value { color: #8ab4f8; font-size: 13px; }
.metube-autopsy-metric p { margin: 4px 0 0; font-size: 12px; color: #9aa0a6; }
.metube-timemachine { display: grid; gap: 10px; }
.metube-tm-config {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  background: #14181d; border: 1px solid #2a2f36; border-radius: 10px;
  padding: 8px 12px; font-size: 12px;
}
.metube-tm-config label { color: #9aa0a6; }
.metube-tm-config input {
  background: #1c1f24; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 6px; padding: 3px 6px; font-size: 12px; width: 90px;
}
.metube-tm-period {
  background: #1c1f24; border: 1px solid #2a2f36; border-radius: 10px;
  padding: 10px 12px;
}
.metube-tm-period h4 { margin: 0 0 6px; font-size: 13px; }
.metube-tm-period .metube-tm-count { color: #8ab4f8; font-size: 13px; }
.metube-tm-period p { margin: 2px 0; font-size: 12px; color: #9aa0a6; }
.metube-tm-note {
  font-size: 11px; color: #9aa0a6; border-top: 1px dashed #2a2f36;
  padding-top: 8px; margin-top: 4px;
}
.metube-provenance { display: grid; gap: 10px; }
.metube-prov-step {
  background: #14181d; border: 1px solid #2a2f36; border-radius: 10px;
  padding: 10px 12px;
}
.metube-prov-step h4 { margin: 0 0 4px; font-size: 13px; }
.metube-prov-step p { margin: 3px 0; font-size: 12px; color: #c8ccd0; }
.metube-prov-step .metube-prov-meta { color: #9aa0a6; font-size: 11px; }
.metube-onboarding {
  display: grid; gap: 12px; max-width: 640px; margin: 40px auto;
}
.metube-onboarding h2 { margin: 0; }
.metube-onboarding p { margin: 0; font-size: 14px; color: #c8ccd0; }
.metube-onboarding ul { margin: 0; padding-left: 18px; font-size: 13px; color: #9aa0a6; }
.metube-onboarding-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.metube-onboarding-actions button {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 18px; padding: 8px 16px; font-size: 14px; cursor: pointer;
}
.metube-onboarding-actions button:hover { border-color: #8ab4f8; }
.metube-portability { display: grid; gap: 10px; }
.metube-portability-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.metube-portability-actions button,
.metube-portability label {
  background: #2a2f36; color: #e8eaed; border: 1px solid #3a4048;
  border-radius: 18px; padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.metube-portability-actions button:hover { border-color: #8ab4f8; }
.metube-portability input[type="file"] { display: none; }
.metube-portability-note { font-size: 12px; color: #9aa0a6; }
.metube-portability-result { font-size: 13px; color: #8ab4f8; }
.metube-fork-lineage {
  font-size: 12px; color: #9aa0a6; border-left: 2px solid #2a2f36;
  padding-left: 8px; margin: 6px 0 0;
}
.metube-saved-empty { color: #9aa0a6; font-size: 14px; }
.metube-prov-unknown { color: #f5c26b; font-size: 12px; }
`;