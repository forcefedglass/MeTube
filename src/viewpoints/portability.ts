/**
 * Portability — Phase 5.
 *
 * Export/import of MeTube state in a documented, versioned format.
 *
 * DESIGN RULES (FROZEN):
 *   - The format is `{ format: 'metube-export', version: 1, ... }`. Any
 *     consumer can validate the shape before reading further.
 *   - DEFAULT export = Viewpoints + Viewlists + classification overrides
 *     + relevant MeTube preferences (active viewpoint id, fixture-mode
 *     flag). These are the user's authored lenses.
 *   - Feedback history and feed history are PRIVATE DATA: excluded unless
 *     the user explicitly selects them ("include history"). Nothing is
 *     ever silently bundled.
 *   - Import validates before applying anything: unknown version is a hard
 *     rejection; malformed sections are rejected whole (never partially
 *     applied); unknown fields inside known sections are preserved
 *     verbatim, never dropped, never reinterpreted.
 *   - Import merges by id: existing records win only when the user chooses
 *     "keep mine"; imported records win when the user chooses "import
 *     wins". Both modes are explicit. The merge never silently drops a
 *     record that exists on one side only.
 *   - No browsing history, YouTube history, or anything outside MeTube's
 *     own stores is ever exported. (MeTube never reads those anyway.)
 *
 * Pure and DOM-free. Deterministic.
 */

import type { Viewpoint, Viewlist } from '../model/viewpoint';
import type { ClassificationOverride } from '../model/classification';
import type { UserFeedback } from '../model/types';

export const EXPORT_FORMAT = 'metube-export';
export const EXPORT_VERSION = 1;

/** What to include in an export. Defaults exclude all private data. */
export interface ExportOptions {
  /** Include recorded feedback history (explicit signals). Private data. */
  includeFeedback?: boolean;
  /** Include saved feed snapshots. Private data. */
  includeFeedHistory?: boolean;
}

/** The v1 export document. */
export interface MeTubeExportV1 {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  /** Human-readable statement of what this file contains. */
  contents: string;
  viewpoints: Viewpoint[];
  viewlists: Viewlist[];
  classificationOverrides: ClassificationOverride[];
  preferences: {
    activeViewpointId: string | null;
    fixtureMode: boolean;
  };
  feedback?: UserFeedback[];
  feedHistory?: unknown[];
}

/** Errors returned by validation — caller surfaces them verbatim. */
export interface ImportError {
  message: string;
}

export type ImportResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ImportError };

/** Merge mode, chosen explicitly by the user. */
export type ImportMode = 'keep-mine' | 'import-wins';

export interface PortabilityData {
  viewpoints: Viewpoint[];
  viewlists: Viewlist[];
  classificationOverrides: ClassificationOverride[];
  preferences: {
    activeViewpointId: string | null;
    fixtureMode: boolean;
  };
  feedback: UserFeedback[];
}

/**
 * Build a v1 export document. Deterministic given inputs.
 */
export function buildExport(
  data: PortabilityData,
  options: ExportOptions,
  now: string,
): MeTubeExportV1 {
  const doc: MeTubeExportV1 = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    contents:
      `Slipgate export v${EXPORT_VERSION}: ${data.viewpoints.length} Viewpoint(s), ` +
      `${data.viewlists.length} Viewlist(s), ${data.classificationOverrides.length} classification override(s), ` +
      `preferences (active viewpoint${data.preferences.activeViewpointId ? `: ${data.preferences.activeViewpointId}` : ': none'}; fixture mode: ${data.preferences.fixtureMode ? 'on' : 'off'}).` +
      (options.includeFeedback
        ? ` Includes ${data.feedback.length} explicit feedback record(s) (private data, explicitly selected).`
        : ' Feedback history excluded (private data).') +
      (options.includeFeedHistory
        ? ' Includes saved feed snapshots (private data, explicitly selected).'
        : ' Feed history excluded (private data).'),
    viewpoints: data.viewpoints,
    viewlists: data.viewlists,
    classificationOverrides: data.classificationOverrides,
    preferences: {
      activeViewpointId: data.preferences.activeViewpointId,
      fixtureMode: data.preferences.fixtureMode,
    },
  };
  if (options.includeFeedback) doc.feedback = data.feedback;
  return doc;
}

/**
 * Validate + parse an export document. Hard-rejects wrong format or
 * version; rejects malformed required sections whole. Returns the parsed
 * data or an error message the caller shows verbatim.
 */
export function parseImport(raw: unknown): ImportResult<PortabilityData> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: { message: 'Not a Slipgate export: the file is not a JSON object.' } };
  }
  const doc = raw as Record<string, unknown>;
  if (doc.format !== EXPORT_FORMAT) {
    return {
      ok: false,
      error: { message: `Not a Slipgate export: expected format "${EXPORT_FORMAT}", found ${JSON.stringify(doc.format)}.` },
    };
  }
  if (doc.version !== EXPORT_VERSION) {
    return {
      ok: false,
      error: { message: `Unsupported Slipgate export version: ${JSON.stringify(doc.version)} (this build reads version ${EXPORT_VERSION} only).` },
    };
  }
  if (!Array.isArray(doc.viewpoints)) {
    return { ok: false, error: { message: 'Malformed export: "viewpoints" is not an array.' } };
  }
  if (!Array.isArray(doc.viewlists)) {
    return { ok: false, error: { message: 'Malformed export: "viewlists" is not an array.' } };
  }
  if (!Array.isArray(doc.classificationOverrides)) {
    return { ok: false, error: { message: 'Malformed export: "classificationOverrides" is not an array.' } };
  }
  if (typeof doc.preferences !== 'object' || doc.preferences === null) {
    return { ok: false, error: { message: 'Malformed export: "preferences" is not an object.' } };
  }
  const prefs = doc.preferences as Record<string, unknown>;
  if (
    prefs.activeViewpointId !== null && typeof prefs.activeViewpointId !== 'string'
  ) {
    return { ok: false, error: { message: 'Malformed export: "preferences.activeViewpointId" must be a string or null.' } };
  }
  if (typeof prefs.fixtureMode !== 'boolean') {
    return { ok: false, error: { message: 'Malformed export: "preferences.fixtureMode" must be a boolean.' } };
  }
  const feedback = doc.feedback;
  if (feedback !== undefined && !Array.isArray(feedback)) {
    return { ok: false, error: { message: 'Malformed export: "feedback" is present but not an array.' } };
  }
  for (const vp of doc.viewpoints) {
    if (typeof vp !== 'object' || vp === null || typeof (vp as Record<string, unknown>).id !== 'string') {
      return { ok: false, error: { message: 'Malformed export: a viewpoint record has no string id.' } };
    }
  }
  for (const l of doc.viewlists) {
    if (typeof l !== 'object' || l === null || typeof (l as Record<string, unknown>).id !== 'string') {
      return { ok: false, error: { message: 'Malformed export: a viewlist record has no string id.' } };
    }
  }

  return {
    ok: true,
    value: {
      viewpoints: doc.viewpoints as Viewpoint[],
      viewlists: doc.viewlists as Viewlist[],
      classificationOverrides: doc.classificationOverrides as ClassificationOverride[],
      preferences: {
        activeViewpointId: prefs.activeViewpointId as string | null,
        fixtureMode: prefs.fixtureMode as boolean,
      },
      feedback: (feedback ?? []) as UserFeedback[],
    },
  };
}

/**
 * Merge imported data into existing data under an explicit mode.
 * Pure: returns the merged arrays.
 *
 *   keep-mine  : existing record wins on id collision; imported-only ids are ADDED (never dropped).
 *   import-wins: imported record wins on id collision; existing-only ids are KEPT (never dropped).
 */
export function mergeById<T extends { id: string }>(
  mine: T[],
  imported: T[],
  mode: ImportMode,
): T[] {
  const byId = new Map<string, T>();
  if (mode === 'keep-mine') {
    for (const m of mine) byId.set(m.id, m);
    for (const i of imported) if (!byId.has(i.id)) byId.set(i.id, i);
  } else {
    for (const i of imported) byId.set(i.id, i);
    for (const m of mine) if (!byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Merge feedback lists (only present when the import included it AND the
 * user chose to apply it). De-duplicates by id; never drops a record.
 */
export function mergeFeedback(
  mine: UserFeedback[],
  imported: UserFeedback[],
): UserFeedback[] {
  const byId = new Map<string, UserFeedback>();
  for (const f of [...mine, ...imported]) byId.set(f.id, f);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}