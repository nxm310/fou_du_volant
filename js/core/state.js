/**
 * Fou du Volant - State Management
 * Store réactif centralisé avec système d'événements Pub/Sub
 */

const DEFAULT_SETTINGS = {
  distance: 750,          // Distance d'alerte en mètres
  sound: true,             // Bips et alertes Web Audio
  voice: true,             // Synthèse vocale TTS
  overspeedAlert: true,    // Alerte visuelle et sonore de survitesse
  autoCarMode: true,       // Bascule automatique en HUD > 25 km/h
  toleranceSpeed: 3,       // Tolérance de survitesse en km/h (+3 km/h avant alerte)
  mapTileLayer: 'dark_esri', // 'google_traffic', 'google_hybrid', 'google_roads', 'dark_esri', 'osmfr'
  filterTypes: {
    fixe: true,
    tourelle: true,
    feu: true,
    discriminant: true,
    troncon: true,
    passage: true,
    chantier: true,
    urbain: true,
    leurre: true,
    mobile: true
  }
};

class StateStore {
  constructor() {
    this.subscribers = new Map();
    this.settings = this.loadSettings();

    this.runtime = {
      userPos: null,          // { lat, lng, speed, heading, accuracy, altitude, timestamp }
      smoothedSpeed: 0,       // km/h lissé
      currentRoad: { name: '', ref: '' },
      isCarMode: false,
      activeAlerts: [],       // Radars devant le véhicule
      nearestRadar: null,     // Radar le plus proche
      isOverspeed: false,
      gpsAccuracy: null,
      gpsActive: false,
      gpsStatus: { active: false, error: null, message: 'Localisation inactive' },
      isMuted: false,
      radars: [],             // Tous les radars chargés
      totalRadars: 0,
      metadata: {
        updated_at: null,
        official_date: '11 juillet 2025',
        official_source: 'Ministère de l\'Intérieur / Sécurité Routière',
        chantier_count: 0,
        stats: {}
      }
    };
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('fdv_settings_v3');
      if (saved) {
        const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        settings.filterTypes = { ...DEFAULT_SETTINGS.filterTypes, ...settings.filterTypes };
        if (!['dark_esri', 'osm'].includes(settings.mapTileLayer)) settings.mapTileLayer = 'dark_esri';
        return settings;
      }
    } catch (e) {
      console.warn('Impossible de charger les réglages :', e);
    }
    return { ...DEFAULT_SETTINGS, filterTypes: { ...DEFAULT_SETTINGS.filterTypes } };
  }

  saveSettings() {
    try {
      localStorage.setItem('fdv_settings_v3', JSON.stringify(this.settings));
      this.emit('settingsChanged', this.settings);
    } catch (e) {
      console.error('Erreur sauvegarde réglages :', e);
    }
  }

  updateSettings(partial) {
    this.settings = Object.assign(this.settings, partial);
    this.saveSettings();
  }

  on(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);
    return () => this.subscribers.get(event).delete(callback);
  }

  emit(event, payload) {
    if (this.subscribers.has(event)) {
      this.subscribers.get(event).forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Erreur event ${event}:`, err);
        }
      });
    }
  }

  setRadars(list, metadata = null) {
    this.runtime.radars = list;
    this.runtime.totalRadars = list.length;
    if (metadata && typeof metadata === 'object') {
      this.runtime.metadata = Object.assign(this.runtime.metadata, metadata);
    }
    this.emit('radarsLoaded', list);
    this.emit('metadataUpdated', this.runtime.metadata);
  }

  updatePosition(posData) {
    this.runtime.userPos = posData;
    this.runtime.gpsActive = true;
    this.runtime.gpsAccuracy = posData.accuracy;
    this.emit('positionUpdated', posData);
  }

  setGpsStatus(status) {
    this.runtime.gpsActive = status.active;
    this.runtime.gpsStatus = status;
    this.emit('gpsStatusChanged', status);
  }

  setRoad(road) {
    this.runtime.currentRoad = road;
    this.emit('roadUpdated', road);
  }

  setAlerts(alerts, nearest) {
    this.runtime.activeAlerts = alerts;
    this.runtime.nearestRadar = nearest;
    this.emit('alertsUpdated', { alerts, nearest });
  }

  setOverspeed(isOver) {
    if (this.runtime.isOverspeed !== isOver) {
      this.runtime.isOverspeed = isOver;
      this.emit('overspeedChanged', isOver);
    }
  }

  toggleCarMode(force = null) {
    const next = force !== null ? force : !this.runtime.isCarMode;
    if (this.runtime.isCarMode !== next) {
      this.runtime.isCarMode = next;
      this.emit('carModeChanged', next);
    }
  }
}

export const state = new StateStore();
