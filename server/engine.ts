import { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { DIFFICULTIES, type Settings, type Guess, type RoomView, type Session, type Status } from '../shared/protocol.js';
import { evaluate, validateCode } from './scoring.js';
export interface Player {id:string; nickname:string; tokenHash:string; connected:boolean; disconnectedAt:number|null; secret:number[]|null; guesses:Guess[]; rematch:boolean}
export interface Room {code:string;gameId:string;hostId:string;status:Status;settings:Settings;round:number;players:Player[];winnerId:string|null;resultType:RoomView['resultType'];createdAt:number;expiresAt:number}
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
function nickname(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||[...value.trim()].length>20||/[\x00-\x1f\x7f]/.test(value)) throw new Error('Adj meg egy 1–20 karakteres becenevet!');
 return value.trim();
}
export class Engine {
 rooms=new Map<string,Room>();
 constructor(public save:(room:Room)=>void=()=>{},public grace=120_000,public ttl=86_400_000,public now:()=>number=Date.now){}
 private edit(code:string,fn:(room:Room)=>void):Room {
  const existing=this.get(code);const room=structuredClone(existing);fn(room);this.save(room);this.rooms.set(code,room);return room;
 }
 get(code:string):Room {const r=this.rooms.get(code);if(!r||r.expiresAt<=this.now()||r.status==='CLOSED') throw new Error('A szoba nem található vagy lejárt.');return r;}
 player(r:Room,id:string):Player {const p=r.players.find(p=>p.id===id);if(!p) throw new Error('Nem vagy a szoba tagja.');return p;}
 private newPlayer(name:unknown){const token=randomBytes(32).toString('hex');return {token,player:{id:randomUUID(),nickname:nickname(name),tokenHash:hash(token),connected:true,disconnectedAt:null,secret:null,guesses:[],rematch:false} as Player};}
 create(name:unknown){
  if(this.rooms.size>=500) throw new Error('A szerver jelenleg megtelt. Próbáld később!');
  const {token,player}=this.newPlayer(name);const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';
  do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(this.rooms.has(code));
  const r:Room={code,gameId:randomUUID(),hostId:player.id,status:'WAITING',settings:{difficulty:'normal',repeats:true,maxAttempts:10},round:1,players:[player],winnerId:null,resultType:null,createdAt:this.now(),expiresAt:this.now()+this.ttl};
  this.save(r);this.rooms.set(code,r);return {room:r,session:{roomCode:code,playerId:player.id,token}};
 }
 join(code:unknown,name:unknown){
  if(typeof code!=='string'||!/^[A-Z2-9]{6}$/.test(code)) throw new Error('A szobakód 6 betűből vagy számból áll.');
  const {token,player}=this.newPlayer(name);
  const room=this.edit(code,r=>{if(r.status!=='WAITING'||r.players.length>=2) throw new Error('A szoba megtelt, vagy a játék már elindult.');r.players.push(player);});
  return {room,session:{roomCode:code,playerId:player.id,token}};
 }
 authenticate(session:Session){
  if(!session||typeof session.roomCode!=='string'||typeof session.playerId!=='string'||typeof session.token!=='string'||!/^[a-f0-9]{64}$/.test(session.token)) throw new Error('Érvénytelen munkamenet.');
  const r=this.get(session.roomCode),p=this.player(r,session.playerId);
  if(!timingSafeEqual(Buffer.from(p.tokenHash,'hex'),Buffer.from(hash(session.token),'hex'))) throw new Error('Érvénytelen munkamenet.');
  if(!p.connected&&p.disconnectedAt!==null&&this.now()-p.disconnectedAt>=this.grace&&r.status!=='FINISHED') throw new Error('A visszacsatlakozási idő lejárt.');
  return p;
 }
 configure(code:string,id:string,input:Settings){return this.edit(code,r=>{
  this.player(r,id);if(r.status!=='WAITING'||r.hostId!==id) throw new Error('Csak a házigazda módosíthatja a beállításokat, indulás előtt.');
  if(!input||!Object.hasOwn(DIFFICULTIES,input.difficulty)||typeof input.repeats!=='boolean'||!Number.isInteger(input.maxAttempts)||input.maxAttempts<1||input.maxAttempts>20) throw new Error('Érvénytelen játékbeállítás.');
  r.settings={difficulty:input.difficulty,repeats:input.repeats,maxAttempts:input.maxAttempts};
 });}
 start(code:string,id:string){return this.edit(code,r=>{if(r.hostId!==id||r.status!=='WAITING') throw new Error('A játékot a házigazda indíthatja.');if(r.players.length!==2||r.players.some(p=>!p.connected)) throw new Error('Az induláshoz két online játékos szükséges.');r.status='SETUP';});}
 secret(code:string,id:string,gameId:unknown,colors:unknown){return this.edit(code,r=>{
  const p=this.player(r,id);if(r.status!=='SETUP'||r.gameId!==gameId||p.secret) throw new Error('Most nem rögzíthető új titkos kód.');
  validateCode(colors,r.settings);p.secret=[...colors];if(r.players.every(p=>p.secret))r.status='PLAYING';
 });}
 guess(code:string,id:string,gameId:unknown,round:unknown,colors:unknown){return this.edit(code,r=>{
  const p=this.player(r,id);if(r.status!=='PLAYING'||r.gameId!==gameId||r.round!==round) throw new Error('Ez a kör már nem aktív.');
  if(r.players.some(p=>!p.connected)) throw new Error('Várjuk meg, amíg az ellenfél visszacsatlakozik.');
  if(p.guesses.some(g=>g.round===r.round)) throw new Error('Ebben a körben már tippeltél.');
  validateCode(colors,r.settings);const opponent=r.players.find(p=>p.id!==id)!;
  p.guesses.push({round:r.round,colors:[...colors],...evaluate(opponent.secret!,colors)});
  if(r.players.every(p=>p.guesses.some(g=>g.round===r.round))){
   const winners=r.players.filter(p=>p.guesses.at(-1)!.exact===DIFFICULTIES[r.settings.difficulty].length);
   if(winners.length||r.round>=r.settings.maxAttempts){r.status='FINISHED';r.winnerId=winners.length===1?winners[0].id:null;r.resultType=winners.length?'solved':'exhausted';}
   else r.round++;
  }
 });}
 reconnect(session:Session){this.authenticate(session);return this.edit(session.roomCode,r=>{const p=this.player(r,session.playerId);p.connected=true;p.disconnectedAt=null;});}
 disconnect(code:string,id:string){return this.edit(code,r=>{const p=this.player(r,id);p.connected=false;p.disconnectedAt=this.now();});}
 leave(code:string,id:string){return this.edit(code,r=>{
  const p=this.player(r,id);p.connected=false;p.disconnectedAt=this.now()-this.grace;
  if(r.status==='WAITING'){r.players=r.players.filter(p=>p.id!==id);if(!r.players.length)r.status='CLOSED';else r.hostId=r.players[0].id;}
  else if(r.status==='PLAYING'||r.status==='SETUP'){r.status='FINISHED';r.winnerId=r.players.find(p=>p.id!==id)?.id??null;r.resultType='forfeit';}
 });}
 rematch(code:string,id:string){return this.edit(code,r=>{
  if(r.status!=='FINISHED'||r.players.length!==2||r.players.some(p=>!p.connected)) throw new Error('Az új játékhoz két online játékos szükséges.');
  this.player(r,id).rematch=true;
  if(r.players.every(p=>p.rematch)){r.status='SETUP';r.gameId=randomUUID();r.round=1;r.winnerId=null;r.resultType=null;r.players.forEach(p=>{p.secret=null;p.guesses=[];p.rematch=false;});}
 });}
 sweep():Room[]{const changed:Room[]=[];for(const r of this.rooms.values()){
  if(r.expiresAt<=this.now()||r.status==='CLOSED'){changed.push({...r,status:'CLOSED'});this.rooms.delete(r.code);continue;}
  const expired=r.players.filter(p=>!p.connected&&p.disconnectedAt!==null&&this.now()-p.disconnectedAt>=this.grace);
  if(!expired.length||r.status==='FINISHED')continue;
  changed.push(this.edit(r.code,draft=>{
   if(draft.status==='WAITING'){draft.players=draft.players.filter(p=>!expired.some(e=>e.id===p.id));if(!draft.players.length)draft.status='CLOSED';else draft.hostId=draft.players[0].id;}
   else{draft.status='FINISHED';draft.resultType='forfeit';draft.winnerId=draft.players.find(p=>p.connected)?.id??null;}
  }));
 }return changed;}
 view(r:Room,id:string):RoomView {
  const me=this.player(r,id);return {code:r.code,gameId:r.gameId,hostId:r.hostId,meId:id,status:r.status,settings:{...r.settings},round:r.round,
   players:r.players.map(p=>({id:p.id,nickname:p.nickname,connected:p.connected,ready:!!p.secret,submitted:p.guesses.some(g=>g.round===r.round),rematch:p.rematch,reconnectUntil:p.disconnectedAt===null?null:p.disconnectedAt+this.grace})),
   guesses:structuredClone(me.guesses),ownSecret:me.secret?[...me.secret]:null,winnerId:r.winnerId,resultType:r.resultType,expiresAt:r.expiresAt,
   reveal:r.status==='FINISHED'?r.players.map(p=>({id:p.id,secret:p.secret?[...p.secret]:null,guesses:structuredClone(p.guesses)})):null};
 }
}
