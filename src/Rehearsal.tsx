import {t as tr,locale} from './i18n.ts';
import {storageKey,browserSearch} from './storage-scope.ts';
import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {acceptRepair,currentChoice,evaluateMorning,findRepair,formatMinute,issues} from './feasibility.ts';
import type {Minutes,Morning,Verdict} from './feasibility.ts';
import {changeInputs,newRehearsal,reconcileMeeting,useMeeting,REHEARSAL_KEY,restoreRehearsal} from './rehearsal-state.ts';
import type {Rehearsal as Saved} from './rehearsal-state.ts';
import {parsePlans} from './plans.ts';
import {DocumentMeeting} from './DocumentMeeting.tsx';
import './rehearsal.css';
import {MorningTimeline} from './MorningTimeline.tsx';
import './story.css';
import {preparationReview} from './requirements.ts';
import {PreparationReview,ResilienceCheck} from './PreparationReview.tsx';
const DOCUMENTS_KEY=storageKey('duetnest-meta-hackathon:readiness:v1',browserSearch());
function readDocuments(){try{return parsePlans(localStorage.getItem(DOCUMENTS_KEY));}catch{return null;}}
const clock=(n:number|null)=>n===null?'':formatMinute(n);
const span=(n:Minutes)=>n.min===n.max?`${n.min}`:`${n.min}–${n.max}`;
function load(){try{return {state:restoreRehearsal(localStorage.getItem(REHEARSAL_KEY)),error:''};}catch{return {state:newRehearsal(),error:tr("Saved scenario could not be read. It has not been overwritten; edits will stay in this session only.")};}}
function Arrival({result}:{result:Verdict}){return <>{result.arrival?<><strong className="arrival-time">{clock(result.arrival.min)}<span>–</span>{clock(result.arrival.max)}</strong><p>{tr("Estimated arrival · your entered ranges")}</p></>:<p>{tr("No reliable arrival range yet.")}</p>}</>;}
function ResultTitle({result}:{result:Verdict}) {return <>{result.status==='feasible'?tr("Works with these assumptions"):result.status==='infeasible'?tr("This plan needs a change"):result.status==='unknown'?tr("One missing detail can change the answer"):tr("Check the inputs")}</>;}
export function Rehearsal(){
 const [initial]=useState(load),[stored,setSaved]=useState<Saved>(initial.state),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [documents,setDocuments]=useState(readDocuments),[formVersion,setFormVersion]=useState(0);
 const saved=reconcileMeeting(stored,documents);
 useEffect(()=>{const refresh=()=>setDocuments(readDocuments());const onStorage=(e:StorageEvent)=>{if(e.key===DOCUMENTS_KEY||e.key===null)refresh();};window.addEventListener('storage',onStorage);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener('focus',refresh);};},[]);
 useEffect(()=>{if(saved===stored)return;setSaved(saved);setConfirmed(false);setNotice(tr("Document evidence changed. Review the affected requirements and timing before choosing a plan."));if(!initial.error){try{localStorage.setItem(REHEARSAL_KEY,JSON.stringify(saved));}catch{setError(tr("The old document link was disabled in this tab, but the browser could not save the change."));}}},[saved,stored,initial.error]);
 const heading=useRef<HTMLHeadingElement>(null),p=saved.input,choice=currentChoice(p,saved.choice);
 const baseline=evaluateMorning(p),current=evaluateMorning(p,choice),repair=findRepair(p);
 const preparation=preparationReview(saved,documents);
 function persist(next:Saved,message:string){const fresh=readDocuments();setDocuments(fresh);const checked=reconcileMeeting(next,fresh);if(checked!==next)message=tr("The document changed. Review the current meeting time before continuing.");next=checked;setFormVersion(v=>v+1);setSaved(next);setDirty(false);setConfirmed(false);setError('');setNotice(message);if(!initial.error){try{localStorage.setItem(REHEARSAL_KEY,JSON.stringify(next));}catch{setError(tr("Your change is visible, but this browser could not save it. Keep this tab open."));}}requestAnimationFrame(()=>heading.current?.focus());}
 function update(input:Morning,message:string){try{persist(changeInputs(saved,input),message);}catch(e){setError((e as Error).message);}}
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);
  const number=(key:string)=>{const s=String(f.get(key)??'').trim();return s===''?null:Number(s);};
  const time=(key:string)=>{const s=String(f.get(key)??'');return !s?null:/^\d\d:\d\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;};
  const pairs=['travel',...p.preparation.map(t=>t.id)];
  if(pairs.some(key=>(number(key+'Min')===null)!==(number(key+'Max')===null))){setError(tr("Fill both ends of each range, or leave both blank if the duration is unknown. Your entered values are still here."));return;}
  const duration=(prefix:string):Minutes|null=>{const min=number(prefix+'Min'),max=number(prefix+'Max');return min===null||max===null?null:{min,max};};
  const next:Morning={...p,day:String(f.get('day')),ready:time('ready'),meeting:time('meeting'),travel:duration('travel'),buffer:number('buffer'),evening:number('evening'),preparation:p.preparation.map(t=>({...t,duration:duration(t.id),mayMove:f.get(t.id+'Move')==='on'}))};
  const errors=issues(next);if(errors.length){setError(errors.join(' '));return;}
  update(next,tr("Inputs saved and recalculated. Any previous evening choice needs confirmation again."));
 }
 const title=preparation.needsAttention?tr("See what still stands between you and tomorrow."):current.status==='feasible'?tr("A little preparation. A calmer morning."):tr("Catch the problem before tomorrow.");
 return <div className="rehearsal" lang={locale()}>
  <a className="skip" href="#rehearsal-main">{tr("Skip to the plan check")}</a>
  <header className="rehearsal-header"><a className="brand" href="#"><span className="monogram">dn</span><span>DuetNest<small>{tr("TOMORROW READY · LAB")}</small></span></a><a className="story-preview-link" href="#demo">{tr("Play the story ↗")}</a><a className="back-to-lab" href="#lab">{tr("Documents & sources ↗")}</a><span className="local-pill">{tr("Local calculation · no AI call")}</span></header>
  <main id="rehearsal-main">
   <div className="rehearsal-intro"><div><p className="eyebrow">{tr("ONE PARENT. ONE PREPARED DAY.")}</p><h1>{title}</h1><p>{tr("Check your time, see what changed, and choose what you can do tonight.")}</p></div><div className="scenario-date">{new Intl.DateTimeFormat(locale()==='uk'?'uk-UA':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${p.day}T12:00:00Z`))}<small>{tr("Europe/Warsaw · morning 04:00–12:00")}</small></div></div>
   <div className="rehearsal-disclosure">{tr("Local prototype · use fictional documents. Meeting time can come from a fact you have checked; personal durations are your estimates. No AI is called on this screen. This checks one journey, not a child's overall readiness.")}</div>
   {initial.error&&<p className="rehearsal-error" role="alert">{initial.error}</p>}{error&&<p className="rehearsal-error" role="alert">{tr(error)}</p>}
   {notice&&<p className="rehearsal-notice" role="status">{notice}</p>}
   <div className="rehearsal-layout">
    <section className="rehearsal-results" aria-label={tr("Plan comparison")}>
     {saved.binding?.status==='review'&&<p className="rehearsal-error" role="alert">{saved.binding.reason} {tr("Previous time:")} {saved.binding.value}{tr(". Review the document below; the previous evening choice has been cleared.")}</p>}
     {dirty?<div className="verdict unknown"><h2 ref={heading} tabIndex={-1}>{tr("Your inputs have changed.")}</h2><p>{tr("Recalculate to see a current result. Previous comparisons are hidden until then.")}</p></div>:<>
      <div className={`verdict ${current.status} ${preparation.needsAttention?'scope-incomplete':''}`}><p className="eyebrow">{choice.length?tr("YOUR CHOSEN PLAN"):tr("CURRENT MORNING PLAN")}</p><h2 ref={heading} tabIndex={-1}>{current.status==='feasible'&&preparation.needsAttention?tr("Timing fits. Preparation still needs review."):<ResultTitle result={current}/>}</h2><Arrival result={current}/>{preparation.uncovered.length>0&&<p className="coverage-caution">{preparation.uncovered.length} {tr("saved requirements are not included in these durations. Map them below before relying on this arrival range.")}</p>}<MorningTimeline input={p} result={current} original={choice.length?baseline:undefined}/>{saved.binding?.status==='confirmed'&&<div className="result-source"><strong>{saved.binding.title}</strong><blockquote>{saved.binding.quote}</blockquote>{saved.binding.previous&&<p>{tr("Meeting changed:")} {saved.binding.previous.value} → {saved.binding.value}{tr(". Confirmed by you.")}</p>}</div>}
       <div className="time-summary"><div><span>{tr("School meeting")}</span><b>{p.meeting===null?tr("Not provided"):clock(p.meeting)}</b></div><div><span>{tr("Worst-case buffer")}</span><b>{current.slack?tr("{0} min", current.slack.min):tr("Unknown")}</b></div><div><span>{tr("Requested buffer")}</span><b>{p.buffer===null?tr("Unknown"):tr("{0} min", p.buffer)}</b></div></div>
       <ul>{current.reasons.map(reason=><li key={reason}>{tr(reason)}</li>)}</ul>
       {current.arrival&&<details><summary>{tr("Why this result?")}</summary><p>{clock(p.ready)} + {span(current.preparation!)} {tr("min morning preparation +")} {span(p.travel!)} {tr("min travel =")} {clock(current.arrival.min)}–{clock(current.arrival.max)}.</p><p>{tr("Worst-case arrival must be no later than the school meeting minus your")} {p.buffer}{tr("-minute buffer. All preparation is sequential; no parallel work or help from another person is assumed.")}</p>{choice.length>0&&<p>{tr("Evening preparation uses up to")} {current.eveningMinutes} {tr("of the")} {p.evening} {tr("minutes you entered. Scheduling it does not mark it done.")}</p>}</details>}
       <ResilienceCheck saved={saved} result={current} moved={choice}/>
      </div>
      {choice.length>0?<div className="repair-card"><p className="eyebrow">{tr("CHOSEN BY YOU · NOT MARKED DONE")}</p><h3>{tr("Prepare the evening before")}</h3><ul>{p.preparation.filter(t=>choice.includes(t.id)).map(t=><li key={t.id}>{tr(t.label)} · {span(t.duration!)} {tr("min")}</li>)}</ul><p>{tr("Your original morning would arrive at")} {baseline.arrival?`${clock(baseline.arrival.min)}–${clock(baseline.arrival.max)}`:tr("an unknown time")}.</p><button className="secondary" onClick={()=>persist({...saved,choice:null},tr("Returned to the original morning. No task completion changed."))}>{tr("Undo evening choice")}</button></div>:repair.variant?<div className="repair-card"><p className="eyebrow">{tr("A CHECKED OPTION")}</p><h3>{tr("Move preparation to the evening")}</h3><ul>{p.preparation.filter(t=>repair.variant!.moved.includes(t.id)).map(t=><li key={t.id}>{tr(t.label)} · {span(t.duration!)} {tr("min")}</li>)}</ul><Arrival result={repair.variant.verdict}/><p>{tr("Worst-case buffer:")} <strong>{repair.variant.verdict.slack!.min} {tr("min")}</strong>{tr(". Evening time needed:")} <strong>{repair.variant.verdict.eveningMinutes} {tr("min")}</strong>.</p><label className="repair-consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{tr("I can actually do these actions the evening before.")}</label><button className="primary" disabled={!confirmed||preparation.uncovered.length>0||preparation.stale.length>0} onClick={()=>{try{persist({...saved,choice:acceptRepair(p,repair.variant!.moved)},tr("Evening choice saved. Preparation still needs to be done."));}catch(e){setError((e as Error).message);}}}>{tr("Use this evening plan")}</button><small>{preparation.uncovered.length>0?tr("Map the document requirements below before choosing this plan. "):''}{tr(repair.reason)} {tr("Checked")} {repair.checked} {tr("possible selections. No other changes were considered.")}</small></div>:baseline.status==='infeasible'&&<div className="repair-card"><h3>{tr("Keep the requirement. Clarify the options.")}</h3><p>{tr(repair.reason)}</p><p>{tr("To compare an evening transfer, allow it in the preparation fields and enter the time you have available. The app will not assume an earlier start or another person's help.")}</p></div>}
     </>}
     <PreparationReview saved={saved} plans={documents} disabled={dirty} readFresh={readDocuments} onSave={persist}/>
     <DocumentMeeting key={p.day} plans={documents} day={p.day} binding={saved.binding} disabled={dirty} readFresh={readDocuments} onConfirm={binding=>persist(useMeeting(saved,binding),tr("Document time confirmed. Check the updated calculation."))} onManual={()=>{const {binding:_,...manual}=saved;persist({...manual,input:{...p,meeting:null},choice:null},tr("Document disconnected. Enter and recalculate a manual meeting time."));}}/>
     {!saved.binding&&<section className="scenario-source"><p className="eyebrow">{tr("TRY A CHANGE · SYNTHETIC SCHOOL NOTES")}</p><p>Original: “Zbiórka 28 października 2026 o 08:00.”</p><p>Revision: “Zmiana godziny zbiórki: 28 października 2026 o 07:45.”</p><p>{tr("The example moves the same meeting from 08:00 to 07:45. This button changes only the manual meeting parameter; it does not import or interpret a document.")}</p><button className="secondary" disabled={dirty||Boolean(saved.binding)||p.meeting===465||p.day!=='2026-10-28'} onClick={()=>update({...p,meeting:465},tr("Synthetic revision applied: school meeting 07:45. Recheck any evening choice."))}>{tr("Use revised school time: 07:45")}</button>{p.day!=='2026-10-28'&&<small>{tr("The example note is for 28 Oct 2026. Set another meeting manually for your chosen day.")}</small>}</section>}
    </section>
    <section className="assumptions"><div><p className="eyebrow">{tr("YOUR TIME & CONSTRAINTS")}</p><h2>{tr("Try your own numbers")}</h2><p>{tr("Blank fields mean unknown, never zero. Leave both ends of a range blank when unknown. These are estimates you enter, not live traffic data.")}</p></div>
     <form key={formVersion} noValidate onSubmit={submit} onChange={()=>{setDirty(true);setConfirmed(false);setError('');setNotice('');}}>
      <label>{tr("Day")}<input name="day" type="date" defaultValue={p.day} required/></label>
      <div className="field-pair"><label>{tr("Other commitments end")}<input name="ready" type="time" min="04:00" max="12:00" defaultValue={clock(p.ready)}/></label><label>{tr("School meeting")}{saved.binding?<input name="meeting" type="time" value={clock(p.meeting)} readOnly aria-describedby="linked-time-help"/>:<input name="meeting" type="time" min="04:00" max="12:00" defaultValue={clock(p.meeting)}/>}</label></div>
      {saved.binding&&<small id="linked-time-help">{tr("Linked to a document. Confirm a new source below the result, or disconnect it to enter time manually.")}</small>}
      <fieldset><legend>{tr("Travel time · minutes")}</legend><div className="field-pair"><label>{tr("Minimum travel")}<input name="travelMin" type="number" min="0" max="120" step="1" defaultValue={p.travel?.min??''}/></label><label>{tr("Maximum travel")}<input name="travelMax" type="number" min="0" max="120" step="1" defaultValue={p.travel?.max??''}/></label></div></fieldset>
      <div className="field-pair"><label>{tr("Required buffer · min")}<input name="buffer" type="number" min="0" max="120" step="1" defaultValue={p.buffer??''}/></label><label>{tr("Free time the evening before · min")}<input name="evening" type="number" min="0" max="120" step="1" defaultValue={p.evening??''}/></label></div>
      {p.preparation.map(t=><fieldset key={t.id}><legend>{tr(t.label)}</legend>{t.unresolved&&<p className="action-review-warning">{tr(t.unresolved??'')}</p>}<div className="field-pair"><label>{tr("Minimum preparation")}<input name={t.id+'Min'} type="number" min="0" max="120" step="1" defaultValue={t.duration?.min??''}/></label><label>{tr("Maximum preparation")}<input name={t.id+'Max'} type="number" min="0" max="120" step="1" defaultValue={t.duration?.max??''}/></label></div><label className="repair-consent"><input name={t.id+'Move'} type="checkbox" defaultChecked={t.mayMove}/>{tr("Allow this action to move to the evening")}</label></fieldset>)}
      <button className="primary" type="submit">{tr("Recalculate my plan")}</button>
     </form>
    </section>
   </div>
   <footer className="rehearsal-footer"><span>{tr("One journey, one parent, one morning. Saved locally in this browser, separate from your document plans.")}</span><button className="text-button" onClick={()=>{if(window.confirm(tr("Reset only this synthetic scenario? Your document plans will stay unchanged.")))persist(newRehearsal(),tr("Synthetic scenario reset. Document plans are unchanged."));}}>{tr("Reset this scenario")}</button></footer>
  </main>
 </div>;
}
