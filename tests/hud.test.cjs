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
test('losing GPS clears speed, road and limit instead of displaying previous measurements',async()=>{
 setupDOM();
 const {CockpitHUD}=await import('../js/ui/hud.js');
 const hud=new CockpitHUD();
 hud.updatePosition({speed:76,accuracy:8});hud.updateRoad({name:'Route test',ref:'D1'});
 hud.updateAlert({radar:{vitesse:80,type:'Radar fixe'},distance:500});
 assert.equal(hud.signNumEl.textContent,80);
 hud.updateGpsStatus({active:false,error:'denied',message:'Localisation refusée'});
 assert.equal(hud.speedEl.textContent,'—');
 assert.equal(hud.roadTextEl.textContent,'Voie non identifiée');
 assert.equal(hud.signNumEl.textContent,'—');
 assert.equal(hud.limitLabel.textContent,'Limite inconnue');
 assert.equal(hud.speedArc.attributes['stroke-dasharray'],'0 100');
});
test('a point with an unknown limit never retains the previous speed sign',async()=>{
 setupDOM();const {CockpitHUD}=await import('../js/ui/hud.js');const hud=new CockpitHUD();
 hud.updateAlert({radar:{vitesse:80,type:'Radar fixe'},distance:500});
 hud.updateAlert({radar:{vitesse:null,type:'Signalement'},distance:200});
 assert.equal(hud.signNumEl.textContent,'—');assert.equal(hud.signEl.classList.contains('hidden'),true);
 assert.equal(hud.limitLabel.textContent,'Limite inconnue');
});
