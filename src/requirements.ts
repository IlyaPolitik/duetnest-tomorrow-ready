import {activeFacts,conflicts,tasks} from './engine.ts';
import type {Task} from './engine.ts';
import type {Plans} from './plans.ts';
import type {Rehearsal} from './rehearsal-state.ts';
import {issues} from './feasibility.ts';
import type {Minutes,Preparation} from './feasibility.ts';

export type RequirementBinding={taskId:string;preparationId:string;day:string;event:string;label:string;fingerprint:string;status:'confirmed'|'review';previousDuration?:Minutes};
export type RequirementOption={task:Task;fingerprint:string};
const changedRequirement='A linked document requirement changed. Review its action and duration again.';
const sharedRequirement='Other changed requirements still link to this action. Review them too.';
const linkProblem=(reason:string|undefined)=>reason===changedRequirement||reason===sharedRequirement;
export function requirementOptions(state:Rehearsal,plans:Plans|null):RequirementOption[]{
 const document=plans?.days[state.input.day],event=state.binding?.event;
 if(!document||!event||state.binding?.status!=='confirmed')return [];
 return tasks(document).filter(t=>['item','task'].includes(t.kind)&&t.facts[0].event===event).map(task=>({task,
  fingerprint:JSON.stringify([document.day,event,task.id,task.facts.map(f=>[f,document.sources.find(s=>s.id===f.sourceId)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])}));
}
export function validRequirements(value:unknown):value is RequirementBinding[]{
 if(!Array.isArray(value)||value.length>100)return false;
 const seen=new Set<string>();
 return value.every(b=>{if(!b||['taskId','preparationId','day','event','label','fingerprint'].some(k=>typeof b[k]!=='string'||!b[k].trim()||b[k].length>500000)||!['confirmed','review'].includes(b.status)||seen.has(b.taskId))return false;
  if(b.previousDuration&&(!Number.isInteger(b.previousDuration.min)||!Number.isInteger(b.previousDuration.max)||b.previousDuration.min<0||b.previousDuration.max>120||b.previousDuration.min>b.previousDuration.max))return false;
  seen.add(b.taskId);return true;});
}
export function reconcileRequirements(state:Rehearsal,plans:Plans|null):Rehearsal{
 const options=requirementOptions(state,plans);
 if(state.choice&&options.some(o=>!state.requirements?.some(b=>b.taskId===o.task.id&&b.fingerprint===o.fingerprint&&b.status==='confirmed')))state={...state,choice:null};
 if(!state.requirements?.length)return state;
 const stale=state.requirements.filter(b=>b.status==='review'||b.day!==state.input.day||!state.input.preparation.some(t=>t.id===b.preparationId)||!options.some(o=>o.task.id===b.taskId&&o.fingerprint===b.fingerprint));
 if(!stale.length)return state;
 const ids=new Set(stale.map(b=>b.preparationId));
 const message=changedRequirement;
 if(!state.choice&&stale.every(b=>b.status==='review')&&state.input.preparation.filter(t=>ids.has(t.id)).every(t=>t.duration===null&&Boolean(t.unresolved)))return state;
 return {...state,choice:null,requirements:state.requirements.map(b=>{
  if(!stale.includes(b))return b;
  const previousDuration=b.previousDuration??state.input.preparation.find(t=>t.id===b.preparationId)?.duration;
  return {...b,status:'review',...(previousDuration?{previousDuration}:{})};
 }),input:{...state.input,preparation:state.input.preparation.map(t=>ids.has(t.id)?{...t,duration:null,unresolved:t.unresolved&&!linkProblem(t.unresolved)?t.unresolved:message}:t)}};
}
export function linkRequirement(state:Rehearsal,plans:Plans|null,taskId:string,fingerprint:string,preparationId:string,duration:Minutes,reviewed:boolean):Rehearsal{
 if(!reviewed)throw new Error('Confirm the quote and the action that covers it.');
 const option=requirementOptions(state,plans).find(o=>o.task.id===taskId&&o.fingerprint===fingerprint);
 if(!option)throw new Error('The requirement changed. Review the current document again.');
 const existing=state.input.preparation.find(t=>t.id===preparationId);
 if((state.requirements?.length??0)>=100&&!state.requirements?.some(b=>b.taskId===taskId))throw new Error('This scenario supports at most 100 requirement links.');
 if(!existing&&state.input.preparation.length>=12)throw new Error('This morning supports at most 12 actions. Map to an existing action or simplify the plan.');
 if(!preparationId||(!existing&&(state.requirements??[]).some(b=>b.preparationId===preparationId)))throw new Error('Choose an existing action or create a new one.');
 const {unresolved:_,...action}=existing??{id:preparationId,label:option.task.label.slice(0,100),duration:null,after:[],mayMove:false};
 const updated:Preparation={...action,duration};
 if(existing?.unresolved&&!linkProblem(existing.unresolved))updated.unresolved=existing.unresolved;
 const binding:RequirementBinding={taskId,preparationId,day:state.input.day,event:state.binding!.event,label:option.task.label,fingerprint,status:'confirmed'};
 const requirements=[...(state.requirements??[]).filter(b=>b.taskId!==taskId),binding];
 // One action can cover several requirements. Any other stale link keeps it blocked.
 const otherStale=requirements.some(b=>b.preparationId===preparationId&&b.status==='review');
 if(otherStale&&!updated.unresolved)updated.unresolved=sharedRequirement;
 const input={...state.input,preparation:existing?state.input.preparation.map(t=>t.id===preparationId?updated:t):[...state.input.preparation,updated]};
 const errors=issues(input);if(errors.length)throw new Error(errors.join(' '));
 return reconcileRequirements({...state,input,requirements,choice:null},plans);
}
export function unlinkRequirement(state:Rehearsal,taskId:string):Rehearsal{
 const binding=state.requirements?.find(b=>b.taskId===taskId);
 if(!binding)return state;
 const requirements=state.requirements!.filter(b=>b.taskId!==taskId);
 return {...state,requirements,choice:null,input:{...state.input,preparation:state.input.preparation.map(t=>{
  if(t.id!==binding.preparationId||requirements.some(b=>b.preparationId===t.id&&b.status==='review'))return t;
  const {unresolved,...action}=t;return {...action,duration:null,...(unresolved&&!linkProblem(unresolved)?{unresolved}:{})};
 })}};
}
export function preparationReview(state:Rehearsal,plans:Plans|null){
 const day=plans?.days[state.input.day],event=state.binding?.event;
 const options=requirementOptions(state,plans);
 const uncovered=options.filter(o=>!state.requirements?.some(b=>b.taskId===o.task.id&&b.fingerprint===o.fingerprint&&b.status==='confirmed'&&state.input.preparation.some(t=>t.id===b.preparationId)));
 const pending=options.filter(o=>!o.task.done);
 const dependencies=day&&event?activeFacts(day).filter(f=>f.event===event&&f.kind==='dependency'):[];
 const unresolvedConflicts=day&&event?conflicts(day).filter(c=>c.facts[0].event===event&&!c.resolved):[];
 const unclassified=day?day.sources.filter(s=>!day.sources.some(n=>n.supersedes===s.id)&&!activeFacts(day).some(f=>f.sourceId===s.id)):[];
 const stale=state.requirements?.filter(b=>b.status==='review')??[];
 return {options,uncovered,pending,dependencies,unresolvedConflicts,unclassified,stale,linked:Boolean(state.binding?.status==='confirmed'),
  needsAttention:!options.length||!plans||!state.binding||state.binding.status!=='confirmed'||Boolean(uncovered.length||pending.length||dependencies.length||unresolvedConflicts.length||unclassified.length||stale.length)};
}
