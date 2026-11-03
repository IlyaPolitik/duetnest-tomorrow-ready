import {t as tr,locale} from './i18n.ts';
import { useState } from 'react';
import type { Plans } from './plans.ts';
import { confirmMeeting, meetingEvents, meetingOptions } from './meeting-binding.ts';
import type { MeetingBinding } from './meeting-binding.ts';

export function DocumentMeeting({plans,day,binding,disabled,onConfirm,onManual,readFresh}:{plans:Plans|null;day:string;binding?:MeetingBinding;disabled:boolean;onConfirm:(b:MeetingBinding)=>void;onManual:()=>void;readFresh:()=>Plans|null}) {
  const [event,setEvent]=useState(binding?.day===day?binding.event:''),[factId,setFactId]=useState(''),[review,setReview]=useState(''),[error,setError]=useState('');
  const options=meetingOptions(plans,day,event),selected=options.find(o=>o.fact.id===factId);
  const token=selected?.fingerprint??'';
  return <section id="meeting-evidence" className="document-meeting" aria-label={tr("Meeting from a document")}>
    <p className="eyebrow">{tr("MEETING FROM A DOCUMENT")}</p><h3>{tr("Keep the reason next to the result.")}</h3>
    <p>{tr("Select a fact already saved in your documents. Check its day, event and exact quote before using it. Travel and preparation remain your own estimates.")}</p>
    {binding&&<div className={`linked-meeting ${binding.status==='review'?'needs-review':''}`}>
      <strong>{binding.status==='review'?tr("Review required"):tr("Confirmed by you")} · {binding.value}</strong>
      <p>{binding.title} · {binding.day} · {binding.event}</p><blockquote>{binding.quote}</blockquote>
      {binding.reason&&<p role="alert">{tr(binding.reason)} {tr("The old time and evening choice are no longer used.")}</p>}
      {binding.previous&&<p>{tr("Changed from")} {binding.previous.value} {tr("in “")}{binding.previous.title}{tr("” to")} {binding.value} {tr("in “")}{binding.title}”.</p>}
      <button className="text-button" disabled={disabled} onClick={onManual}>{tr("Disconnect document and enter time manually")}</button>
    </div>}
    {!plans?<p role="alert">{tr("Saved documents are unavailable. They have not been overwritten.")}</p>:<>
      <label>{tr("Event for")} {day}<select aria-label={tr("Document event")} value={event} disabled={disabled} onChange={e=>{setEvent(e.target.value);setFactId('');setReview('');setError('');}}><option value="">{tr("Choose an event")}</option>{meetingEvents(plans.days[day]).map(name=><option key={name}>{name}</option>)}</select></label>
      {!meetingEvents(plans.days[day]).length&&<p>{tr("No meeting facts saved for this day. Add a document and a checked meeting fact in")} <a href="#">{tr("Documents & sources")}</a>{tr(", or use another calculation day.")}</p>}
      {event&&<label>{tr("Meeting fact")}<select aria-label={tr("Document meeting fact")} value={factId} disabled={disabled} onChange={e=>{setFactId(e.target.value);setReview('');setError('');}}><option value="">{tr("Choose a source and time")}</option>{options.map(o=><option key={o.fact.id} value={o.fact.id}>{o.fact.value} · {o.source.title}</option>)}</select></label>}
      {selected&&<div className="meeting-preview"><strong>{selected.source.title} · {selected.fact.value}</strong><blockquote>{selected.fact.quote}</blockquote><small>{selected.fact.provenance?tr("Meta candidate, reviewed by you"):tr("Saved fact; not a new AI analysis")}</small>
        {selected.problem?<p role="alert">{tr(selected.problem)}</p>:<><label className="repair-consent"><input type="checkbox" disabled={disabled} checked={review===token&&Boolean(token)} onChange={e=>setReview(e.target.checked?token:'')}/>{tr("I checked this quote and confirm")} {selected.fact.value} {tr("for")} {event} {tr("on")} {day}.</label><button className="primary" disabled={disabled||review!==token} onClick={()=>{try{onConfirm(confirmMeeting(readFresh(),day,event,factId,token,review===token,binding));setReview('');setError('');}catch(e){setError((e as Error).message);setReview('');}}}>{tr("Use this document time")}</button></>}
      </div>}
    </>}
    {disabled&&<p>{tr("Recalculate your edited parameters before linking a document.")}</p>}{error&&<p role="alert">{tr(error)}</p>}
  </section>;
}
