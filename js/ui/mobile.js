import { state } from '../core/state.js';
import { tracker } from '../geo/tracker.js';
import { soundEngine } from '../audio/sound.js';
export class MobileExperience {
  constructor() {
    const el = id => document.getElementById(id);
    const open = id => el(id).showModal();
    el('btnInstall').onclick = () => open('installDialog');
    if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) el('btnInstall').hidden = true;
    el('navSources').onclick = () => open('sourcesDialog');
    el('navSettings').onclick = () => el('btnOpenSettings').click();
    el('navMap').onclick = () => state.toggleCarMode(false);
    const start = () => {
      soundEngine.unlock();
      tracker.start();
      state.toggleCarMode(true);
    };
    el('navDrive').onclick = start;
    el('btnStartDrive').onclick = start;
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => el(b.dataset.close).close());
    document.querySelectorAll('.filter-chip[data-category]').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active')));
    state.on('carModeChanged', active => {
      document.querySelector('.journey-sheet').inert = active;
      document.querySelector('.bottom-nav').inert = active;
      document.querySelector('.map-topbar').inert = active;
      document.querySelector('.brand-bar').inert = active;
      el(active ? 'btnExitHud' : 'btnStartDrive').focus();
    });
    state.on('positionUpdated', pos => {
      el('journeySpeed').textContent = pos.speed;
      el('journeyTitle').textContent = 'Prêt pour la route.';
      el('journeyDescription').textContent = `Position acquise · précision ±${pos.accuracy} m`;
    });
    state.on('gpsStatusChanged', status => {
      el('journeyNote').textContent = status.error ? status.message : 'Préparez votre trajet à l’arrêt.';
      if (!status.active) el('journeySpeed').textContent = '—';
    });
    state.on('radarsLoaded', list => {
      el('journeyCount').textContent = list.length.toLocaleString('fr-FR');
      el('journeyDataStatus').textContent = 'Base enregistrée';
    });
    state.on('dataError', message => {
      el('journeyDataStatus').textContent = 'Base indisponible';
      el('journeyNote').textContent = message;
    });
    const network = () => {
      el('journeyNetwork').textContent = navigator.onLine ? 'En ligne' : 'Hors ligne';
      if (!navigator.onLine) el('journeyNote').textContent = 'Base locale disponible si déjà chargée. Carte en ligne.';
    };
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    network();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.resumeTracking = tracker.isActive;
        tracker.stop();
        window.speechSynthesis?.cancel();
      } else if (this.resumeTracking) {
        tracker.start();
        this.resumeTracking = false;
      }
    });
  }
}
