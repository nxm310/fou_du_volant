/**
 * Fou du Volant - Geolocation Tracker & Road Snapping Engine
 * Gestion robuste pour smartphone (iOS Safari / Android Chrome)
 * Deux phases d'acquisition : fix réseau ultra-rapide + suivi GPS haute précision
 */

import { state } from '../core/state.js';
import { spatialIndex, haversineMeters, calculateBearing } from './spatial-index.js';
import { isRadarAhead, isSameRoadOrCompatible } from './corridor.js';

let watchId = null;
let lastPosition = null;
let lastRoadQueryTime = 0;
let cachedRoad = { name: '', ref: '' };
let autoCarModeTimer = null;

export class GeoTracker {
  constructor() {
    this.isActive = false;
    this.hasFirstFix = false;
    this.retryTimeout = null;
  }

  isSecure() {
    return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  start() {
    if (!this.isSecure()) {
      console.warn('⚠️ Contexte non sécurisé HTTP : le navigateur mobile bloque la géolocalisation.');
      state.setGpsStatus({
        active: false,
        error: 'insecure',
        message: 'HTTPS requis sur mobile (HTTP bloque le GPS)'
      });
      return;
    }

    if (!('geolocation' in navigator)) {
      state.setGpsStatus({
        active: false,
        error: 'unsupported',
        message: 'GPS non supporté sur ce navigateur'
      });
      return;
    }

    if (this.isActive) return;
    this.isActive = true;

    state.setGpsStatus({
      active: false,
      error: null,
      message: 'Recherche position...'
    });

    // 1. Étape 1 : Fix réseau / wifi ultra-rapide (< 0.5s)
    if (!this.hasFirstFix) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!this.hasFirstFix) {
            console.log('📍 Premier fix réseau obtenu :', pos.coords.latitude, pos.coords.longitude);
            this.handleSuccess(pos, false);
          }
        },
        (err) => {
          console.log('Fix rapide réseau non disponible, attente satellites...', err.message);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    }

    // 2. Étape 2 : Suivi continu par satellites (GPS haute précision)
    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 25000 // 25s pour laisser le temps au GPS mobile de se verrouiller
    };

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleSuccess(pos, true),
      (err) => this.handleError(err),
      options
    );
  }

  requestPosition() {
    // Méthode de relance explicite sur tap utilisateur
    console.log('Demande de localisation initiée par l\'utilisateur...');
    this.isActive = false;
    this.hasFirstFix = false;
    this.start();
  }

  stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    this.isActive = false;
  }

  handleSuccess(position, isHighAccuracy = true) {
    this.hasFirstFix = true;
    const coords = position.coords;
    const now = Date.now();

    let speedKmh = 0;
    let heading = coords.heading;

    // Calcul de la vitesse
    if (coords.speed !== null && !isNaN(coords.speed) && coords.speed >= 0) {
      speedKmh = Math.round(coords.speed * 3.6);
    } else if (lastPosition) {
      const dt = (now - lastPosition.time) / 1000;
      if (dt > 0.5 && dt < 10) {
        const dist = haversineMeters(
          lastPosition.lat,
          lastPosition.lng,
          coords.latitude,
          coords.longitude
        );
        speedKmh = Math.round((dist / dt) * 3.6);
        if (heading === null || isNaN(heading)) {
          heading = calculateBearing(
            lastPosition.lat,
            lastPosition.lng,
            coords.latitude,
            coords.longitude
          );
        }
      }
    }

    const smoothed = Math.max(0, Math.min(speedKmh, 250));
    const accuracy = Math.round(coords.accuracy || 0);

    const posData = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: accuracy,
      speed: smoothed,
      heading: (heading !== null && !isNaN(heading)) ? Math.round(heading) : null,
      altitude: coords.altitude ? Math.round(coords.altitude) : null,
      timestamp: now
    };

    lastPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      time: now
    };

    state.updatePosition(posData);
    state.setGpsStatus({
      active: true,
      error: null,
      message: `${smoothed} km/h • ±${accuracy}m`
    });

    // Détection de la route actuelle (OSRM)
    this.checkRoadSnapping(coords.latitude, coords.longitude, smoothed);

    // Gestion du basculement automatique Cockpit HUD
    this.checkAutoCarMode(smoothed);

    // Évaluation des radars à proximité
    this.evaluateRadars(posData);
  }

  handleError(err) {
    console.warn('Erreur GPS :', err.code, err.message);
    let msg = 'Signal GPS introuvable';
    let errType = 'error';

    switch (err.code) {
      case 1: // PERMISSION_DENIED
        msg = 'GPS refusé : autorisez l\'accès localisation dans les Réglages';
        errType = 'denied';
        break;
      case 2: // POSITION_UNAVAILABLE
        msg = 'Position indisponible (activez le GPS)';
        errType = 'unavailable';
        break;
      case 3: // TIMEOUT
        msg = 'Signal faible : attente satellites...';
        errType = 'timeout';
        if (!this.retryTimeout && this.isActive) {
          this.retryTimeout = setTimeout(() => {
            this.retryTimeout = null;
            if (this.isActive) {
              this.isActive = false;
              this.start();
            }
          }, 3000);
        }
        break;
    }

    state.setGpsStatus({
      active: false,
      error: errType,
      message: msg
    });
  }

  async checkRoadSnapping(lat, lng, speedKmh) {
    const now = Date.now();
    if (now - lastRoadQueryTime < 6000) return;
    lastRoadQueryTime = now;

    try {
      const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      if (data.waypoints && data.waypoints.length > 0) {
        const wp = data.waypoints[0];
        const rawName = wp.name || '';
        const refMatch = rawName.match(/\b([A|N|D]\s?\d{1,4}[A-Z]?)\b/i);
        const ref = refMatch ? refMatch[0].toUpperCase().replace(/\s+/g, '') : '';

        cachedRoad = {
          name: rawName || ref || 'Route en cours',
          ref: ref
        };
        state.setRoad(cachedRoad);
      }
    } catch (e) {
      // Échec silencieux
    }
  }

  checkAutoCarMode(speedKmh) {
    if (!state.settings.autoCarMode) return;

    if (speedKmh >= 25 && !state.runtime.isCarMode) {
      if (!autoCarModeTimer) {
        autoCarModeTimer = setTimeout(() => {
          if (state.runtime.userPos && state.runtime.userPos.speed >= 25) {
            state.toggleCarMode(true);
          }
          autoCarModeTimer = null;
        }, 3000);
      }
    } else if (speedKmh < 10) {
      if (autoCarModeTimer) {
        clearTimeout(autoCarModeTimer);
        autoCarModeTimer = null;
      }
    }
  }

  evaluateRadars(pos) {
    const threshold = state.settings.distance;
    const candidates = spatialIndex.queryRadius(pos.lat, pos.lng, threshold);

    const activeAlerts = [];
    let isOverspeed = false;

    for (const item of candidates) {
      const r = item.radar;
      const cat = r.category || 'fixe';
      if (state.settings.filterTypes[cat] === false) continue;
      if (!isRadarAhead(r, pos, pos.heading, pos.speed)) continue;
      if (!isSameRoadOrCompatible(r.route, cachedRoad)) continue;

      activeAlerts.push(item);
    }

    const nearest = activeAlerts.length > 0 ? activeAlerts[0] : null;

    if (nearest && nearest.radar.vitesse) {
      const limit = nearest.radar.vitesse;
      const tol = state.settings.toleranceSpeed || 0;
      if (pos.speed > limit + tol) {
        isOverspeed = true;
      }
    }

    state.setOverspeed(isOverspeed);
    state.setAlerts(activeAlerts, nearest);
  }
}

export const tracker = new GeoTracker();
