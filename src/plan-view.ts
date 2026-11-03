import {orderedPlanActions,timeConflict} from './action-inbox.ts';
import type {EventPlan} from './action-inbox.ts';

// Display ordering only. Never resolve conflicting evidence or mark work complete.
export function planView(plan:EventPlan){
 const sorted=orderedPlanActions(plan.actions),candidates=sorted.map(a=>a.candidate);
 const pending=sorted.filter(a=>!a.done),done=sorted.filter(a=>a.done);
 const conflicting=sorted.filter(a=>timeConflict(candidates,a.candidate));
 const next=pending.find(a=>a.candidate.kind!=='dependency'&&!timeConflict(candidates,a.candidate));
 const meeting=sorted.find(a=>a.candidate.kind==='meeting'&&!timeConflict(candidates,a.candidate));
 const departure=sorted.find(a=>a.candidate.kind==='departure'&&!timeConflict(candidates,a.candidate));
 const meetingChange=plan.changes.find(c=>c.after?.kind==='meeting'&&c.before?.kind==='meeting');
 return {pending,done,next,meeting,departure,meetingChange,conflicting};
}
