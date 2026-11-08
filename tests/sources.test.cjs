const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('the app version, resource links and offline cache agree',()=>{
 const releases=JSON.parse(fs.readFileSync('releases.json'));
 assert.equal(releases.current,releases.history[0].version);
 assert.equal(new Set(releases.history.map(r=>r.version)).size,releases.history.length);
 assert.ok(fs.readFileSync('service-worker.js','utf8').includes(`fdv-shell-v${releases.current}`));
 const versions=[...fs.readFileSync('index.html','utf8').matchAll(/v=(\d+\.\d+\.\d+)/g)].map(m=>m[1]);
 assert.ok(versions.length>0);assert.ok(versions.every(v=>v===releases.current));
});
test('release notice appears on a new version, not on every launch after acknowledgment',async()=>{
 const {shouldShowRelease}=await import('../js/ui/releases.js');
 assert.equal(shouldShowRelease(null,'4.2.0'),true);
 assert.equal(shouldShowRelease('4.1.2','4.2.0'),true);
 assert.equal(shouldShowRelease('4.2.0','4.2.0'),false);
});
test('failed or invalid chantier refresh preserves its data and download date',async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};
 global.window={dispatchEvent:()=>{}};
 const {ChantierService}=await import('../js/data/chantier-service.js');
 const service=new ChantierService();
 const payload=JSON.parse(fs.readFileSync('data/sourced_chantiers.json'));
 const originalFetch=global.fetch;
 try {
  global.fetch=async()=>new Response(JSON.stringify(payload));
  await service.load({fresh:true});
  const previous=service.payload;const date=service.downloadedAt;
  for(const response of [new Response('offline',{status:503}),new Response('{"records":[{}]}')]){
   global.fetch=async()=>response;
   await assert.rejects(service.load({fresh:true}));
   assert.equal(service.payload,previous);assert.equal(service.downloadedAt,date);
  }
 }finally{global.fetch=originalFetch;}
});
test('failed radar refresh preserves stored date and does not save a new snapshot',async()=>{
 global.localStorage={getItem:()=>null};
 const {RadarService}=await import('../js/data/radar-service.js');
 const {storage}=await import('../js/core/storage.js');
 const originalFetch=global.fetch;const originalSave=storage.saveOfficialRadars;
 let writes=0;storage.saveOfficialRadars=async()=>{writes++;};
 try {
  global.fetch=async()=>new Response('offline',{status:503});
  await assert.rejects(new RadarService().refresh({fresh:true}));
  assert.equal(writes,0);
 }finally{global.fetch=originalFetch;storage.saveOfficialRadars=originalSave;}
});
