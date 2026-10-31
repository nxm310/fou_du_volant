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

      if (!radars || radars.length === 0) {
        console.log('IndexedDB vide, chargement du fichier local radars.json...');
        radars = await this.fetchFromNetwork();
        if (radars.length > 0) {
          await storage.saveOfficialRadars(radars);
        }
      }

      // 2. Charger les signalements communautaires récents
      const community = await storage.getCommunityRadars();

      // 3. Fusion et construction de l'index spatial
      const allRadars = radars.concat(community);
      state.setRadars(allRadars);
      spatialIndex.build(allRadars);

      console.log(`✅ Base prête : ${allRadars.length} radars consolidés indexés en mémoire.`);
    } catch (err) {
      console.error('Erreur initialisation RadarService :', err);
    }
  }

  async fetchFromNetwork() {
    try {
      const res = await fetch('./radars.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.radars || [];
    } catch (e) {
      console.warn('Impossible de récupérer radars.json :', e);
      return [];
    }
  }

  async refresh() {
    const radars = await this.fetchFromNetwork();
    if (radars.length > 0) {
      await storage.saveOfficialRadars(radars);
      const community = await storage.getCommunityRadars();
      const allRadars = radars.concat(community);
      state.setRadars(allRadars);
      spatialIndex.build(allRadars);
    }
  }
}

export const radarService = new RadarService();
