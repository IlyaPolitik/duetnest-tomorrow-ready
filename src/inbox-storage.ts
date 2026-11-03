import {restoreInbox,emptyInbox} from './action-inbox.ts';
export function loadInboxStorage(storage:Pick<Storage,'getItem'>,key:string){
 let raw:string|null=null;
 try {raw=storage.getItem(key);return {state:restoreInbox(raw),raw,error:false};}
 catch {return {state:emptyInbox(),raw,error:true};}
}
// Read-only support information; never scans other origins or rewrites a store.
export function inboxStorageSummary(storage:Pick<Storage,'getItem'>,key:string){
 const snapshot=loadInboxStorage(storage,key);
 return {present:snapshot.raw!==null,readable:!snapshot.error,letters:snapshot.state.letters.length,done:Object.values(snapshot.state.done).filter(Boolean).length};
}
