const {test}=require('node:test');
const assert=require('node:assert/strict');
test('short announcements omit unknown speed limits and distinguish works',async()=>{
 global.window={};global.localStorage={getItem:()=>null};
 const {formatApproachAnnouncement}=await import('../js/audio/sound.js');
 assert.equal(formatApproachAnnouncement({category:'fixe',vitesse:80},500),'Radar à 500 mètres, limite 80.');
 assert.equal(formatApproachAnnouncement({category:'chantier',vitesse:null},80),'Travaux à proximité.');
 assert.equal(formatApproachAnnouncement({category:'fixe',vitesse:undefined},null),'Radar à proximité.');
});
