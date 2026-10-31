/**
 * Fou du Volant - Modals & Dialog Controllers
 * Utilise les éléments <dialog> natifs (Modern Web Guidance)
 */

import { state } from '../core/state.js';
import { storage } from '../core/storage.js';
import { parseLufopFile } from '../data/lufop-parser.js';
import { spatialIndex } from '../geo/spatial-index.js';

export class ModalsController {
  constructor() {
    this.settingsDialog = document.getElementById('settingsDialog');
    this.reportDialog = document.getElementById('reportDialog');
    this.lufopDialog = document.getElementById('lufopDialog');

    this.initSettingsModal();
    this.initReportModal();
    this.initLufopModal();
    this.initLightDismiss();
  }

  initLightDismiss() {
    // Fermeture des <dialog> en cliquant sur le backdrop
    [this.settingsDialog, this.reportDialog, this.lufopDialog].forEach((dialog) => {
      if (!dialog) return;
      dialog.addEventListener('click', (e) => {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          dialog.close();
        }
      });
    });
  }

  initSettingsModal() {
    const btnOpen = document.getElementById('btnOpenSettings');
    const btnClose = document.getElementById('btnCloseSettings');
    if (btnOpen && this.settingsDialog) {
      btnOpen.addEventListener('click', () => {
        this.populateSettingsUI();
        this.settingsDialog.showModal();
      });
    }
    if (btnClose && this.settingsDialog) {
      btnClose.addEventListener('click', () => this.settingsDialog.close());
    }

    // Réglages inputs
    const distInput = document.getElementById('cfgDistance');
    const distVal = document.getElementById('cfgDistanceVal');
    const selTile = document.getElementById('cfgTileLayer');
    const swSound = document.getElementById('cfgSound');
    const swVoice = document.getElementById('cfgVoice');
    const swOverspeed = document.getElementById('cfgOverspeed');
    const swAutoHud = document.getElementById('cfgAutoHud');
    const btnClearCache = document.getElementById('btnClearCache');

    if (distInput) {
      distInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (distVal) distVal.textContent = `${val} m`;
        state.updateSettings({ distance: val });
      });
    }

    if (selTile) {
      selTile.addEventListener('change', (e) => {
        state.updateSettings({ mapTileLayer: e.target.value });
        window.dispatchEvent(new CustomEvent('tileLayerChanged', { detail: e.target.value }));
      });
    }

    if (swSound) {
      swSound.addEventListener('change', (e) => state.updateSettings({ sound: e.target.checked }));
    }
    if (swVoice) {
      swVoice.addEventListener('change', (e) => state.updateSettings({ voice: e.target.checked }));
    }
    if (swOverspeed) {
      swOverspeed.addEventListener('change', (e) => state.updateSettings({ overspeedAlert: e.target.checked }));
    }
    if (swAutoHud) {
      swAutoHud.addEventListener('change', (e) => state.updateSettings({ autoCarMode: e.target.checked }));
    }

    if (btnClearCache) {
      btnClearCache.addEventListener('click', async () => {
        if (confirm("Réinitialiser le cache local et recharger les données ?")) {
          await storage.clearAll();
          location.reload();
        }
      });
    }
  }

  populateSettingsUI() {
    const s = state.settings;
    const distInput = document.getElementById('cfgDistance');
    const distVal = document.getElementById('cfgDistanceVal');
    const selTile = document.getElementById('cfgTileLayer');
    const swSound = document.getElementById('cfgSound');
    const swVoice = document.getElementById('cfgVoice');
    const swOverspeed = document.getElementById('cfgOverspeed');
    const swAutoHud = document.getElementById('cfgAutoHud');
    const statTotal = document.getElementById('statTotalRadars');

    if (distInput) distInput.value = s.distance;
    if (distVal) distVal.textContent = `${s.distance} m`;
    if (selTile) selTile.value = s.mapTileLayer || 'dark';
    if (swSound) swSound.checked = s.sound;
    if (swVoice) swVoice.checked = s.voice;
    if (swOverspeed) swOverspeed.checked = s.overspeedAlert;
    if (swAutoHud) swAutoHud.checked = s.autoCarMode;
    if (statTotal) statTotal.textContent = `${state.runtime.totalRadars} radars`;
  }

  initReportModal() {
    const btnClose = document.getElementById('btnCloseReport');
    if (btnClose && this.reportDialog) {
      btnClose.addEventListener('click', () => this.reportDialog.close());
    }

    const reportButtons = document.querySelectorAll('.report-option-btn');
    reportButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reportType = btn.dataset.type;
        const pos = state.runtime.userPos;
        if (!pos) {
          alert("Position GPS non disponible pour le signalement.");
          return;
        }

        const report = {
          id: `community_${Date.now()}`,
          lat: pos.lat,
          lng: pos.lng,
          type: this.getReportLabel(reportType),
          category: reportType === 'mobile' ? 'mobile' : 'chantier',
          icon: this.getReportIcon(reportType),
          route: state.runtime.currentRoad.ref || '',
          emplacement: state.runtime.currentRoad.name || 'Signalement communautaire',
          direction: '',
          vitesse: null,
          created_at: new Date().toISOString()
        };

        // Sauvegarde locale
        await storage.addCommunityRadar(report);
        state.runtime.radars.push(report);
        spatialIndex.build(state.runtime.radars);
        state.emit('radarsLoaded', state.runtime.radars);

        this.reportDialog.close();
        alert(`Merci ! Signalement "${report.type}" enregistré.`);
      });
    });
  }

  getReportLabel(type) {
    switch (type) {
      case 'mobile': return 'Radar mobile';
      case 'police': return 'Contrôle de police';
      case 'chantier': return 'Zone de travaux';
      case 'accident': return 'Accident / Danger';
      default: return 'Signalement';
    }
  }

  getReportIcon(type) {
    switch (type) {
      case 'mobile': return '🚓';
      case 'police': return '👮';
      case 'chantier': return '🚧';
      case 'accident': return '⚠️';
      default: return '🚨';
    }
  }

  initLufopModal() {
    const btnOpen = document.getElementById('btnOpenLufop');
    const btnClose = document.getElementById('btnCloseLufop');
    const dropzone = document.getElementById('lufopDropzone');
    const fileInput = document.getElementById('lufopFileInput');

    if (btnOpen && this.lufopDialog) {
      btnOpen.addEventListener('click', () => this.lufopDialog.showModal());
    }
    if (btnClose && this.lufopDialog) {
      btnClose.addEventListener('click', () => this.lufopDialog.close());
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          await this.handleLufopFiles(e.dataTransfer.files);
        }
      });

      fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
          await this.handleLufopFiles(e.target.files);
        }
      });
    }
  }

  async handleLufopFiles(files) {
    let totalImported = 0;
    for (const file of files) {
      const items = await parseLufopFile(file);
      if (items && items.length > 0) {
        totalImported += items.length;
        for (const item of items) {
          state.runtime.radars.push(item);
        }
      }
    }

    if (totalImported > 0) {
      spatialIndex.build(state.runtime.radars);
      state.emit('radarsLoaded', state.runtime.radars);
      alert(`Import réussi : ${totalImported} radars ajoutés à votre carte !`);
      if (this.lufopDialog) this.lufopDialog.close();
    } else {
      alert("Aucun radar détecté dans les fichiers fournis.");
    }
  }
}
