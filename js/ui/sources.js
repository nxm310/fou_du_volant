import { state } from '../core/state.js';
import { radarService } from '../data/radar-service.js';
import { chantierService } from '../data/chantier-service.js';
export function formatSourceDate(value, withTime = false) {
  if (!value) return 'Non renseignée';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' });
}
export class SourcesView {
  constructor() {
    this.button = document.getElementById('btnRefreshSources');
    this.status = document.getElementById('sourcesRefreshStatus');
    this.button.onclick = () => this.refresh();
    state.on('metadataUpdated', () => this.render());
    window.addEventListener('chantierSourcesUpdated', () => this.render());
    chantierService.load().then(() => this.render()).catch(() => {
      document.getElementById('sourceChantierDate').textContent = 'Indisponible · réessayez l’actualisation';
    });
    this.render();
  }
  render() {
    const el = id => document.getElementById(id);
    const meta = state.runtime.metadata;
    el('sourceOfficialDate').textContent = meta.official_date || 'Non renseignée';
    el('sourcePreparedDate').textContent = formatSourceDate(meta.updated_at, true);
    el('sourceRadarDownloaded').textContent = meta.downloaded_at ? formatSourceDate(meta.downloaded_at, true) : 'Pas encore effectué avec ce bouton';
    el('sourceChantierDownloaded').textContent = chantierService.downloadedAt ? formatSourceDate(chantierService.downloadedAt, true) : 'Pas encore effectué avec ce bouton';
    const dates = [...new Set((chantierService.payload?.records || []).map(r => r.source_consulted_on).filter(Boolean))].sort();
    if (dates.length) el('sourceChantierDate').textContent = dates.map(date => formatSourceDate(date)).join(' · ');
  }
  async refresh() {
    if (this.button.disabled) return;
    this.button.disabled = true;
    this.button.textContent = 'Actualisation en cours…';
    this.status.textContent = 'Téléchargement de la base et des fiches publiées…';
    this.status.setAttribute('aria-busy', 'true');
    try {
      const results = await Promise.allSettled([radarService.refresh({ fresh: true }), chantierService.load({ fresh: true })]);
      const names = ['Base cartographique', 'Fiches de chantier'];
      this.status.textContent = results.map((result, index) => result.status === 'fulfilled'
        ? `${names[index]} : téléchargement réussi.`
        : `${names[index]} : échec, données précédentes conservées.`).join(' ') + ' Les dates des sources restent celles annoncées dans les fichiers.';
      this.render();
    } finally {
      this.button.disabled = false;
      this.button.textContent = 'Réactualiser les sources ↻';
      this.status.setAttribute('aria-busy', 'false');
    }
  }
}
