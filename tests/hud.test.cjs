const {test}=require('node:test');
const assert=require('node:assert/strict');
function setupDOM(){
 const nodes=new Map();
 global.document={addEventListener:()=>{},getElementById:id=>{
  if(!nodes.has(id)){
   const classes=new Set();
   nodes.set(id,{textContent:'',dataset:{},style:{},attributes:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)},setAttribute(k,v){this.attributes[k]=v;},addEventListener(){}});
  }
  return nodes.get(id);
 }};
 global.localStorage={getItem:()=>null};
 return nodes;
}
test('losing GPS clears the displayed road limit and speed', async () => {
 setupDOM();
 const { CockpitHUD } = await import('../js/ui/hud.js');
 const hud = new CockpitHUD();
 hud.updatePosition({ speed: 76, accuracy: 8 });
 hud.updateRoad({ name: 'Route test', ref: 'D1' });
 hud.updateRoadLimit(80);
 hud.updateGpsStatus({ active: false, error: 'denied', message: 'Localisation refusée' });
 assert.equal(hud.speedEl.textContent, '—');
 assert.equal(hud.roadTextEl.textContent, 'Voie non identifiée');
 assert.equal(hud.signNumEl.textContent, '—');
 assert.equal(hud.signEl.dataset.known, 'false');
 assert.equal(hud.speedArc.attributes['stroke-dasharray'], '0 100');
});

test('radar warnings never replace the current road limit', async () => {
 setupDOM();
 const { CockpitHUD } = await import('../js/ui/hud.js');
 const hud = new CockpitHUD();
 hud.updateRoadLimit(50);
 hud.updateAlert({ radar: { vitesse: 80, type: 'Radar fixe' }, distance: 500 });
 assert.equal(hud.signNumEl.textContent, 50);
 assert.match(hud.alertTitle.textContent, /80 km/);
 hud.updateAlert(null);
 assert.equal(hud.signNumEl.textContent, 50);
});
