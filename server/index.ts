import 'dotenv/config';
import {createApp} from './app.js';
const positive=(value:string|undefined,fallback:number)=>{const number=Number(value);return Number.isFinite(number)&&number>0?number:fallback;};
const server=await createApp({database:process.env.DATABASE_PATH??'./data/codebreaker.sqlite',origins:process.env.ALLOWED_ORIGINS?.split(',').map(v=>v.trim())??['http://localhost:5173','http://localhost:3001'],grace:positive(process.env.RECONNECT_SECONDS,120)*1000,ttl:positive(process.env.ROOM_TTL_HOURS,24)*3600_000});
const port=positive(process.env.PORT,3001);
server.http.listen(port,process.env.HOST??'0.0.0.0',()=>console.log(`CodeBreaker: http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void server.close().then(()=>process.exit(0));});
