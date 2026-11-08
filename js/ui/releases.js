export function shouldShowRelease(seenVersion, currentVersion) {
  return Boolean(currentVersion) && seenVersion !== currentVersion;
}
export class ReleaseNotes {
  constructor() {
    this.dialog = document.getElementById('releaseDialog');
    document.getElementById('btnReleaseHistory').onclick = () => this.open(true);
    document.getElementById('btnReleaseDone').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => {
      if (this.release) try { localStorage.setItem('fdv_release_seen', this.release.current); } catch { /* Show again when persistence is unavailable. */ }
    });
    this.ready = this.load();
  }
  async load() {
    try {
      const response = await fetch('./releases.json');
      if (!response.ok) throw new Error('unavailable');
      const release = await response.json();
      if (!Array.isArray(release.history) || release.history[0]?.version !== release.current) throw new Error('invalid');
      this.release = release;
      document.getElementById('sourceAppVersion').textContent = `Version ${release.current}`;
      let seen = null;
      try { seen = localStorage.getItem('fdv_release_seen'); } catch { /* Optional persistence. */ }
      if (shouldShowRelease(seen, release.current)) this.open(false);
    } catch {
      document.getElementById('releaseHistory').textContent = 'Historique indisponible. Réessayez après une première ouverture avec Internet.';
    }
  }
  open(all = true) {
    if (!this.release) { this.dialog.showModal(); return; }
    const container = document.getElementById('releaseHistory');
    container.replaceChildren();
    for (const release of (all ? this.release.history : this.release.history.slice(0, 1))) {
      const section = document.createElement('section'); section.className = 'release-entry';
      const heading = document.createElement('h3'); heading.textContent = `Version ${release.version}`;
      const date = document.createElement('p'); date.className = 'muted'; date.textContent = new Date(`${release.date}T12:00:00`).toLocaleDateString('fr-FR', { dateStyle: 'long' });
      const changes = document.createElement('ul');
      for (const text of release.changes) { const li = document.createElement('li'); li.textContent = text; changes.append(li); }
      section.append(heading, date, changes); container.append(section);
    }
    this.dialog.showModal();
  }
}
