import {validDate} from './engine.ts';
import {validateSourceReview} from './source-review.ts';
import {parseCandidates} from './analysis-contract.ts';
import type {AnalysisResult,Candidate} from './analysis-contract.ts';
export type Letter={id:string;title:string;text:string;result:Extract<AnalysisResult,{status:'ok'}>;savedAt:string};
export type Inbox={version:1;draft:string;draftBaseId?:string;draftMessageDate?:string;letters:Letter[];done:Record<string,boolean>;revisions?:Record<string,Revision>;undone?:string[]};
export const emptyInbox=():Inbox=>({version:1,draft:'',letters:[],done:{}});
export function checkLetter(letter:Letter){
 if(!letter||typeof letter.id!=='string'||!letter.id||typeof letter.title!=='string'||typeof letter.text!=='string'||letter.text.length>20000||!letter.result||letter.result.status!=='ok'||letter.result.sourceId!==letter.id||letter.result.sourceText!==letter.text)throw Error('Invalid letter evidence');
 if(letter.result.messageDate!==undefined&&(typeof letter.result.messageDate!=='string'||!validDate(letter.result.messageDate)))throw Error('Invalid message date');
 parseCandidates({candidates:letter.result.candidates,warnings:letter.result.warnings},{id:letter.id,title:letter.title,text:letter.text,lang:'UK',messageDate:letter.result.messageDate});
}
export function restoreInbox(raw:string|null):Inbox{
 if(!raw)return emptyInbox();const x=JSON.parse(raw);
 if(x?.draftMessageDate!==undefined&&(typeof x.draftMessageDate!=='string'||(x.draftMessageDate!==''&&!validDate(x.draftMessageDate))))throw Error('Invalid draft message date');
 if(x?.draftBaseId!==undefined&&typeof x.draftBaseId!=='string')throw Error('Invalid draft target');
 if(x?.version!==1||typeof x.draft!=='string'||x.draft.length>20000||!Array.isArray(x.letters)||x.letters.length>100||!x.done||typeof x.done!=='object'||Array.isArray(x.done)||Object.values(x.done).some(v=>typeof v!=='boolean'))throw Error('Invalid saved inbox');
 const ids=new Set();for(const l of x.letters){checkLetter(l);if(ids.has(l.id))throw Error('Duplicate letter');ids.add(l.id);}eventPlans(x);return x;
}
export function timeConflict(cs:Candidate[],c:Candidate):boolean{
 return ['meeting','departure'].includes(c.kind)&&new Set(cs.filter(x=>x.kind===c.kind).map(x=>`${x.day??'?'}:${x.value}`)).size>1;
}
export function saveLetter(s:Inbox,l:Letter,confirmed:boolean):Inbox{
 if(!confirmed)throw Error('Review the actions and dates first');checkLetter(l);
 if(s.letters.some(x=>x.id===l.id))return s;if(s.letters.length>=100)throw Error('Inbox limit reached');
 return {...s,draft:'',draftBaseId:'',draftMessageDate:'',letters:[l,...s.letters]};
}
export function setActionDone(s:Inbox,id:string,index:number):Inbox{
 const l=s.letters.find(x=>x.id===id),c=l?.result.candidates[index];
 if(!l||!c||!eventPlans(s).some(p=>p.actions.some(a=>a.id===id+':'+index))||c.kind==='dependency'||timeConflict(l.result.candidates,c))throw Error('Clarify the conflicting action first');
 const key=id+':'+index;return {...s,done:{...s.done,[key]:!s.done[key]}};
}

export function orderedActions(candidates:Candidate[]){return candidates.map((candidate,index)=>({candidate,index})).sort((a,b)=>(a.candidate.day??"9999").localeCompare(b.candidate.day??"9999")||a.index-b.index);}


// Conservative text gate, followed by explicit parent confirmation of event identity/scope.
export function isEventCancellation(text:string):boolean{
 return (text.match(/[^.!?\n]+[.!?]?/g)??[]).some(clause=>{
  if(clause.trim().endsWith('?')||/^\s*(?:чи\s|whether\s)/i.test(clause))return false;
  const event=/(?:поїздк|екскурс|поді[яюї]|захід|заход|зустріч|відвідуван|поездк|мероприяти|встреч|trip|visit|event|meeting|wycieczk|wydarzen|spotkani)/i;
  const cancelled=/(?:скасован|скасовано|відмінено|відмінена|отменен|отменён|отменена|отменяется|cancell?ed|odwołan|anulowan)/i;
  const negated=/(?:\bnot\b|\bnever\b|n't|\bnie\b|(?:^|\s)не\s)[^,;.!?]{0,30}(?:скасов|скасован|відмін|отмен|cancel|odwoł|anul)/i;
  return event.test(clause)&&cancelled.test(clause)&&!negated.test(clause);
 });
}
// Suggestions only: keep the exact source sentence and require event/scope confirmation.
// Do not extract a positive fragment out of a question, condition, quotation or contradiction.
export function cancellationQuotes(text:string):string[]{
 const clauses=text.match(/[^.!?\n]+[.!?]?/g)??[];
 const subject=/^(?:(?:оновлення|update|aktualizacja|обновление)\s*:\s*)?(?:(?:the|this|our|entire|whole|ця|вся|наша|всю|эту|всю|nasza|cała)\s+)*(?:поїздк|екскурс|поді[яюї]|захід|зустріч|відвідуван|поездк|мероприяти|встреч|trip\b|visit\b|event\b|meeting\b|wycieczk|wydarzen|spotkani)/i;
 const uncertain=/(?:\b(?:if|unless|might|may|could|possibly|whether|but|however|only)\b|якщо|можливо|ймовір|лише|тільки|частков|але|проте|если|возможно|только|jedynie|tylko|jeśli|może)/i;
 const reversal=/(?:не\s+(?:скасован|відмін|отмен)|\bnot\s+cancel|\bnie\b[^.!?]{0,30}(?:odwoł|anul)|все ж відбуд|відновлен|відновлено|відбудеться за планом|\b(?:reinstated|going ahead|will go ahead|still happening)\b)/i;
 if(clauses.some(c=>reversal.test(c)))return [];
 return [...new Set(clauses.map(c=>c.trim()).filter(c=>c.length<=2000&&subject.test(c.replace(/^\[\d{1,2}:\d{2}(?:,?\s+\d{4}-\d{2}-\d{2})?\]\s+[\p{L}\p{N} _'-]{1,60}:\s*/u,''))&&!uncertain.test(c)&&isEventCancellation(c)))];
}
export type Revision={baseId:string;mode:'update'|'cancel';choices:Record<string,string>;quote?:string};
export type PlanAction={id:string;sourceId:string;index:number;candidate:Candidate;done:boolean};
export type Change={before:Candidate|null;after:Candidate|null;wasDone:boolean};
export type EventPlan={id:string;head:string;title:string;cancelled:boolean;actions:PlanAction[];history:Letter[];changes:Change[];retained:number};
const meaning=(c:Candidate)=>JSON.stringify([c.kind,c.value.trim().toLocaleLowerCase().replace(/\s+/g,' '),c.day]);
export function proposedChoices(plan:EventPlan,letter:Letter):Record<string,string>{
 const choices:Record<string,string>={};const used=new Set<string>();
 letter.result.candidates.forEach((c,i)=>{
  const exact=plan.actions.filter(a=>meaning(a.candidate)===meaning(c));
  const times=plan.actions.filter(a=>a.candidate.kind===c.kind&&a.candidate.day===c.day);
  const match=exact.length===1?exact[0]:['meeting','departure'].includes(c.kind)&&times.length===1&&letter.result.candidates.filter(x=>x.kind===c.kind).length===1?times[0]:undefined;
  choices[i]=match&&!used.has(match.id)?match.id:'';if(choices[i])used.add(choices[i]);
 });return choices;
}
// Replay immutable source history. Missing requirements are retained, never treated as removed.
export function eventPlans(s:Inbox):EventPlan[]{
 const revisions=s.revisions??{},undone=s.undone??[];
 if(!revisions||typeof revisions!=='object'||Array.isArray(revisions)||!Array.isArray(undone)||new Set(undone).size!==undone.length||undone.some(id=>typeof id!=='string'||!Object.hasOwn(revisions,id)))throw Error('Invalid revision history');
 const ids=new Set(s.letters.map(l=>l.id));if(Object.keys(revisions).some(id=>!ids.has(id)))throw Error('Orphan revision');
 const plans:EventPlan[]=[],versions=new Map<string,EventPlan>();
 for(const letter of [...s.letters].reverse()){
  const revision=Object.hasOwn(revisions,letter.id)?revisions[letter.id]:undefined;
  const fresh=(c:Candidate,index:number):PlanAction=>({id:letter.id+':'+index,sourceId:letter.id,index,candidate:c,done:!!s.done[letter.id+':'+index]});
  if(!revision){const initial:EventPlan={id:letter.id,head:letter.id,title:letter.title,cancelled:false,actions:letter.result.candidates.map(fresh),history:[letter],changes:[],retained:0};plans.push(initial);versions.set(letter.id,{...initial,history:[...initial.history]});continue;}
  if(!revision||!['update','cancel'].includes(revision.mode)||typeof revision.baseId!=='string'||!revision.choices||typeof revision.choices!=='object'||Array.isArray(revision.choices))throw Error('Invalid revision');
  const base=versions.get(revision.baseId);if(!base||base.cancelled)throw Error('Stale or cancelled event');
  const plan={...base,history:[...base.history]},current=plans.find(p=>p.id===base.id)!;
  if(!undone.includes(letter.id)&&(current.head!==revision.baseId||current.cancelled))throw Error('Stale or cancelled event');
  if(revision.mode==='cancel'){
   if(letter.result.candidates.length||Object.keys(revision.choices).length)throw Error('Cancellation cannot contain active requirements');
   if(typeof revision.quote!=='string'||!isEventCancellation(revision.quote))throw Error('Need an explicit whole-event cancellation statement');
   validateSourceReview({id:letter.id,title:letter.title,text:letter.text,lang:'UK',review:{event:plan.title,status:'cancelled',quote:revision.quote}});
  }else{
   if(revision.quote!==undefined||Object.keys(revision.choices).length!==letter.result.candidates.length||Object.keys(revision.choices).some(k=>String(Number(k))!==k||!/^\d+$/.test(k)||Number(k)>=letter.result.candidates.length))throw Error('Review every new action');
   const targets=Object.values(revision.choices);if(targets.some(v=>typeof v!=='string')||new Set(targets.filter(Boolean)).size!==targets.filter(Boolean).length)throw Error('Duplicate replacement');
   letter.result.candidates.forEach((c,i)=>{const id=revision.choices[i];if(id&&!plan.actions.some(a=>a.id===id&&a.candidate.kind===c.kind))throw Error('Replacement is not an active action of this event');});
  }
  plan.history.push(letter);current.history.push(letter);
  const before=plan.actions;
  if(revision.mode==='cancel'){
   plan.changes=before.map(a=>({before:a.candidate,after:null,wasDone:a.done}));plan.actions=[];plan.cancelled=true;plan.retained=0;
  }else{
   const replaced=new Set(Object.values(revision.choices).filter(Boolean));
   const retained=before.filter(a=>!replaced.has(a.id));const changes:Change[]=[];
   const updated=letter.result.candidates.map((c,i)=>{
    const old=before.find(a=>a.id===revision.choices[i]);
    if(old&&meaning(old.candidate)===meaning(c))return {...old,sourceId:letter.id,index:i,candidate:c};
    changes.push({before:old?.candidate??null,after:c,wasDone:old?.done??false});
    // Changed or reinstated requirements always need a fresh completion, even after undo.
    return {...fresh(c,i),done:!!s.done[letter.id+':'+i]};
   });
   plan.actions=[...retained,...updated];plan.changes=changes;plan.retained=retained.length+updated.filter(a=>before.some(b=>b.id===a.id)).length;
  }
  plan.head=letter.id;versions.set(letter.id,plan);
  if(!undone.includes(letter.id))Object.assign(current,{head:plan.head,actions:plan.actions,cancelled:plan.cancelled,changes:plan.changes,retained:plan.retained});
 }
 return plans.reverse();
}
export function saveRevision(s:Inbox,l:Letter,revision:Revision,confirmed:boolean):Inbox{
 if(!confirmed)throw Error('Confirm the event and its changes');checkLetter(l);
 if(s.letters.some(x=>x.id===l.id)){
  if(JSON.stringify(s.revisions?.[l.id])===JSON.stringify(revision)&&JSON.stringify(s.letters.find(x=>x.id===l.id))===JSON.stringify(l))return s;
  throw Error('Source id already used');
 }
 const next={...saveLetter(s,l,true),revisions:{...s.revisions,[l.id]:revision}};eventPlans(next);return next;
}
export function setPlanActionDone(s:Inbox,planId:string,actionId:string):Inbox{
 const plan=eventPlans(s).find(p=>p.id===planId),action=plan?.actions.find(a=>a.id===actionId);
 if(!plan||!action||action.candidate.kind==='dependency'||timeConflict(plan.actions.map(a=>a.candidate),action.candidate))throw Error('Clarify this action first');
 return {...s,done:{...s.done,[actionId]:!s.done[actionId]}};
}
export function undoRevision(s:Inbox,head:string):Inbox{
 if(!eventPlans(s).some(p=>p.head===head)||!s.revisions?.[head])throw Error('Only the current revision can be undone');
 const next={...s,undone:[...(s.undone??[]),head]};eventPlans(next);return next;
}

export function orderedPlanActions(actions:PlanAction[]):PlanAction[]{
 const rank=(c:Candidate)=>['item','task'].includes(c.kind)?0:['meeting','departure'].includes(c.kind)?1:2;
 return [...actions].sort((a,b)=>Number(a.done)-Number(b.done)||(a.candidate.day??'9999').localeCompare(b.candidate.day??'9999')||rank(a.candidate)-rank(b.candidate)||(rank(a.candidate)===1?a.candidate.value.localeCompare(b.candidate.value):0));
}
