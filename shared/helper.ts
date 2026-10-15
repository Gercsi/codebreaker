import type {Guess} from './protocol.js';

export interface HelperKnowledge {fixed:(number|null)[]; minimum:number[]; absent:boolean[]}
// Only use the player's already received feedback, never the opponent's secret.
export function helperKnowledge(guesses:readonly Guess[],length:number,count:number):HelperKnowledge {
 const fixed:(number|null)[]=Array(length).fill(null),minimum:number[]=Array(count).fill(0),absent:boolean[]=Array(count).fill(false);
 for(const guess of guesses){
  if(!guess.feedback)continue;
  const matched=Array(count).fill(0),attempted=Array(count).fill(0);
  guess.colors.forEach((color,i)=>{attempted[color]++;if(guess.feedback![i]!=='miss')matched[color]++;if(guess.feedback![i]==='exact')fixed[i]=color;});
  for(let c=0;c<count;c++){minimum[c]=Math.max(minimum[c],matched[c]);if(attempted[c]>0&&matched[c]===0)absent[c]=true;}
 }
 return {fixed,minimum,absent};
}
export function feedbackLabel(guess:Guess,index:number):string {
 const result=guess.feedback?.[index];
 if(result==='exact')return 'Jó helyen';
 if(result==='partial')return 'Más helyen';
 const hasMatch=guess.colors.some((c,i)=>c===guess.colors[index]&&guess.feedback?.[i]!=='miss');
 return hasMatch?'Többlet':'Nincs benne';
}
