import test from 'node:test';
import assert from 'node:assert/strict';
import records from './fixtures/evaluation/uk-cycle-2026-11-02-recorded.json' with {type:'json'};
import {emptyInbox,saveLetter,setPlanActionDone,eventPlans,saveRevision,proposedChoices,cancellationQuotes,restoreInbox,undoRevision} from '../src/action-inbox.ts';
import type {Letter} from '../src/action-inbox.ts';
function letter(key:keyof typeof records):Letter{const result=records[key] as Letter['result'];return{id:result.sourceId,title:'Українська поїздка',text:result.sourceText,result,savedAt:result.extractedAt};}
test('fresh Ukrainian inference preserves water through update, cancellation, persisted history and undo',()=>{
 const first=letter('first'),update=letter('update'),cancel=letter('cancel');
 assert.deepEqual(first.result.candidates.filter(c=>c.kind==='meeting'||c.kind==='departure').map(c=>[c.kind,c.value,c.day]),[['meeting','08:20','2026-12-16'],['departure','08:35','2026-12-16']]);
 assert.deepEqual(update.result.candidates.map(c=>c.value),['08:05','08:35']);
 assert.equal(cancel.result.candidates.length,0);
 for(const l of [first,update,cancel]) for(const w of l.result.warnings)assert.match(w,/[ІіЇїЄєА-Яа-я]/u);
 let s=saveLetter(emptyInbox(),first,true),p=eventPlans(s)[0];
 const water=p.actions.find(a=>/воду/u.test(a.candidate.value))!;assert.ok(water);
 s=setPlanActionDone(s,p.id,water.id);p=eventPlans(s)[0];
 s=saveRevision(s,update,{baseId:p.head,mode:'update',choices:proposedChoices(p,update)},true);
 p=eventPlans(restoreInbox(JSON.stringify(s)))[0];
 assert.equal(p.actions.length,4);assert.ok(p.actions.find(a=>/воду/u.test(a.candidate.value))?.done);
 assert.equal(p.actions.find(a=>/дощовик/u.test(a.candidate.value))?.done,false);
 assert.equal(p.actions.find(a=>a.candidate.kind==='meeting')?.candidate.value,'08:05');
 const quotes=cancellationQuotes(cancel.text);assert.equal(quotes.length,1);
 s=saveRevision(s,cancel,{baseId:p.head,mode:'cancel',choices:{},quote:quotes[0]},true);
 s=restoreInbox(JSON.stringify(s));p=eventPlans(s)[0];assert.ok(p.cancelled);assert.equal(p.actions.length,0);assert.equal(p.history.length,3);
 s=restoreInbox(JSON.stringify(undoRevision(s,p.head)));p=eventPlans(s)[0];
 assert.equal(p.cancelled,false);assert.equal(p.actions.find(a=>a.id===water.id)?.done,true);
 assert.equal(p.actions.find(a=>a.candidate.kind==='meeting')?.candidate.value,'08:05');
});
