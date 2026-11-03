import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addSource,emptyState,conflicts,tasks,activeFacts} from '../src/engine.ts';
import {acceptCandidate,acceptCandidateGroup} from '../src/review.ts';
import {initialPlans} from '../src/plans.ts';
import {confirmMeeting,meetingOptions} from '../src/meeting-binding.ts';
import {newRehearsal,useMeeting,reconcileMeeting} from '../src/rehearsal-state.ts';
import {evaluateMorning} from '../src/feasibility.ts';
import type {AnalysisResult} from '../src/analysis-contract.ts';
const records=JSON.parse(readFileSync(new URL('./fixtures/evaluation/live-conflict-cancellation.json',import.meta.url),'utf8')) as Record<string,Extract<AnalysisResult,{status:'ok'}>>;
const r=records['pl-unresolved-times'];
const state=()=>addSource({...emptyState(),day:r.day},{id:r.sourceId,title:'Recorded live conflict',lang:'PL',text:r.sourceText});
test('a live unresolved conflict cannot enter the plan one time at a time',()=>{
 assert.throws(()=>acceptCandidate(state(),r,0,true),/together/);
});
test('reviewed live alternatives commit together, remain blocked, and replay idempotently',()=>{
 const before=state();
 assert.throws(()=>acceptCandidateGroup(before,r,0,{0:true}));
 assert.equal(before.facts.length,0);
 const accepted=acceptCandidateGroup(before,r,0,{0:true,1:true});
 assert.equal(accepted.facts.length,2);assert.equal(conflicts(accepted).length,1);assert.equal(conflicts(accepted)[0].resolved,false);
 assert.equal(tasks(accepted).find(t=>t.kind==='meeting')?.blocked,true);
 const plans=initialPlans(accepted),options=meetingOptions(plans,r.day,r.event);
 for(const o of options)assert.throws(()=>confirmMeeting(plans,r.day,r.event,o.fact.id,o.fingerprint,true),/different meeting times/);
 assert.deepEqual(acceptCandidateGroup(accepted,r,1,{0:true,1:true}),accepted);
 const water=acceptCandidate(accepted,r,2,true);assert.equal(tasks(water).find(t=>t.label==='water')?.blocked,false);
 const revised=addSource(before,{id:'new-notice',title:'Replacement',lang:'EN',text:'New notice',supersedes:r.sourceId});
 assert.throws(()=>acceptCandidateGroup(revised,r,0,{0:true,1:true}),/out of date/);
});
test('live full cancellation as a replacement removes obligations and invalidates calculation, preserving history',()=>{
 const cancel=records['en-full-cancellation'];assert.equal(cancel.candidates.length,0);assert.match(cancel.warnings.join(' '),/cancel/i);
 let before=addSource({...emptyState(),day:cancel.day},{id:'old-trip',title:'Original',lang:'EN',text:'Meet at 08:35 and bring a packed lunch.'},[
  {id:'old-meeting',sourceId:'old-trip',event:cancel.event,kind:'meeting',value:'08:35',quote:'Meet at 08:35',minutes:0},
  {id:'old-lunch',sourceId:'old-trip',event:cancel.event,kind:'item',value:'packed lunch',quote:'bring a packed lunch',minutes:2}]);
 const plans=initialPlans(before),o=meetingOptions(plans,cancel.day,cancel.event)[0];
 const rehearsal=useMeeting({...newRehearsal(),input:{...newRehearsal().input,day:cancel.day}},confirmMeeting(plans,cancel.day,cancel.event,o.fact.id,o.fingerprint,true));
 const cancelled=addSource(before,{id:cancel.sourceId,title:'Actual live cancellation',lang:'EN',text:cancel.sourceText,supersedes:'old-trip'});
 assert.equal(activeFacts(cancelled).length,0);assert.equal(tasks(cancelled).length,0);assert.equal(cancelled.sources.length,2);
 const reconciled=reconcileMeeting(rehearsal,initialPlans(cancelled));
 assert.equal(reconciled.input.meeting,null);assert.equal(evaluateMorning(reconciled.input).status,'unknown');
});
test('live disputed dates cannot be cherry-picked or partially committed to the planning day',()=>{
 const date=records['en-date-conflict'];
 const before=addSource({...emptyState(),day:date.day},{id:date.sourceId,title:'Disputed dates',lang:'EN',text:date.sourceText});
 assert.deepEqual(date.candidates.map(c=>c.day),['2026-11-16','2026-11-17']);
 assert.throws(()=>acceptCandidate(before,date,0,true),/together/);
 assert.throws(()=>acceptCandidateGroup(before,date,0,{0:true,1:true}),/another day/);
 assert.equal(before.facts.length,0);
});
test('live partial and other-event cancellations preserve only the active event requirements',()=>{
 for(const [id,time,items] of [['uk-partial-withdrawal','09:10',['water','warm jacket']],['en-other-event-cancelled','09:20',['bring a notebook']]] as const){
  const record=records[id];
  let before=addSource({...emptyState(),day:record.day},{id:record.sourceId,title:id,lang:'EN',text:record.sourceText});
  for(let i=0;i<record.candidates.length;i++)before=acceptCandidate(before,record,i,true);
  assert.deepEqual(activeFacts(before).filter(f=>f.kind==='meeting').map(f=>f.value),[time]);
  assert.deepEqual(tasks(before).filter(t=>t.kind==='item').map(t=>t.label),items);
  assert.equal(conflicts(before).length,0);
 }
 assert.equal(records['pl-cancellation-fresh'].candidates.length,0);
 assert.match(records['pl-cancellation-fresh'].warnings.join(' '),/cancel/i);
});
