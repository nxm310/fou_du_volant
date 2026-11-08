const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('service-worker.js', 'utf8');
function harness(offline = true) {
 const listeners = {};
 const entries = new Map();
 const deleted = [];
 const cache = { match: async key => entries.get(String(key)), put: async (key, value) => entries.set(String(key),value), addAll: async urls => { for(const url of urls) assert.ok(fs.existsSync(url), url); } };
 const context = { URL, Response, self: {location: {origin:'https://example.test'}, registration: {scope:'https://example.test/fou_du_volant/'}, clients: {claim:async()=>{}}, addEventListener:(name,fn)=>listeners[name]=fn}, caches:{open:async()=>cache,keys:async()=>['unrelated-app','fdv-shell-old'],delete:async key=>deleted.push(key)}, fetch: async()=>{if(offline) throw Error('offline');return new Response(JSON.stringify({radars:[]}));} };
 vm.runInNewContext(code, context);
 const fetch = async path => {let response;listeners.fetch({request:{url:`https://example.test/fou_du_volant/${path}`,method:'GET'},respondWith:p=>response=p});return await response;};
 return {listeners,entries,deleted,fetch};
}
test('all precached files exist', async()=>{const h=harness();let done;h.listeners.install({waitUntil:p=>done=p});await done;});
test('version query resolves to offline shell',async()=>{const h=harness();h.entries.set('https://example.test/fou_du_volant/js/app.js',new Response('module'));assert.equal(await (await h.fetch('js/app.js?v=4.0.0')).text(),'module');});
test('missing resource returns a Response, never null',async()=>{assert.equal((await harness().fetch('missing.js')).status,503);});
test('failed/invalid data refresh preserves offline snapshot',async()=>{for(const offline of [true,false]){const h=harness(offline);h.entries.set('https://example.test/fou_du_volant/radars.json',new Response('saved-data'));assert.equal(await(await h.fetch('radars.json?t=123')).text(),'saved-data');}});
test('activation leaves other apps caches intact',async()=>{const h=harness();let done;h.listeners.activate({waitUntil:p=>done=p});await done;assert.deepEqual(h.deleted,['fdv-shell-old']);});
