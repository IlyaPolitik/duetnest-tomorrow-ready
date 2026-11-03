// Bounded, single-parent morning calculation. No model calls or external actions.
import { validDate } from './engine.ts';
export type Minutes = { min: number; max: number };
export type Preparation = { id: string; label: string; duration: Minutes | null; after: string[]; mayMove: boolean; unresolved?: string };
export type Morning = { day: string; zone: 'Europe/Warsaw'; ready: number | null; meeting: number | null; travel: Minutes | null; buffer: number | null; evening: number | null; preparation: Preparation[] };
export type Verdict = { status: 'feasible' | 'infeasible' | 'unknown' | 'invalid'; reasons: string[]; arrival?: Minutes; slack?: Minutes; preparation?: Minutes; eveningMinutes?: number };
export type Variant = { moved: string[]; verdict: Verdict };
export type Choice = { inputKey: string; moved: string[] };
const integer = (n: unknown, max = 120) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= max;
const range = (v: unknown): v is Minutes => Boolean(v && typeof v === 'object' && integer((v as Minutes).min) && integer((v as Minutes).max) && (v as Minutes).min <= (v as Minutes).max);
export function issues(p: Morning): string[] {
  const errors: string[] = [];
  if (!p || typeof p !== 'object') return ['The scenario could not be read.'];
  if (!validDate(p.day) || p.zone !== 'Europe/Warsaw') errors.push('Choose a valid day in Europe/Warsaw.');
  for (const [name,n] of [['Morning starts',p.ready],['School meeting',p.meeting]] as const)
    if (n !== null && (!integer(n,720) || n < 240)) errors.push(`${name}: use a time between 04:00 and 12:00.`);
  if (p.travel !== null && !range(p.travel)) errors.push('Travel: use a minimum and maximum from 0 to 120 minutes, in that order.');
  for (const [name,n] of [['Buffer',p.buffer],['Evening time',p.evening]] as const)
    if (n !== null && !integer(n)) errors.push(`${name}: use 0 to 120 whole minutes.`);
  if (!Array.isArray(p.preparation) || p.preparation.length > 12) return [...errors,'Use at most 12 preparation actions.'];
  const ids = new Set<string>();
  for (const t of p.preparation) {
    if (!t || typeof t.id !== 'string' || !t.id.trim() || ids.has(t.id) || typeof t.label !== 'string' || !t.label.trim() || t.label.length > 100 || typeof t.mayMove !== 'boolean' || !Array.isArray(t.after) || t.after.some(x=>typeof x!=='string') || new Set(t.after).size!==t.after.length || (t.unresolved !== undefined && (typeof t.unresolved !== 'string' || !t.unresolved.trim()))) { errors.push('Each action needs a unique ID, a label and valid dependencies.'); continue; }
    ids.add(t.id);
    if (t.duration !== null && !range(t.duration)) errors.push(`${t.label}: use a duration range from 0 to 120 minutes.`);
  }
  if (errors.length) return errors;
  if (p.preparation.some(t=>t.after.some(id=>!ids.has(id)))) return ['A prerequisite action is missing.'];
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id:string):boolean { if(visiting.has(id))return false;if(visited.has(id))return true;visiting.add(id);for(const dependency of p.preparation.find(t=>t.id===id)!.after)if(!visit(dependency))return false;visiting.delete(id);visited.add(id);return true; }
  if (p.preparation.some(t=>!visit(t.id))) errors.push('The preparation dependencies contain a cycle.');
  return errors;
}
function evaluateChecked(p:Morning,moved:string[]):Verdict {
  const selection=new Set(moved);
  if(selection.size!==moved.length || moved.some(id=>!p.preparation.some(t=>t.id===id&&t.mayMove)))return {status:'invalid',reasons:['Only actions you allowed can move to the evening.']};
  if(p.preparation.some(t=>selection.has(t.id)&&t.after.some(id=>!selection.has(id))))return {status:'invalid',reasons:['An evening action still depends on a morning action.']};
  const missing:string[]=[];
  if(p.ready===null)missing.push('When are your other morning commitments finished?');
  if(p.meeting===null)missing.push('What is the confirmed school meeting time?');
  if(p.travel===null)missing.push('How long can the journey take? Enter a minimum and maximum.');
  if(p.buffer===null)missing.push('How many minutes of buffer do you want?');
  if(moved.length&&p.evening===null)missing.push('How much time is available the evening before?');
  for(const t of p.preparation){if(t.duration===null)missing.push(`How long does “${t.label}” take?`);if(t.unresolved)missing.push(t.unresolved);}
  if(missing.length)return {status:'unknown',reasons:missing};
  const preparation=p.preparation.filter(t=>!selection.has(t.id)).reduce((sum,t)=>({min:sum.min+t.duration!.min,max:sum.max+t.duration!.max}),{min:0,max:0});
  const eveningMinutes=p.preparation.filter(t=>selection.has(t.id)).reduce((n,t)=>n+t.duration!.max,0);
  const arrival={min:p.ready!+preparation.min+p.travel!.min,max:p.ready!+preparation.max+p.travel!.max};
  const slack={min:p.meeting!-arrival.max,max:p.meeting!-arrival.min};
  const reasons:string[]=[];
  if(moved.length&&eveningMinutes>p.evening!)reasons.push(`Evening preparation needs ${eveningMinutes} minutes; only ${p.evening} are available.`);
  if(slack.min<0)reasons.push(slack.max<0?`Arrival is ${-slack.max}–${-slack.min} minutes after the meeting.`:`Arrival could be up to ${-slack.min} minutes after the meeting.`);
  else if(slack.min<p.buffer!)reasons.push(`The worst-case buffer is ${slack.min} minutes; you requested ${p.buffer}.`);
  return {status:reasons.length?'infeasible':'feasible',reasons:reasons.length?reasons:['Works within the entered time ranges and constraints.'],arrival,slack,preparation,eveningMinutes};
}
export function evaluateMorning(p:Morning,moved:string[]=[]):Verdict {
  const errors=issues(p);return errors.length?{status:'invalid',reasons:errors}:evaluateChecked(p,moved);
}
export function findRepair(p:Morning):{variant:Variant|null; checked:number; reason:string} {
  const baseline=evaluateMorning(p);
  if(baseline.status!=='infeasible')return {variant:null,checked:0,reason:baseline.status==='feasible'?'No change is needed.':'Clarify the inputs before comparing changes.'};
  if(p.evening===null)return {variant:null,checked:0,reason:'Enter the time available the evening before to compare changes.'};
  const allowed=p.preparation.filter(t=>t.mayMove), candidates:Variant[]=[];let checked=0;
  for(let mask=1;mask<2**allowed.length;mask++){
    const moved=allowed.filter((_,i)=>(mask&(1<<i))!==0).map(t=>t.id);const verdict=evaluateChecked(p,moved);checked++;
    if(verdict.status==='feasible')candidates.push({moved,verdict});
  }
  candidates.sort((a,b)=>a.moved.length-b.moved.length || a.verdict.eveningMinutes!-b.verdict.eveningMinutes! || a.moved.join('|').localeCompare(b.moved.join('|')));
  return {variant:candidates[0]??null,checked,reason:candidates.length?'Fewest moved actions, then least evening time, among all allowed evening transfers.':'No allowed evening transfer meets these constraints. Your original requirements stay unchanged.'};
}
export const inputKey=(p:Morning)=>JSON.stringify(p);
export function acceptRepair(p:Morning,moved:string[]):Choice {
  if(!moved.length || evaluateMorning(p,moved).status!=='feasible')throw new Error('This change is no longer feasible. Recheck the current inputs.');
  return {inputKey:inputKey(p),moved:[...moved]};
}
export function currentChoice(p:Morning,choice:Choice|null):string[] {
  return choice?.inputKey===inputKey(p)&&Array.isArray(choice.moved)&&choice.moved.length>0&&evaluateMorning(p,choice.moved).status==='feasible' ? choice.moved : [];
}
export function formatMinute(value:number):string { const day=Math.floor(value/1440),m=value%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}${day?` (+${day} day)`:''}`; }
