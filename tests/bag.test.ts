import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState, applyDemoUpdate } from '../src/fixtures.ts';
import { tasks, toggleTask, parseState } from '../src/engine.ts';
import { confirmPhotoItem, parseObservations, suggestions, requiresPersonalCheck } from '../src/bag-contract.ts';
import type { PhotoReview } from '../src/bag-contract.ts';
const bottle = {kind:'bottle',score:.89,box:[.1,.1,.2,.5] as [number,number,number,number]};
const reviewFor = (state=demoState()):PhotoReview=>({day:state.day,photoHash:'a'.repeat(64),filename:'synthetic-bag.png',fingerprints:tasks(state).map(t=>t.fingerprint),observations:[bottle]});
test('detection gives tentative matches without completing tasks or treating unseen coat as absent',()=>{
 const state=demoState(), before=JSON.stringify(state), items=tasks(state).filter(t=>t.kind==='item');
 assert.equal(suggestions(items[0],parseObservations([bottle])).length,1);
 assert.deepEqual(suggestions(items[1],[bottle]),[]);
 assert.equal(JSON.stringify(state),before);assert.ok(tasks(state).every(t=>!t.done));
});
test('rejects malformed boxes and filters unknown or low confidence classes',()=>{
 assert.throws(()=>parseObservations([{...bottle,box:[.9,.1,.5,.2]}]));
 assert.throws(()=>parseObservations([{...bottle,score:NaN}]));
 assert.deepEqual(parseObservations([{...bottle,kind:'person'},{...bottle,score:.59}]),[]);
});
test('documents and medicines never receive object matching hints',()=>{
 const base=tasks(demoState()).find(t=>t.kind==='item')!;
 for(const label of ['Бутылка лекарства','Water and medication','Passport document','Подписанное разрешение']){
 const item={...base,label};assert.equal(requiresPersonalCheck(item),true);assert.deepEqual(suggestions(item,[bottle]),[]);
 }
});
test('manual photo confirmation roundtrips with provenance; normal toggle clears receipt',()=>{
 const state=demoState(), task=tasks(state).find(t=>t.kind==='item')!;
 const next=confirmPhotoItem(state,reviewFor(state),task.fingerprint);
 assert.equal(tasks(next).find(t=>t.id===task.id)?.done,true);
 assert.equal(parseState(JSON.stringify(next)).photoChecks?.[task.fingerprint].method,'manual-after-photo');
 const unmarked=toggleTask(next,task.fingerprint);assert.equal(unmarked.photoChecks?.[task.fingerprint],undefined);
 assert.equal(toggleTask(unmarked,task.fingerprint).photoChecks?.[task.fingerprint],undefined);
});
test('stale photo day, changed facts, and non-item completions are rejected',()=>{
 const state=demoState(), review=reviewFor(state), item=tasks(state).find(t=>t.kind==='item')!;
 assert.throws(()=>confirmPhotoItem({...state,day:'2026-10-28'},review,item.fingerprint));
 assert.throws(()=>confirmPhotoItem(applyDemoUpdate(state),review,item.fingerprint));
 assert.throws(()=>confirmPhotoItem(state,review,tasks(state).find(t=>t.kind==='task')!.fingerprint));
 assert.throws(()=>parseState(JSON.stringify({...state,photoChecks:{bad:{method:'AI-confirmed'}}})));
});
