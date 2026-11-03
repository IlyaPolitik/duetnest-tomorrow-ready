import test from 'node:test';
import assert from 'node:assert/strict';
import {dateEvidenceMatches} from '../src/date-evidence.ts';
import {parseInput,parseCandidates} from '../src/analysis-contract.ts';
import {emptyInbox,saveLetter,restoreInbox,cancellationQuotes} from '../src/action-inbox.ts';
import {callMeta} from '../server/meta.ts';
const text='[18:10] Teacher: Tomorrow meet at 08:20. Bring water.\n[18:11] Parent: Should we bring a toy?';
const candidate={kind:'meeting' as const,value:'08:20',quote:'Tomorrow meet at 08:20.',day:'2027-01-01',dateQuote:'Tomorrow'};
const source={id:'chat',title:'Chat excerpt',lang:'EN',text,messageDate:'2026-12-31'};
test('relative dates require confirmed message date and handle month/year/leap boundaries',()=>{
 for(const word of ['tomorrow','завтра','jutro','homme'])assert.equal(dateEvidenceMatches('2027-01-01',word,'2026-12-31'),true);
 assert.equal(dateEvidenceMatches('2026-12-31','today','2026-12-31'),true);
 for(const word of ['the day after tomorrow','післязавтра','послезавтра','pojutrze','ülehomme'])assert.equal(dateEvidenceMatches('2027-01-02',word,'2026-12-31'),true);
 assert.equal(dateEvidenceMatches('2028-02-29','tomorrow','2028-02-28'),true);
 assert.equal(dateEvidenceMatches('2027-01-01','tomorrow'),false);
 assert.equal(dateEvidenceMatches('2027-01-01','tomorrow','2026-12-30'),false);
 assert.equal(dateEvidenceMatches('2027-01-01','today or tomorrow','2026-12-31'),false);
 assert.equal(dateEvidenceMatches('2027-01-01','next Friday','2026-12-31'),false);
 assert.equal(dateEvidenceMatches('2027-01-01','tomorrow','2026-02-30'),false);
 assert.equal(dateEvidenceMatches('2026-12-16','16 December 2026'),true);
});
test('chat metadata is validated and relative-date evidence survives save and reload',()=>{
 const input=parseInput({requestId:'chat-test',source,event:'Trip',day:'2026-11-02',purpose:'actions'});
 assert.equal(input.source.messageDate,'2026-12-31');
 assert.throws(()=>parseInput({...input,source:{...source,messageDate:'2026-02-30'}}));
 assert.throws(()=>parseCandidates({candidates:[candidate],warnings:[]},{...source,messageDate:undefined}));
 const parsed=parseCandidates({candidates:[candidate],warnings:[]},source);
 const saved=saveLetter(emptyInbox(),{id:source.id,title:source.title,text,savedAt:'2026-11-02',result:{status:'ok',...parsed,model:'test',requestId:'chat-test',extractedAt:'2026-11-02',sourceId:source.id,sourceText:text,messageDate:source.messageDate,event:'Trip',day:'2026-11-02'}},true);
 assert.equal(restoreInbox(JSON.stringify(saved)).letters[0].result.messageDate,'2026-12-31');
 const altered=structuredClone(saved);altered.letters[0].result.messageDate='2026-12-30';assert.throws(()=>restoreInbox(JSON.stringify(altered)));
 assert.equal(restoreInbox(JSON.stringify({...emptyInbox(),draft:text,draftMessageDate:'2026-12-31'})).draftMessageDate,'2026-12-31');
 assert.throws(()=>restoreInbox(JSON.stringify({...emptyInbox(),draftMessageDate:'invalid'})));
});
test('timestamped cancellation retains original attribution but questions, conditions and reversals stay unresolved',()=>{
 const line='[19:00] Teacher: The trip is cancelled.';
 assert.deepEqual(cancellationQuotes(line),[line]);
 for(const bad of ['[19:00] Parent: Is the trip cancelled?','[19:00] Teacher: If it rains, the trip is cancelled.','[19:00] Parent: The trip might be cancelled.',line+'\n[19:10] Teacher: The trip is not cancelled.'])assert.deepEqual(cancellationQuotes(bad),[]);
});
test('model receives the confirmed date separately from untrusted chat and preserves it in the result',async()=>{
 const input=parseInput({requestId:'chat-test',source,event:'Trip',day:'2026-11-02',purpose:'actions',outputLanguage:'uk'});
 const result=await callMeta(input,{provider:'fireworks',key:'test',limit:1},async(_url,options)=>{
  const payload=JSON.parse(String(options?.body)),user=JSON.parse(payload.messages[1].content);
  assert.equal(user.userConfirmedMessageDate,'2026-12-31');assert.equal(user.document,text);
  assert.match(payload.messages[0].content,/rumour/);assert.match(payload.messages[0].content,/Sender labels alone do not verify authority/);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidates:[candidate],warnings:[]})}}]}));
 });
 assert.equal(result.status,'ok');if(result.status==='ok')assert.equal(result.messageDate,'2026-12-31');
});

import records from './fixtures/evaluation/chat-2026-11-02-recorded.json' with {type:'json'};
import initial from './fixtures/evaluation/uk-cycle-2026-11-02-recorded.json' with {type:'json'};
import {eventPlans,setPlanActionDone,proposedChoices,saveRevision,undoRevision} from '../src/action-inbox.ts';
import type {Letter} from '../src/action-inbox.ts';
test('recorded live chat update and cancellation preserve completion through reload and undo',()=>{
 const letter=(r:unknown):Letter=>{const result=r as Letter['result'];return {id:result.sourceId,title:'Museum',text:result.sourceText,result,savedAt:result.extractedAt};};
 let state=saveLetter(emptyInbox(),letter(initial.first),true),plan=eventPlans(state)[0];
 const water=plan.actions.find(a=>a.candidate.value.includes('воду'))!;
 state=setPlanActionDone(state,plan.id,water.id);plan=eventPlans(state)[0];
 assert.deepEqual(records.change.candidates.map(c=>[c.kind,c.value,c.day]),[['meeting','08:05','2026-12-16']]);
 state=saveRevision(state,letter(records.change),{baseId:plan.head,mode:'update',choices:proposedChoices(plan,letter(records.change))},true);
 state=restoreInbox(JSON.stringify(state));plan=eventPlans(state)[0];assert.equal(plan.actions.find(a=>a.id===water.id)?.done,true);
 const quotes=cancellationQuotes(records.cancel.sourceText);assert.equal(quotes.length,1);assert.match(quotes[0],/^\[19:25\] Вчителька:/);
 state=saveRevision(state,letter(records.cancel),{baseId:plan.head,mode:'cancel',choices:{},quote:quotes[0]},true);
 state=restoreInbox(JSON.stringify(state));assert.equal(eventPlans(state)[0].actions.length,0);
 state=restoreInbox(JSON.stringify(undoRevision(state,records.cancel.sourceId)));plan=eventPlans(state)[0];
 assert.equal(plan.actions.find(a=>a.id===water.id)?.done,true);assert.equal(plan.actions.find(a=>a.candidate.kind==='meeting')?.candidate.value,'08:05');
});

import finalChat from './fixtures/evaluation/final-chat-2026-11-02-recorded.json' with {type:'json'};
test('ordinary chat separates today deadline from tomorrow event and retains two completed actions across change/cancel/undo',()=>{
 const letter=(r:unknown):Letter=>{const result=r as Letter['result'];return {id:result.sourceId,title:'Museum',text:result.sourceText,result,savedAt:result.extractedAt};};
 const first=letter(finalChat.first);
 assert.equal(first.result.candidates.length,4);
 assert.deepEqual(first.result.candidates.map(c=>[c.kind,c.day]),[['meeting','2026-12-16'],['item','2026-12-16'],['item','2026-12-16'],['task','2026-12-15']]);
 let state=saveLetter(emptyInbox(),first,true),plan=eventPlans(state)[0];
 assert.equal(plan.actions.some(a=>a.done),false);
 const done=plan.actions.filter(a=>a.candidate.value==='Bring water'||a.candidate.kind==='task').map(a=>a.id);assert.equal(done.length,2);
 for(const id of done)state=setPlanActionDone(state,plan.id,id);
 plan=eventPlans(state)[0];state=saveRevision(state,letter(finalChat.change),{baseId:plan.head,mode:'update',choices:proposedChoices(plan,letter(finalChat.change))},true);
 state=restoreInbox(JSON.stringify(state));plan=eventPlans(state)[0];
 assert.equal(plan.actions.length,4);assert.equal(plan.actions.find(a=>a.candidate.kind==='meeting')?.candidate.value,'08:05');
 for(const id of done)assert.equal(plan.actions.find(a=>a.id===id)?.done,true);
 const cancel=letter(finalChat.cancel);state=saveRevision(state,cancel,{baseId:plan.head,mode:'cancel',choices:{},quote:cancellationQuotes(cancel.text)[0]},true);
 state=restoreInbox(JSON.stringify(state));assert.equal(eventPlans(state)[0].actions.length,0);
 state=restoreInbox(JSON.stringify(undoRevision(state,cancel.id)));plan=eventPlans(state)[0];
 assert.equal(plan.actions.length,4);for(const id of done)assert.equal(plan.actions.find(a=>a.id===id)?.done,true);
});
