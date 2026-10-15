import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../server/engine.js';
import {evaluate,validateCode} from '../server/scoring.js';
const settings={difficulty:'normal' as const,repeats:true,maxAttempts:10};
test('értékelés: pontos, részleges, nulla és duplikált találatok',()=>{
 const cases:[number[],number[],number,number][]=[
  [[0,1,2,3,4],[0,1,2,3,4],5,0],[[0,0,0,0,0],[1,1,1,1,1],0,0],
  [[0,1,2,3,4],[0,1,5,5,5],2,0],[[0,1,2,3,4],[1,2,3,4,0],0,5],
  [[0,0,1,2,3],[0,0,0,0,0],2,0],[[0,1,2,3,4],[0,2,1,5,4],2,2],
  [[0,0,1,1,2],[1,1,0,0,0],0,4],[[0,1,0,2,2],[0,0,2,2,0],2,2]
 ];for(const [secret,guess,exact,partial]of cases)assert.deepEqual(evaluate(secret,guess),{exact,partial});
});
test('validálás: hossz, típus, szín, ismétlődés',()=>{
 for(const input of [[],[0,1,2,3],[0,1,2,3,8],[0,1,2,3,-1],[0,1,2,3,1.2],[0,1,2,3,'1'],null,{}])assert.throws(()=>validateCode(input,settings));
 assert.throws(()=>validateCode([0,0,1,2,3],{...settings,repeats:false}));
 assert.doesNotThrow(()=>validateCode([0,1,2,3,4],{...settings,repeats:false}));
 assert.throws(()=>evaluate([0],[0,1]));
});
test('kimerítő duplikációs ellenőrzés: minden 3 színű, 4 hosszú kódpár',()=>{
 const codes=Array.from({length:81},(_,n)=>Array.from({length:4},(_,i)=>Math.floor(n/3**i)%3));
 for(const secret of codes)for(const guess of codes){const score=evaluate(secret,guess);let overlap=0;for(let c=0;c<3;c++)overlap+=Math.min(secret.filter(x=>x===c).length,guess.filter(x=>x===c).length);assert.equal(score.exact+score.partial,overlap);assert.ok(score.exact+score.partial<=4);assert.deepEqual(evaluate(guess,secret),score);}
});
function pair(engine=new Engine()){
 const a=engine.create('Anna'),b=engine.join(a.room.code,'Bence');engine.start(a.room.code,a.session.playerId);
 const code=a.room.code,id=engine.get(code).gameId;engine.secret(code,a.session.playerId,id,[0,1,2,3,4]);engine.secret(code,b.session.playerId,id,[4,3,2,1,0]);
 return {engine,a:a.session,b:b.session,code,id};
}
test('szobakapacitás, tagság, jogosultság és beállítások zárolása',()=>{
 const e=new Engine(),a=e.create('Anna'),b=e.join(a.room.code,'Bence');
 assert.throws(()=>e.join(a.room.code,'Cecil'));assert.throws(()=>e.start(a.room.code,b.session.playerId));
 assert.throws(()=>e.configure(a.room.code,a.session.playerId,{...settings,difficulty:'toString' as any}));
 assert.throws(()=>e.configure(a.room.code,'outsider',settings));
 e.start(a.room.code,a.session.playerId);assert.throws(()=>e.configure(a.room.code,a.session.playerId,settings));
 assert.throws(()=>e.authenticate({...a.session,token:'a'.repeat(64)}));assert.throws(()=>e.create('a'.repeat(21)));
});
test('a kör mindkét tippet megvárja, a gyorsabb megfejtés nem dönt',()=>{
 const {engine:e,a,b,code,id}=pair();e.guess(code,a.playerId,id,1,[4,3,2,1,0]);
 assert.equal(e.get(code).status,'PLAYING');assert.equal(e.get(code).round,1);
 assert.throws(()=>e.guess(code,a.playerId,id,1,[4,3,2,1,0]));
 e.guess(code,b.playerId,id,1,[0,1,2,3,4]);assert.equal(e.get(code).status,'FINISHED');assert.equal(e.get(code).winnerId,null);
});
test('egy megfejtés győzelem, nincs korai ellenfél-adat',()=>{
 const {engine:e,a,b,code,id}=pair();const r=e.guess(code,a.playerId,id,1,[4,3,2,1,0]);
 const view=e.view(r,b.playerId);assert.equal(view.reveal,null);assert.deepEqual(view.guesses,[]);assert.deepEqual(view.ownSecret,[4,3,2,1,0]);
 const serialized=JSON.stringify(view);assert.ok(!serialized.includes('token'));assert.ok(!serialized.includes('tokenHash'));
 assert.deepEqual(Object.keys(view.players[0]).sort(),['id','nickname','connected','ready','submitted','rematch','reconnectUntil'].sort());
 e.guess(code,b.playerId,id,1,[7,7,7,7,7]);assert.equal(e.get(code).winnerId,a.playerId);assert.equal(e.view(e.get(code),b.playerId).reveal?.length,2);
});
test('elfogyott tippek: döntetlen, visszavágó mindkét fél beleegyezésével',()=>{
 const {engine:e,a,b,code,id}=pair();for(let round=1;round<=10;round++){e.guess(code,a.playerId,id,round,[7,7,7,7,7]);e.guess(code,b.playerId,id,round,[6,6,6,6,6]);}
 assert.equal(e.get(code).status,'FINISHED');assert.equal(e.get(code).resultType,'exhausted');assert.equal(e.get(code).winnerId,null);
 e.rematch(code,a.playerId);assert.equal(e.get(code).status,'FINISHED');e.rematch(code,b.playerId);
 const r=e.get(code);assert.equal(r.status,'SETUP');assert.notEqual(r.gameId,id);assert.equal(r.round,1);assert.equal(e.view(r,a.playerId).reveal,null);for(const p of r.players){assert.equal(p.secret,null);assert.equal(p.guesses.length,0);assert.equal(p.rematch,false);}
 assert.throws(()=>e.secret(code,a.playerId,id,[0,1,2,3,4]));
});
test('külön visszajelzések, következő kör és elavult kérés',()=>{
 const {engine:e,a,b,code,id}=pair();e.guess(code,a.playerId,id,1,[4,4,4,4,4]);e.guess(code,b.playerId,id,1,[7,7,7,7,7]);
 assert.equal(e.get(code).round,2);assert.equal(e.view(e.get(code),a.playerId).guesses[0].exact,1);assert.equal(e.view(e.get(code),b.playerId).guesses[0].exact,0);
 assert.throws(()=>e.guess(code,a.playerId,id,1,[4,3,2,1,0]));
});
test('kapcsolatvesztés, hiteles visszaállítás és lejárat',()=>{
 let now=1000;const {engine:e,a,b,code}=pair(new Engine(()=>{},120_000,86_400_000,()=>now));
 e.disconnect(code,a.playerId);assert.equal(e.get(code).players[0].connected,false);now+=100_000;e.reconnect(a);assert.equal(e.get(code).players[0].connected,true);
 e.disconnect(code,a.playerId);now+=120_001;e.sweep();assert.equal(e.get(code).winnerId,b.playerId);assert.equal(e.get(code).resultType,'forfeit');
});
test('együtt megszakadt kapcsolat döntetlen, várakozó szobában host átadás',()=>{
 let now=1000;const {engine:e,a,b,code}=pair(new Engine(()=>{},120_000,86_400_000,()=>now));e.disconnect(code,a.playerId);e.disconnect(code,b.playerId);now+=120_001;e.sweep();assert.equal(e.get(code).winnerId,null);
 const host=e.create('Host'),guest=e.join(host.room.code,'Vendég');e.leave(host.room.code,host.session.playerId);assert.equal(e.get(host.room.code).hostId,guest.session.playerId);
});
test('titkos kód zárolása és feladás',()=>{
 const {engine:e,a,b,code,id}=pair();assert.throws(()=>e.secret(code,a.playerId,id,[7,7,7,7,7]));e.leave(code,a.playerId);assert.equal(e.get(code).winnerId,b.playerId);assert.equal(e.get(code).resultType,'forfeit');
});
test('sikertelen lemezmentés nem módosítja a hiteles állapotot',()=>{
 const e=new Engine();const a=e.create('Anna');e.save=()=>{throw new Error('disk full');};assert.throws(()=>e.configure(a.room.code,a.session.playerId,{...settings,difficulty:'hard'}));assert.equal(e.get(a.room.code).settings.difficulty,'normal');
});
