import {helperKnowledge,feedbackLabel} from '../shared/helper.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../server/engine.js';
import {evaluate,evaluateDetailed,validateCode} from '../server/scoring.js';
const settings={difficulty:'normal' as const,repeats:true,maxAttempts:10,helper:false};
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

test('segítő értékelés: pontos találat elsőbbsége, többlet és kizárt szín',()=>{
 const colors=[0,0,0,2,7],result=evaluateDetailed([1,0,1,2,3],colors);
 assert.deepEqual(result.feedback,['miss','exact','miss','exact','miss']);
 const guess={round:1,colors,...result},knowledge=helperKnowledge([guess],5,8);
 assert.equal(feedbackLabel(guess,0),'Többlet');assert.equal(feedbackLabel(guess,4),'Nincs benne');
 assert.equal(knowledge.absent[0],false);assert.equal(knowledge.absent[7],true);
 assert.deepEqual(knowledge.fixed,[null,0,null,2,null]);assert.equal(knowledge.minimum[0],1);
});

test('segítő kimerítő ellenőrzés: minden jel és következtetés igaz a 6561 kódpárra',()=>{
 const codes=Array.from({length:81},(_,n)=>Array.from({length:4},(_,i)=>Math.floor(n/3**i)%3));
 for(const secret of codes)for(const colors of codes){
  const result=evaluateDetailed(secret,colors),knowledge=helperKnowledge([{round:1,colors,...result}],4,3);
  result.feedback.forEach((f,i)=>{assert.equal(f==='exact',secret[i]===colors[i]);if(f==='partial')assert.ok(secret.includes(colors[i]));});
  for(let c=0;c<3;c++){
   const actual=secret.filter(v=>v===c).length,matched=result.feedback.filter((f,i)=>colors[i]===c&&f!=='miss').length;
   assert.equal(matched,Math.min(actual,colors.filter(v=>v===c).length));
   assert.ok(knowledge.minimum[c]<=actual);if(knowledge.absent[c])assert.equal(actual,0);
  }
  knowledge.fixed.forEach((c,i)=>{if(c!==null)assert.equal(c,secret[i]);});
 }
});

test('segítő beállítás: közös, csak host, zárolt és régi szobákkal kompatibilis',()=>{
 const e=new Engine(),a=e.create('Anna'),code=a.room.code,b=e.join(code,'Bence');
 assert.equal(e.get(code).settings.helper,false);
 assert.throws(()=>e.configure(code,b.session.playerId,{...settings,helper:true}));
 for(const invalid of [null,1,'true',{},[]])assert.throws(()=>e.configure(code,a.session.playerId,{...settings,helper:invalid as any}));
 const legacy={...settings};delete (legacy as Partial<typeof legacy>).helper;
 e.configure(code,a.session.playerId,legacy);assert.equal(e.get(code).settings.helper,false);
 delete (e.get(code).settings as Partial<typeof settings>).helper;
 assert.equal(e.view(e.get(code),a.session.playerId).settings.helper,false);
 e.configure(code,a.session.playerId,{...settings,helper:true});assert.equal(e.view(e.get(code),b.session.playerId).settings.helper,true);
 e.start(code,a.session.playerId);assert.throws(()=>e.configure(code,a.session.playerId,settings));
 const id=e.get(code).gameId;e.secret(code,a.session.playerId,id,[0,1,2,3,4]);e.secret(code,b.session.playerId,id,[4,3,2,1,0]);
 const r=e.guess(code,a.session.playerId,id,1,[4,2,6,6,6]);
 assert.deepEqual(e.view(r,a.session.playerId).guesses[0].feedback,['exact','partial','miss','miss','miss']);
 assert.deepEqual(e.view(r,b.session.playerId).guesses,[]);assert.equal(e.view(r,a.session.playerId).reveal,null);
 e.leave(code,a.session.playerId);e.reconnect(a.session);e.rematch(code,a.session.playerId);e.rematch(code,b.session.playerId);
 assert.equal(e.get(code).settings.helper,true);assert.deepEqual(helperKnowledge(e.view(e.get(code),a.session.playerId).guesses,5,8).fixed,[null,null,null,null,null]);
 const classic=pair();classic.engine.guess(classic.code,classic.a.playerId,classic.id,1,[4,2,6,6,6]);
 assert.ok(!Object.hasOwn(classic.engine.view(classic.engine.get(classic.code),classic.a.playerId).guesses[0],'feedback'));
});

test('segítő tudás több körből: a darabszám maximum, a fix helyek összeadódnak',()=>{
 const secret=[0,0,1,2,3],colorsA=[0,1,0,7,7],colorsB=[0,0,7,2,7];
 const guesses=[{round:1,colors:colorsA,...evaluateDetailed(secret,colorsA)},{round:2,colors:colorsB,...evaluateDetailed(secret,colorsB)}];
 const k=helperKnowledge(guesses,5,8);assert.equal(k.minimum[0],2);assert.equal(k.minimum[1],1);
 assert.deepEqual(k.fixed,[0,0,null,2,null]);assert.equal(k.absent[7],true);
 assert.deepEqual(helperKnowledge([{round:1,colors:secret,exact:5,partial:0}],5,8).fixed,[null,null,null,null,null]);
});
