import test from 'node:test';
import assert from 'node:assert/strict';
import records from './fixtures/evaluation/action-first-2026-10-29-recorded.json' with {type:'json'};
import previous from './fixtures/evaluation/holdout-2026-10-29-recorded.json' with {type:'json'};
import {emptyInbox,saveLetter,saveRevision,eventPlans,proposedChoices,setPlanActionDone,restoreInbox,undoRevision,isEventCancellation,orderedPlanActions,cancellationQuotes} from '../src/action-inbox.ts';
import type {Letter,Inbox} from '../src/action-inbox.ts';
function letter(id:string,raw:unknown,title='Museum'):Letter{const r=structuredClone(raw) as Letter['result'];r.sourceId=id;return {id,title,text:r.sourceText,result:r,savedAt:'2026-10-29T19:00:00Z'};}
const first=()=>letter('first',records.deadlines),partial=()=>letter('partial',previous.partial),cancel=()=>letter('cancel',records.cancel);
const plan=(s:Inbox)=>eventPlans(s).find(p=>p.id==='first')!;
function prepared(){let s=saveLetter(emptyInbox(),first(),true);return setPlanActionDone(s,'first',plan(s).actions.find(a=>a.candidate.value.includes('воду'))!.id);}
function update(s:Inbox,l=partial()){return saveRevision(s,l,{baseId:plan(s).head,mode:'update',choices:proposedChoices(plan(s),l)},true);}
function cancelled(s:Inbox){return saveRevision(s,cancel(),{baseId:plan(s).head,mode:'cancel',choices:{},quote:'Оновлення: поїздку до музею 16 грудня 2026 року повністю скасовано.'},true);}
test('first message → partial change → cancellation → reload keeps completed work, omitted items and another event',()=>{
 let s=prepared();const other=letter('other',records.deadlines,'Other child / event');s=saveLetter(s,other,true);const otherBefore=eventPlans(s).find(p=>p.id==='other');
 s=update(s);assert.equal(plan(s).actions.length,5);assert.equal(plan(s).actions.find(a=>a.candidate.kind==='meeting')!.candidate.value,'08:05');assert.equal(plan(s).actions.find(a=>a.candidate.value.includes('воду'))!.done,true);assert.equal(plan(s).actions.find(a=>a.candidate.value.includes('дощовик'))!.done,false);assert.equal(plan(s).actions.find(a=>a.candidate.value.includes('форму'))!.candidate.day,'2026-12-12');assert.equal(plan(s).changes.length,1);assert.equal(plan(s).retained,4);
 s=restoreInbox(JSON.stringify(cancelled(s)));assert.equal(plan(s).cancelled,true);assert.equal(plan(s).actions.length,0);assert.equal(plan(s).history.length,3);assert.equal(s.done['first:2'],true);assert.deepEqual(eventPlans(s).find(p=>p.id==='other'),otherBefore);assert.throws(()=>setPlanActionDone(s,'first','first:2'));
 s=restoreInbox(JSON.stringify(undoRevision(s,'cancel')));assert.equal(plan(s).cancelled,false);assert.equal(plan(s).actions.find(a=>a.id==='first:2')?.done,true);assert.equal(plan(s).actions.find(a=>a.candidate.kind==='meeting')?.candidate.value,'08:05');assert.equal(plan(s).history.length,3);
});
test('unchanged repeated requirement keeps completion; changed requirement needs completion again',()=>{
 let s=prepared();const repeat=letter('repeat',records.deadlines);s=update(s,repeat);assert.equal(plan(s).actions.length,5);assert.equal(plan(s).actions.find(a=>a.id==='first:2')?.done,true);
 s=setPlanActionDone(s,'first',plan(s).actions.find(a=>a.candidate.kind==='meeting')!.id);s=update(s);assert.equal(plan(s).actions.find(a=>a.candidate.kind==='meeting')!.done,false);assert.equal(plan(s).changes[0].wasDone,true);assert.equal(s.done['first:0'],true);
});
test('stale update, wrong-event action match, duplicate replacement and unreviewed save cannot mutate plan',()=>{
 const s=prepared(),l=partial(),r={baseId:'first',mode:'update' as const,choices:proposedChoices(plan(s),l)};assert.throws(()=>saveRevision(s,l,r,false));const updated=saveRevision(s,l,r,true);assert.throws(()=>saveRevision(updated,letter('stale',previous.partial),r,true));assert.equal(saveRevision(updated,l,r,true),updated);
 assert.throws(()=>saveRevision(s,l,{...r,choices:{0:'other:0'}},true));assert.throws(()=>saveRevision(s,l,{...r,choices:{0:'first:2'}},true));assert.throws(()=>saveRevision(s,l,{...r,choices:{}},true));assert.throws(()=>saveRevision(s,l,{...r,choices:{'00':'first:0'}},true));
 const two=letter('two',records.deadlines);const choices=proposedChoices(plan(s),two);choices[3]=choices[2];assert.throws(()=>saveRevision(s,two,{...r,choices},true));assert.equal(plan(s).head,'first');
});
test('no match means keep both conflicting times; completion blocked only for those times',()=>{
 let s=prepared();s=saveRevision(s,partial(),{baseId:'first',mode:'update',choices:{0:''}},true);const meetings=plan(s).actions.filter(a=>a.candidate.kind==='meeting');assert.equal(meetings.length,2);for(const a of meetings)assert.throws(()=>setPlanActionDone(s,'first',a.id));assert.doesNotThrow(()=>setPlanActionDone(s,'first','first:3'));
});
test('an empty extraction or partial-item cancellation never automatically cancels an event',()=>{
 const s=prepared(),l=cancel();const clarification=saveRevision(s,l,{baseId:'first',mode:'update',choices:{}},true);assert.equal(plan(clarification).cancelled,false);assert.equal(plan(clarification).actions.length,5);
 assert.throws(()=>saveRevision(s,l,{baseId:'first',mode:'cancel',choices:{},quote:'invented'},true));assert.throws(()=>saveRevision(s,partial(),{baseId:'first',mode:'cancel',choices:{},quote:partial().text},true));
 for(const q of ['Воду брати не потрібно.','Чи поїздку скасовано?','Is the trip cancelled?','Поїздку не скасовано.','The trip is not cancelled.','Wycieczka nie została odwołana.'])assert.equal(isEventCancellation(q),false,q);
 for(const q of ['Поїздку повністю скасовано.','The entire visit is cancelled.','Wycieczka została odwołana.'])assert.equal(isEventCancellation(q),true,q);
});
test('undo retains history, permits a new branch and never silently revives the cancelled event',()=>{
 const ended=cancelled(update(prepared()));assert.throws(()=>saveRevision(ended,letter('later',previous.partial),{baseId:'cancel',mode:'update',choices:{0:''}},true));assert.throws(()=>undoRevision(ended,'partial'));
 let s=undoRevision(ended,'cancel');s=undoRevision(s,'partial');assert.equal(plan(s).head,'first');s=update(s,letter('new-change',previous.partial));s=restoreInbox(JSON.stringify(s));assert.equal(plan(s).head,'new-change');assert.equal(plan(s).history.length,4);assert.equal(plan(s).actions.find(a=>a.id==='first:2')?.done,true);
});
test('corrupt histories are rejected; existing v1 records load without migration or erased checks',()=>{
 const s=prepared();assert.deepEqual(restoreInbox(JSON.stringify(s)),s);
 for(const bad of [{...s,undone:['missing']},{...s,revisions:{orphan:{baseId:'first',mode:'update',choices:{}}}},{...s,revisions:{first:{baseId:'first',mode:'update',choices:{}}}}])assert.throws(()=>restoreInbox(JSON.stringify(bad)));
});

test('next action prioritizes remaining preparation and sorts meeting before later departure after an update',()=>{
 const s=update(prepared());let actions=plan(s).actions.filter(a=>a.candidate.day==='2026-12-16');
 const meeting=actions.find(a=>a.candidate.kind==='meeting')!;
 actions=[{...meeting,id:'departure',candidate:{...meeting.candidate,kind:'departure',value:'08:35'}},...actions];
 assert.match(orderedPlanActions(actions)[0].candidate.value,/дощовик/);
 actions=actions.map(a=>a.candidate.kind==='item'?{...a,done:true}:a);
 assert.equal(orderedPlanActions(actions)[0].candidate.value,'08:05');
});


test('cancellation review proposes an exact source sentence but never bypasses parent confirmation',()=>{
 const l=cancel(),quotes=cancellationQuotes(l.text);
 assert.deepEqual(quotes,['Оновлення: поїздку до музею 16 грудня 2026 року повністю скасовано.']);
 assert.ok(l.text.includes(quotes[0]));
 const s=update(prepared()),r={baseId:plan(s).head,mode:'cancel' as const,choices:{},quote:quotes[0]};
 assert.throws(()=>saveRevision(s,l,r,false));assert.equal(plan(s).cancelled,false);
 const next=restoreInbox(JSON.stringify(saveRevision(s,l,r,true)));
 assert.equal(plan(next).cancelled,true);assert.equal(next.done['first:2'],true);
 assert.equal(plan(undoRevision(next,'cancel')).actions.find(a=>a.id==='first:2')?.done,true);
});
test('cancellation suggestions refuse questions, conditions, negation, quoted history and conflicting reinstatement',()=>{
 for(const text of ['Чи поїздку скасовано?','Поїздку не скасовано.','The trip is not cancelled.','If it rains, the trip is cancelled.','The trip may be cancelled.','Поїздку скасовано, якщо буде дощ.','Старе повідомлення: «Поїздку скасовано».','The trip is cancelled. The trip is not cancelled.','Поїздку скасовано. Поїздку відновлено.','Воду брати не потрібно.','Повернення форми для поїздки скасовано.','Зустріч скасовано лише для частини учасників.'])assert.deepEqual(cancellationQuotes(text),[],text);
 for(const text of ['Поїздку до музею «Ріверсайд» 16 грудня повністю скасовано.','The entire visit is cancelled.','Wycieczka została odwołana.'])assert.deepEqual(cancellationQuotes(text),[text]);
 assert.equal(cancellationQuotes('Поїздку до музею скасовано. Екскурсію до парку скасовано.').length,2);
});
