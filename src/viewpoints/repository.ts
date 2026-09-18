/**
 * Viewpoint repository: CRUD, duplication, Viewlists, activation state.
 *
 * All state persists via the LocalStore. Activation ("which Viewpoint is
 * live") lives in the KV store under ACTIVE_VIEWPOINT_KEY. If the active
 * id points at a deleted or disabled Viewpoint, activation resolves to
 * null (the bootstrap unlensed feed) — never to a silent fallback.
 */

import type { Viewpoint, Viewlist } from '../model/viewpoint';
import { duplicateViewpoint } from '../model/viewpoint';
import type { LocalStore } from '../storage/local-store';

export const VIEWPOINTS_KEY = 'viewpoints';
export const VIEWLISTS_KEY = 'viewlists';
export const ACTIVE_VIEWPOINT_KEY = 'active-viewpoint-id';
export const VIEWPOINT_SEEDED_KEY = 'viewpoints-seeded';

export interface ViewpointRepository {
  // Viewpoints
  list(): Promise<Viewpoint[]>;
  get(id: string): Promise<Viewpoint | undefined>;
  create(vp: Viewpoint): Promise<Viewpoint>;
  update(vp: Viewpoint): Promise<Viewpoint>;
  remove(id: string): Promise<void>;
  duplicate(id: string, newTitle: string): Promise<Viewpoint>;
  // Viewlists
  listViewlists(): Promise<Viewlist[]>;
  createViewlist(list: Viewlist): Promise<Viewlist>;
  updateViewlist(list: Viewlist): Promise<Viewlist>;
  removeViewlist(id: string): Promise<void>;
  assignViewpoint(viewlistId: string, viewpointId: string): Promise<void>;
  unassignViewpoint(viewlistId: string, viewpointId: string): Promise<void>;
  // Activation
  getActive(): Promise<Viewpoint | null>;
  setActive(id: string | null): Promise<void>;
}

export function openViewpointRepository(store: LocalStore): ViewpointRepository {
  return new StoreViewpointRepository(store);
}

class StoreViewpointRepository implements ViewpointRepository {
  constructor(private readonly store: LocalStore) {}

  private async readAll(): Promise<Viewpoint[]> {
    const raw = await this.store.getKv(VIEWPOINTS_KEY);
    return Array.isArray(raw) ? (raw as Viewpoint[]) : [];
  }

  private async writeAll(vps: Viewpoint[]): Promise<void> {
    await this.store.putKv(VIEWPOINTS_KEY, vps);
  }

  private async readLists(): Promise<Viewlist[]> {
    const raw = await this.store.getKv(VIEWLISTS_KEY);
    return Array.isArray(raw) ? (raw as Viewlist[]) : [];
  }

  private async writeLists(lists: Viewlist[]): Promise<void> {
    await this.store.putKv(VIEWLISTS_KEY, lists);
  }

  async list(): Promise<Viewpoint[]> {
    const all = await this.readAll();
    return [...all].sort((a, b) => a.title.localeCompare(b.title));
  }

  async get(id: string): Promise<Viewpoint | undefined> {
    return (await this.readAll()).find((v) => v.id === id);
  }

  async create(vp: Viewpoint): Promise<Viewpoint> {
    const all = await this.readAll();
    if (all.some((v) => v.id === vp.id)) {
      throw new Error(`Viewpoint id already exists: ${vp.id}`);
    }
    await this.writeAll([...all, vp]);
    return vp;
  }

  async update(vp: Viewpoint): Promise<Viewpoint> {
    const all = await this.readAll();
    const idx = all.findIndex((v) => v.id === vp.id);
    if (idx === -1) throw new Error(`No such Viewpoint: ${vp.id}`);
    const next = [...all];
    next[idx] = vp;
    await this.writeAll(next);
    return vp;
  }

  async remove(id: string): Promise<void> {
    const all = await this.readAll();
    await this.writeAll(all.filter((v) => v.id !== id));
    // Dangling memberships are pruned on write; also clean lists now.
    const lists = await this.readLists();
    let listsChanged = false;
    for (const l of lists) {
      if (l.viewpointIds.includes(id)) {
        l.viewpointIds = l.viewpointIds.filter((x) => x !== id);
        listsChanged = true;
      }
    }
    if (listsChanged) await this.writeLists(lists);
    // If the removed Viewpoint was active, deactivate explicitly.
    if ((await this.store.getKv(ACTIVE_VIEWPOINT_KEY)) === id) {
      await this.store.putKv(ACTIVE_VIEWPOINT_KEY, null);
    }
  }

  async duplicate(id: string, newTitle: string): Promise<Viewpoint> {
    const source = await this.get(id);
    if (!source) throw new Error(`No such Viewpoint: ${id}`);
    const all = await this.readAll();
    const copyId = uniqueId(id, all);
    const now = new Date().toISOString();
    const copy = duplicateViewpoint(source, copyId, newTitle, now);
    await this.writeAll([...all, copy]);
    return copy;
  }

  async listViewlists(): Promise<Viewlist[]> {
    const all = await this.readLists();
    const vps = new Set((await this.readAll()).map((v) => v.id));
    // Resolve lazily: keep raw list, filter on read so stale ids vanish.
    return all
      .map((l) => ({ ...l, viewpointIds: l.viewpointIds.filter((x) => vps.has(x)) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async createViewlist(list: Viewlist): Promise<Viewlist> {
    const all = await this.readLists();
    if (all.some((l) => l.id === list.id)) {
      throw new Error(`Viewlist id already exists: ${list.id}`);
    }
    await this.writeLists([...all, list]);
    return list;
  }

  async updateViewlist(list: Viewlist): Promise<Viewlist> {
    const all = await this.readLists();
    const idx = all.findIndex((l) => l.id === list.id);
    if (idx === -1) throw new Error(`No such Viewlist: ${list.id}`);
    const next = [...all];
    next[idx] = list;
    await this.writeLists(next);
    return list;
  }

  async removeViewlist(id: string): Promise<void> {
    await this.writeLists((await this.readLists()).filter((l) => l.id !== id));
  }

  async assignViewpoint(viewlistId: string, viewpointId: string): Promise<void> {
    const all = await this.readLists();
    const idx = all.findIndex((l) => l.id === viewlistId);
    if (idx === -1) throw new Error(`No such Viewlist: ${viewlistId}`);
    const next = [...all];
    next[idx] = {
      ...next[idx],
      viewpointIds: [...new Set([...next[idx].viewpointIds, viewpointId])],
      updatedAt: new Date().toISOString(),
    };
    await this.writeLists(next);
  }

  async unassignViewpoint(viewlistId: string, viewpointId: string): Promise<void> {
    const all = await this.readLists();
    const idx = all.findIndex((l) => l.id === viewlistId);
    if (idx === -1) throw new Error(`No such Viewlist: ${viewlistId}`);
    const next = [...all];
    next[idx] = {
      ...next[idx],
      viewpointIds: next[idx].viewpointIds.filter((x) => x !== viewpointId),
      updatedAt: new Date().toISOString(),
    };
    await this.writeLists(next);
  }

  async getActive(): Promise<Viewpoint | null> {
    const id = await this.store.getKv(ACTIVE_VIEWPOINT_KEY);
    if (typeof id !== 'string') return null;
    const vp = await this.get(id);
    if (!vp || !vp.enabled) return null;
    return vp;
  }

  async setActive(id: string | null): Promise<void> {
    if (id === null) {
      await this.store.putKv(ACTIVE_VIEWPOINT_KEY, null);
      return;
    }
    const vp = await this.get(id);
    if (!vp) throw new Error(`No such Viewpoint: ${id}`);
    if (!vp.enabled) throw new Error(`Viewpoint is disabled: ${id}`);
    await this.store.putKv(ACTIVE_VIEWPOINT_KEY, id);
  }
}

function uniqueId(baseId: string, existing: Viewpoint[]): string {
  const taken = new Set(existing.map((v) => v.id));
  if (!taken.has(`${baseId}-copy`)) return `${baseId}-copy`;
  let n = 2;
  while (taken.has(`${baseId}-copy${n}`)) n += 1;
  return `${baseId}-copy${n}`;
}