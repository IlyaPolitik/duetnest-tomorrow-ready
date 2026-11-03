import {t as tr,locale} from './i18n.ts';
import {useState} from 'react';
import {evaluateMorning,findRepair,formatMinute} from './feasibility.ts';
import {newRehearsal} from './rehearsal-state.ts';
import {MorningTimeline} from './MorningTimeline.tsx';
import './story.css';

const stages=[tr("The plan"),tr("The change"),tr("The repair"),tr("The unknown")];
export function StoryDemo(){
 const [step,setStep]=useState(0);
 const input={...newRehearsal().input,meeting:step===0?480:465,travel:step===3?null:{min:20,max:25},preparation:newRehearsal().input.preparation.map(t=>({...t,mayMove:step>=2}))};
 const baseline=evaluateMorning(input),repair=findRepair(input);
 const result=step===2&&repair.variant?repair.variant.verdict:baseline;
 const headlines=[tr("Tomorrow looks sorted."),tr("One sentence. A different morning."),tr("Change tonight. Keep tomorrow."),tr("A good answer knows its limits.")];
 const descriptions=[tr("The bag, the journey, the school gate. See how the pieces fit before the morning starts."),tr("School moved the meeting 15 minutes earlier. The same routine now gets you there too late."),tr("Prepare the bag this evening. The meeting stays fixed. No earlier start. No second person needed."),tr("Remove the travel estimate and the answer becomes unknown. Missing information never turns into false reassurance.")];
 const tones=['calm','risk','fixed','unknown'];
 return <div className={`story ${tones[step]}`}>
  <a className="skip" href="#demo-main">{tr("Skip to demo")}</a>
  <header className="story-nav"><a href="#" className="brand"><span className="story-symbol" aria-hidden="true">↗</span><span>Tomorrow Ready<small>{tr("BY DUETNEST")}</small></span></a><div><a href="#rehearsal">{tr("My plan")}</a><a href="#lab">{tr("Documents ↗")}</a></div></header>
  <main id="demo-main" className="story-main">
   <div className="story-kicker"><span className="story-dot"/> {tr("A REHEARSAL FOR REAL LIFE")} <span className="story-demo-label">{tr("Interactive demo · fictional data")}</span></div>
   <div className="story-intro"><div key={step} className="story-copy"><h1>{headlines[step]}</h1><p>{descriptions[step]}</p></div><div className="story-chapter"><span>0{step+1}</span><small>/ 04</small></div></div>
   <nav className="story-steps" aria-label={tr("Demo chapters")}>{stages.map((label,index)=><button key={label} onClick={()=>setStep(index)} aria-current={step===index?'step':undefined}><span>0{index+1}</span>{label}<b aria-hidden="true">{index<step?'✓':'↗'}</b></button>)}</nav>
   <div className="story-stage">
    <section className="story-evidence" aria-label={tr("Demo source and assumptions")}>
     <div className="story-section-label"><span>{tr("01 / THE EVIDENCE")}</span><span aria-hidden="true">↙</span></div>
     <article className="story-letter" key={step===0?'old':'new'}>
      <div className="letter-top"><span className="letter-icon" aria-hidden="true">≡</span><div><b>{tr("School trip")}</b><small>{tr("28 October 2026 · fictional note")}</small></div><span className="letter-version">V{step===0?'1':'2'}</span></div>
      <p className="letter-salutation">{tr("Dear parents,")}</p><p>{step===0?tr("We will meet at the school gate at"):tr("A small update: we will now meet at")} <mark>{step===0?'08:00':'07:45'}</mark> {tr("on 28 October 2026. Please bring a packed school bag.")}</p>
      <div className="letter-signature">{tr("The school team")} <span aria-hidden="true">↗</span></div>
     </article>
     {step>0&&<div className="story-delta"><span>{tr("Meeting changed")}</span><div><s>08:00</s><span aria-hidden="true">→</span><strong>07:45</strong></div><small>{tr("15 minutes earlier. Same morning commitments.")}</small></div>}
     <div className="story-assumptions"><p className="story-section-label">{tr("02 / YOUR ESTIMATES")}</p><div><span>{tr("Available from")}</span><b>07:15</b></div><div><span>{tr("Pack the bag")}</span><b>{tr("15 min")} {step===2&&<em>{tr("→ tonight")}</em>}</b></div><div><span>{tr("Journey")}</span><b>{step===3?tr("Unknown"):'20–25 min'}</b></div><div><span>{tr("Arrival buffer")}</span><b>{tr("5 min")}</b></div></div>
    </section>
    <section className="story-outcome" aria-label={tr("Demo calculation")} aria-live="polite" aria-atomic="true">
     <div className="story-section-label"><span>{tr("03 / THE CONSEQUENCE")}</span><span className="story-state">{result.status==='feasible'?tr("FITS THE ESTIMATES"):result.status==='infeasible'?tr("CHANGE NEEDED"):tr("NEEDS CLARIFICATION")}</span></div>
     <div className="story-arrival" key={step}><p>{step===3?tr("ESTIMATED ARRIVAL"):tr("YOU WOULD ARRIVE AT")}</p><div>{result.arrival?<><strong>{formatMinute(result.arrival.min)}</strong><span>—</span><strong>{formatMinute(result.arrival.max)}</strong></>:<strong className="unknown-word">{tr("Not known.")}</strong>}</div><h2>{step===0?tr("5–10 minutes before the meeting."):step===1?tr("5–10 minutes too late."):step===2?tr("5–10 minutes back on your side."):tr("No estimate. No green light.")}</h2></div>
     <MorningTimeline input={input} result={result} original={step===2?baseline:undefined}/>
     <div className="story-insight"><span className="insight-icon" aria-hidden="true">{step===1?'!':step===3?'?':'↗'}</span><div><b>{step===0?tr("The plan fits. For now."):step===1?tr("A reminder would tell you the new time."):step===2?tr("One action moved. The whole morning changes."):tr("Ask for the missing piece.")}</b><p>{step===0?tr("Your latest estimated arrival meets the five-minute buffer."):step===1?tr("This rehearsal shows what that change does to your morning."):step===2?tr("15 of 15 available evening minutes used. This is a proposal, not a completed task."):tr("How long could the journey take? Both ends of the range are needed.")}</p></div></div>
    </section>
   </div>
   <div className="story-controls"><p>{tr("One parent. One morning.")}<br/><strong>{tr("Small changes, made visible.")}</strong></p>{step<3?<button className="story-next" onClick={()=>setStep(step+1)}>{[tr("A new school note arrives"),tr("Try packing the bag tonight"),tr("What if travel is unknown?")][step]}<span aria-hidden="true">→</span></button>:<a className="story-next" href="#rehearsal">{tr("Try it with your own plan")} <span aria-hidden="true">→</span></a>}</div>
   <footer className="story-footer"><span>{tr("Fictional example · local calculation · no AI call · nothing saved")}</span><button onClick={()=>setStep(0)}>{tr("Replay from the start ↺")}</button></footer>
  </main>
 </div>;
}
