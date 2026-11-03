import test from 'node:test';
import assert from 'node:assert/strict';
import {loadInboxStorage,inboxStorageSummary} from '../src/inbox-storage.ts';
import {emptyInbox} from '../src/action-inbox.ts';
test('absent store is distinguished from malformed and inaccessible saved data',()=>{
 const absent={getItem:()=>null};
 assert.deepEqual(inboxStorageSummary(absent,'x'),{present:false,readable:true,letters:0,done:0});
 const malformed={getItem:()=>'{bad json'};
 assert.equal(loadInboxStorage(malformed,'x').raw,'{bad json');
 assert.equal(loadInboxStorage(malformed,'x').error,true);
 assert.equal(inboxStorageSummary(malformed,'x').readable,false);
 const denied={getItem:()=>{throw Error('Storage denied');}};
 assert.equal(loadInboxStorage(denied,'x').error,true);
});
test('storage inspection is read-only and preserves exact raw draft and completion data',()=>{
 const raw=JSON.stringify({...emptyInbox(),draft:'Не закривати чернетку',done:{'legacy:0':true}});
 let reads=0;const storage={getItem:(key:string)=>{assert.equal(key,'parent');reads++;return raw;}};
 const loaded=loadInboxStorage(storage,'parent');
 assert.equal(reads,1);assert.equal(loaded.raw,raw);assert.equal(loaded.error,false);
 assert.equal(loaded.state.draft,'Не закривати чернетку');
 assert.equal(loaded.state.done['legacy:0'],true);
});
