/**
 * Guided-tour panel — first-use onboarding UI.
 *
 * A callout overlay above the LIVE product: the shell renders and stays
 * interactive beneath it, and every step explains something the user can
 * actually see. Next / Back / Skip on every step; no modal prison; the
 * product is never blocked.
 *
 * Teaching contract (from the onboarding spec):
 *   - SHOW -> EXPLAIN -> LET ME CHANGE IT. Explanations map to visible
 *     product surfaces, never to abstract documentation.
 *   - Every number shown is a real runtime value; nothing is fabricated.
 *   - UNKNOWN is displayed as "Unknown" and never speculated.
 *   - No Viewpoint is ever framed as more balanced, accurate, moderate,
 *     extreme, preferable, or representative than another.
 */

import type { TourStepId } from '../onboarding/tour-state';
import { TOUR_STEP_IDS } from '../onboarding/tour-state';
import type { Viewpoint } from '../model/viewpoint';
import { defaultViewpointConfig } from '../model/viewpoint';

export interface TourCallbacks {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** The tour requests a jump to a specific step (demo choice etc.). */
  onJump: (step: TourStepId) => void;
  /** General demo chosen: start with starter Viewpoints instead. */
  onStartGeneralDemo: () => void;
  /** Political-perspective demo chosen: explicit opt-in required. */
  onRequestPoliticalDemo: () => void;
  /** Compare step: generate the opposite Viewpoint's Viewstream. */
  onCompareViewpoint: (viewpointId: string) => void;
  /** Change-something step: apply or undo the harmless demo config change. */
  onToggleDemoChange: () => void;
  /**
   * Create-your-own step: create a Viewpoint from the simplified creator.
   * The full raw config the tour will save is built by the shell from
   * these two plain answers; the panel previews it before saving.
   */
  onCreateSimplified: (subject: string, changeType: SimplifiedChangeType) => void;
}

/** Plain-language change types offered by the simplified creator. */
export type SimplifiedChangeType =
  | 'unfamiliar-channels'
  | 'source-spread'
  | 'wide-window'
  | 'primary-sources'
  | 'plain';

export const SIMPLIFIED_CHANGE_TYPES: Array<{
  id: SimplifiedChangeType;
  label: string;
  hint: string;
}> = [
  {
    id: 'unfamiliar-channels',
    label: 'Channels I never see',
    hint: 'Strictly unfamiliar channels, more exploration.',
  },
  {
    id: 'source-spread',
    label: 'A spread of sources',
    hint: 'Caps on any single channel or narrative.',
  },
  {
    id: 'wide-window',
    label: 'A wider date range',
    hint: 'Wide-window temporal sampling.',
  },
  {
    id: 'primary-sources',
    label: 'Primary / official sources',
    hint: 'Recorded source-type preference (not a hard filter — honest limitation).',
  },
  {
    id: 'plain',
    label: 'Just a plain look',
    hint: 'Default sampling rules.',
  },
];

/**
 * Live facts the tour needs for the step it renders. Everything here is
 * recorded runtime data supplied by the shell — the panel never invents
 * values.
 */
export interface TourStepContext {
  activeViewpoint: Viewpoint | null;
  viewpoints: Viewpoint[];
  /** First-card step: the first feed item's recorded provenance facts. */
  firstCard: FirstCardFacts | null;
  /** Build step: the last acquisition run's recorded facts. */
  buildFacts: BuildFacts | null;
  /** Autopsy step: metric summaries computed by computeFeedAutopsy. */
  autopsyMetricSummaries: Array<{ id: string; label: string; value: string }>;
  /** Coverage step: total candidates + unknown counts from the map. */
  coverageFacts: { totalCandidates: number; unclassified: number; unknownDates: number } | null;
  /** Compare step: the evidenced demo pair available for lens switching. */
  demoCompare: { leftId: string; leftTitle: string; rightId: string; rightTitle: string } | null;
  /** Change-something step: whether the demo change is currently applied. */
  demoChangeApplied: boolean;
}

export interface FirstCardFacts {
  viewpointTitle: string;
  /** The seed query that surfaced it, from recorded provenance. */
  foundBecauseOf: string | null;
  discoverySource: string | null;
  sourceType: string | null;
  narrativeCluster: string | null;
  reason: string;
}

export interface BuildFacts {
  /** Discovery ideas in the Viewpoint (seed concepts + resolved topics). */
  seedIdeaCount: number;
  /** Steps actually executed (capped by MAX_PLAN_STEPS). */
  executedStepCount: number;
  /** The executed queries, verbatim. */
  executedQueries: string[];
  candidatesFound: number;
  duplicatesRemoved: number;
  retainedForComposition: number;
}

const STEP_TITLES: Record<TourStepId, string> = {
  welcome: 'Welcome to Slipgate',
  'what-is-a-viewpoint': 'What is a Viewpoint?',
  'demo-choice': 'Try a demo',
  'viewpoint-details': 'This is the Viewpoint you chose',
  'build-viewstream': 'Watch discovery happen',
  'first-card': 'Why is this here?',
  'unknown-is-honest': '"Unknown" is an answer, not a failure',
  'feed-autopsy': 'One card can look diverse while the feed is repetitive',
  coverage: 'Coverage: what have you been seeing?',
  'compare-viewpoints': 'Change the instructions, not your identity',
  feedback: 'A click is not a request for more',
  'exploration-firewall': 'Viewpoints are isolated from each other',
  'change-something': 'Change one thing',
  'create-your-own': 'Create your own',
  done: 'You now know how Slipgate works',
};

export function renderTourPanel(
  step: TourStepId,
  ctx: TourStepContext,
  callbacks: TourCallbacks,
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'metube-tour';
  wrap.dataset.tourStep = step;

  const card = document.createElement('div');
  card.className = 'metube-tour-card';

  const h = document.createElement('h3');
  h.className = 'metube-tour-title';
  h.textContent = STEP_TITLES[step];
  card.append(h);

  for (const block of stepBody(step, ctx, callbacks)) {
    card.append(block);
  }

  card.append(renderFooter(step, callbacks));
  wrap.append(card);
  return wrap;
}

// ---------------------------------------------------------------------------
// Step bodies
// ---------------------------------------------------------------------------

function stepBody(
  step: TourStepId,
  ctx: TourStepContext,
  callbacks: TourCallbacks,
): HTMLElement[] {
  switch (step) {
    case 'welcome':
      return [
        p('Your normal recommendation feed decides which small part of a huge video library you see.'),
        p('Slipgate gives you another way through it.'),
        p('You choose a Viewpoint — a set of instructions describing what you want to explore. Slipgate independently looks for matching videos, builds a Viewstream, and shows you why each result appeared.'),
      ];

    case 'what-is-a-viewpoint': {
      const blocks = [
        p('A Viewpoint is a saved set of instructions. It tells Slipgate what to look for and how you want the resulting feed shaped.'),
        p('It is not a search query and it is not a statement of belief. It is a sampling lens: you author it, every field is visible, and every field is editable.'),
      ];
      const look = details('What "look for" means in the Viewpoint editor', [
        li('Seed concepts — free-text search queries that drive discovery'),
        li('Seed channels / playlists — explicit starting points'),
        li('Constraints — topics to require or exclude'),
        li('Discovery style — unfamiliarity, exploration share, temporal window, locale'),
        li('Exposure budget — caps and floors on how much of the feed one channel, narrative, or source type may occupy'),
      ]);
      blocks.push(look);
      return blocks;
    }

    case 'demo-choice': {
      const blocks = [
        p('Pick a demo to watch the whole mechanism run on real data. You can leave the tour at any point — Skip tour is on every step.'),
      ];
      const choices = document.createElement('div');
      choices.className = 'metube-tour-choices';

      const general = document.createElement('button');
      general.type = 'button';
      general.textContent = 'Start with a general demo (gaming, aerospace)';
      general.addEventListener('click', () => callbacks.onStartGeneralDemo());
      choices.append(general);

      // Political-perspective demo: explanation-before-loading. The exact
      // disclaimer is shown BEFORE the opt-in; nothing is seeded until the
      // user explicitly confirms.
      const political = document.createElement('button');
      political.type = 'button';
      political.textContent = 'Try a political-perspective demo';
      const optIn = document.createElement('div');
      optIn.className = 'metube-tour-optin';
      optIn.hidden = true;
      const disclaimer = document.createElement('p');
      disclaimer.className = 'metube-tour-disclaimer';
      disclaimer.textContent =
        'These are test lenses, not truth labels. They ask Slipgate to explore material associated with different US political traditions. Slipgate does not assume that you agree with any of them, and using one does not define your political identity.';
      const optInRow = document.createElement('div');
      optInRow.className = 'metube-tour-choices';
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'metube-tour-confirm';
      confirm.textContent = 'Add the four test Viewpoints';
      confirm.addEventListener('click', () => callbacks.onRequestPoliticalDemo());
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => {
        optIn.hidden = true;
        political.hidden = false;
      });
      optInRow.append(confirm, cancel);
      optIn.append(disclaimer, optInRow);
      political.addEventListener('click', () => {
        political.hidden = true;
        optIn.hidden = false;
      });
      choices.append(political, optIn);

      blocks.push(choices);
      return blocks;
    }

    case 'viewpoint-details': {
      const vp = ctx.activeViewpoint;
      if (!vp) {
        return [
          p('No Viewpoint is active. Activate one on the Viewpoints tab to see its full definition here.'),
        ];
      }
      const blocks = [
        p(`You are looking at "${vp.title}".`),
        p('These are the instructions the Viewstream was generated through — every one of them is editable.'),
      ];
      blocks.push(lookForBlock(vp));
      blocks.push(styleBlock(vp));
      blocks.push(assumptionsBlock(vp));
      blocks.push(rawSettingsBlock(vp));
      return blocks;
    }

    case 'build-viewstream': {
      const facts = ctx.buildFacts;
      if (!facts) {
        return [p('Build a Viewstream (activate a Viewpoint, then open the Viewstream tab) and this step will show the real numbers from that run.')];
      }
      const blocks = [
        p('When you generate a Viewstream, Slipgate runs this pipeline: plan discovery, search independent candidate sources, collect candidates, classify what it can, apply Viewpoint rules, compose the Viewstream.'),
      ];
      const ul = document.createElement('ul');
      ul.className = 'metube-tour-facts';
      ul.append(
        li(`Discovery plan: ${facts.executedQueries.length} search${facts.executedQueries.length === 1 ? '' : 'es'} executed (cap: ${facts.executedStepCount} per generation${facts.seedIdeaCount > facts.executedStepCount ? ` — this Viewpoint contains ${facts.seedIdeaCount} discovery ideas, so the remaining ${facts.seedIdeaCount - facts.executedStepCount} wait for the next regeneration` : ''})`),
      );
      for (const q of facts.executedQueries) {
        ul.append(li(`Searching: "${q}"`));
      }
      ul.append(
        li(`Candidates found: ${facts.candidatesFound}`),
        li(`Duplicates removed: ${facts.duplicatesRemoved}`),
        li(`Candidates retained for composition: ${facts.retainedForComposition}`),
      );
      blocks.push(ul);
      return blocks;
    }

    case 'first-card': {
      const f = ctx.firstCard;
      if (!f) {
        return [p('Generate a Viewstream and click the first card to see its full provenance chain here.')];
      }
      const blocks = [
        p('Click any card to open its full provenance chain. This is the trace for the first result:'),
      ];
      const ul = document.createElement('ul');
      ul.className = 'metube-tour-facts';
      ul.append(
        li(`Viewpoint: ${f.viewpointTitle}`),
        li(`Found because of: ${f.foundBecauseOf === null ? 'Unknown — no recorded seed for this candidate' : `"${f.foundBecauseOf}"`}`),
        li(`Discovery source: ${f.discoverySource ?? 'Unknown'}`),
        li(`Source type: ${f.sourceType ?? 'Unknown'}`),
        li(`Narrative cluster: ${f.narrativeCluster ?? 'Unknown'}`),
        li(`Why included: ${f.reason}`),
      );
      blocks.push(ul);
      blocks.push(p('Every value above comes from recorded provenance and classification data. Unknown means Unknown — Slipgate would rather tell you "I don\'t know" than invent a classification.'));
      return blocks;
    }

    case 'unknown-is-honest':
      return [
        p('Slipgate would rather tell you "I don\'t know" than invent a classification.'),
        p('Some candidates have unknown source type, narrative cluster, date relationship, or scale band. Unknown does not mean bad. It means Slipgate does not currently have enough evidence to classify it confidently.'),
        p('The political demo Viewpoints are a clear example: no political classification exists anywhere in Slipgate, so political dimensions of every candidate are UNKNOWN — reported honestly, never guessed.'),
      ];

    case 'feed-autopsy': {
      const blocks = [
        p('One recommendation can look diverse while the whole feed is still repetitive. Feed Autopsy shows what the entire Viewstream actually contains.'),
      ];
      const m = ctx.autopsyMetricSummaries;
      if (m.length > 0) {
        const shown = m.slice(0, 4);
        const ul = document.createElement('ul');
        ul.className = 'metube-tour-facts';
        for (const metric of shown) {
          ul.append(li(`${metric.label}: ${metric.value}`));
        }
        blocks.push(ul);
        if (m.length > 4) {
          blocks.push(p(`(+ ${m.length - 4} more metric(s) — open the Coverage tab for the full autopsy.)`));
        }
      } else {
        blocks.push(p('Generate a Viewstream and the Coverage tab will show the full autopsy with live values.'));
      }
      return blocks;
    }

    case 'coverage': {
      const blocks = [
        p('Coverage asks a different question: what parts of this candidate pool have I seen a lot of, and what parts have I barely seen?'),
      ];
      const f = ctx.coverageFacts;
      if (f) {
        const ul = document.createElement('ul');
        ul.className = 'metube-tour-facts';
        ul.append(
          li(`Total candidates in the pool: ${f.totalCandidates}`),
          li(`Without classification: ${f.unclassified}`),
          li(`With unknown dates: ${f.unknownDates}`),
        );
        blocks.push(ul);
      } else {
        blocks.push(p('Open the Coverage tab (after generating a Viewstream) to see the live coverage map.'));
      }
      return blocks;
    }

    case 'compare-viewpoints': {
      const blocks = [
        p('Now we change the instructions, not your identity. Generating a Viewstream from a different Viewpoint builds a different information environment from the same corpus.'),
        p('The comparison reports composition facts only — queries executed, candidates discovered, unique channels, source types, familiarity, concentration, unknown classifications. No Viewpoint is scored as more balanced or truthful than another.'),
      ];
      if (ctx.demoCompare) {
        const { leftTitle, rightTitle } = ctx.demoCompare;
        const choices = document.createElement('div');
        choices.className = 'metube-tour-choices';
        const switchBtn = document.createElement('button');
        switchBtn.type = 'button';
        switchBtn.textContent = `Switch to "${rightTitle}" and regenerate`;
        switchBtn.addEventListener('click', () =>
          callbacks.onCompareViewpoint(ctx.demoCompare!.rightId),
        );
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.textContent = `Switch back to "${leftTitle}"`;
        backBtn.addEventListener('click', () =>
          callbacks.onCompareViewpoint(ctx.demoCompare!.leftId),
        );
        choices.append(switchBtn, backBtn);
        blocks.push(choices);
        blocks.push(
          p('Switching lenses is a sampling decision — it says what you want to look at, not what you believe.'),
        );
      } else {
        blocks.push(
          p('Two demo Viewpoints are available for this from the demo step. You can also activate a second Viewpoint of your own (Viewpoints tab → Activate) and compare.'),
        );
      }
      return blocks;
    }

    case 'feedback': {
      const blocks = [
        p('Watching or clicking a card is NOT treated as "I agree with this" or "give me more of this".'),
        p('Feedback is explicit only — labeled buttons with declared semantics:'),
      ];
      const ul = document.createElement('ul');
      ul.className = 'metube-tour-facts';
      ul.append(
        li('"Good recommendation" — this was useful to surface'),
        li('"Interesting — don\'t extrapolate" — worth seeing, but not a request for similar material'),
        li('"More from this source" — increase this source\'s relevance inside this Viewpoint'),
        li('"Less from this source" — reduce this source inside this Viewpoint'),
        li('"This cluster is overrepresented" — too much of this kind of material is appearing'),
        li('"I watched this" — records exposure only, never preference'),
        li('"Mute channel" — exclude this channel'),
      );
      blocks.push(ul);
      return blocks;
    }

    case 'exploration-firewall':
      return [
        p('What you do inside one Viewpoint does not automatically redefine another Viewpoint.'),
        p('Preference feedback recorded in a Viewstream is scoped to that Viewpoint. Exposure facts (watched/skipped/saved) and channel mutes are global — they are facts about what you did, not instructions to any lens.'),
        p('Slipgate state lives in this browser (page-origin storage on youtube.com), separate from YouTube\'s own recommendation state — Slipgate never reads or writes your YouTube watch history. Separation from YouTube\'s profile is the design goal; it is not an anonymity promise.'),
      ];

    case 'change-something': {
      const blocks = [
        p('Change one rule and regenerate, so you can watch configuration change the feed with your own eyes.'),
      ];
      const applied = ctx.demoChangeApplied;
      const applyBox = document.createElement('div');
      applyBox.className = 'metube-tour-optin';
      const applyText = document.createElement('p');
      applyText.textContent = applied
        ? 'Demo change applied: exploration raised to 50%. Look at the Viewstream — the exploration slots now pull from outside the seeds. Then undo it.'
        : 'Try it here: raise the exploration share to 50% for this Viewpoint. This edits the Viewpoint (you can undo this demo change with one click).';
      applyBox.append(applyText);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'metube-tour-confirm';
      btn.textContent = applied ? 'Undo demo change' : 'Apply demo change: exploration 50%';
      btn.addEventListener('click', () => callbacks.onToggleDemoChange());
      applyBox.append(btn);
      blocks.push(applyBox);
      blocks.push(
        p('The Viewpoints tab exposes every one of these rules — seeds, unfamiliarity, exposure budgets, temporal windows. Every change is visible there, and nothing changes your identity.'),
      );
      return blocks;
    }

    case 'create-your-own': {
      const blocks = [
        p('What do you want another view of?'),
      ];
      const form = document.createElement('div');
      form.className = 'metube-tour-creator';

      const label = document.createElement('label');
      label.textContent = 'Subject';
      const subject = document.createElement('input');
      subject.type = 'text';
      subject.placeholder = 'e.g. PC gaming, space policy, this game\u2019s launch coverage…';
      subject.className = 'metube-tour-subject';
      label.append(subject);
      form.append(label);

      const changeLabel = document.createElement('p');
      changeLabel.textContent = 'What should be different about it?';
      form.append(changeLabel);

      const changeList = document.createElement('div');
      changeList.className = 'metube-tour-choices';
      let selected: SimplifiedChangeType = 'plain';
      const radios: Array<{ input: HTMLInputElement; id: SimplifiedChangeType }> = [];
      for (const ct of SIMPLIFIED_CHANGE_TYPES) {
        const opt = document.createElement('label');
        opt.className = 'metube-tour-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `metube-tour-change-${step}`;
        input.value = ct.id;
        if (ct.id === 'plain') input.checked = true;
        input.addEventListener('change', () => {
          selected = ct.id;
        });
        radios.push({ input, id: ct.id });
        const text = document.createElement('span');
        text.textContent = `${ct.label} — ${ct.hint}`;
        opt.append(input, text);
        changeList.append(opt);
      }
      form.append(changeList);

      const preview = document.createElement('details');
      preview.className = 'metube-tour-raw';
      const psum = document.createElement('summary');
      psum.textContent = 'Show the underlying configuration before saving';
      preview.append(psum);
      const previewPre = document.createElement('pre');
      previewPre.className = 'metube-tour-preview';
      preview.append(previewPre);
      form.append(preview);

      const refreshPreview = (): void => {
        // The EXACT merged config that will be saved: defaults + overlay.
        previewPre.textContent = JSON.stringify(
          {
            ...defaultViewpointConfig(),
            ...simplifiedConfigOverlay(subject.value, selected),
          },
          null,
          2,
        );
      };
      subject.addEventListener('input', refreshPreview);
      for (const r of radios) {
        r.input.addEventListener('change', refreshPreview);
      }
      refreshPreview();

      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'metube-tour-confirm';
      save.textContent = 'Create this Viewpoint';
      save.addEventListener('click', () => {
        const subjectText = subject.value.trim();
        if (subjectText.length === 0) {
          subject.focus();
          return;
        }
        callbacks.onCreateSimplified(subjectText, selected);
      });
      form.append(save);
      blocks.push(form);
      blocks.push(
        p('A political topic works exactly like any other subject here — entering one does not record or imply anything about your political identity.'),
      );
      return blocks;
    }

    case 'done':
      return [
        p('You just saw: a Viewpoint is instructions you author; a Viewstream is built from independent discovery, and every inclusion is traceable; Slipgate reports what it does not know as Unknown; changing the Viewpoint changes the information environment.'),
        p('Slipgate is not choosing what you should believe. You choose a lens; Slipgate searches independently and shows you why things appeared.'),
        p('The tour stays replayable from the Help link whenever you want it again.'),
      ];
  }
}

// ---------------------------------------------------------------------------
// Simplified creator preview — the exact config the shell will save.
// This mapping is the contract: the preview shown here is what gets saved,
// no hidden extra fields.
// ---------------------------------------------------------------------------

/**
 * The exact config overlay the shell will save for a simplified creation.
 * `newViewpoint` merges this partial over `defaultViewpointConfig()`, so
 * the JSON preview shown to the user = defaults + this overlay. The
 * preview renders the merged result (see simplifiedConfigMerged).
 */
export function simplifiedConfigOverlay(
  subject: string,
  changeType: SimplifiedChangeType,
): Partial<Viewpoint['config']> {
  const base: Partial<Viewpoint['config']> = {
    seedConcepts: subject ? [subject] : [],
  };
  switch (changeType) {
    case 'unfamiliar-channels':
      return {
        ...base,
        unfamiliarityTarget: 'strictly-unfamiliar',
        explorationPercent: 0.5,
      };
    case 'source-spread':
      return {
        ...base,
        exposureBudget: {
          maxSingleChannelShare: 0.2,
          maxSingleNarrativeShare: 0.4,
        },
      };
    case 'wide-window':
      return { ...base, temporal: 'wide-window' };
    case 'primary-sources':
      return {
        ...base,
        sourceTypePreferences: ['primary-source', 'official-source'],
      };
    case 'plain':
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Viewpoint rendering helpers (viewpoint-details step)
// ---------------------------------------------------------------------------

function lookForBlock(vp: Viewpoint): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-tour-lookfor';
  const h = document.createElement('h4');
  h.textContent = 'LOOK FOR';
  box.append(h);
  const ul = document.createElement('ul');
  const seeds = vp.config.seedConcepts.length > 0
    ? vp.config.seedConcepts
    : vp.config.seedTopics;
  if (seeds.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No seeds — the Viewpoint samples whatever the pool holds.';
    ul.append(li);
  } else {
    const max = 5;
    for (const seed of seeds.slice(0, max)) {
      const li = document.createElement('li');
      li.textContent = seed;
      ul.append(li);
    }
    if (seeds.length > max) {
      const li = document.createElement('li');
      li.textContent = `… and ${seeds.length - max} more (Show raw settings below)`;
      ul.append(li);
    }
  }
  box.append(ul);
  return box;
}

function styleBlock(vp: Viewpoint): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-tour-style';
  const h = document.createElement('h4');
  h.textContent = 'DISCOVERY STYLE';
  box.append(h);
  const ul = document.createElement('ul');
  ul.append(
    li(`Unfamiliar channels: ${unfamiliarityLabel(vp.config.unfamiliarityTarget)}`),
    li(`Exploration: ${(vp.config.explorationPercent * 100).toFixed(0)}%`),
    li(`Max share from one channel: ${((vp.config.exposureBudget.maxSingleChannelShare ?? 1) * 100).toFixed(0)}%`),
    li(`Narrative concentration: ${narrativeLabel(vp.config.narrativeDiversityTarget)}`),
    li(`Geography: ${vp.config.locale.region ?? 'any'} · Language: ${vp.config.locale.language ?? 'any'}`),
    li(`Temporal sampling: ${vp.config.temporal}`),
  );
  box.append(ul);
  return box;
}

function assumptionsBlock(vp: Viewpoint): HTMLElement {
  const box = document.createElement('div');
  box.className = 'metube-tour-assumptions';
  const h = document.createElement('h4');
  h.textContent = 'ASSUMPTIONS (notes for this Viewpoint)';
  box.append(h);
  const note = document.createElement('p');
  note.textContent =
    'Assumptions are notes you give this Viewpoint. They are instructions and context for this lens — not permanent facts Slipgate has inferred about you.';
  box.append(note);
  if (vp.config.assumptions.length === 0) {
    box.append(p('This Viewpoint has no assumptions recorded.'));
    return box;
  }
  const ul = document.createElement('ul');
  for (const a of vp.config.assumptions) {
    ul.append(li(a));
  }
  box.append(ul);
  return box;
}

function rawSettingsBlock(vp: Viewpoint): HTMLElement {
  const details = document.createElement('details');
  details.className = 'metube-tour-raw';
  const summary = document.createElement('summary');
  summary.textContent = 'Show raw settings';
  details.append(summary);
  const pre = document.createElement('pre');
  // Config is plain JSON data; textContent assignment is Trusted-Type-safe.
  pre.textContent = JSON.stringify(vp.config, null, 2);
  details.append(pre);
  return details;
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function renderFooter(step: TourStepId, callbacks: TourCallbacks): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'metube-tour-footer';

  const steps = document.createElement('span');
  steps.className = 'metube-tour-steps';
  steps.textContent = `Step ${stepNumber(step)} of ${TOUR_STEP_IDS.length}`;
  footer.append(steps);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'metube-tour-skip';
  skip.textContent = 'Skip tour';
  skip.addEventListener('click', () => callbacks.onSkip());
  footer.append(skip);

  const nav = document.createElement('div');
  nav.className = 'metube-tour-nav';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back';
  back.disabled = stepNumber(step) <= 1;
  back.addEventListener('click', () => callbacks.onBack());
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'metube-tour-next';
  next.textContent = step === 'done' ? 'Finish' : 'Next';
  next.addEventListener('click', () => callbacks.onNext());
  nav.append(back, next);
  footer.append(nav);
  return footer;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function stepNumber(step: TourStepId): number {
  return TOUR_STEP_IDS.indexOf(step) + 1;
}

function unfamiliarityLabel(target: Viewpoint['config']['unfamiliarityTarget']): string {
  if (target === 'strictly-unfamiliar') return 'High (strictly unfamiliar)';
  if (target === 'mostly-unfamiliar') return 'Mostly unfamiliar';
  return 'Any';
}

function narrativeLabel(target: Viewpoint['config']['narrativeDiversityTarget']): string {
  if (target === 'max-narrative-spread') return 'Limited (max spread requested)';
  if (target === 'mixed-narratives') return 'Mixed narratives';
  return 'Any';
}

function p(text: string): HTMLElement {
  const el = document.createElement('p');
  el.textContent = text;
  return el;
}

function li(text: string): HTMLElement {
  const el = document.createElement('li');
  el.textContent = text;
  return el;
}

function details(summaryText: string, items: HTMLElement[]): HTMLElement {
  const d = document.createElement('details');
  const s = document.createElement('summary');
  s.textContent = summaryText;
  d.append(s);
  const ul = document.createElement('ul');
  for (const item of items) {
    ul.append(item);
  }
  d.append(ul);
  return d;
}