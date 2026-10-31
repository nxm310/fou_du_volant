/**
 * Fou du Volant - High-Performance Spatial Grid Index
 * Permet des recherches spatiales de radars en temps constant O(1)
 * Remplace la boucle naïve de 5 000 itérations par GPS tick
 */

const CELL_SIZE = 0.05; // ~5.5 km de côté

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Rayon de la Terre en mètres
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dLam = (lon2 - lon1) * toRad;

  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  const brng = Math.atan2(y, x) * toDeg;
  return (brng + 360) % 360;
}

export class SpatialIndex {
  constructor() {
    this.grid = new Map();
    this.radars = [];
  }

  build(radars) {
    this.grid.clear();
    this.radars = radars;

    for (let i = 0; i < radars.length; i++) {
      const r = radars[i];
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;

      const cellX = Math.floor(r.lat / CELL_SIZE);
      const cellY = Math.floor(r.lng / CELL_SIZE);
      const key = `${cellX}_${cellY}`;

      let cell = this.grid.get(key);
      if (!cell) {
        cell = [];
        this.grid.set(key, cell);
      }
      cell.push(r);
    }
  }

  /**
   * Trouve tous les radars dans un rayon donné (en mètres)
   * Ne visite que les cellules adjacentes à la position
   */
  queryRadius(lat, lng, radiusMeters) {
    if (!lat || !lng) return [];

    const cellRadius = Math.ceil((radiusMeters / 5500));
    const centerCellX = Math.floor(lat / CELL_SIZE);
    const centerCellY = Math.floor(lng / CELL_SIZE);

    const candidates = [];

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const key = `${centerCellX + dx}_${centerCellY + dy}`;
        const cell = this.grid.get(key);
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            candidates.push(cell[i]);
          }
        }
      }
    }

    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      const r = candidates[i];
      const dist = haversineMeters(lat, lng, r.lat, r.lng);
      if (dist <= radiusMeters) {
        results.push({
          radar: r,
          distance: Math.round(dist)
        });
      }
    }

    results.sort((a, b) => a.distance - b.distance);
    return results;
  }
}

export const spatialIndex = new SpatialIndex();
