import {t as tr,locale} from './i18n.ts';
import {useState,useEffect}from'react';
import type{State,Source}from'./engine.ts';
import{finishSourceReview,revisionSummary}from'./source-review.ts';
import'./source-changes.css';
export function SourceChanges({state,source,commit,onOpen}:{state:State;source:Source;commit?:(s:State,message:string)=>void;onOpen?:()=>void}){
 const summary=revisionSummary(state,source.id);
 const defaultEvent=source.review?.event??summary?.event??state.facts.find(f=>f.sourceId===source.id)?.event??tr("School trip");
 const[event,setEvent]=useState(defaultEvent),[eventEdited,setEventEdited]=useState(false);
 useEffect(()=>{if(!eventEdited)setEvent(defaultEvent);},[defaultEvent,eventEdited]);
 const[cancelled,setCancelled]=useState(source.review?.status==='cancelled'),[quote,setQuote]=useState(source.review?.quote??''),[checked,setChecked]=useState(false),[error,setError]=useState('');
 const replaced=state.sources.some(s=>s.supersedes===source.id);
 const status=source.review?.status??'pending';
 if(!summary && !commit && status!=='cancelled')return null;
 return <section className={`source-changes ${status}`} aria-label={tr("Document changes")}>
  <span className="eyebrow">{summary?tr("WHAT CHANGED"):tr("SOURCE REVIEW")}</span>
  <h3>{status==='cancelled'?tr("Event cancelled"):status==='reviewed'?(summary?tr("Revision checked"):tr("Source checked")):(summary?tr("Check the revised plan"):tr("Check this source"))}</h3>
  {replaced&&<p>{tr("This version is in history. Open the current source before acting.")}</p>}
  <p>{source.title}{summary&&<> {tr("· replaces")} {summary.previous.title}</>}</p>
  {status==='cancelled'?<><p>{tr("You confirmed the cancellation for")} <strong>{source.review!.event}</strong>{tr(". Earlier requirements from the replaced source are no longer active. This is not a ready-to-go result.")}</p><blockquote>{source.review!.quote}</blockquote></>:<>
   {status==='pending'&&<p>{tr("This source is saved, but the review is not finished. Missing facts do not prove that a requirement was cancelled.")}</p>}
   {summary&&<>
    {(['meeting','departure']as const).map(kind=>{const before=summary.before.filter(f=>f.kind===kind),after=summary.after.filter(f=>f.kind===kind);if(!before.length&&!after.length)return null;return <div className="change-time" key={kind}><span>{kind==='meeting'?tr("Meeting time"):tr("Departure time")}</span><strong>{before.map(f=>f.value).join(' / ')||tr("Not established")} → {after.map(f=>f.value).join(' / ')||tr("Needs review")}</strong><small>{tr("Review the timing again before using your calculation.")}</small><details><summary>{tr("Compare exact quotes")}</summary><small>{tr("Previous source:")} {summary.previous.title}</small>{before.map(f=><blockquote key={f.id}>{f.quote}</blockquote>)}<small>{tr("Revised source:")} {summary.source.title}</small>{after.map(f=><blockquote key={f.id}>{f.quote}</blockquote>)}</details></div>;})}
    <div className="change-columns"><div><h4>{tr("Added to this plan")}</h4>{!summary.added.some(f=>!['meeting','departure'].includes(f.kind))&&<p>{tr("No new items.")}</p>}{summary.added.filter(f=>!['meeting','departure'].includes(f.kind)).map(f=><p key={f.id}>{f.value}<small>{f.quote}</small></p>)}</div><div><h4>{status==='pending'?tr("Not yet carried over"):tr("Not in the revised plan")}</h4>{summary.removed.filter(f=>!['meeting','departure'].includes(f.kind)).map(f=><p key={f.id}>{f.value}<small>{tr("Previous source:")} {f.quote}</small></p>)}<small>{tr("Absence alone does not establish cancellation.")}</small></div></div>
    {!!summary.retained.length&&<p className="change-retained">{tr("Still in the plan:")} {summary.retained.map(({fact,done,needsRecheck})=>`${fact.value}${done?' (already done)':needsRecheck?' (check again: source changed)':''}`).join(' · ')}</p>}
   </>}
  </>}
  {onOpen&&<button className="secondary" onClick={onOpen}>{tr("Review source and changes")}</button>}
  {commit && !replaced && <details><summary>{source.review?tr("Update your review"):tr("Finish checking this source")}</summary><form onSubmit={e=>{e.preventDefault();try{commit(finishSourceReview(state,source.id,event,cancelled?'cancelled':'reviewed',quote,checked),cancelled?tr("Cancellation confirmed from your quote."):tr("Source review finished. Check unresolved conflicts before calculating."));setError('');setChecked(false);}catch(e){setError((e as Error).message);}}}>
   <label>{tr("Event being reviewed")}<input value={event} onChange={e=>{setEvent(e.target.value);setEventEdited(true);setChecked(false);}} maxLength={100} required/></label>
   <label><input type="checkbox" checked={cancelled} onChange={e=>{setCancelled(e.target.checked);setChecked(false);}}/>{tr("This source explicitly cancels the whole event")}</label>
   {cancelled&&<label>{tr("Exact cancellation quote")}<textarea value={quote} onChange={e=>{setQuote(e.target.value);setChecked(false);}} required maxLength={2000}/></label>}
   <label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{tr("I checked the full source, event, date and all requirements")}</label>
   {error&&<p role="alert" className="error">{error}</p>}<button className="secondary" disabled={!checked}>{cancelled?tr("Confirm event cancellation"):tr("Finish source review")}</button>
  </form></details>}
 </section>;
}
