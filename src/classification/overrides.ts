/**
 * Classification overrides — user authority over the machine.
 *
 * Overrides are the escape hatch from every machine-derived classification:
 * the user can set any dimension of any video to any value (including
 * 'unknown'), and that choice always wins over classifier output.
 *
 * Persistence design: overrides live under their OWN KV key, separate from
 * the candidate pool. The pool is rewritten on every acquisition run (and
 * pruned at MAX_POOL_SIZE), so anything that must survive regeneration
 * cannot live inside it. Merging happens at read/enrich time, never
 * write time.
 */

import type { LocalStore } from '../storage/local-store';
import type {
  ClassificationOverride,
  VideoClassification,
} from '../model/classification';

export const OVERRIDES_KEY = 'classification-overrides';

/** Read all stored overrides (may be empty). */
export async function loadOverrides(store: LocalStore): Promise<ClassificationOverride[]> {
  const raw = await store.getKv(OVERRIDES_KEY);
  return Array.isArray(raw) ? (raw as ClassificationOverride[]) : [];
}

/** Store all overrides (replaces the list). */
export async function saveOverrides(
  store: LocalStore,
  overrides: ClassificationOverride[],
): Promise<void> {
  await store.putKv(OVERRIDES_KEY, overrides);
}

/**
 * Set (or replace) one override. Setting the same videoId + dimension
 * twice replaces the previous override — one user opinion per dimension.
 */
export async function setOverride(
  store: LocalStore,
  override: ClassificationOverride,
): Promise<void> {
  const all = await loadOverrides(store);
  const next = all.filter(
    (o) => !(o.videoId === override.videoId && o.dimension === override.dimension),
  );
  next.push(override);
  await saveOverrides(store, next);
}

/** Remove one override (falls back to machine classification). */
export async function clearOverride(
  store: LocalStore,
  videoId: string,
  dimension: ClassificationOverride['dimension'],
): Promise<void> {
  const all = await loadOverrides(store);
  await saveOverrides(
    store,
    all.filter((o) => !(o.videoId === videoId && o.dimension === dimension)),
  );
}

/** Apply overrides to a classification. Pure. User always wins. */
export function applyOverrides(
  classification: VideoClassification,
  overrides: ClassificationOverride[],
): VideoClassification {
  const mine = overrides.filter((o) => o.videoId === classification.videoId);
  if (mine.length === 0) return classification;
  let out: VideoClassification = classification;
  for (const o of mine) {
    out = applyOne(out, o);
  }
  return out;
}

function applyOne(
  classification: VideoClassification,
  override: ClassificationOverride,
): VideoClassification {
  const overrideValue = <T extends string>(value: string): {
    value: T;
    confidence: number;
    origin: 'user-override';
    method: string;
    evidence: string;
  } => ({
    value: value as T,
    confidence: 1,
    origin: 'user-override',
    method: 'user',
    evidence: override.note && override.note.length > 0
      ? `User override (${override.note})`
      : 'User override.',
  });
  switch (override.dimension) {
    case 'topics':
      return {
        ...classification,
        topics: override.value.trim() === ''
          ? []
          : [overrideValue(override.value)],
      };
    case 'sourceType':
      return { ...classification, sourceType: overrideValue(override.value) };
    case 'narrativeCluster':
      return { ...classification, narrativeCluster: overrideValue(override.value) };
    case 'temporalPosition':
      return { ...classification, temporalPosition: overrideValue(override.value) };
  }
}