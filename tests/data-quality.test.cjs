const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('legacy itinerary snapshots migrate without changing real chantier reports',async()=>{
 const {normalizeRadarRecords,summarizeRecords}=await import('../js/data/data-quality.js');
 const input=[{id:'sr_I_01_001',category:'chantier',type:'Radar autonome / chantier',lat:46,lng:5},{id:'community_1',category:'chantier',type:'Zone de travaux',lat:47,lng:4}];
 const migrated=normalizeRadarRecords(input);
 assert.equal(migrated[0].entity_kind,'itinerary');assert.equal(migrated[0].category,'leurre');
 assert.deepEqual(migrated[1],input[1]);assert.equal(input[0].category,'chantier');
 assert.equal(summarizeRecords(migrated).chantier_count,1);
 assert.equal(summarizeRecords(migrated).itinerary_count,1);
});
test('shipped data does not count route representatives as chantier devices',async()=>{
 const data=JSON.parse(fs.readFileSync('radars.json'));
 const routes=data.radars.filter(r=>r.id.startsWith('sr_I_'));
 assert.equal(routes.length,458);assert.ok(routes.every(r=>r.category==='leurre'&&r.entity_kind==='itinerary'));
 const {summarizeRecords}=await import('../js/data/data-quality.js');
 assert.equal(data.chantier_count,summarizeRecords(data.radars).chantier_count);
 assert.equal(data.itinerary_count,458);
});
test('documentary fiches retain provenance without invented coordinates or live presence',()=>{
 const {records}=JSON.parse(fs.readFileSync('data/sourced_chantiers.json'));
 assert.equal(records.length,3);assert.equal(new Set(records.map(r=>r.id)).size,3);
 for(const r of records){assert.equal(new URL(r.source_url).protocol,'https:');assert.ok(r.source_name);assert.match(r.source_consulted_on,/^\d{4}-\d{2}-\d{2}$/);assert.ok(r.installation_date<=r.source_consulted_on);assert.equal(r.presence_status,'unconfirmed');assert.equal(r.lat,null);assert.equal(r.lng,null);}
});
test('route representative does not trigger GPS alerts while a chantier report still does',async()=>{
 global.localStorage={getItem:()=>null};
 const {state}=await import('../js/core/state.js');
 const {spatialIndex}=await import('../js/geo/spatial-index.js');
 const {GeoTracker}=await import('../js/geo/tracker.js');
 spatialIndex.build([{id:'sr_I_01_001',category:'chantier',lat:46,lng:5},{id:'community_1',category:'chantier',lat:46,lng:5}]);
 new GeoTracker().evaluateRadars({lat:46,lng:5,speed:0,heading:null});
 assert.deepEqual(state.runtime.activeAlerts.map(a=>a.radar.id),['community_1']);
 spatialIndex.build([{id:'route',entity_kind:'itinerary',category:'leurre',lat:46,lng:5}]);
 new GeoTracker().evaluateRadars({lat:46,lng:5,speed:0,heading:null});
 assert.equal(state.runtime.activeAlerts.length,0);
});
test('pausing GPS releases the active flag and ignores late callbacks',async()=>{
 const {GeoTracker}=await import('../js/geo/tracker.js');
 const {state}=await import('../js/core/state.js');
 const tracker=new GeoTracker();tracker.isActive=true;
 const previousPosition=state.runtime.userPos;
 tracker.stop();
 assert.equal(tracker.isActive,false);
 tracker.handleSuccess({coords:{latitude:48,longitude:2}});
 assert.equal(state.runtime.userPos,previousPosition);
 assert.equal(state.runtime.gpsStatus.message,'Trajet en pause');
});
