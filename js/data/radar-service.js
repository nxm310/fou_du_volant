/**
 * Fou du Volant - Radar Data Service
 * Gestion du cycle de vie des données, synchronisation IndexedDB et fallback réseau
 */

import { normalizeRadarRecords, summarizeRecords } from './data-quality.js';
import { storage } from '../core/storage.js';
import { state } from '../core/state.js';
import { spatialIndex } from '../geo/spatial-index.js';

export class RadarService {
  async init() {
    try {
      // 1. Tenter de charger depuis IndexedDB (accès instantané hors-ligne)
      let radars = await storage.getOfficialRadars();
      let meta = await storage.getSyncMetadata();

      const needsUpdate = !radars?.length || !meta || meta.version !== '4.1.0';

      if (needsUpdate) {
        console.log('Migration de la base vers le schéma 4.1.0');
        try {
          meta = await this.refresh();
          radars = await storage.getOfficialRadars();
        } catch (error) {
          if (!radars?.length) throw error;
        }
      }

      // 2. Charger les signalements communautaires récents
      const community = await storage.getCommunityRadars();

      // 3. Fusion et construction de l'index spatial
      const allRadars = normalizeRadarRecords(radars || []).concat(community);
      meta = { ...meta, ...summarizeRecords(allRadars) };
      state.setRadars(allRadars, meta);
      spatialIndex.build(allRadars);

      const chantierCount = allRadars.filter(r => r.category === 'chantier').length;
      console.log(`✅ Base prête : ${allRadars.length} radars consolidés indexés (${chantierCount} chantiers & autonomes).`);
    } catch (err) {
      state.emit('dataError', err.message);
      console.error('Erreur initialisation RadarService :', err);
    }
  }

  async fetchPayload({ fresh = false } = {}) {
    try {
      const res = await fetch(`./radars.json?v=4.1.0${fresh ? '&fdv_refresh=1' : ''}&t=${Date.now()}`, { cache: fresh ? 'no-store' : 'no-cache', signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Impossible de récupérer radars.json :', e);
      throw new Error("Base inaccessible. Vérifiez votre connexion ; les données déjà enregistrées restent disponibles.");
    }
  }

  async refresh({ fresh = false } = {}) {
    console.log('Actualisation forcée de la base de radars...');
    const payload = await this.fetchPayload({ fresh });
    const rawRecords = payload.radars;
    const radars = Array.isArray(rawRecords) ? normalizeRadarRecords(rawRecords) : rawRecords;
    if (!Array.isArray(radars) || !radars.length || radars.some(r => !Number.isFinite(r.lat) || !Number.isFinite(r.lng))) throw new Error('Base vide ou invalide ; données locales conservées.');
    const meta = {
      updated_at: payload.updated_at,
      downloaded_at: fresh ? new Date().toISOString() : (await storage.getSyncMetadata())?.downloaded_at || null,
      official_date: payload.official_date || '11 juillet 2025',
      official_source: payload.official_source || 'Ministère de l\'Intérieur / Sécurité Routière',
      total: payload.total || radars.length,
      chantier_count: payload.chantier_count ?? radars.filter(r => r.category === 'chantier').length,
      stats: payload.stats || {},
      ...summarizeRecords(radars),
      version: '4.1.0'
    };

    if (radars.length > 0) {
      await storage.saveOfficialRadars(radars, meta);
      const community = await storage.getCommunityRadars();
      const allRadars = radars.concat(community);
      state.setRadars(allRadars, meta);
      spatialIndex.build(allRadars);
    }
    return meta;
  }
}

export const radarService = new RadarService();
