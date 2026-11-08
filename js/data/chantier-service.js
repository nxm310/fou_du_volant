export class ChantierService {
  constructor() {
    this.payload = null;
    try { this.downloadedAt = localStorage.getItem('fdv_chantiers_downloaded_at'); } catch { this.downloadedAt = null; }
  }
  async load({ fresh = false } = {}) {
    if (this.payload && !fresh) return this.payload;
    const response = await fetch(`./data/sourced_chantiers.json${fresh ? '?fdv_refresh=1' : ''}`, {
      cache: fresh ? 'no-store' : 'default', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Fiches de chantier inaccessibles ; les fiches déjà téléchargées sont conservées.');
    const payload = await response.json();
    if (!Array.isArray(payload.records) || payload.records.some(r => !r.id || !r.installation_date || !r.source_consulted_on || !r.source_url?.startsWith('https://'))) throw new Error('Fiches de chantier invalides ; données précédentes conservées.');
    this.payload = payload;
    if (fresh) {
      this.downloadedAt = new Date().toISOString();
      try { localStorage.setItem('fdv_chantiers_downloaded_at', this.downloadedAt); } catch { /* Storage may be unavailable. */ }
    }
    window.dispatchEvent(new CustomEvent('chantierSourcesUpdated'));
    return payload;
  }
}
export const chantierService = new ChantierService();
