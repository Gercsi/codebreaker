import { DIFFICULTIES, type Settings, type Score, type PegFeedback } from '../shared/protocol.js';
export function validateCode(input:unknown,settings:Settings):asserts input is number[] {
 const {length,colors}=DIFFICULTIES[settings.difficulty];
 if(!Array.isArray(input)||input.length!==length) throw new Error(`Pontosan ${length} színt válassz!`);
 if(input.some(c=>!Number.isInteger(c)||c<0||c>=colors)) throw new Error('Érvénytelen szín.');
 if(!settings.repeats&&new Set(input).size!==length) throw new Error('Ebben a játékban a színek nem ismétlődhetnek.');
}
export function evaluateDetailed(secret:readonly number[],guess:readonly number[]):Score & {feedback:PegFeedback[]} {
 if(secret.length!==guess.length) throw new Error('Eltérő kódhossz.');
 const feedback:PegFeedback[]=Array(guess.length).fill('miss');
 const remaining=new Map<number,number>();
 // Exact matches consume their occurrences first. Remaining copies match left to right.
 secret.forEach((c,i)=>{if(c===guess[i])feedback[i]='exact';else remaining.set(c,(remaining.get(c)||0)+1);});
 guess.forEach((c,i)=>{if(feedback[i]!=='exact'&&(remaining.get(c)||0)>0){feedback[i]='partial';remaining.set(c,remaining.get(c)!-1);}});
 return {exact:feedback.filter(f=>f==='exact').length,partial:feedback.filter(f=>f==='partial').length,feedback};
}
export function evaluate(secret:readonly number[],guess:readonly number[]):Score {
 const {exact,partial}=evaluateDetailed(secret,guess);return {exact,partial};
}
