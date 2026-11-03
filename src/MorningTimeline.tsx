import {t as tr,locale} from './i18n.ts';
import type {CSSProperties} from 'react';
import {formatMinute} from './feasibility.ts';
import type {Morning, Verdict} from './feasibility.ts';

/** A shared time scale. Marks use the actual calculation, never a model's guess. */
export function MorningTimeline({input, result, original}:{input:Morning;result:Verdict;original?:Verdict}) {
 const values=[input.ready,input.meeting,result.arrival?.min,result.arrival?.max,original?.arrival?.max].filter((n):n is number=>typeof n==='number');
 const start=Math.floor((Math.min(...values,720)-10)/15)*15;
 const end=Math.ceil((Math.max(...values,240)+10)/15)*15;
 const extent=Math.max(30,end-start);
 const position=(n:number)=>`${(n-start)/extent*100}%`;
 const style=(min:number,max:number):CSSProperties=>({left:position(min),width:`${Math.max(1,(max-min)/extent*100)}%`});
 const rows=[...(original?.arrival?[{label:tr("Without a change"),value:original,old:true}]:[]),{label:original?tr("With evening preparation"):tr("Your morning"),value:result,old:false}];
 return <div className="morning-timeline" aria-label={tr("Calculated morning timeline")}>
  <div className="timeline-heading"><span>{tr("YOUR MORNING, MAPPED")}</span><span>{tr("Time ranges · Warsaw")}</span></div>
  {result.arrival&&input.ready!==null&&input.travel&&input.meeting!==null?<>
   <div className="timeline-axis" aria-hidden="true">{Array.from({length:Math.floor(extent/(Math.ceil(extent/90)*15))+1},(_,i)=>start+i*Math.ceil(extent/90)*15).map(n=><span key={n} style={{left:position(n)}}>{formatMinute(n)}</span>)}</div>
   {rows.map(row=><div className={`timeline-row ${row.old?'before':result.status}`} key={row.label}>
    <div className="timeline-row-caption"><b>{row.label}</b><span>{formatMinute(row.value.arrival!.min)}–{formatMinute(row.value.arrival!.max)}</span></div>
    <div className="timeline-track" aria-hidden="true">
     {row.value.preparation&&row.value.preparation.max>0&&<span className="timeline-prep" style={style(input.ready!,input.ready!+row.value.preparation.max)}/>}
     <span className="timeline-travel" style={style(input.ready!+row.value.preparation!.max,row.value.arrival!.max)}/>
     <span className="timeline-arrival" style={style(row.value.arrival!.min,row.value.arrival!.max)}/>
     <span className="timeline-meeting" style={{left:position(input.meeting!)}}/>
    </div>
   </div>)}
   <div className="timeline-legend"><span><i className="prep"/>{tr("Preparation")}</span><span><i className="travel"/>{tr("Travel")}</span><span><i className="arrival"/>{tr("Arrival range")}</span><span><i className="meeting"/>{tr("Meeting")} {formatMinute(input.meeting)}</span></div>
  </>:<div className="timeline-unknown"><span aria-hidden="true">— — —</span><b>{tr("No reliable timeline yet")}</b><p>{tr(result.reasons[0]) || tr("Review the inputs before using this timeline.")}</p></div>}
 </div>;
}
