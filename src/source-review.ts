import {tasks} from './engine.ts';
import type {Source,State,Fact} from './engine.ts';
export type SourceReview={event:string;status:'reviewed'|'cancelled';quote?:string};
export function validateSourceReview(source:Source):void{
 const r=source.review;if(r===undefined)return;
 if(!r || typeof r.event!=='string' || !r.event.trim() || r.event.length>100 || !['reviewed','cancelled'].includes(r.status))throw new Error('Invalid source review.');
 if(r.status==='cancelled' && (typeof r.quote!=='string' || !r.quote.trim() || r.quote.length>2000 || !source.text.includes(r.quote)))throw new Error('Cancellation needs an exact quote from this source.');
 if(r.status==='reviewed' && r.quote!==undefined)throw new Error('Unexpected cancellation quote.');
}
export function finishSourceReview(state:State,sourceId:string,event:string,status:SourceReview['status'],quote:string,confirmed:boolean):State{
 if(!confirmed)throw new Error('Check the whole source before finishing this review.');
 const source=state.sources.find(s=>s.id===sourceId);
 if(!source || state.sources.some(s=>s.supersedes===sourceId))throw new Error('This source was replaced. Review the current version.');
 const review:SourceReview={event:event.trim(),status,...(status==='cancelled'?{quote}: {})};
 validateSourceReview({...source,review});
 if(status==='cancelled' && state.facts.some(f=>f.sourceId===sourceId && f.event===review.event))throw new Error('This source already has active facts for the event. Add a corrected source before confirming cancellation.');
 return {...state,sources:state.sources.map(s=>s.id===sourceId?{...s,review}:s)};
}
const key=(f:Fact)=>JSON.stringify([f.kind,f.value.trim().toLowerCase()]);
export function revisionSummary(state:State,sourceId:string){
 const source=state.sources.find(s=>s.id===sourceId);
 const previous=state.sources.find(s=>s.id===source?.supersedes);
 if(!source || !previous)return null;
 const event=source.review?.event ?? state.facts.find(f=>f.sourceId===sourceId)?.event ?? state.facts.find(f=>f.sourceId===previous.id)?.event ?? '';
 const before=state.facts.filter(f=>f.sourceId===previous.id && f.event===event);
 const after=state.facts.filter(f=>f.sourceId===source.id && f.event===event);
 const beforeKeys=new Set(before.map(key)),afterKeys=new Set(after.map(key));
 return {source,previous,event,status:source.review?.status??'pending',
  before,after,removed:before.filter(f=>!afterKeys.has(key(f))),added:after.filter(f=>!beforeKeys.has(key(f))),
  retained:after.filter(f=>beforeKeys.has(key(f))).map(f=>{const task=tasks(state).find(t=>t.facts.some(x=>x.id===f.id));return {fact:f,done:!!task?.done,needsRecheck:!!task?.needsRecheck};})};
}
