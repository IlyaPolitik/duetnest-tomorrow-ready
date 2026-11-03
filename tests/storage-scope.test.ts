import test from 'node:test';import assert from 'node:assert/strict';import{storageKey}from'../src/storage-scope.ts';
test('parent session separates both stores and leaves normal and unrecognized URLs unchanged',()=>{
 for(const base of ['duetnest-meta-hackathon:readiness:v1','duetnest-meta-hackathon:rehearsal:v1']){
  assert.equal(storageKey(base),base);assert.equal(storageKey(base,'?session=unknown'),base);
  assert.equal(storageKey(base,'?session=parent-20261029'),base+':parent-20261029');
 }
});
test('judge chat replay cannot overwrite the parent test or the default plan',()=>{
 const base='plans',judge=storageKey(base,'?session=judge-chat-20261102');
 assert.equal(judge,base+':judge-chat-20261102');
 assert.notEqual(judge,storageKey(base,'?session=parent-20261029'));assert.notEqual(judge,storageKey(base));
});
