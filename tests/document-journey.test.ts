import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{emptyState,addSource,tasks,toggleTask,parseState}from'../src/engine.ts';import type{State}from'../src/engine.ts';
import{acceptCandidate}from'../src/review.ts';import{finishSourceReview,revisionSummary}from'../src/source-review.ts';
import{initialPlans}from'../src/plans.ts';import{confirmMeeting,meetingOptions}from'../src/meeting-binding.ts';import{newRehearsal,useMeeting,reconcileMeeting}from'../src/rehearsal-state.ts';
import type{AnalysisResult}from'../src/analysis-contract.ts';
const records=JSON.parse(readFileSync(new URL('./fixtures/evaluation/document-journey-recorded.json',import.meta.url),'utf8'))as Record<string,Extract<AnalysisResult,{status:'ok'}>>;
function addRecord(state:State,id:string,supersedes?:string){const r=records[id];let next=addSource(state,{id:r.sourceId,title:id,lang:'EN',text:r.sourceText,supersedes});for(let i=0;i<r.candidates.length;i++)next=acceptCandidate(next,r,i,true);return next;}
test('actual PDF/photo model responses survive review, replacement, cancellation and reload',()=>{
 const original=records['original-pdf'],revision=records['revision-photo'],cancel=records['cancellation-scan'];
 let state=addRecord({...emptyState(),day:original.day},'original-pdf');
 state=finishSourceReview(state,original.sourceId,original.event,'reviewed','',true);
 state=toggleTask(state,tasks(state).find(t=>t.label==='water')!.fingerprint);
 const plans=initialPlans(state),o=meetingOptions(plans,state.day,original.event)[0];const scenario=useMeeting({...newRehearsal(),input:{...newRehearsal().input,day:state.day}},confirmMeeting(plans,state.day,original.event,o.fact.id,o.fingerprint,true));
 state=addRecord(state,'revision-photo',original.sourceId);assert.equal(reconcileMeeting(scenario,initialPlans(state)).input.meeting,null);
 const summary=revisionSummary(state,revision.sourceId)!;assert.equal(summary.status,'pending');assert.ok(summary.removed.some(f=>f.value==='packed lunch'));assert.equal(summary.after.find(f=>f.kind==='meeting')!.value,'08:50');
 assert.equal(tasks(state).find(t=>t.label==='water')!.needsRecheck,true,'changed source quote needs explicit recheck');
 state=finishSourceReview(state,revision.sourceId,revision.event,'reviewed','',true);
 state=parseState(JSON.stringify(state));assert.equal(state.sources.at(-1)?.review?.status,'reviewed');
 state=addRecord(state,'cancellation-scan',revision.sourceId);assert.equal(revisionSummary(state,cancel.sourceId)?.status,'pending','zero AI candidates is not cancellation consent');
 state=finishSourceReview(state,cancel.sourceId,cancel.event,'cancelled','The entire visit is cancelled. No new date is set.',true);
 const restored=parseState(JSON.stringify(state));assert.equal(restored.sources.length,3);assert.equal(tasks(restored).length,0);assert.equal(restored.sources.at(-1)?.review?.status,'cancelled');
 assert.equal(reconcileMeeting(scenario,initialPlans(restored)).input.meeting,null);
});
test('mixed PDF live analysis uses scanned body rather than accepting only text header',()=>{
 const r=records['mixed-pdf'];assert.ok(r.sourceText.includes('School notice - see the scanned correction below.'));assert.ok(r.sourceText.includes('Meet at 09:05'));
 const state=addRecord({...emptyState(),day:r.day},'mixed-pdf');assert.equal(state.facts.find(f=>f.kind==='meeting')?.value,'09:05');assert.equal(tasks(state).some(t=>t.label.includes('lunch')),false);
});
