/**
 * Local-first persistence: IndexedDB wrapper with an in-memory fallback.
 * Everything stays on the user's machine. No network calls, ever.
 */

const DB_NAME = 'metube';
const DB_VERSION = 1;

export const STORE_PROFILE = 'profile';
export const STORE_FEEDS = 'feeds';
export const STORE_KV = 'kv';

export interface KvValue {
  key: string;
  value: unknown;
}

export interface LocalStore {
  getProfile(): Promise<unknown>;
  saveProfile(profile: unknown): Promise<void>;
  listFeeds(): Promise<unknown[]>;
  saveFeed(snapshot: unknown): Promise<void>;
  getKv(key: string): Promise<unknown>;
  putKv(key: string, value: unknown): Promise<void>;
}

export function openLocalStore(): LocalStore {
  if (typeof indexedDB !== 'undefined') {
    return new IdbLocalStore();
  }
  return new MemoryLocalStore();
}

class IdbLocalStore implements LocalStore {
  private dbp: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (this.dbp === null) {
      this.dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_PROFILE)) db.createObjectStore(STORE_PROFILE, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(STORE_FEEDS)) db.createObjectStore(STORE_FEEDS, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV, { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbp;
  }

  private async tx(store: string, mode: IDBTransactionMode) {
    const db = await this.db();
    return db.transaction(store, mode).objectStore(store);
  }

  async getProfile(): Promise<unknown> {
    const os = await this.tx(STORE_PROFILE, 'readonly');
    return wrap(os.getAll());
  }

  async saveProfile(profile: unknown): Promise<void> {
    const os = await this.tx(STORE_PROFILE, 'readwrite');
    await wrap(os.put(profile));
  }

  async listFeeds(): Promise<unknown[]> {
    const os = await this.tx(STORE_FEEDS, 'readonly');
    return wrap(os.getAll()) as Promise<unknown[]>;
  }

  async saveFeed(snapshot: unknown): Promise<void> {
    const os = await this.tx(STORE_FEEDS, 'readwrite');
    await wrap(os.put(snapshot));
  }

  async getKv(key: string): Promise<unknown> {
    const os = await this.tx(STORE_KV, 'readonly');
    return wrap(os.get(key));
  }

  async putKv(key: string, value: unknown): Promise<void> {
    const os = await this.tx(STORE_KV, 'readwrite');
    await wrap(os.put({ key, value }));
  }
}

class MemoryLocalStore implements LocalStore {
  private profile: unknown = null;
  private feeds: unknown[] = [];
  private kv = new Map<string, unknown>();

  async getProfile(): Promise<unknown> { return this.profile; }
  async saveProfile(profile: unknown): Promise<void> { this.profile = profile; }
  async listFeeds(): Promise<unknown[]> { return [...this.feeds]; }
  async saveFeed(snapshot: unknown): Promise<void> { this.feeds.push(snapshot); }
  async getKv(key: string): Promise<unknown> { return this.kv.get(key); }
  async putKv(key: string, value: unknown): Promise<void> { this.kv.set(key, value); }
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}