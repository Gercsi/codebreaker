import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {io,type Socket} from 'socket.io-client';
import {createApp} from '../server/app.js';
import type {RoomView,Reply,Session} from '../shared/protocol.js';
const request=(s:Socket,event:string,data:unknown)=>new Promise<Reply>((resolve,reject)=>s.timeout(4000).emit(event,data,(err:Error,reply:Reply)=>err?reject(err):resolve(reply)));
const connect=(url:string)=>new Promise<Socket>((resolve,reject)=>{const s=io(url,{transports:['websocket'],forceNew:true,reconnection:false});s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
const state=(s:Socket,predicate:(r:RoomView)=>boolean)=>new Promise<RoomView>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('state timeout')),4000);const handler=(r:RoomView)=>{if(predicate(r)){clearTimeout(timer);s.off('room:state',handler);resolve(r);}};s.on('room:state',handler);});
test('két Socket.IO kliens: privát állapot, párhuzamos kérés, reconnect, SQLite újraindítás',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codebreaker-'));let app=await createApp({database:join(dir,'test.sqlite')});const clients:Socket[]=[];
 async function listen(){await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${(app.http.address() as any).port}`;}
 try{
  let url=await listen();let a=await connect(url),b=await connect(url),c=await connect(url);clients.push(a,b,c);
  const created=await request(a,'room:create',{nickname:'Anna'});assert.ok(created.ok&&created.session);const sa=(created as {session:Session}).session;
  const joined=await request(b,'room:join',{nickname:'Bence',code:sa.roomCode});assert.ok(joined.ok&&joined.session);const sb=(joined as {session:Session}).session;
  assert.equal((await request(c,'room:join',{nickname:'Cecil',code:sa.roomCode})).ok,false);
  assert.equal((await request(c,'game:state-sync',{...sa,token:'0'.repeat(64)})).ok,false);
  let ready=state(a,r=>r.status==='SETUP');assert.equal((await request(a,'game:start',{})).ok,true);let r=await ready;const gameId=r.gameId;
  await request(a,'game:secret-submit',{gameId,colors:[0,1,2,3,4]});ready=state(a,r=>r.status==='PLAYING');await request(b,'game:secret-submit',{gameId,colors:[4,3,2,1,0]});await ready;
  const opponentUpdate=state(b,r=>r.players.some(p=>p.id===sa.playerId&&p.submitted));
  const replies=await Promise.all([request(a,'game:guess-submit',{gameId,round:1,colors:[4,3,2,1,0]}),request(a,'game:guess-submit',{gameId,round:1,colors:[4,3,2,1,0]})]);assert.equal(replies.filter(r=>r.ok).length,1);
  const privateView=await opponentUpdate;assert.equal(privateView.status,'PLAYING');assert.equal(privateView.reveal,null);assert.equal(privateView.guesses.length,0);assert.ok(!JSON.stringify(privateView).includes(sa.token));
  const disconnected=state(b,r=>!r.players.find(p=>p.id===sa.playerId)!.connected);a.disconnect();await disconnected;
  a=await connect(url);clients.push(a);ready=state(a,r=>r.guesses.length===1);assert.equal((await request(a,'game:state-sync',sa)).ok,true);r=await ready;assert.equal(r.round,1);assert.equal(r.guesses[0].exact,5);
  await app.close();app=await createApp({database:join(dir,'test.sqlite')});url=await listen();a=await connect(url);b=await connect(url);clients.push(a,b);
  await request(a,'game:state-sync',sa);ready=state(b,r=>r.status==='PLAYING');await request(b,'game:state-sync',sb);await ready;
  const finalA=state(a,r=>r.status==='FINISHED'),finalB=state(b,r=>r.status==='FINISHED');await request(b,'game:guess-submit',{gameId,round:1,colors:[0,1,2,3,4]});const [ra,rb]=await Promise.all([finalA,finalB]);assert.equal(ra.winnerId,null);assert.equal(rb.winnerId,null);assert.deepEqual(ra.reveal,rb.reveal);
  assert.equal(app.store.load()[0].status,'FINISHED');
 }finally{clients.forEach(c=>c.disconnect());await app.close();await rm(dir,{recursive:true,force:true});}
});
