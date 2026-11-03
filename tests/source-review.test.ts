import test from'node:test';import assert from'node:assert/strict';
import{addSource,addFact,emptyState,parseState,tasks,toggleTask}from'../src/engine.ts';
import{finishSourceReview,revisionSummary}from'../src/source-review.ts';
function base(){return addSource(emptyState(),{id:'old',title:'Original',lang:'EN',text:'Meet at 08:30. Bring water. Bring lunch.'},[{id:'m1',sourceId:'old',kind:'meeting',event:'Trip',value:'08:30',quote:'Meet at 08:30.',minutes:0},{id:'w1',sourceId:'old',kind:'item',event:'Trip',value:'water',quote:'Bring water.',minutes:2},{id:'l1',sourceId:'old',kind:'item',event:'Trip',value:'lunch',quote:'Bring lunch.',minutes:2}]);}
function revised(){const original=base();return addSource(toggleTask(original,tasks(original).find(t=>t.label==='water')!.fingerprint),{id:'new',title:'Revision',lang:'EN',text:'Meet at 08:50. Bring water. Do not bring lunch.',supersedes:'old'},[{id:'m2',sourceId:'new',kind:'meeting',event:'Trip',value:'08:50',quote:'Meet at 08:50.',minutes:0},{id:'w2',sourceId:'new',kind:'item',event:'Trip',value:'water',quote:'Bring water.',minutes:2}]);}
test('revision differences preserve old/new evidence without interpreting missing facts as cancellation',()=>{
 const state=revised(),summary=revisionSummary(state,'new')!;
 assert.equal(summary.status,'pending');assert.deepEqual(summary.added.map(f=>f.value),['08:50']);assert.deepEqual(summary.removed.map(f=>f.value),['08:30','lunch']);
 assert.equal(summary.before[0].quote,'Meet at 08:30.');assert.equal(summary.after[0].quote,'Meet at 08:50.');assert.equal(summary.retained[0].done,true);
 const checked=finishSourceReview(state,'new','Trip','reviewed','',true);assert.equal(revisionSummary(parseState(JSON.stringify(checked)),'new')!.status,'reviewed');
});
test('empty extraction remains pending; cancellation needs an exact quote and explicit complete review',()=>{
 const state=addSource(base(),{id:'cancel',title:'Cancellation',lang:'EN',text:'The whole trip is cancelled.',supersedes:'old'});
 assert.equal(revisionSummary(state,'cancel')!.status,'pending');
 assert.throws(()=>finishSourceReview(state,'cancel','Trip','cancelled','The whole trip is cancelled.',false));
 assert.throws(()=>finishSourceReview(state,'cancel','Trip','cancelled','Invented cancellation',true));
 const cancelled=finishSourceReview(state,'cancel','Trip','cancelled','The whole trip is cancelled.',true);
 assert.equal(revisionSummary(parseState(JSON.stringify(cancelled)),'cancel')!.status,'cancelled');assert.equal(tasks(cancelled).length,0);assert.equal(cancelled.sources.length,2);
 assert.throws(()=>finishSourceReview(state,'old','Trip','reviewed','',true));
});
test('facts changed after review invalidate it; contradictory cancellation state cannot restore',()=>{
 const checked=finishSourceReview(revised(),'new','Trip','reviewed','',true);
 const added=addFact(checked,{id:'extra',sourceId:'new',kind:'task',event:'Trip',value:'Check lunch notice',quote:'Do not bring lunch.',minutes:1});assert.equal(added.sources.at(-1)?.review,undefined);
 assert.throws(()=>finishSourceReview(checked,'new','Trip','cancelled','Do not bring lunch.',true));
 assert.throws(()=>parseState(JSON.stringify({...checked,sources:checked.sources.map(s=>s.id==='new'?{...s,review:{event:'Trip',status:'cancelled',quote:'Do not bring lunch.'}}:s)})));
 assert.equal(checked.sources.at(-1)?.review?.status,'reviewed','immutable prior state');
});
