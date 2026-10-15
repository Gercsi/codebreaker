import initSqlJs, {type Database} from 'sql.js';
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import type {Room} from './engine.js';
export class Store {
 constructor(private db:Database,private path:string){db.run('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS results (game_id TEXT PRIMARY KEY, room_code TEXT NOT NULL, result TEXT NOT NULL, finished_at INTEGER NOT NULL)');}
 static async open(path:string){const SQL=await initSqlJs();const full=resolve(path);mkdirSync(dirname(full),{recursive:true});return new Store(new SQL.Database(existsSync(full)?readFileSync(full):undefined),full);}
 load():Room[]{const result=this.db.exec('SELECT state FROM rooms');return result.length?result[0].values.map(row=>JSON.parse(String(row[0]))):[];}
 save(room:Room){this.db.run('BEGIN');try{
  this.db.run('INSERT OR REPLACE INTO rooms(code,state) VALUES (?,?)',[room.code,JSON.stringify(room)]);
  if(room.status==='FINISHED')this.db.run('INSERT OR IGNORE INTO results(game_id,room_code,result,finished_at) VALUES (?,?,?,?)',[room.gameId,room.code,JSON.stringify({winnerId:room.winnerId,type:room.resultType,players:room.players.map(p=>({id:p.id,nickname:p.nickname,attempts:p.guesses.length,solved:p.guesses.some(g=>g.exact===p.secret?.length)}))}),Date.now()]);
  this.db.run('COMMIT');this.flush();
 }catch(error){try{this.db.run('ROLLBACK');}catch{};this.reload();throw error;}}
 prune(now:number){this.db.run("DELETE FROM rooms WHERE json_extract(state,'$.expiresAt') <= ? OR json_extract(state,'$.status') = 'CLOSED'",[now]);this.flush();}
 private flush(){const temporary=this.path+'.tmp';writeFileSync(temporary,Buffer.from(this.db.export()),{mode:0o600});renameSync(temporary,this.path);}
 private reload(){if(existsSync(this.path)){const Constructor=this.db.constructor as new(data:Uint8Array)=>Database;this.db.close();this.db=new Constructor(readFileSync(this.path));}}
 close(){this.db.close();}
}
