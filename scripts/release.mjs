// Every published correction gets a distinct app/cache version and release entry.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const changes = process.argv.slice(2);
if (!changes.length || changes.some(text => !text.trim())) {
  console.error('Usage: node scripts/release.mjs "Correction présentée à l’utilisateur" ["Autre amélioration"]');
  process.exit(1);
}
const read = file => readFileSync(resolve(root, file), 'utf8');
const release = JSON.parse(read('releases.json'));
const [major, minor, patch] = release.current.split('.').map(Number);
const current = `${major}.${minor}.${patch + 1}`;
const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
release.current = current;
release.history.unshift({version:current,date,changes});
const worker = read('service-worker.js').replace(/fdv-shell-v\d+\.\d+\.\d+/, `fdv-shell-v${current}`);
const html = read('index.html').replace(/v=\d+\.\d+\.\d+/g, `v=${current}`).replace(/(<span id="sourceAppVersion">)Version [\d.]+/, `$1Version ${current}`);
writeFileSync(resolve(root,'releases.json'), JSON.stringify(release,null,2)+'\n');
writeFileSync(resolve(root,'service-worker.js'),worker);
writeFileSync(resolve(root,'index.html'),html);
console.log(`Version ${current} préparée avec son historique.`);
