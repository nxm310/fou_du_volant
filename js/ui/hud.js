/**
 * Fou du Volant - Cockpit HUD Controller
 */

import { state } from '../core/state.js';
import { requestWakeLock, releaseWakeLock } from './wakelock.js';

export class CockpitHUD {
  constructor() {
    this.view = document.getElementById('cockpitView');
    this.speedEl = document.getElementById('hudSpeed');
    this.roadTextEl = document.getElementById('hudRoadText');
    this.signEl = document.getElementById('hudSpeedLimitSign');
    this.signNumEl = document.getElementById('hudSpeedLimitNum');
    this.gpsDotEl = document.getElementById('hudGpsDot');
    this.speedArc = document.getElementById('hudSpeedArc');
    this.tripStatus = document.getElementById('hudTripStatus');
    this.roadRef = document.getElementById('hudRoadRef');
    this.gpsAccEl = document.getElementById('hudGpsAccuracy');

    this.alertCard = document.getElementById('hudAlertCard');
    this.alertIcon = document.getElementById('hudAlertIcon');
    this.alertTitle = document.getElementById('hudAlertTitle');
    this.alertDist = document.getElementById('hudAlertDist');
    this.alertBar = document.getElementById('hudAlertBar');

    this.btnReport = document.getElementById('btnHudReport');
    this.btnExit = document.getElementById('btnExitHud');
    this.btnMute = document.getElementById('btnHudMute');

    this.initEvents();
  }

  initEvents() {
    // Écoute du store
    state.on('positionUpdated', (pos) => this.updatePosition(pos));
    state.on('gpsStatusChanged', (status) => this.updateGpsStatus(status));
    state.on('roadSpeedLimitUpdated', (limit) => this.updateRoadLimit(limit));
    state.on('roadUpdated', (road) => this.updateRoad(road));
    state.on('alertsUpdated', ({ alerts, nearest }) => this.updateAlert(nearest));
    state.on('overspeedChanged', (isOver) => this.updateOverspeed(isOver));
    state.on('carModeChanged', (isActive) => this.handleModeChange(isActive));

    document.getElementById('btnPreviewDrive').addEventListener('click', () => {
      document.getElementById('settingsDialog').close();
      state.toggleCarMode(true);
    });

    // Boutons du HUD
    if (this.btnExit) {
      this.btnExit.addEventListener('click', () => state.toggleCarMode(false));
    }

    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        state.runtime.isMuted = !state.runtime.isMuted;
        this.btnMute.setAttribute('aria-pressed', String(state.runtime.isMuted));
        this.btnMute.setAttribute('aria-label', state.runtime.isMuted ? 'Activer le son' : 'Couper le son');
      });
    }

    if (this.btnReport) {
      this.btnReport.addEventListener('click', () => {
        const dialog = document.getElementById('reportDialog');
        if (dialog && typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
      });
    }
  }

  updateGpsStatus(status) {
    this.view.dataset.gps = status.active ? 'active' : status.error ? 'error' : 'pending';
    this.tripStatus.textContent = status.active ? '' : status.message || 'En attente de votre position GPS';
    if (!status.active) {
      this.speedEl.textContent = '—';
      this.speedArc.setAttribute('stroke-dasharray', '0 100');
      this.roadTextEl.textContent = 'Voie non identifiée';
      this.roadRef.textContent = '';
      this.roadRef.hidden = true;
      this.updateRoadLimit(null);
      this.updateAlert(null);
    }
    this.gpsAccEl.textContent = status.active ? `Précision ±${state.runtime.gpsAccuracy || 0} m` : status.error === 'denied' ? 'GPS non autorisé' : 'GPS en attente';
    this.gpsDotEl.className = 'gps-dot' + (status.active ? ' active' : status.error ? ' error' : '');
  }

  handleModeChange(isActive) {
    if (isActive) {
      this.updateGpsStatus(state.runtime.gpsStatus);
      if (state.runtime.gpsStatus.active && state.runtime.userPos) {
        this.updatePosition(state.runtime.userPos);
        this.updateRoad(state.runtime.currentRoad);
        this.updateRoadLimit(state.runtime.roadSpeedLimit);
        this.updateAlert(state.runtime.nearestRadar);
      }
      this.view.classList.add('active');
      requestWakeLock();
    } else {
      this.view.classList.remove('active');
      releaseWakeLock();
    }
  }

  updatePosition(pos) {
    if (this.speedEl) {
      const speed = Number.isFinite(pos.speed) ? Math.max(0, pos.speed) : null;
      this.speedEl.textContent = speed === null ? '—' : Math.round(speed);
      this.speedArc.setAttribute('stroke-dasharray', `${speed === null ? 0 : Math.min(speed / 130, 1) * 75} 100`);
    }
    if (this.gpsDotEl) {
      this.gpsDotEl.classList.toggle('active', pos.accuracy <= 25);
    }
    if (this.gpsAccEl) {
      this.gpsAccEl.textContent = `Précision ±${pos.accuracy} m`;
    }
  }

  updateRoad(road) {
    if (this.roadTextEl) {
      this.roadTextEl.textContent = road.name || road.ref || 'Voie non identifiée';
      this.roadRef.textContent = road.ref || '';
      this.roadRef.hidden = !road.ref;
    }
  }

  updateRoadLimit(limit) {
    const known = Number.isInteger(limit) && limit > 0 && limit <= 130;
    this.signNumEl.textContent = known ? limit : '—';
    this.signEl.dataset.known = String(known);
    this.signEl.setAttribute('aria-label', known ? `Limite cartographiée de la voie : ${limit} km/h` : 'Limite de la voie indisponible');
  }

  updateAlert(nearest) {
    if (!nearest) {
      this.alertCard.className = 'cockpit-alert-card idle';
      this.alertIcon.textContent = '◇';
      this.alertTitle.textContent = state.runtime.gpsStatus.active ? 'Aucune alerte à proximité' : 'Position GPS nécessaire';
      this.alertDist.textContent = '—';
      this.alertBar.style.width = '0%';
      this.view.dataset.overspeed = 'false';
      return;
    }

    const r = nearest.radar;
    const dist = nearest.distance;
    const threshold = state.settings.distance;

    this.alertIcon.textContent = r.icon || '📷';
    this.alertTitle.textContent = (r.type || 'Radar') + (r.vitesse ? ` · limite au point ${r.vitesse} km/h` : '');
    this.alertDist.textContent = dist >= 1000 ? `${(dist / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(dist)} m`;

    // Calcul du pourcentage de progression (100% à distance max -> 0% à 0m)
    const pct = Math.max(0, Math.min(100, Math.round((dist / threshold) * 100)));
    this.alertBar.style.width = `${pct}%`;

    this.view.dataset.overspeed = String(state.runtime.isOverspeed);
    if (state.runtime.isOverspeed) {
      this.alertCard.className = 'cockpit-alert-card overspeed';
    } else {
      this.alertCard.className = 'cockpit-alert-card warning';
    }
  }

  updateOverspeed(isOver) {
    this.view.dataset.overspeed = String(isOver);
    if (state.runtime.nearestRadar) {
      if (isOver) {
        this.alertCard.className = 'cockpit-alert-card overspeed';
      } else {
        this.alertCard.className = 'cockpit-alert-card warning';
      }
    }
  }
}
