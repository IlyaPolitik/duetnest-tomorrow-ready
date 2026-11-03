import test from 'node:test';
import assert from 'node:assert/strict';
import {addFact,addSource,emptyState,tasks,toggleTask} from '../src/engine.ts';
import {initialPlans} from '../src/plans.ts';
import {confirmMeeting,meetingOptions} from '../src/meeting-binding.ts';
import {newRehearsal,reconcileMeeting,restoreRehearsal,useMeeting} from '../src/rehearsal-state.ts';
import {linkRequirement,preparationReview,requirementOptions,unlinkRequirement} from '../src/requirements.ts';
import {acceptRepair,evaluateMorning,findRepair} from '../src/feasibility.ts';

function fixture(){
 let documents={...emptyState(),day:'2026-10-28'};
 documents=addSource(documents,{id:'meeting',title:'School time',lang:'EN',text:'28 October 2026. Meeting 07:45.'},[{id:'time',sourceId:'meeting',event:'Trip',kind:'meeting',value:'07:45',quote:'Meeting 07:45.',minutes:0}]);
 documents=addSource(documents,{id:'packing',title:'Packing list',lang:'EN',text:'Bring water. Bring a jacket. Pickup person is unknown.'},[
  {id:'water',sourceId:'packing',event:'Trip',kind:'item',value:'Bring water',quote:'Bring water.',minutes:2},
  {id:'jacket',sourceId:'packing',event:'Trip',kind:'item',value:'Bring a jacket',quote:'Bring a jacket.',minutes:2},
  {id:'pickup',sourceId:'packing',event:'Trip',kind:'dependency',value:'Who is picking up?',quote:'Pickup person is unknown.',minutes:0},
 ]);
 const plans=initialPlans(documents),option=meetingOptions(plans,documents.day,'Trip')[0];
 const state=useMeeting(newRehearsal(),confirmMeeting(plans,documents.day,'Trip','time',option.fingerprint,true));
 return {documents,plans,state};
}
function cover(){
 let {state,plans,documents}=fixture();
 for(const o of requirementOptions(state,plans))state=linkRequirement(state,plans,o.task.id,o.fingerprint,'bag',{min:15,max:15},true);
 return {state,plans,documents};
}
test('requirements do not inherit model two-minute estimates or mark themselves done',()=>{
 const {state,plans}=fixture(),review=preparationReview(state,plans);
 assert.equal(review.uncovered.length,2);assert.equal(review.pending.length,2);assert.equal(review.dependencies.length,1);
 const o=review.options[0];
 assert.throws(()=>linkRequirement(state,plans,o.task.id,o.fingerprint,'new-action',{min:NaN,max:2},true));
 const linked=linkRequirement(state,plans,o.task.id,o.fingerprint,'new-action',{min:8,max:12},true);
 assert.deepEqual(linked.input.preparation.at(-1)?.duration,{min:8,max:12});
 assert.equal(linked.input.preparation.at(-1)?.mayMove,false);
 assert.equal(preparationReview(linked,plans).pending.length,2);
});
test('shared action covers both requirements once and still exposes external dependency',()=>{
 const {state,plans}=cover();
 assert.equal(state.input.preparation.length,1);assert.equal(preparationReview(state,plans).uncovered.length,0);
 assert.deepEqual(evaluateMorning(state.input).preparation,{min:15,max:15});
 assert.equal(preparationReview(state,plans).needsAttention,true);
 assert.equal(preparationReview(state,plans).dependencies[0].value,'Who is picking up?');
});
test('changed packing document invalidates durations and choice even with unchanged meeting',()=>{
 const {state,plans,documents}=cover();state.input.preparation[0].mayMove=true;
 state.choice=acceptRepair(state.input,['bag']);
 const changed=addSource(documents,{id:'packing2',supersedes:'packing',title:'New packing list',lang:'EN',text:'Bring two water bottles.'});
 const stale=reconcileMeeting(state,initialPlans(changed));
 assert.equal(stale.binding?.status,'confirmed');assert.equal(stale.input.meeting,465);
 assert.equal(stale.choice,null);assert.equal(stale.input.preparation[0].duration,null);
 assert.ok(stale.input.preparation[0].unresolved);assert.equal(evaluateMorning(stale.input).status,'unknown');
 assert.ok(stale.requirements?.every(b=>b.status==='review'));
 assert.deepEqual(stale.requirements?.[0].previousDuration,{min:15,max:15},'retain the old estimate without trusting it');
 const restored=reconcileMeeting(restoreRehearsal(JSON.stringify(stale)),plans);
 assert.equal(evaluateMorning(restored.input).status,'unknown','return of an old source does not restore consent');
});
test('source race, false consent, stale day and unrelated event cannot create a mapping',()=>{
 const {state,plans,documents}=fixture(),o=requirementOptions(state,plans)[0];
 assert.throws(()=>linkRequirement(state,plans,o.task.id,o.fingerprint,'bag',{min:1,max:2},false));
 assert.throws(()=>linkRequirement(state,plans,o.task.id,'old-token','bag',{min:1,max:2},true));
 assert.throws(()=>linkRequirement({...state,input:{...state.input,day:'2026-10-29'}},plans,o.task.id,o.fingerprint,'bag',{min:1,max:2},true));
 const other=addFact(documents,{id:'other',sourceId:'packing',event:'Other trip',kind:'task',value:'Other water',quote:'Bring water.',minutes:2});
 assert.equal(requirementOptions(state,initialPlans(other)).length,2);
 const changed={...documents,sources:documents.sources.map(s=>s.id==='packing'?{...s,text:s.text+' Correction.'}:s)};
 assert.throws(()=>linkRequirement(state,initialPlans(changed),o.task.id,o.fingerprint,'bag',{min:1,max:2},true));
});
test('task completion is separate from timing and does not invalidate a mapped duration',()=>{
 const {state,documents}=cover();
 const done=toggleTask(documents,tasks(documents).find(t=>t.label==='Bring water')!.fingerprint);
 const unchanged=reconcileMeeting(state,initialPlans(done));
 assert.equal(unchanged,state);assert.equal(preparationReview(state,initialPlans(done)).pending.length,1);
});
test('unreviewed source stays visible and a newly added requirement clears a saved evening choice',()=>{
 const {state,documents}=cover();state.input.preparation[0].mayMove=true;state.choice=acceptRepair(state.input,['bag']);
 const unreviewed=addSource(documents,{id:'extra',title:'Unreviewed correction',lang:'EN',text:'Bring a signed form.'});
 assert.equal(preparationReview(state,initialPlans(unreviewed)).unclassified.length,1);
 const next=addFact(unreviewed,{id:'form',sourceId:'extra',kind:'task',event:'Trip',value:'Prepare form',quote:'Bring a signed form.',minutes:2});
 const checked=reconcileMeeting(state,initialPlans(next));assert.equal(checked.choice,null);
 assert.equal(preparationReview(checked,initialPlans(next)).uncovered.length,1);
});
test('removing an obsolete link preserves documents and action but does not invent a duration',()=>{
 const {state,plans}=cover(),before=JSON.stringify(plans);
 const next=unlinkRequirement(state,state.requirements![0].taskId);
 assert.equal(next.input.preparation.length,1);assert.equal(next.input.preparation[0].duration,null);
 assert.equal(next.requirements?.length,1);assert.equal(JSON.stringify(plans),before);
 assert.equal(evaluateMorning(next.input).status,'unknown');
});
test('restoration preserves valid links and rejects duplicate or corrupt links',()=>{
 const {state}=cover();assert.deepEqual(restoreRehearsal(JSON.stringify(state)).requirements,state.requirements);
 assert.throws(()=>restoreRehearsal(JSON.stringify({...state,requirements:[...state.requirements!,state.requirements![0]]})));
 assert.throws(()=>restoreRehearsal(JSON.stringify({...state,requirements:[{}]})));
 assert.equal(restoreRehearsal(JSON.stringify(newRehearsal())).requirements,undefined);
});
test('zero extra headroom is not resilience to five more minutes of travel',()=>{
 const {state}=cover();state.input.preparation[0].mayMove=true;
 const r=findRepair(state.input).variant!;assert.equal(r.verdict.slack!.min-state.input.buffer!,0);
 assert.equal(evaluateMorning({...state.input,travel:{min:25,max:30}},r.moved).status,'infeasible');
});
test('separate actions respect the twelve-action bound',()=>{
 const {state,plans}=fixture();state.input.preparation=Array.from({length:12},(_,i)=>({...state.input.preparation[0],id:`p${i}`}));
 const o=requirementOptions(state,plans)[0];
 assert.throws(()=>linkRequirement(state,plans,o.task.id,o.fingerprint,'thirteenth',{min:1,max:2},true));
 assert.equal(linkRequirement(state,plans,o.task.id,o.fingerprint,'p0',{min:1,max:2},true).input.preparation.length,12);
});
test('mapping a requirement cannot resolve an independent external constraint',()=>{
 const {state,plans}=fixture();state.input.preparation[0].unresolved='A required signature is unavailable.';
 const o=requirementOptions(state,plans)[0];
 const linked=linkRequirement(state,plans,o.task.id,o.fingerprint,'bag',{min:10,max:15},true);
 assert.equal(linked.input.preparation[0].unresolved,'A required signature is unavailable.');
 assert.equal(evaluateMorning(linked.input).status,'unknown');
 assert.equal(unlinkRequirement(linked,o.task.id).input.preparation[0].unresolved,'A required signature is unavailable.');
});
