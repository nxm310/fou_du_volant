/**
 * Fou du Volant - Leaflet Map View & Virtualized Markers
 */

import { state } from '../core/state.js';

let map = null;
let markerLayer = null;
let userMarker = null;
let isUserInteracting = false;
let activeCategoryFilter = 'all';

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

    // Fond de carte sombre CartoDB Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    map.on('movestart', () => { isUserInteracting = true; });
    map.on('moveend', () => {
      this.renderVisibleMarkers();
    });
  }

  initEvents() {
    state.on('positionUpdated', (pos) => this.handlePosition(pos));
    state.on('alertsUpdated', ({ alerts, nearest }) => this.handleAlert(nearest));
    state.on('radarsLoaded', () => this.renderVisibleMarkers());

    const btnRecenter = document.getElementById('btnRecenter');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', () => {
        isUserInteracting = false;
        if (state.runtime.userPos && map) {
          map.setView([state.runtime.userPos.lat, state.runtime.userPos.lng], 15, { animate: true });
        }
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

  renderVisibleMarkers() {
    if (!map || !markerLayer || !state.runtime.radars.length) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    markerLayer.clearLayers();

    // Au zoom faible, limiter l'affichage pour fluidité
    const maxMarkers = zoom > 12 ? 300 : 80;
    let count = 0;

    for (const r of state.runtime.radars) {
      if (activeCategoryFilter !== 'all' && (r.category || 'fixe') !== activeCategoryFilter) {
        continue;
      }

      if (bounds.contains([r.lat, r.lng])) {
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
          <div style="font-family:sans-serif; min-width:180px;">
            <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${r.icon || '📷'} ${r.type}</div>
            ${r.vitesse ? `<div style="color:#d91c1c; font-weight:800; font-size:16px;">Limitation : ${r.vitesse} km/h</div>` : ''}
            ${r.route ? `<div style="font-size:12px; color:#555;">Voie : ${r.route}</div>` : ''}
            ${r.emplacement ? `<div style="font-size:12px; color:#555;">Commune : ${r.emplacement}</div>` : ''}
          </div>
        `);

        markerLayer.addLayer(m);
        count++;
        if (count >= maxMarkers) break;
      }
    }
  }
}
