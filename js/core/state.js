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
      isMuted: false,
      radars: [],             // Tous les radars chargés
      totalRadars: 0
    };
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('fdv_settings_v3');
      if (saved) {
        return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Impossible de charger les réglages :', e);
    }
    return Object.assign({}, DEFAULT_SETTINGS);
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

  setRadars(list) {
    this.runtime.radars = list;
    this.runtime.totalRadars = list.length;
    this.emit('radarsLoaded', list);
  }

  updatePosition(posData) {
    this.runtime.userPos = posData;
    this.runtime.gpsActive = true;
    this.runtime.gpsAccuracy = posData.accuracy;
    this.emit('positionUpdated', posData);
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
