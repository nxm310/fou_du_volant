/**
 * Fou du Volant - Radar Data Service
 * Gestion du cycle de vie des données, synchronisation IndexedDB et fallback réseau
 */

import { storage } from '../core/storage.js';
import { state } from '../core/state.js';
import { spatialIndex } from '../geo/spatial-index.js';

export class RadarService {
  async init() {
    try {
      // 1. Tenter de charger depuis IndexedDB (accès instantané hors-ligne)
      let radars = await storage.getOfficialRadars();
      let meta = await storage.getSyncMetadata();

      // Vérifier si la base locale contient bien les 458 chantiers et la dernière version
      const hasChantiers = radars && radars.some(r => r.category === 'chantier');
      const needsUpdate = !radars || radars.length < 4000 || !hasChantiers || !meta || meta.version !== '3.1.0' || !meta.official_date;

      if (needsUpdate) {
        console.log('🔄 Base locale antérieure détectée (sans chantiers). Synchronisation automatique v3.1.0...');
        meta = await this.refresh();
        radars = await storage.getOfficialRadars();
      }

      // 2. Charger les signalements communautaires récents
      const community = await storage.getCommunityRadars();

      // 3. Fusion et construction de l'index spatial
      const allRadars = (radars || []).concat(community);
      state.setRadars(allRadars, meta);
      spatialIndex.build(allRadars);

      const chantierCount = allRadars.filter(r => r.category === 'chantier').length;
      console.log(`✅ Base prête : ${allRadars.length} radars consolidés indexés (${chantierCount} chantiers & autonomes).`);
    } catch (err) {
      console.error('Erreur initialisation RadarService :', err);
    }
  }

  async fetchPayload() {
    try {
      const res = await fetch(`./radars.json?v=3.1.0&t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Impossible de récupérer radars.json :', e);
      return { radars: [] };
    }
  }

  async refresh() {
    console.log('Actualisation forcée de la base de radars...');
    const payload = await this.fetchPayload();
    const radars = payload.radars || [];
    const meta = {
      updated_at: payload.updated_at,
      official_date: payload.official_date || '11 juillet 2025',
      official_source: payload.official_source || 'Ministère de l\'Intérieur / Sécurité Routière',
      total: payload.total || radars.length,
      chantier_count: payload.chantier_count || 458,
      stats: payload.stats || {},
      version: '3.1.0'
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
