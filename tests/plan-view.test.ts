import test from 'node:test';
import assert from 'node:assert/strict';
import {planView} from '../src/plan-view.ts';
import {emptyInbox,saveLetter,eventPlans,setPlanActionDone,saveRevision,proposedChoices,cancellationQuotes} from '../src/action-inbox.ts';
import type {Letter} from '../src/action-inbox.ts';
import data from './fixtures/evaluation/uk-cycle-2026-11-02-recorded.json' with {type:'json'};
const letter=(key:keyof typeof data):Letter=>{const result=data[key] as Letter['result'];return {id:result.sourceId,title:'Trip',text:result.sourceText,savedAt:result.extractedAt,result};};
test('next-step control advances to raincoat while preserving visible completed water and changed time',()=>{
 let s=saveLetter(emptyInbox(),letter('first'),true),p=eventPlans(s)[0];
 const v=planView(p);assert.match(v.next!.candidate.value,/воду/);assert.equal(v.meeting?.candidate.value,'08:20');
 s=setPlanActionDone(s,p.id,v.next!.id);p=eventPlans(s)[0];
 s=saveRevision(s,letter('update'),{baseId:p.head,mode:'update',choices:proposedChoices(p,letter('update'))},true);
 p=eventPlans(s)[0];const updated=planView(p);
 assert.match(updated.next!.candidate.value,/дощовик/);assert.equal(updated.done.length,1);
 assert.match(updated.done[0].candidate.value,/воду/);assert.equal(updated.meeting?.candidate.value,'08:05');assert.equal(updated.departure?.candidate.value,'08:35');
 s=setPlanActionDone(s,p.id,updated.next!.id);assert.equal(planView(eventPlans(s)[0]).next?.candidate.kind,'meeting');
 s=setPlanActionDone(s,p.id,updated.done[0].id);assert.match(planView(eventPlans(s)[0]).next!.candidate.value,/воду/);
});
test('display never selects a single conflicting meeting time, completes dependencies, or offers cancelled tasks',()=>{
 const base=eventPlans(saveLetter(emptyInbox(),letter('first'),true))[0];
 const meeting=base.actions.find(a=>a.candidate.kind==='meeting')!;
 const conflict={...base,actions:[...base.actions,{...meeting,id:'conflict',candidate:{...meeting.candidate,value:'08:10'}}]};
 const v=planView(conflict);assert.equal(v.meeting,undefined);assert.equal(v.conflicting.length,2);assert.equal(v.next?.candidate.kind,'item');
 const dependency={...meeting,id:'question',candidate:{...meeting.candidate,kind:'dependency' as const}};
 assert.equal(planView({...base,actions:[dependency]}).next,undefined);
 let s=saveLetter(emptyInbox(),letter('first'),true);
 s=saveRevision(s,letter('cancel'),{baseId:base.head,mode:'cancel',choices:{},quote:cancellationQuotes(letter('cancel').text)[0]},true);
 assert.equal(planView(eventPlans(s)[0]).next,undefined);
});
