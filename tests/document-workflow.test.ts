import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addSource,conflicts,emptyState,tasks,toggleTask,resolveConflict,activeFacts} from '../src/engine.ts';
import {acceptCandidate} from '../src/review.ts';
import {initialPlans} from '../src/plans.ts';
import {confirmMeeting,meetingOptions} from '../src/meeting-binding.ts';
import {newRehearsal,reconcileMeeting,useMeeting} from '../src/rehearsal-state.ts';
import {linkRequirement,requirementOptions} from '../src/requirements.ts';
import {evaluateMorning} from '../src/feasibility.ts';
import type {AnalysisResult} from '../src/analysis-contract.ts';
const record=JSON.parse(readFileSync(new URL('./fixtures/evaluation/pl-original-recorded.json',import.meta.url),'utf8')).result as Extract<AnalysisResult,{status:'ok'}>;
function fixture(){
 let state=addSource({...emptyState(),day:record.day},{id:record.sourceId,title:'Recorded fictional PL letter',lang:'PL',text:record.sourceText});
 for(let i=0;i<record.candidates.length;i++)state=acceptCandidate(state,record,i,true);
 const plans=initialPlans(state),option=meetingOptions(plans,state.day,record.event)[0];
 let scenario=useMeeting({...newRehearsal(),input:{...newRehearsal().input,day:state.day}},confirmMeeting(plans,state.day,record.event,option.fact.id,option.fingerprint,true));
 for(const r of requirementOptions(scenario,plans))scenario=linkRequirement(scenario,plans,r.task.id,r.fingerprint,'bag',{min:15,max:15},true);
 return {state,scenario};
}
test('recorded live candidates → confirmed facts → independent contradictory document blocks timing',()=>{
 const {state,scenario}=fixture();
 const contradicted=addSource(state,{id:'independent',title:'Another office',lang:'PL',text:'3 listopada 2026. Zbiórka o 08:00.'},[{id:'other-time',sourceId:'independent',event:record.event,kind:'meeting',value:'08:00',quote:'Zbiórka o 08:00.',minutes:0}]);
 assert.equal(conflicts(contradicted).length,1);assert.equal(conflicts(contradicted)[0].resolved,false);
 const invalid=reconcileMeeting(scenario,initialPlans(contradicted));
 assert.equal(invalid.input.meeting,null);assert.equal(invalid.choice,null);assert.equal(evaluateMorning(invalid.input).status,'unknown');
 const resolved=resolveConflict(contradicted,conflicts(contradicted)[0].key,'other-time');
 assert.equal(reconcileMeeting(invalid,initialPlans(resolved)).binding?.status,'review','resolving conflict alone is not renewed calculation consent');
});
test('explicit time revision preserves unchanged completion but invalidates old calculation',()=>{
 let {state,scenario}=fixture();
 const water=tasks(state).find(t=>t.kind==='item'&&t.label==='water')!;state=toggleTask(state,water.fingerprint);
 const newFacts=state.facts.map(f=>({...f,id:'v2-'+f.id,sourceId:'revision',...(f.kind==='meeting'?{value:'07:55',quote:'Zbiórka o 07:55.'}:{})}));
 const revised=addSource(state,{id:'revision',title:'Revised fictional letter',lang:'PL',text:record.sourceText.replace('07:40','07:55'),supersedes:record.sourceId},newFacts);
 assert.equal(tasks(revised).find(t=>t.label==='water')?.done,true);
 assert.equal(tasks(revised).find(t=>t.label==='jacket')?.done,false);
 assert.equal(revised.sources.length,2);
 const stale=reconcileMeeting(scenario,initialPlans(revised));assert.equal(stale.input.meeting,null);assert.equal(stale.input.preparation[0].duration,null);
 assert.equal(evaluateMorning(stale.input).status,'unknown');
 assert.throws(()=>acceptCandidate(revised,record,0,true),'old live response cannot be accepted after replacement');
});
test('cancellation replacement without active facts removes old obligations without asserting readiness',()=>{
 const {state,scenario}=fixture();
 const cancelled=addSource(state,{id:'cancelled',title:'Cancellation',lang:'EN',text:'The trip on 3 November 2026 is cancelled. No replacement scheduled.',supersedes:record.sourceId});
 assert.equal(activeFacts(cancelled).length,0);assert.equal(tasks(cancelled).length,0);
 const stale=reconcileMeeting(scenario,initialPlans(cancelled));assert.equal(evaluateMorning(stale.input).status,'unknown');assert.equal(stale.choice,null);
 assert.equal(cancelled.sources.length,2,'history remains recoverable');
});
