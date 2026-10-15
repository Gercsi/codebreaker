import { DIFFICULTIES, type Settings, type Score } from '../shared/protocol.js';
export function validateCode(input:unknown,settings:Settings):asserts input is number[] {
 const {length,colors}=DIFFICULTIES[settings.difficulty];
 if(!Array.isArray(input)||input.length!==length) throw new Error(`Pontosan ${length} színt válassz!`);
 if(input.some(c=>!Number.isInteger(c)||c<0||c>=colors)) throw new Error('Érvénytelen szín.');
 if(!settings.repeats&&new Set(input).size!==length) throw new Error('Ebben a játékban a színek nem ismétlődhetnek.');
}
export function evaluate(secret:readonly number[],guess:readonly number[]):Score {
 if(secret.length!==guess.length) throw new Error('Eltérő kódhossz.');
 let exact=0,partial=0; const remaining=new Map<number,number>();
 secret.forEach((c,i)=>{if(c===guess[i]) exact++;else remaining.set(c,(remaining.get(c)||0)+1);});
 guess.forEach((c,i)=>{if(c!==secret[i]&&(remaining.get(c)||0)>0){partial++;remaining.set(c,remaining.get(c)!-1);}});
 return {exact,partial};
}
