export const COLORS = [
  {name:'Piros',hex:'#f16c72',symbol:'●'}, {name:'Kék',hex:'#619cf5',symbol:'◆'},
  {name:'Zöld',hex:'#7cc79c',symbol:'▲'}, {name:'Sárga',hex:'#edce75',symbol:'★'},
  {name:'Lila',hex:'#b294ef',symbol:'✦'}, {name:'Narancs',hex:'#efa16f',symbol:'■'},
  {name:'Türkiz',hex:'#71d0cf',symbol:'✚'}, {name:'Rózsaszín',hex:'#e894bc',symbol:'♥'}
] as const;
export const DIFFICULTIES = {easy:{label:'Könnyű',length:4,colors:6},normal:{label:'Normál',length:5,colors:8},hard:{label:'Nehéz',length:6,colors:8}} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export interface Settings {difficulty:Difficulty; repeats:boolean; maxAttempts:number; helper:boolean}
export type Status = 'WAITING'|'SETUP'|'PLAYING'|'FINISHED'|'CLOSED';
export interface Score {exact:number; partial:number}
export type PegFeedback = 'exact'|'partial'|'miss';
export interface Guess extends Score {round:number; colors:number[]; feedback?:PegFeedback[]}
export interface PublicPlayer {id:string; nickname:string; connected:boolean; ready:boolean; submitted:boolean; rematch:boolean; reconnectUntil:number|null}
export interface RoomView {
 code:string; gameId:string; hostId:string; meId:string; status:Status; settings:Settings;
 round:number; players:PublicPlayer[]; guesses:Guess[]; ownSecret:number[]|null;
 winnerId:string|null; resultType:'solved'|'exhausted'|'forfeit'|null;
 reveal:null|{id:string; secret:number[]|null; guesses:Guess[]}[];
 expiresAt:number;
}
export interface Session {roomCode:string; playerId:string; token:string}
export type Reply = {ok:true; session?:Session}|{ok:false; error:string};
export type Ack = (reply:Reply)=>void;
export interface ClientEvents {
 'room:create':(data:{nickname:string},ack:Ack)=>void;
 'room:join':(data:{nickname:string;code:string},ack:Ack)=>void;
 'room:leave':(data:Record<string,never>,ack:Ack)=>void;
 'game:configure':(data:Settings,ack:Ack)=>void;
 'game:start':(data:Record<string,never>,ack:Ack)=>void;
 'game:secret-submit':(data:{gameId:string;colors:number[]},ack:Ack)=>void;
 'game:guess-submit':(data:{gameId:string;round:number;colors:number[]},ack:Ack)=>void;
 'game:rematch-request':(data:Record<string,never>,ack:Ack)=>void;
 'game:state-sync':(data:Session,ack:Ack)=>void;
}
export interface ServerEvents {
 'room:state':(state:RoomView)=>void;
 'game:ready':()=>void;
 'game:guess-result':(guess:Guess)=>void;
 'game:round-complete':(data:{round:number})=>void;
 'game:finished':()=>void;
 'game:rematch-accepted':()=>void;
 'player:disconnected':(data:{playerId:string})=>void;
 'player:reconnected':(data:{playerId:string})=>void;
}
