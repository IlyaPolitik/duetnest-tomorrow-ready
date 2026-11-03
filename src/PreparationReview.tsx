import {t as tr,locale} from './i18n.ts';
import {useState} from 'react';
import type {FormEvent} from 'react';
import type {Plans} from './plans.ts';
import type {Rehearsal} from './rehearsal-state.ts';
import {linkRequirement,preparationReview,unlinkRequirement} from './requirements.ts';
import {evaluateMorning} from './feasibility.ts';
import type {Verdict} from './feasibility.ts';
import './preparation-review.css';

export function PreparationReview({saved,plans,disabled,readFresh,onSave}:{saved:Rehearsal;plans:Plans|null;disabled:boolean;readFresh:()=>Plans|null;onSave:(next:Rehearsal,message:string)=>void}){
 const [selected,setSelected]=useState(''),[error,setError]=useState('');
 const review=preparationReview(saved,plans),option=review.options.find(o=>o.task.id===selected);
 const currentLink=saved.requirements?.find(b=>b.taskId===selected);
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!option)return;
  const data=new FormData(e.currentTarget),rawMin=String(data.get('min')??''),rawMax=String(data.get('max')??'');
  if(!rawMin.trim()||!rawMax.trim()){setError(tr("Enter both duration estimates. A missing estimate is not zero."));return;}
  const target=String(data.get('action')??'');
  if(!target){setError(tr("Choose an action or create a separate one."));return;}
  try{onSave(linkRequirement(saved,readFresh(),option.task.id,option.fingerprint,target==='new'?`requirement-${crypto.randomUUID()}`:target,{min:Number(rawMin),max:Number(rawMax)},data.get('review')==='on'),tr("Requirement linked to preparation. Previous evening choice cleared; check the new timing."));setSelected('');setError('');}catch(e){setError((e as Error).message);}
 }
 return <section className="preparation-review" aria-labelledby="preparation-review-title">
  <p className="eyebrow">{tr("THE REST OF YOUR DAY MATTERS TOO")}</p><h2 id="preparation-review-title">{review.needsAttention?tr("What still needs a decision."):tr("Reviewed actions checked by you.")}</h2>
  <p>{tr("A workable journey does not mean everything is prepared. This check covers saved facts for the linked event; it cannot prove the document was fully understood.")}</p>
  {!review.linked?<div className="review-attention"><b>{tr("Connect a checked meeting first.")}</b><p>{tr("Then we can bring the requirements for that event into this calculation.")}</p><a href="#meeting-evidence">{tr("Choose a document meeting ↓")}</a></div>:<>
   <div className="review-counts"><div><b>{review.uncovered.length}</b><span>{tr("requirements outside the timing model")}</span></div><div><b>{review.pending.length}</b><span>{tr("actions not marked done")}</span></div><div><b>{review.dependencies.length+review.unresolvedConflicts.length}</b><span>{tr("open questions or conflicts")}</span></div></div>
   {review.dependencies.length>0&&<div className="review-attention"><h3>{tr("Needs clarification, not a checkmark")}</h3>{review.dependencies.map(f=><div key={f.id}><b>{f.value}</b><blockquote>{f.quote}</blockquote></div>)}<p>{tr("You can still prepare independently. These questions stay open; the app does not infer permission or another person's availability.")}</p></div>}
   {review.unresolvedConflicts.length>0&&<p className="review-attention">{tr("Different times remain for this event.")} <a href="#">{tr("Review the conflicting sources →")}</a></p>}
   {review.unclassified.length>0&&<div className="review-attention"><b>{tr("Sources without reviewed facts")}</b><ul>{review.unclassified.map(s=><li key={s.id}>{s.title}</li>)}</ul><p>{tr("Their relevance and requirements are not established.")} <a href="#">{tr("Review sources →")}</a></p></div>}
   {review.stale.length>0&&<div className="review-attention"><b>{tr("Changed requirements need a fresh decision")}</b>{review.stale.map(b=><div className="stale-requirement" key={b.taskId}><p>{b.label}</p>{b.previousDuration&&<small>{tr("Previous estimate:")} {b.previousDuration.min}–{b.previousDuration.max} {tr("min. No longer used.")}</small>}<button type="button" className="text-button" disabled={disabled} onClick={()=>onSave(unlinkRequirement(saved,b.taskId),tr("Obsolete requirement link removed. Its action is kept with unknown duration; review it before recalculating."))}>{tr("Remove obsolete link")}</button></div>)}<p>{tr("Old sources remain in Documents. Removing a link keeps the action and asks you to estimate its duration again.")}</p></div>}
   {review.options.length===0?<p>{tr("No saved item or preparation requirements for this event. This does not prove that none exist.")} <a href="#">{tr("Review the document →")}</a></p>:<div className="requirements-list">{review.options.map(o=>{
    const link=saved.requirements?.find(b=>b.taskId===o.task.id&&b.status==='confirmed'&&b.fingerprint===o.fingerprint);
    const action=link?saved.input.preparation.find(t=>t.id===link.preparationId):undefined;
    return <article key={o.task.id}><div><strong>{o.task.label}</strong><small>{o.task.done?tr("Checked by you"):tr("Not marked done")} · {action?tr("Timing: {0}", action.label):tr("Not included in timing")}</small></div><button type="button" className="secondary" disabled={disabled} onClick={()=>{setSelected(o.task.id);setError('');}}>{action?tr("Review mapping"):tr("Include in timing")}</button></article>;
   })}</div>}
   {option&&<form key={option.fingerprint} className="requirement-editor" onSubmit={submit}>
    <h3>{option.task.label}</h3>{option.task.facts.map(f=><blockquote key={f.id}>{f.quote}</blockquote>)}
    <label>{tr("Which action covers this requirement?")}<select name="action" defaultValue={currentLink?.preparationId??''} required disabled={disabled}><option value="">{tr("Choose deliberately")}</option>{saved.input.preparation.map(t=><option key={t.id} value={t.id}>{tr(t.label)}</option>)}<option value="new">{tr("Create a separate action")}</option></select></label>
    <p>{tr("For a shared action, estimate its total time including all requirements it covers. We do not guess two minutes or count the same packing twice.")}</p>
    <div className="field-pair"><label>{tr("Minimum action minutes")}<input name="min" type="number" min="0" max="120" step="1" required disabled={disabled}/></label><label>{tr("Maximum action minutes")}<input name="max" type="number" min="0" max="120" step="1" required disabled={disabled}/></label></div>
    <label className="repair-consent"><input type="checkbox" name="review" required disabled={disabled}/>{tr("I checked the quote. This action covers it, and these are my duration estimates.")}</label>
    {error&&<p className="rehearsal-error" role="alert">{tr(error)}</p>}
    <button className="primary" disabled={disabled}>{tr("Save requirement mapping")}</button><button className="text-button" type="button" onClick={()=>{setSelected('');setError('');}}>{tr("Cancel")}</button>
   </form>}
   <p className="review-bottom"><a href="#">{tr("Review sources or mark completed actions →")}</a> {tr("· Scheduling never marks an action done.")}</p>
  </>}
 </section>;
}

export function ResilienceCheck({saved,result,moved}:{saved:Rehearsal;result:Verdict;moved:string[]}){
 const [delay,setDelay]=useState(0);
 const headroom=result.slack&&saved.input.buffer!==null?result.slack.min-saved.input.buffer:null;
 const travel=saved.input.travel;
 const stress=travel&&travel.max+delay<=120?evaluateMorning({...saved.input,travel:{min:travel.min+delay,max:travel.max+delay}},moved):null;
 return <section className="resilience-check"><p className="eyebrow">{tr("HOW MUCH ROOM IS REALLY LEFT?")}</p>
  <h3>{headroom===null?tr("The margin is unknown."):headroom<0?tr("The requested buffer is already missing."):headroom===0?tr("It fits, but has no extra margin."):tr("{0} extra minutes before your buffer is lost.", headroom)}</h3>
  <p>{tr("Measured against the slow end of your estimates and your requested buffer. No live traffic or probability is implied.")}</p>
  <label>{tr("Try extra journey time")}<select aria-label={tr("Extra journey time")} value={delay} onChange={e=>setDelay(Number(e.target.value))}><option value={0}>{tr("No extra delay")}</option><option value={5}>{tr("5 more minutes")}</option><option value={10}>{tr("10 more minutes")}</option><option value={15}>{tr("15 more minutes")}</option></select></label>
  <p role="status">{delay===0?tr("Choose a delay to test the margin. Your saved estimates stay unchanged."):!stress?tr("This test exceeds the supported journey range."):stress.status==='feasible'?tr("With {0} extra minutes, the plan still meets your buffer.", delay):tr("With {0} extra minutes: {1}", delay, stress.reasons.join(' '))}</p>
 </section>;
}
