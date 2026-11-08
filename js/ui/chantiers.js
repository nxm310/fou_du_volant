import { chantierService } from '../data/chantier-service.js';
import { state } from '../core/state.js';
export class ChantiersView {
  constructor() {
    this.list = document.getElementById('chantiersList');
    this.retry = document.getElementById('btnRetryChantiers');
    document.getElementById('btnOpenChantiers').addEventListener('click', () => {
      document.getElementById('chantiersDialog').showModal();
      this.updateCount();
      if (!this.loaded) this.load();
    });
    this.retry.onclick = () => this.load();
    window.addEventListener('chantierSourcesUpdated', () => { if (this.loaded) { this.loaded = false; this.load(); } });
    state.on('radarsLoaded', () => this.updateCount());
    this.updateCount();
  }
  updateCount() {
    const count = state.runtime.radars.filter(r => r.category === 'chantier').length;
    document.getElementById('chantiersMapCount').textContent = `${count} point${count === 1 ? '' : 's'} de chantier avec coordonnées dans la base et les signalements locaux. Les fiches sans coordonnées ne déclenchent pas d’alerte GPS.`;
    document.getElementById('btnShowMappedChantiers').disabled = count === 0;
  }
  async load() {
    if (this.loading) return;
    this.loading = true;
    this.retry.hidden = true;
    this.list.textContent = 'Chargement des fiches…';
    try {
      const payload = await chantierService.load();
      if (!Array.isArray(payload.records)) throw new Error('invalid');
      this.list.replaceChildren();
      for (const record of payload.records) {
        const article = document.createElement('article'); article.className = 'chantier-card';
        const title = document.createElement('h3'); title.textContent = `${record.route} · ${record.commune} (${record.departement})`;
        const date = value => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR');
        const dates = document.createElement('p'); dates.textContent = `Installation annoncée : ${date(record.installation_date)}. Source consultée le ${date(record.source_consulted_on)}.`;
        const status = document.createElement('p'); status.className = 'chantier-status'; status.textContent = 'Présence actuelle non confirmée · coordonnées non disponibles';
        const link = document.createElement('a'); const url = new URL(record.source_url);
        if (url.protocol !== 'https:') throw new Error('invalid source');
        link.href = url.href; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `Voir la fiche ${record.source_name} ↗`;
        article.append(title, dates, status, link); this.list.append(article);
      }
      if (!payload.records.length) this.list.textContent = 'Aucune fiche disponible.';
      this.loaded = true;
    } catch {
      this.list.textContent = 'Les fiches sont indisponibles. Connectez-vous puis réessayez.';
      this.retry.hidden = false;
    } finally { this.loading = false; }
  }
}
