/**
 * Fou du Volant - Modals & Dialog Controllers
 * Utilise les éléments <dialog> natifs (Modern Web Guidance)
 */

import { state } from '../core/state.js';
import { storage } from '../core/storage.js';
import { radarService } from '../data/radar-service.js';
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
    const btnTopDb = document.getElementById('btnTopDbInfo');
    const btnClose = document.getElementById('btnCloseSettings');
    if (btnOpen && this.settingsDialog) {
      btnOpen.addEventListener('click', () => {
        this.populateSettingsUI();
        this.settingsDialog.showModal();
      });
    }
    if (btnTopDb && this.settingsDialog) {
      btnTopDb.addEventListener('click', () => {
        this.populateSettingsUI();
        this.settingsDialog.showModal();
      });
    }
    if (btnClose && this.settingsDialog) {
      btnClose.addEventListener('click', () => this.settingsDialog.close());
    }

    state.on('radarsLoaded', () => this.updateTopbarBadge());
    state.on('metadataUpdated', () => this.updateTopbarBadge());

    // Réglages inputs
    const distInput = document.getElementById('cfgDistance');
    const distVal = document.getElementById('cfgDistanceVal');
    const selTile = document.getElementById('cfgTileLayer');
    const swSound = document.getElementById('cfgSound');
    const swVoice = document.getElementById('cfgVoice');
    const swOverspeed = document.getElementById('cfgOverspeed');
    const swAutoHud = document.getElementById('cfgAutoHud');
    const btnRefreshData = document.getElementById('btnRefreshData');
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

    if (btnRefreshData) {
      btnRefreshData.addEventListener('click', async () => {
        btnRefreshData.disabled = true;
        btnRefreshData.textContent = '⏳ En cours...';
        try {
          const meta = await radarService.refresh();
          this.populateSettingsUI();
          this.updateTopbarBadge();
          alert(`✅ Base de données actualisée avec succès !\n\n• ${state.runtime.totalRadars.toLocaleString('fr-FR')} points dans la base\n• Base officielle Sécurité Routière : ${meta.official_date || '11 juillet 2025'}\n• ${meta.chantier_count ?? 0} points de chantier localisés`);
        } catch (e) {
          alert(`Erreur lors de l'actualisation : ${e.message}`);
        } finally {
          btnRefreshData.disabled = false;
          btnRefreshData.textContent = '🔄 Actualiser';
        }
      });
    }

    if (btnClearCache) {
      btnClearCache.addEventListener('click', async () => {
        if (confirm("Réinitialiser le cache local et recharger toutes les données officielles ?")) {
          await storage.clearAll();
          location.reload();
        }
      });
    }
  }

  updateTopbarBadge() {
    const countEl = document.getElementById('topbarRadarCount');
    const dateEl = document.getElementById('topbarRadarDate');
    const meta = state.runtime.metadata;
    if (countEl && state.runtime.totalRadars) {
      countEl.textContent = state.runtime.totalRadars.toLocaleString('fr-FR');
    }
    if (dateEl && meta && meta.official_date) {
      dateEl.textContent = meta.official_date.replace('juillet', 'juil.').replace('septembre', 'sept.').replace('octobre', 'oct.');
    }
  }

  populateSettingsUI() {
    const s = state.settings;
    const meta = state.runtime.metadata || {};
    const distInput = document.getElementById('cfgDistance');
    const distVal = document.getElementById('cfgDistanceVal');
    const selTile = document.getElementById('cfgTileLayer');
    const swSound = document.getElementById('cfgSound');
    const swVoice = document.getElementById('cfgVoice');
    const swOverspeed = document.getElementById('cfgOverspeed');
    const swAutoHud = document.getElementById('cfgAutoHud');

    const statOfficial = document.getElementById('statOfficialDate');
    const statSync = document.getElementById('statSyncDate');
    const statChantier = document.getElementById('statChantierRadars');
    const statTotal = document.getElementById('statTotalRadars');

    if (distInput) distInput.value = s.distance;
    if (distVal) distVal.textContent = `${s.distance} m`;
    if (selTile) selTile.value = s.mapTileLayer || 'dark_esri';
    if (swSound) swSound.checked = s.sound;
    if (swVoice) swVoice.checked = s.voice;
    if (swOverspeed) swOverspeed.checked = s.overspeedAlert;
    if (swAutoHud) swAutoHud.checked = s.autoCarMode;

    if (statOfficial) statOfficial.textContent = `${meta.official_date || '11 juillet 2025'} (Sécurité Routière)`;
    if (statSync) {
      if (meta.updated_at) {
        try {
          const d = new Date(meta.updated_at);
          statSync.textContent = d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
        } catch {
          statSync.textContent = meta.updated_at;
        }
      } else {
        statSync.textContent = 'Synchronisé';
      }
    }
    const chantierCount = meta.chantier_count ?? (meta.stats && meta.stats['Radar autonome / chantier']) ?? 0;
    if (statChantier) statChantier.textContent = `${chantierCount} points localisés · présence non confirmée`;
    if (statTotal) statTotal.textContent = `${state.runtime.totalRadars.toLocaleString('fr-FR')} points dans la base`;
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
        state.runtime.totalRadars = state.runtime.radars.length;
        spatialIndex.build(state.runtime.radars);
        state.emit('radarsLoaded', state.runtime.radars);

        this.reportDialog.close();
        alert(`Enregistré sur cet appareil uniquement. Signalement "${report.type}" enregistré.`);
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
      state.runtime.totalRadars = state.runtime.radars.length;
      spatialIndex.build(state.runtime.radars);
      state.emit('radarsLoaded', state.runtime.radars);
      alert(`Import réussi : ${totalImported} radars ajoutés à votre carte !`);
      if (this.lufopDialog) this.lufopDialog.close();
    } else {
      alert("Aucun radar détecté dans les fichiers fournis.");
    }
  }
}
