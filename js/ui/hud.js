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
    state.on('roadUpdated', (road) => this.updateRoad(road));
    state.on('alertsUpdated', ({ alerts, nearest }) => this.updateAlert(nearest));
    state.on('overspeedChanged', (isOver) => this.updateOverspeed(isOver));
    state.on('carModeChanged', (isActive) => this.handleModeChange(isActive));

    // Boutons du HUD
    if (this.btnExit) {
      this.btnExit.addEventListener('click', () => state.toggleCarMode(false));
    }

    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        state.runtime.isMuted = !state.runtime.isMuted;
        this.btnMute.textContent = state.runtime.isMuted ? '🔇' : '🔊';
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
    if (!status.active) this.speedEl.textContent = "—";
    if (this.gpsAccEl) {
      this.gpsAccEl.textContent = status.active ? `GPS ±${state.runtime.gpsAccuracy || 0}m` : (status.error ? 'ERR' : 'GPS');
    }
    if (this.gpsDotEl) {
      this.gpsDotEl.className = 'gps-dot' + (status.active ? ' active' : status.error ? ' error' : '');
    }
  }

  handleModeChange(isActive) {
    if (isActive) {
      this.view.classList.add('active');
      requestWakeLock();
    } else {
      this.view.classList.remove('active');
      releaseWakeLock();
    }
  }

  updatePosition(pos) {
    if (this.speedEl) {
      this.speedEl.textContent = pos.speed;
    }
    if (this.gpsDotEl) {
      this.gpsDotEl.classList.toggle('active', pos.accuracy <= 25);
    }
    if (this.gpsAccEl) {
      this.gpsAccEl.textContent = `GPS ±${pos.accuracy}m`;
    }
  }

  updateRoad(road) {
    if (this.roadTextEl) {
      this.roadTextEl.textContent = road.name || road.ref || 'En route';
    }
  }

  updateAlert(nearest) {
    if (!nearest) {
      this.alertCard.className = 'cockpit-alert-card idle';
      this.alertIcon.textContent = '🛡️';
      this.alertTitle.textContent = 'Aucun radar détecté';
      this.alertDist.textContent = '--';
      this.alertBar.style.width = '0%';
      this.signEl.classList.add('hidden');
      return;
    }

    const r = nearest.radar;
    const dist = nearest.distance;
    const threshold = state.settings.distance;

    this.alertIcon.textContent = r.icon || '📷';
    this.alertTitle.textContent = r.type || 'Radar';
    this.alertDist.textContent = `${dist} m`;

    // Calcul du pourcentage de progression (100% à distance max -> 0% à 0m)
    const pct = Math.max(0, Math.min(100, Math.round((dist / threshold) * 100)));
    this.alertBar.style.width = `${pct}%`;

    // Panneau de limitation de vitesse
    if (r.vitesse) {
      this.signNumEl.textContent = r.vitesse;
      this.signEl.classList.remove('hidden');
    } else {
      this.signEl.classList.add('hidden');
    }

    if (state.runtime.isOverspeed) {
      this.alertCard.className = 'cockpit-alert-card overspeed';
    } else {
      this.alertCard.className = 'cockpit-alert-card warning';
    }
  }

  updateOverspeed(isOver) {
    if (state.runtime.nearestRadar) {
      if (isOver) {
        this.alertCard.className = 'cockpit-alert-card overspeed';
      } else {
        this.alertCard.className = 'cockpit-alert-card warning';
      }
    }
  }
}
