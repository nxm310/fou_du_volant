/**
 * Fou du Volant - Leaflet Map View & Virtualized Markers
 */

import { state } from '../core/state.js';
import { tracker } from '../geo/tracker.js';

let map = null;
let currentTileLayer = null;
let markerLayer = null;
let corridorLayer = null;
let userMarker = null;
let isUserInteracting = false;
let activeCategoryFilter = 'all';

export const TILE_PROVIDERS = {
  dark_esri: {
    name: 'Sombre Nuit Épuré (Esri Dark)',
    icon: '🌙',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 16, attribution: 'Tiles &copy; Esri — Esri, DeLorme, NAVTEQ' }
  },
  osm: {
    name: 'OpenStreetMap', icon: '◫',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
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

function safeRadar(r) {
  return Object.fromEntries(Object.entries(r).map(([key, value]) => [key, typeof value === 'string' ? value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])) : value]));
}

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
      attributionControl: true
    }).setView([46.603354, 1.888334], 6);

    // Chargement du fond de carte initial (Google Maps Trafic par défaut)
    this.setTileLayer(state.settings.mapTileLayer || 'dark_esri');

    // Calques séparés pour les corridors (polylignes) et les marqueurs
    corridorLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);

    map.on('dragstart', () => { isUserInteracting = true; });
    state.on('carModeChanged', () => setTimeout(() => map.invalidateSize(), 100));
    map.on('moveend', () => {
      this.renderVisibleMarkers();
    });
  }

  setTileLayer(providerKey) {
    if (!map) return;
    const provider = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS.dark_esri;

    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }

    currentTileLayer = L.tileLayer(provider.url, provider.options).addTo(map);
    state.updateSettings({ mapTileLayer: providerKey });
  }

  initEvents() {
    state.on('positionUpdated', (pos) => this.handlePosition(pos));
    state.on('gpsStatusChanged', (status) => this.handleGpsStatus(status));
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

    const gpsPill = document.getElementById('mapGpsPill');
    if (gpsPill) {
      gpsPill.style.cursor = 'pointer';
      gpsPill.addEventListener('click', () => {
        if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
          this.showInsecureModal();
          return;
        }
        tracker.requestPosition();
      });
    }

    const btnRecenter = document.getElementById('btnRecenter');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', () => {
        isUserInteracting = false;
        if (state.runtime.userPos && map) {
          map.setView([state.runtime.userPos.lat, state.runtime.userPos.lng], 15, { animate: true });
        } else {
          tracker.requestPosition();
        }
      });
    }

    const btnTile = document.getElementById('btnToggleTile');
    if (btnTile) {
      btnTile.addEventListener('click', () => {
        const keys = Object.keys(TILE_PROVIDERS);
        const current = state.settings.mapTileLayer || 'dark_esri';
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

    document.getElementById('btnShowMappedChantiers').addEventListener('click', () => {
      document.getElementById('chantiersDialog').close();
      activeCategoryFilter = 'chantier';
      document.querySelectorAll('.filter-chip[data-category]').forEach(c => {
        c.classList.remove('active'); c.setAttribute('aria-pressed', 'false');
      });
      document.getElementById('btnOpenChantiers').classList.add('active');
      const points = state.runtime.radars.filter(r => r.category === 'chantier');
      if (map && points.length) map.fitBounds(L.latLngBounds(points.map(r => [r.lat, r.lng])), { maxZoom: 12, padding: [60, 60] });
      this.renderVisibleMarkers();
    });
    // Gestion des puces de filtres
    const chips = document.querySelectorAll('.filter-chip[data-category]');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        document.getElementById('btnOpenChantiers').classList.remove('active');
        chips.forEach((c) => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
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

  handleGpsStatus(status) {
    if (this.gpsTextEl) {
      this.gpsTextEl.textContent = status.message;
    }
    if (this.gpsDotEl) {
      this.gpsDotEl.className = 'gps-status-indicator' +
        (status.active ? ' active' : status.error ? ' error' : '');
    }
    if (status.error === 'insecure') {
      this.showInsecureModal();
    }
  }

  showInsecureModal() {
    if (document.getElementById('insecureNotice')) return;

    const notice = document.createElement('div');
    notice.id = 'insecureNotice';
    notice.className = 'insecure-notice-banner';
    notice.innerHTML = `
      <div class="insecure-notice-content">
        <div class="insecure-notice-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:20px;">🔒</span>
            <span>HTTPS requis pour le GPS mobile</span>
          </div>
          <button class="btn-close-notice" id="btnCloseInsecure" aria-label="Fermer">✕</button>
        </div>
        <p style="font-size:12px; margin:8px 0 12px; color:#cccccc; line-height:1.4;">
          iOS Safari et Android Chrome interdisent la géolocalisation en HTTP non sécurisé (<em>${location.host}</em>). Pour activer le GPS en temps réel, ouvrez la version sécurisée :
        </p>
        <a href="https://nxm310.github.io/fou_du_volant/" class="btn-notice-action">
          👉 Basculer sur la version HTTPS (GitHub Pages)
        </a>
      </div>
    `;
    document.body.appendChild(notice);

    document.getElementById('btnCloseInsecure')?.addEventListener('click', () => {
      notice.remove();
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

    r = safeRadar(r);
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
        ${r.entity_kind === 'itinerary' ? '<p style="font-size:12px;margin-top:8px">Itinéraire de contrôle, pas un appareil localisé. Présence non confirmée.</p>' : ''}
        ${r.source_url?.startsWith('https://') ? `<a href="${r.source_url}" target="_blank" rel="noopener" style="font-size:12px">Consulter la source</a>` : ''}
      </div>
    `);

    markerLayer.addLayer(m);
  }

  renderStandardMarker(r) {
    if (!markerLayer) return;
    r = safeRadar(r);
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
        ${r.entity_kind === 'itinerary' ? '<p style="font-size:12px;margin-top:8px">Itinéraire de contrôle, pas un appareil localisé. Présence non confirmée.</p>' : ''}
        ${r.source_url?.startsWith('https://') ? `<a href="${r.source_url}" target="_blank" rel="noopener" style="font-size:12px">Consulter la source</a>` : ''}
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

    // Aggregate at overview zooms instead of hiding points behind category quotas.
    if (zoom < 10) {
      const cells = new Map();
      for (const radar of state.runtime.radars) {
        if (activeCategoryFilter !== 'all' && radar.category !== activeCategoryFilter) continue;
        if (!bounds.contains([radar.lat, radar.lng])) continue;
        const point = map.project([radar.lat, radar.lng], zoom);
        const key = `${Math.floor(point.x / 56)}:${Math.floor(point.y / 56)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(radar);
      }
      for (const group of cells.values()) {
        if (group.length === 1) { this.renderStandardMarker(group[0]); continue; }
        const lat = group.reduce((sum, r) => sum + r.lat, 0) / group.length;
        const lng = group.reduce((sum, r) => sum + r.lng, 0) / group.length;
        const icon = L.divIcon({ className: 'radar-cluster', html: `<span>${group.length}</span>`, iconSize: [38,38], iconAnchor: [19,19] });
        const marker = L.marker([lat, lng], {icon, title: `${group.length} points · agrandir`});
        marker.on('click', () => map.setView([lat,lng], Math.min(zoom + 2, 16)));
        markerLayer.addLayer(marker);
      }
      return;
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
