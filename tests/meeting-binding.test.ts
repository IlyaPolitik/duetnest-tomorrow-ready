import test from 'node:test';
import assert from 'node:assert/strict';
import { addFact, addSource, emptyState, resolveConflict, tasks, toggleTask } from '../src/engine.ts';
import type { Fact, State } from '../src/engine.ts';
import { initialPlans, parsePlans } from '../src/plans.ts';
import { bindingProblem, confirmMeeting, meetingOptions } from '../src/meeting-binding.ts';
import { changeInputs, newRehearsal, reconcileMeeting, restoreRehearsal, useMeeting } from '../src/rehearsal-state.ts';
import { acceptRepair, evaluateMorning } from '../src/feasibility.ts';
import {linkRequirement,requirementOptions} from '../src/requirements.ts';

function fixture() {
  let state:State={...emptyState(),day:'2026-10-28'};
  state=addSource(state,{id:'letter-1',title:'School letter',text:'28 October 2026. Meeting at 08:00. Pack water.',lang:'EN'});
  state=addFact(state,{id:'meeting-1',sourceId:'letter-1',event:'School trip',kind:'meeting',value:'08:00',quote:'Meeting at 08:00.',minutes:0});
  state=addFact(state,{id:'water',sourceId:'letter-1',event:'School trip',kind:'item',value:'Pack water',quote:'Pack water.',minutes:2});
  state=toggleTask(state,tasks(state).find(t=>t.kind==='item')!.fingerprint);
  const plans=initialPlans(state),option=meetingOptions(plans,state.day,'School trip')[0];
  const binding=confirmMeeting(plans,state.day,'School trip','meeting-1',option.fingerprint,true);
  const scenario=useMeeting(newRehearsal(),binding),water=requirementOptions(scenario,plans)[0];
  return {state,plans,binding,scenario:linkRequirement(scenario,plans,water.task.id,water.fingerprint,'bag',{min:15,max:15},true)};
}
function revision(state:State) {
  let next=addSource(state,{id:'letter-2',supersedes:'letter-1',title:'School revision',text:'28 October 2026. Meeting at 07:45. Pack water.',lang:'EN'},[
    {id:'water-2',sourceId:'letter-2',event:'School trip',kind:'item',value:'Pack water',quote:'Pack water.',minutes:2},
  ]);
  next=addFact(next,{id:'meeting-2',sourceId:'letter-2',event:'School trip',kind:'meeting',value:'07:45',quote:'Meeting at 07:45.',minutes:0});
  return next;
}
test('document → calculation → replacement → review → repair → reload preserves unrelated completion',()=>{
  const {state,plans,scenario,binding}=fixture();
  assert.equal(evaluateMorning(scenario.input).status,'feasible');
  const next=revision(state),nextPlans=parsePlans(JSON.stringify(initialPlans(next)));
  const stale=reconcileMeeting(scenario,nextPlans);
  assert.equal(stale.binding?.status,'review');assert.equal(stale.input.meeting,null);assert.equal(stale.choice,null);
  assert.match(stale.binding!.reason!,/new document version/);
  assert.equal(evaluateMorning(stale.input).status,'unknown');
  const option=meetingOptions(nextPlans,state.day,'School trip')[0];
  const rebound=confirmMeeting(nextPlans,state.day,'School trip',option.fact.id,option.fingerprint,true,binding);
  let updated=useMeeting(stale,rebound);
  assert.equal(updated.binding!.previous!.value,'08:00');assert.equal(updated.input.meeting,465);
  assert.equal(evaluateMorning(updated.input).status,'unknown','the requirement duration also needs renewed review');
  const refreshed=requirementOptions(updated,nextPlans)[0];
  updated=linkRequirement(updated,nextPlans,refreshed.task.id,refreshed.fingerprint,'bag',{min:15,max:15},true);
  assert.equal(evaluateMorning(updated.input).status,'infeasible');
  updated=changeInputs(updated,{...updated.input,preparation:updated.input.preparation.map(t=>({...t,mayMove:true}))});
  updated={...updated,choice:acceptRepair(updated.input,['bag'])};
  const restored=reconcileMeeting(restoreRehearsal(JSON.stringify(updated)),nextPlans);
  assert.deepEqual(restored.choice?.moved,['bag']);
  assert.equal(evaluateMorning(restored.input,restored.choice!.moved).status,'feasible');
  assert.ok(tasks(next).find(t=>t.kind==='item')!.done);
  assert.equal(plans.days[state.day].sources.length,1,'read/bind must not mutate the original document plan');
  assert.equal(next.sources.length,2,'keep previous source in history');
});
test('binding requires explicit review and the exact current day, event, fact and source version',()=>{
  const {plans,binding,scenario}=fixture();
  assert.throws(()=>confirmMeeting(plans,binding.day,binding.event,binding.factId,binding.fingerprint,false));
  assert.throws(()=>confirmMeeting(plans,'2026-10-29',binding.event,binding.factId,binding.fingerprint,true));
  assert.throws(()=>confirmMeeting(plans,binding.day,'Different event',binding.factId,binding.fingerprint,true));
  assert.throws(()=>confirmMeeting(plans,binding.day,binding.event,binding.factId,'old version',true));
  assert.throws(()=>useMeeting(scenario,{...binding,day:'2026-10-29'}));
  assert.throws(()=>useMeeting(scenario,{...binding,status:'review'}));
});
test('new conflicts, removed evidence, changed quotes and unreadable plans invalidate a saved choice',()=>{
  const {state,scenario}=fixture();
  const chosen={...scenario,choice:acceptRepair({...scenario.input,preparation:scenario.input.preparation.map(t=>({...t,mayMove:true}))},['bag'])};
  chosen.input={...chosen.input,preparation:chosen.input.preparation.map(t=>({...t,mayMove:true}))};
  const other:Fact={id:'other',sourceId:'letter-1',event:'School trip',kind:'meeting',value:'07:45',quote:'07:45',minutes:0};
  let conflict=addSource(state,{id:'calendar',title:'Calendar',text:'Meeting at 07:45.',lang:'EN'});
  conflict=addFact(conflict,{...other,sourceId:'calendar',quote:'Meeting at 07:45.'});
  for(const changed of [null,initialPlans({...state,facts:state.facts.filter(f=>f.kind!=='meeting')}),initialPlans({...state,sources:state.sources.map(s=>({...s,text:s.text+' Updated.'}))}),initialPlans({...state,facts:state.facts.map(f=>f.kind==='meeting'?{...f,quote:'08:00'}:f)}),initialPlans(conflict)]){
    const stale=reconcileMeeting(chosen,changed);
    assert.equal(stale.input.meeting,null);assert.equal(stale.choice,null);assert.equal(stale.binding?.status,'review');
  }
  const option=meetingOptions(initialPlans(conflict),state.day,'School trip')[0];
  assert.match(option.problem,/different meeting times/);
  assert.throws(()=>confirmMeeting(initialPlans(conflict),state.day,'School trip',option.fact.id,option.fingerprint,true));
  conflict=resolveConflict(conflict,'School trip:meeting','meeting-1');
  const resolved=meetingOptions(initialPlans(conflict),state.day,'School trip');
  assert.equal(resolved.find(o=>o.fact.id==='meeting-1')!.problem,'');
  assert.ok(resolved.find(o=>o.fact.id==='other')!.problem);
});
test('source returns or conflict resolves do not silently restore an invalidated confirmation',()=>{
  const {plans,scenario}=fixture();
  const stale=reconcileMeeting(scenario,null);
  const restored=reconcileMeeting(restoreRehearsal(JSON.stringify(stale)),plans);
  assert.equal(restored.binding?.status,'review');assert.equal(restored.input.meeting,null);
  assert.equal(restored.choice,null);
  assert.equal(changeInputs(scenario,{...scenario.input,day:'2026-10-29'}).binding?.status,'review');
  assert.equal(changeInputs(scenario,{...scenario.input,meeting:465}).input.meeting,null);
});
test('unrelated events, completed tasks and personal travel estimates preserve source confirmation',()=>{
  const {state,plans,scenario,binding}=fixture();
  const unrelated=addFact(state,{id:'other-event',sourceId:'letter-1',event:'Other trip',kind:'meeting',value:'08:00',quote:'Meeting at 08:00.',minutes:0});
  assert.equal(reconcileMeeting(scenario,initialPlans(unrelated)),scenario);
  assert.equal(reconcileMeeting(scenario,initialPlans({...state,completed:{}})),scenario);
  const changed=changeInputs(scenario,{...scenario.input,travel:{min:30,max:40}});
  assert.equal(changed.binding,binding);assert.equal(bindingProblem(binding,changed.input,plans),'');
});
test('manual/legacy scenarios still load; malformed links and unsupported times are rejected',()=>{
  const {state,scenario}=fixture();
  assert.equal(restoreRehearsal(JSON.stringify(newRehearsal())).binding,undefined);
  assert.throws(()=>restoreRehearsal(JSON.stringify({...scenario,binding:{}})));
  const invalid=addSource(state,{id:'late',title:'Too late',text:'Meeting at 19:30.',lang:'EN'});
  const withLate=addFact(invalid,{id:'late-meeting',sourceId:'late',event:'Late event',kind:'meeting',value:'19:30',quote:'Meeting at 19:30.',minutes:0});
  assert.match(meetingOptions(initialPlans(withLate),state.day,'Late event')[0].problem,/04:00/);
  const wrong=addFact(state,{id:'wrong',sourceId:'letter-1',event:'Wrong quote',kind:'meeting',value:'07:45',quote:'Pack water.',minutes:0});
  assert.match(meetingOptions(initialPlans(wrong),state.day,'Wrong quote')[0].problem,/not present/);
});
test('replacement saved before its reviewed facts preserves only identical task completion',()=>{
  const {state}=fixture();
  const imported=addSource(state,{id:'letter-2',supersedes:'letter-1',title:'Revision',text:'Pack water. Pack water and lunch.',lang:'EN'});
  assert.equal(tasks(imported).length,0);
  const unchanged=addFact(imported,{id:'water-2',sourceId:'letter-2',event:'School trip',kind:'item',value:'Pack water',quote:'Pack water.',minutes:2});
  assert.ok(tasks(unchanged).find(t=>t.kind==='item')!.done);
  const unchecked=toggleTask(unchanged,tasks(unchanged).find(t=>t.kind==='item')!.fingerprint);
  const later=addFact(unchecked,{id:'lunch',sourceId:'letter-2',event:'School trip',kind:'item',value:'Pack lunch',quote:'Pack water and lunch.',minutes:2});
  assert.equal(tasks(later).find(t=>t.label==='Pack water')!.done,false,'adding another fact must not undo an explicit uncheck');
  const changed=addFact(imported,{id:'water-2',sourceId:'letter-2',event:'School trip',kind:'item',value:'Pack water',quote:'Pack water and lunch.',minutes:2});
  assert.equal(tasks(changed).find(t=>t.kind==='item')!.done,false);
});
