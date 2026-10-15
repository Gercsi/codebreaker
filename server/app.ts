import express from 'express';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {Server, type Socket} from 'socket.io';
import {Engine,type Room} from './engine.js';
import {Store} from './store.js';
import type {ClientEvents,ServerEvents,Session,Ack} from '../shared/protocol.js';
type GameSocket=Socket<ClientEvents,ServerEvents,Record<string,never>,{session?:Session}>;
export async function createApp(options:{database:string;origins?:string[];grace?:number;ttl?:number;staticPath?:string}){
 const store=await Store.open(options.database),engine=new Engine(r=>store.save(r),options.grace,options.ttl);
 for(const r of store.load()){if(r.expiresAt<=Date.now()||r.status==='CLOSED')continue;r.players.forEach(p=>{if(p.connected){p.connected=false;p.disconnectedAt=Date.now();}});engine.rooms.set(r.code,r);store.save(r);}
 store.prune(Date.now());
 const app=express();app.disable('x-powered-by');
 app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'");next();});
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.use(express.static(resolve(options.staticPath??'dist/client')));
 const http=createServer(app);
 const allowed=(origin:string|undefined,host:string|undefined)=>!origin||options.origins?.includes(origin)||origin===`http://${host}`||origin===`https://${host}`;
 const io=new Server<ClientEvents,ServerEvents,Record<string,never>,{session?:Session}>(http,{maxHttpBufferSize:4096,cors:{origin:(origin,cb)=>cb(null,!origin||!!options.origins?.includes(origin))},allowRequest:(req,cb)=>cb(null,!!allowed(req.headers.origin,req.headers.host))});
 let shuttingDown=false;
 const buckets=new Map<string,{count:number;at:number}>();
 function limit(key:string,max:number,window=60_000){const now=Date.now();let b=buckets.get(key);if(!b||now-b.at>window){b={count:0,at:now};buckets.set(key,b);}if(++b.count>max)throw new Error('Túl sok kérés. Várj egy kicsit!');}
 io.use((socket,next)=>{try{limit('connect:'+socket.handshake.address,100);next();}catch{next(new Error('Túl sok kapcsolódás.'));}});
 function emitState(room:Room){for(const s of io.sockets.sockets.values()){const session=s.data.session;if(session?.roomCode===room.code&&room.players.some(p=>p.id===session.playerId))s.emit('room:state',engine.view(room,session.playerId));}}
 function notify(room:Room,event:'game:ready'|'game:finished'|'game:rematch-accepted'){for(const s of io.sockets.sockets.values())if(s.data.session?.roomCode===room.code)s.emit(event);}
 function bind(s:GameSocket,session:Session){s.data.session=session;}
 io.on('connection',socket=>{
  const run=(ack:Ack,fn:()=>void)=>{if(typeof ack!=='function')return;try{limit('events:'+socket.id,120);limit('ip:'+socket.handshake.address,600);fn();}catch(e){ack({ok:false,error:e instanceof Error?e.message:'Váratlan hiba.'});}};
  const member=()=>{const s=socket.data.session;if(!s)throw new Error('Először csatlakozz egy szobához.');engine.authenticate(s);return s;};
  const vacant=()=>{if(socket.data.session)throw new Error('Először lépj ki az aktuális szobából.');};
  socket.on('room:create',(data,ack)=>run(ack,()=>{vacant();limit('create:'+socket.handshake.address,15);const result=engine.create(data?.nickname);bind(socket,result.session);ack({ok:true,session:result.session});emitState(result.room);}));
  socket.on('room:join',(data,ack)=>run(ack,()=>{vacant();limit('join:'+socket.handshake.address,30);const result=engine.join(data?.code,data?.nickname);bind(socket,result.session);ack({ok:true,session:result.session});emitState(result.room);}));
  socket.on('game:state-sync',(data,ack)=>run(ack,()=>{if(socket.data.session&&(socket.data.session.playerId!==data?.playerId||socket.data.session.roomCode!==data?.roomCode))throw new Error('Már másik szobához csatlakoztál.');const r=engine.reconnect(data);bind(socket,data);ack({ok:true,session:data});emitState(r);for(const peer of io.sockets.sockets.values())if(peer.id!==socket.id&&peer.data.session?.roomCode===r.code)peer.emit('player:reconnected',{playerId:data.playerId});}));
  function action(event:'game:configure'|'game:start'|'game:secret-submit'|'game:guess-submit'|'game:rematch-request',fn:(s:Session,data:any)=>Room){
   socket.on(event,((data:unknown,ack:Ack)=>run(ack,()=>{const s=member(),old=engine.get(s.roomCode);const r=fn(s,data);ack({ok:true});
    emitState(r);
    if(event==='game:guess-submit')socket.emit('game:guess-result',engine.player(r,s.playerId).guesses.at(-1)!);
    if(old.round!==r.round)for(const peer of io.sockets.sockets.values())if(peer.data.session?.roomCode===r.code)peer.emit('game:round-complete',{round:old.round});
    if(old.status!=='PLAYING'&&r.status==='PLAYING')notify(r,'game:ready');
    if(old.status!=='FINISHED'&&r.status==='FINISHED')notify(r,'game:finished');
    if(old.gameId!==r.gameId)notify(r,'game:rematch-accepted');
   })) as any);
  }
  action('game:configure',(s,d)=>engine.configure(s.roomCode,s.playerId,d));
  action('game:start',s=>engine.start(s.roomCode,s.playerId));
  action('game:secret-submit',(s,d)=>engine.secret(s.roomCode,s.playerId,d?.gameId,d?.colors));
  action('game:guess-submit',(s,d)=>engine.guess(s.roomCode,s.playerId,d?.gameId,d?.round,d?.colors));
  action('game:rematch-request',s=>engine.rematch(s.roomCode,s.playerId));
  socket.on('room:leave',(_data,ack)=>run(ack,()=>{const s=member(),r=engine.leave(s.roomCode,s.playerId);for(const peer of io.sockets.sockets.values())if(peer.data.session?.playerId===s.playerId){peer.data.session=undefined;if(peer.id!==socket.id)peer.disconnect(true);}ack({ok:true});emitState(r);}));
  socket.on('disconnect',()=>{if(shuttingDown)return;const s=socket.data.session;if(!s)return;const other=[...io.sockets.sockets.values()].some(peer=>peer.data.session?.playerId===s.playerId);if(other)return;try{const r=engine.disconnect(s.roomCode,s.playerId);emitState(r);for(const peer of io.sockets.sockets.values())if(peer.data.session?.roomCode===r.code)peer.emit('player:disconnected',{playerId:s.playerId});}catch{/* Expired/closed rooms need no notification. */}});
 });
 let ticks=0;
 const timer=setInterval(()=>{try{for(const r of engine.sweep()){emitState(r);if(r.status==='FINISHED')notify(r,'game:finished');}if(++ticks%60===0){store.prune(Date.now());for(const [key,b]of buckets)if(Date.now()-b.at>60_000)buckets.delete(key);}}catch{console.error('Az állapotmentés sikertelen. Ellenőrizd az adatkönyvtárat.');}},1000);
 return {app,http,io,engine,store,close:async()=>{shuttingDown=true;clearInterval(timer);await new Promise<void>(res=>io.close(()=>res()));store.close();}};
}
