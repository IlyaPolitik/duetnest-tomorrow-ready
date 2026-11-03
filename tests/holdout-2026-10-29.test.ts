import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{parseCandidates}from'../src/analysis-contract.ts';import type{AnalysisResult}from'../src/analysis-contract.ts';
import{addSource,emptyState,tasks,parseState,conflicts}from'../src/engine.ts';
import{finishSourceReview,revisionSummary}from'../src/source-review.ts';
import{newRehearsal,useMeeting,reconcileMeeting}from'../src/rehearsal-state.ts';import{confirmMeeting,meetingOptions}from'../src/meeting-binding.ts';import{initialPlans}from'../src/plans.ts';import{preparationReview}from'../src/requirements.ts';
const r=JSON.parse(readFileSync(new URL('./fixtures/evaluation/holdout-2026-10-29-recorded.json',import.meta.url),'utf8')) as Record<string,Extract<AnalysisResult,{status:'ok'}>>;
const clocks:Record<string,string[]>={table:['08:20'],polish:['08:20'],partial:['08:05'],conflict:['08:05','08:20'],cancel:[],'item-cancel':['08:20'],'two-events':['08:20'],'no-year':['08:20']};
for(const [id,expected]of Object.entries(clocks))test('frozen 29 October recorded result: '+id,()=>{
 const v=r[id];assert.equal(v.status,'ok');parseCandidates({candidates:v.candidates,warnings:v.warnings},{id:v.sourceId,title:id,text:v.sourceText,lang:'EN'});
 assert.deepEqual(v.candidates.filter(c=>c.kind==='meeting').map(c=>c.value).sort(),expected);
 assert.ok(v.candidates.every(c=>c.day===(id==='no-year'?null:'2026-12-16')));
 const items=v.candidates.filter(c=>c.kind==='item').map(c=>c.value.toLowerCase()).join('|');
 if(id==='table'||id==='item-cancel'){assert.match(items,/water/);assert.match(items,/raincoat/);}if(id==='polish'){assert.match(items,/water/);assert.match(items,/cap|hat/);assert.match(items,/jacket/);assert.doesNotMatch(items,/breakfast/);}
 if(id==='table')assert.deepEqual(v.candidates.filter(c=>c.kind==='departure').map(c=>c.value),['08:35']);
 if(['conflict','two-events','no-year'].includes(id))assert.match(items,/water/);
 if(id==='partial'){assert.equal(items,'');assert.match(v.warnings.join(' '),/not listed/);}
 if(id==='cancel'){assert.equal(v.candidates.length,0);assert.ok(v.warnings.length);}
 if(id==='item-cancel')assert.doesNotMatch(items,/lunch/);if(id==='two-events')assert.doesNotMatch(items,/towel/);
});
function source(id:string,supersedes?:string){const v=r[id];return{id:v.sourceId,title:id,text:v.sourceText,lang:id==='cancel'?'PL':'EN',supersedes};}
function facts(id:string){const v=r[id];return v.candidates.map((c,i)=>({id:id+i,sourceId:v.sourceId,event:'Riverside museum visit',kind:c.kind,value:c.value,quote:c.quote,minutes:0}));}
test('new partial update invalidates timing, surfaces omitted requirements, then explicit cancellation survives reload',()=>{
 const original=addSource({...emptyState(),day:'2026-12-16'},source('table'),facts('table'));
 const plans=initialPlans(original),o=meetingOptions(plans,original.day,'Riverside museum visit')[0];
 const bound=useMeeting({...newRehearsal(),input:{...newRehearsal().input,day:original.day}},confirmMeeting(plans,original.day,'Riverside museum visit',o.fact.id,o.fingerprint,true));
 const partial=addSource(original,source('partial',r.table.sourceId),facts('partial'));
 assert.deepEqual(revisionSummary(partial,r.partial.sourceId)!.removed.filter(f=>f.kind==='item').map(f=>f.value).sort(),['raincoat','water']);
 const stale=reconcileMeeting(bound,initialPlans(partial));assert.equal(stale.input.meeting,null);assert.equal(stale.choice,null);assert.equal(preparationReview(stale,initialPlans(partial)).needsAttention,true);
 const cancelled=addSource(partial,source('cancel',r.partial.sourceId));assert.equal(revisionSummary(cancelled,r.cancel.sourceId)!.status,'pending');
 const checked=finishSourceReview(cancelled,r.cancel.sourceId,'Riverside museum visit','cancelled','Cała wycieczka została odwołana. Nie ma nowego terminu.',true);
 const restored=parseState(JSON.stringify(checked));assert.equal(restored.sources.length,3);assert.equal(restored.facts.length,5);assert.equal(tasks(restored).length,0);assert.equal(restored.sources.at(-1)!.review!.status,'cancelled');assert.equal(preparationReview(reconcileMeeting(bound,initialPlans(restored)),initialPlans(restored)).needsAttention,true);
});
test('new conflict remains blocked after save and reload',()=>{const s=parseState(JSON.stringify(addSource({...emptyState(),day:'2026-12-16'},source('conflict'),facts('conflict'))));assert.equal(conflicts(s).length,1);assert.equal(tasks(s).find(t=>t.kind==='meeting')!.blocked,true);});
