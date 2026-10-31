/**
 * Fou du Volant - Geolocation Tracker & Road Snapping Engine
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
  }

  start() {
    if (!('geolocation' in navigator)) {
      alert("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    if (this.isActive) return;
    this.isActive = true;

    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleSuccess(pos),
      (err) => this.handleError(err),
      options
    );
  }

  stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    this.isActive = false;
  }

  handleSuccess(position) {
    const coords = position.coords;
    const now = Date.now();

    let speedKmh = 0;
    let heading = coords.heading;

    // Calcul de la vitesse
    if (coords.speed !== null && !isNaN(coords.speed) && coords.speed >= 0) {
      speedKmh = Math.round(coords.speed * 3.6);
    } else if (lastPosition) {
      // Fallback calcul manuel de la vitesse entre 2 points
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

    // Lissage léger de la vitesse
    const smoothed = Math.max(0, Math.min(speedKmh, 250));

    const posData = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: Math.round(coords.accuracy || 0),
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

    // Détection de la route actuelle (OSRM)
    this.checkRoadSnapping(coords.latitude, coords.longitude, smoothed);

    // Gestion du basculement automatique Cockpit HUD
    this.checkAutoCarMode(smoothed);

    // Évaluation des radars à proximité
    this.evaluateRadars(posData);
  }

  handleError(err) {
    console.warn('Erreur GPS :', err.message);
  }

  async checkRoadSnapping(lat, lng, speedKmh) {
    const now = Date.now();
    // Interrogation OSRM au maximum une fois toutes les 6 secondes pour préserver le réseau
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

        // Détection référence routière (A6, RN20, D950, etc.)
        const refMatch = rawName.match(/\b([A|N|D]\s?\d{1,4}[A-Z]?)\b/i);
        const ref = refMatch ? refMatch[0].toUpperCase().replace(/\s+/g, '') : '';

        cachedRoad = {
          name: rawName || ref || 'Route en cours',
          ref: ref
        };
        state.setRoad(cachedRoad);
      }
    } catch (e) {
      // Échec silencieux (pas de réseau)
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
        }, 3000); // Confirmation de 3s à plus de 25 km/h
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

      // Filtre catégorie désactivée
      const cat = r.category || 'fixe';
      if (state.settings.filterTypes[cat] === false) continue;

      // Filtre couloir de trajectoire (angle avant)
      if (!isRadarAhead(r, pos, pos.heading, pos.speed)) continue;

      // Filtre compatibilité de route
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
