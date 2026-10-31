/**
 * Fou du Volant - Application Boot & Orchestrator
 */

import { state } from './core/state.js';
import { radarService } from './data/radar-service.js';
import { tracker } from './geo/tracker.js';
import { soundEngine } from './audio/sound.js';
import { MapView } from './ui/map-view.js';
import { CockpitHUD } from './ui/hud.js';
import { ModalsController } from './ui/modals.js';

class App {
  async init() {
    console.log('🚀 Initialisation de Fou du Volant v3.0...');

    // 1. Initialiser les contrôleurs d'interface
    this.mapView = new MapView();
    this.hud = new CockpitHUD();
    this.modals = new ModalsController();

    // 2. Charger les données et l'index spatial
    await radarService.init();

    // 3. Démarrer le suivi GPS
    tracker.start();

    // 4. Enregistrement du Service Worker PWA
    this.registerServiceWorker();

    // 5. Déblocage du contexte audio et du GPS au premier geste utilisateur
    const unlockUserGesture = () => {
      soundEngine.initVoice();
      if (!tracker.isActive || !state.runtime.userPos) {
        tracker.start();
      }
      document.removeEventListener('click', unlockUserGesture);
      document.removeEventListener('touchstart', unlockUserGesture);
    };
    document.addEventListener('click', unlockUserGesture, { once: true });
    document.addEventListener('touchstart', unlockUserGesture, { once: true });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').then((reg) => {
          reg.update();
        }).catch((err) => {
          console.warn('Erreur Service Worker :', err);
        });
      });
    }
  }
}

// Lancement automatique au chargement du DOM
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
