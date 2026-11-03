// Explicit opt-in usability session. Normal plans keep their existing keys.
export function storageKey(base:string,search=''):string {
 const session=new URLSearchParams(search).get('session');
 return session==='judge-chat-20261102'||session==='parent-20261029'||session==='qa-20261029'||session==='qa-cycle-20261029'||session==='demo-cycle-20261030' ? base+':'+session : base;
}
export const browserSearch=()=>typeof location==='undefined'?'':location.search;
