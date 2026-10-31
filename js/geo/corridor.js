/**
 * Fou du Volant - Corridor & Trajectory Filter
 * Filtre les radars pour n'alerter que ceux situés sur la trajectoire directe
 * Évite les fausses alertes pour les radars situés sur la voie opposée ou rues parallèles
 */

import { calculateBearing } from './spatial-index.js';

const FRONT_ANGLE_MAX = 55; // Angle de détection devant le cap du véhicule (+/- 55°)

export function isRadarAhead(radar, userPos, heading, speedKmh) {
  // À très basse vitesse (< 15 km/h) ou cap inconnu, détection omnidirectionnelle de proximité
  if (speedKmh < 15 || heading === null || isNaN(heading)) {
    return true;
  }

  const radarBearing = calculateBearing(userPos.lat, userPos.lng, radar.lat, radar.lng);

  let angleDiff = Math.abs(radarBearing - heading);
  if (angleDiff > 180) {
    angleDiff = 360 - angleDiff;
  }

  // Si le radar est en dehors du cône avant, on l'ignore
  return angleDiff <= FRONT_ANGLE_MAX;
}

export function normalizeRoadName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^(AUTOROUTE|ROUTE|NATIONALE|DEPARTEMENTALE)/i, '')
    .trim();
}

export function isSameRoadOrCompatible(radarRoad, currentRoad) {
  if (!radarRoad || !currentRoad || !currentRoad.ref) return true;

  const normRadar = normalizeRoadName(radarRoad);
  const normCurrent = normalizeRoadName(currentRoad.ref);

  if (!normRadar || !normCurrent) return true;

  return normRadar.includes(normCurrent) || normCurrent.includes(normRadar);
}
