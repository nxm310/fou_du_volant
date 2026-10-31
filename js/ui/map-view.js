/**
 * Fou du Volant - Leaflet Map View & Virtualized Markers
 */

import { state } from '../core/state.js';

let map = null;
let currentTileLayer = null;
let markerLayer = null;
let corridorLayer = null;
let userMarker = null;
let isUserInteracting = false;
let activeCategoryFilter = 'all';

export const TILE_PROVIDERS = {
  google_traffic: {
    name: 'Google Maps Trafic Direct',
    icon: '🚦',
    url: 'https://mt{s}.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}',
    options: { maxZoom: 20, subdomains: ['0', '1', '2', '3'] }
  },
  google_hybrid: {
    name: 'Google Maps Satellite HD',
    icon: '🛰️',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    options: { maxZoom: 20, subdomains: ['0', '1', '2', '3'] }
  },
  google_roads: {
    name: 'Google Maps Routier',
    icon: '🛣️',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    options: { maxZoom: 20, subdomains: ['0', '1', '2', '3'] }
  },
  dark_esri: {
    name: 'Sombre Nuit Épuré (Esri Dark)',
    icon: '🌙',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 16 }
  },
  osmfr: {
    name: 'OpenStreetMap France',
    icon: '🇫🇷',
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    options: { maxZoom: 20 }
  }
};

const CATEGORY_COLORS = {
  fixe: '#3a86ff',
  tourelle: '#8338ec',
  feu: '#ff006e',
  discriminant: '#fb5607',
  troncon: '#ffbe0b',
  passage: '#06d6a0',
  chantier: '#ff9e00',
  urbain: '#00b4d8',
  leurre: '#a0aab2',
  mobile: '#e63946'
};

export class MapView {
  constructor() {
    this.mapContainer = document.getElementById('mapContainer');
    this.gpsTextEl = document.getElementById('mapGpsText');
    this.gpsDotEl = document.getElementById('mapGpsDot');
    this.alertBanner = document.getElementById('mapAlertBanner');
    this.alertTitle = document.getElementById('mapAlertTitle');
    this.alertDist = document.getElementById('mapAlertDist');

    this.initMap();
    this.initEvents();
  }

  initMap() {
    if (typeof L === 'undefined') return;

    // Initialisation centrée sur la France
    map = L.map('mapContainer', {
      zoomControl: false,
      attributionControl: false
    }).setView([46.603354, 1.888334], 6);

    // Chargement du fond de carte initial (Google Maps Trafic par défaut)
    this.setTileLayer(state.settings.mapTileLayer || 'google_traffic');

    // Calques séparés pour les corridors (polylignes) et les marqueurs
    corridorLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);

    map.on('movestart', () => { isUserInteracting = true; });
    map.on('moveend', () => {
      this.renderVisibleMarkers();
    });
  }

  setTileLayer(providerKey) {
    if (!map) return;
    const provider = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS.google_traffic;

    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }

    currentTileLayer = L.tileLayer(provider.url, provider.options).addTo(map);
    state.updateSettings({ mapTileLayer: providerKey });
  }

  initEvents() {
    state.on('positionUpdated', (pos) => this.handlePosition(pos));
    state.on('alertsUpdated', ({ alerts, nearest }) => this.handleAlert(nearest));
    state.on('radarsLoaded', () => this.renderVisibleMarkers());

    window.addEventListener('tileLayerChanged', (e) => {
      this.setTileLayer(e.detail);
      const btnTile = document.getElementById('btnToggleTile');
      if (btnTile && TILE_PROVIDERS[e.detail]) {
        btnTile.textContent = TILE_PROVIDERS[e.detail].icon || '🗺️';
        btnTile.title = `Fond : ${TILE_PROVIDERS[e.detail].name}`;
      }
    });

    const btnRecenter = document.getElementById('btnRecenter');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', () => {
        isUserInteracting = false;
        if (state.runtime.userPos && map) {
          map.setView([state.runtime.userPos.lat, state.runtime.userPos.lng], 15, { animate: true });
        }
      });
    }

    const btnTile = document.getElementById('btnToggleTile');
    if (btnTile) {
      btnTile.addEventListener('click', () => {
        const keys = Object.keys(TILE_PROVIDERS);
        const current = state.settings.mapTileLayer || 'google_traffic';
        const nextIdx = (keys.indexOf(current) + 1) % keys.length;
        const nextKey = keys[nextIdx];
        this.setTileLayer(nextKey);

        const provider = TILE_PROVIDERS[nextKey];
        btnTile.textContent = provider.icon || '🗺️';
        btnTile.title = `Fond : ${provider.name}`;
      });
    }

    const btnToHud = document.getElementById('btnSwitchToHud');
    if (btnToHud) {
      btnToHud.addEventListener('click', () => state.toggleCarMode(true));
    }

    // Gestion des puces de filtres
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        activeCategoryFilter = chip.dataset.category || 'all';

        if (activeCategoryFilter === 'chantier' && map) {
          // Si on filtre par chantiers et qu'aucun n'est visible dans le zoom actuel, recadrer
          const bounds = map.getBounds();
          const visible = state.runtime.radars.filter(r => r.category === 'chantier' && bounds.contains([r.lat, r.lng]));
          if (visible.length === 0 && map.getZoom() > 8) {
            map.setView([46.603354, 1.888334], 6, { animate: true });
          }
        }

        this.renderVisibleMarkers();
      });
    });
  }

  handlePosition(pos) {
    if (this.gpsTextEl) {
      this.gpsTextEl.textContent = `${pos.speed} km/h • ±${pos.accuracy}m`;
    }
    if (this.gpsDotEl) {
      this.gpsDotEl.classList.toggle('active', pos.accuracy <= 25);
    }

    if (!map) return;

    // Mise à jour du marqueur utilisateur
    const latLng = [pos.lat, pos.lng];
    if (!userMarker) {
      const userIcon = L.divIcon({
        className: 'user-marker-icon',
        html: `
          <div class="user-marker-container">
            <div class="user-marker-pulse"></div>
            <div class="user-marker-center"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      userMarker = L.marker(latLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      map.setView(latLng, 15);
    } else {
      userMarker.setLatLng(latLng);
      if (!isUserInteracting) {
        map.setView(latLng, map.getZoom(), { animate: true, pan: { duration: 0.8 } });
      }
    }
  }

  handleAlert(nearest) {
    if (!this.alertBanner) return;

    if (!nearest) {
      this.alertBanner.classList.remove('show');
      return;
    }

    const r = nearest.radar;
    const dist = nearest.distance;

    this.alertTitle.textContent = `${r.icon || '📷'} ${r.type || 'Radar'}${r.vitesse ? ' (' + r.vitesse + ')' : ''}`;
    this.alertDist.textContent = `${dist} m`;

    this.alertBanner.className = 'map-alert-banner show';
    if (state.runtime.isOverspeed) {
      this.alertBanner.classList.add('overspeed');
    } else {
      this.alertBanner.classList.add('warning');
    }
  }

  renderChantierMarker(r, drawCorridor = true) {
    if (!markerLayer) return;

    // Tracé de la zone de chantier / itinéraire sécurisé
    if (drawCorridor && corridorLayer && r.geo_points && r.geo_points.length > 1) {
      const poly = L.polyline(r.geo_points, {
        color: '#f59e0b',
        weight: 4,
        opacity: 0.85,
        dashArray: '6, 8',
        lineCap: 'round'
      });
      poly.bindTooltip(`🚧 Zone ${r.route || ''} (${r.longueur_troncon_km ? r.longueur_troncon_km + ' km' : r.dep || ''})`, { sticky: true });
      corridorLayer.addLayer(poly);
    }

    const iconHtml = `
      <div class="radar-custom-marker chantier-marker" style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); width:30px; height:30px; border-color:#ffffff; box-shadow:0 0 10px rgba(245, 158, 11, 0.65);">
        <span style="font-size:16px;">🚧</span>
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: iconHtml,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const m = L.marker([r.lat, r.lng], { icon: icon, zIndexOffset: 50 });
    m.bindPopup(`
      <div style="font-family:system-ui, -apple-system, sans-serif; min-width:220px; color:#1a1a1a;">
        <div style="font-weight:800; font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:6px; color:#b45309;">
          <span>🚧</span>
          <span>${r.type}</span>
        </div>
        ${r.route ? `<div style="font-size:12px; color:#111; margin-bottom:3px;"><strong>Voies surveillées :</strong> ${r.route}</div>` : ''}
        ${r.emplacement ? `<div style="font-size:12px; color:#444; margin-bottom:3px;">${r.emplacement}</div>` : ''}
        ${r.longueur_troncon_km ? `<div style="font-size:12px; color:#d97706; font-weight:700; margin-bottom:3px;">Longueur de zone : ${r.longueur_troncon_km} km</div>` : ''}
        ${r.direction ? `<div style="font-size:11px; color:#666;">Sens : ${r.direction}</div>` : ''}
        ${r.equipement ? `<div style="font-size:11px; color:#888; margin-top:2px;">Dispositif : ${r.equipement}</div>` : ''}
      </div>
    `);

    markerLayer.addLayer(m);
  }

  renderStandardMarker(r) {
    if (!markerLayer) return;
    const cat = r.category || 'fixe';
    const color = CATEGORY_COLORS[cat] || '#3a86ff';

    const iconHtml = `
      <div class="radar-custom-marker" style="background:${color}; width:28px; height:28px;">
        <span>${r.icon || '📷'}</span>
        ${r.vitesse ? `<span class="radar-speed-tag">${r.vitesse}</span>` : ''}
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: iconHtml,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const m = L.marker([r.lat, r.lng], { icon: icon });
    m.bindPopup(`
      <div style="font-family:system-ui, -apple-system, sans-serif; min-width:200px; color:#1a1a1a;">
        <div style="font-weight:700; font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
          <span>${r.icon || '📷'}</span>
          <span>${r.type}</span>
        </div>
        ${r.vitesse ? `<div style="color:#d91c1c; font-weight:800; font-size:16px; margin-bottom:4px;">Limitation : ${r.vitesse} km/h</div>` : ''}
        ${r.route ? `<div style="font-size:12px; color:#333; margin-bottom:2px;"><strong>Voie :</strong> ${r.route}</div>` : ''}
        ${r.emplacement ? `<div style="font-size:12px; color:#555; margin-bottom:2px;">${r.emplacement}</div>` : ''}
        ${r.direction ? `<div style="font-size:11px; color:#666;">Contrôle : ${r.direction}</div>` : ''}
        ${r.equipement ? `<div style="font-size:11px; color:#888; margin-top:2px;">Dispositif : ${r.equipement}</div>` : ''}
      </div>
    `);

    markerLayer.addLayer(m);
  }

  renderVisibleMarkers() {
    if (!map || !markerLayer || !state.runtime.radars.length) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    markerLayer.clearLayers();
    if (corridorLayer) {
      corridorLayer.clearLayers();
    }

    // 1. Filtre spécifique "Chantiers" : afficher tous les chantiers dans la vue avec tracés
    if (activeCategoryFilter === 'chantier') {
      let chantierCount = 0;
      for (const r of state.runtime.radars) {
        if (r.category !== 'chantier') continue;
        if (bounds.contains([r.lat, r.lng])) {
          this.renderChantierMarker(r, true);
          chantierCount++;
          if (chantierCount >= 1000) break;
        }
      }
      return;
    }

    // 2. Autre filtre spécifique (ex: tourelles, fixes, feux)
    if (activeCategoryFilter !== 'all') {
      let count = 0;
      for (const r of state.runtime.radars) {
        if (r.category !== activeCategoryFilter) continue;
        if (bounds.contains([r.lat, r.lng])) {
          this.renderStandardMarker(r);
          count++;
          if (count >= 500) break;
        }
      }
      return;
    }

    // 3. Mode "Tous" : échantillonnage équitable entre toutes les catégories
    // Garantit que les chantiers (🚧), tourelles, feux et discriminants ne sont jamais masqués par les fixes
    const maxTotal = zoom > 12 ? 400 : 220;
    const quotas = {
      chantier: 70,
      mobile: 30,
      troncon: 30,
      feu: 40,
      tourelle: 40,
      discriminant: 40,
      passage: 20,
      urbain: 15,
      fixe: 80
    };
    const categoryCounts = {};
    let totalRendered = 0;

    for (const r of state.runtime.radars) {
      const cat = r.category || 'fixe';
      const quota = quotas[cat] || 30;
      const currentCatCount = categoryCounts[cat] || 0;

      if (currentCatCount >= quota) continue;

      if (bounds.contains([r.lat, r.lng])) {
        if (cat === 'chantier') {
          this.renderChantierMarker(r, zoom >= 9);
        } else {
          this.renderStandardMarker(r);
        }
        categoryCounts[cat] = currentCatCount + 1;
        totalRendered++;
        if (totalRendered >= maxTotal) break;
      }
    }
  }
}
