/**
 * Fou du Volant - Application Boot & Orchestrator
 */

import { ChantiersView } from './ui/chantiers.js';
import { MobileExperience } from './ui/mobile.js';
import { radarService } from './data/radar-service.js';
import { MapView } from './ui/map-view.js';
import { CockpitHUD } from './ui/hud.js';
import { ModalsController } from './ui/modals.js';

class App {
  async init() {
    console.log('🚀 Initialisation de Fou du Volant v4.0...');

    // 1. Initialiser les contrôleurs d'interface
    this.mapView = new MapView();
    this.hud = new CockpitHUD();
    this.modals = new ModalsController();

    this.mobile = new MobileExperience();
    this.chantiers = new ChantiersView();
    this.registerServiceWorker();

    // 2. Charger les données et l'index spatial
    await radarService.init();

  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => {
        console.warn('Service Worker indisponible :', err);
      });
    }
  }
}

// Lancement automatique au chargement du DOM
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
