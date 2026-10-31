/**
 * Fou du Volant - IndexedDB & Local Storage Manager
 * Stockage haute capacité hors-ligne, fiable et sans limite de 5 Mo
 */

const DB_NAME = 'FouDuVolantDB';
const DB_VERSION = 2;
const STORE_OFFICIAL = 'official_radars';
const STORE_COMMUNITY = 'community_radars';
const STORE_META = 'metadata';

class StorageManager {
  constructor() {
    this.db = null;
  }

  async initDB() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_OFFICIAL)) {
          db.createObjectStore(STORE_OFFICIAL, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_COMMUNITY)) {
          const commStore = db.createObjectStore(STORE_COMMUNITY, { keyPath: 'id' });
          commStore.createIndex('created_at', 'created_at', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      req.onerror = (e) => {
        console.error('Erreur ouverture IndexedDB:', e);
        reject(e);
      };
    });
  }

  async saveOfficialRadars(radars, metadata = {}) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OFFICIAL, STORE_META], 'readwrite');
      const store = tx.objectStore(STORE_OFFICIAL);
      store.clear();

      for (const r of radars) {
        store.put(r);
      }

      const metaStore = tx.objectStore(STORE_META);
      metaStore.put({
        key: 'official_sync',
        updated_at: metadata.updated_at || new Date().toISOString(),
        official_date: metadata.official_date || '11 juillet 2025',
        official_source: metadata.official_source || 'Ministère de l\'Intérieur / Sécurité Routière',
        total: radars.length,
        chantier_count: metadata.chantier_count || 0,
        stats: metadata.stats || {},
        version: metadata.version || '3.1.0'
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
  }

  async getOfficialRadars() {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFICIAL, 'readonly');
      const store = tx.objectStore(STORE_OFFICIAL);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e);
    });
  }

  async getSyncMetadata() {
    const db = await this.initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get('official_sync');

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async addCommunityRadar(radar) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COMMUNITY, 'readwrite');
      const store = tx.objectStore(STORE_COMMUNITY);
      store.put(radar);

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
  }

  async getCommunityRadars() {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COMMUNITY, 'readonly');
      const store = tx.objectStore(STORE_COMMUNITY);
      const req = store.getAll();

      req.onsuccess = () => {
        // Expiration : supprimer signalements > 3 heures
        const cutoff = Date.now() - (3 * 3600 * 1000);
        const valid = (req.result || []).filter((r) => {
          const ts = new Date(r.created_at || 0).getTime();
          return ts > cutoff;
        });
        resolve(valid);
      };
      req.onerror = (e) => reject(e);
    });
  }

  async clearAll() {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OFFICIAL, STORE_COMMUNITY, STORE_META], 'readwrite');
      tx.objectStore(STORE_OFFICIAL).clear();
      tx.objectStore(STORE_COMMUNITY).clear();
      tx.objectStore(STORE_META).clear();

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
  }
}

export const storage = new StorageManager();
