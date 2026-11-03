import {storageKey,browserSearch} from './storage-scope.ts';
import { currentChoice, issues } from './feasibility.ts';
import type { Choice, Morning } from './feasibility.ts';
import { bindingProblem, minuteOf, validBinding } from './meeting-binding.ts';
import type { MeetingBinding } from './meeting-binding.ts';
import type { Plans } from './plans.ts';
import {reconcileRequirements,validRequirements} from './requirements.ts';
import type {RequirementBinding} from './requirements.ts';
export const REHEARSAL_KEY=storageKey('duetnest-meta-hackathon:rehearsal:v1',browserSearch());
export type Rehearsal={version:1;input:Morning;choice:Choice|null;binding?:MeetingBinding;requirements?:RequirementBinding[]};
export function newRehearsal():Rehearsal{return {version:1,input:{day:'2026-10-28',zone:'Europe/Warsaw',ready:435,meeting:480,travel:{min:20,max:25},buffer:5,evening:15,preparation:[{id:'bag',label:'Pack the school bag',duration:{min:15,max:15},after:[],mayMove:false}]},choice:null};}
export function restoreRehearsal(raw:string|null):Rehearsal {
  if(!raw)return newRehearsal();const value=JSON.parse(raw);
  if(value?.version!==1||issues(value.input).length)throw new Error('Saved scenario is unreadable. It has not been overwritten.');
  if(value.choice!==null&&(!value.choice||typeof value.choice.inputKey!=='string'||!Array.isArray(value.choice.moved)||value.choice.moved.some((id:unknown)=>typeof id!=='string')))throw new Error('Saved change is unreadable. It has not been overwritten.');
  if(value.binding!==undefined&&!validBinding(value.binding))throw new Error('Saved document link is unreadable. It has not been overwritten.');
  if(value.requirements!==undefined&&!validRequirements(value.requirements))throw new Error('Saved requirement links are unreadable. They have not been overwritten.');
  return {version:1,input:value.input,choice:currentChoice(value.input,value.choice).length?value.choice:null,...(value.binding?{binding:value.binding}:{}),...(value.requirements?{requirements:value.requirements}:{})};
}
export function changeInputs(state:Rehearsal,input:Morning):Rehearsal {
  const errors=issues(input);if(errors.length)throw new Error(errors.join(' '));
  const next:Rehearsal={...state,input,choice:null};
  if(state.binding&&(input.day!==state.input.day||input.meeting!==state.input.meeting))return {...next,input:{...input,meeting:null},binding:{...state.binding,status:'review',reason:'The calculation day or meeting parameter changed. Confirm the current document time.'}};
  return next;
}
export function reconcileMeeting(state:Rehearsal,plans:Plans|null):Rehearsal {
  return reconcileRequirements(reconcileMeetingEvidence(state,plans),plans);
}
function reconcileMeetingEvidence(state:Rehearsal,plans:Plans|null):Rehearsal {
  if(!state.binding)return state;
  const reason=bindingProblem(state.binding,state.input,plans);
  if(!reason)return state;
  if(state.binding.status==='review'&&state.input.meeting===null&&state.choice===null)return state;
  return {...state,input:{...state.input,meeting:null},choice:null,binding:{...state.binding,status:'review',reason}};
}
export function useMeeting(state:Rehearsal,binding:MeetingBinding):Rehearsal {
  if(binding.day!==state.input.day||binding.status!=='confirmed')throw new Error('Choose a confirmed meeting for the calculation day.');
  const input={...state.input,meeting:minuteOf(binding.value)};
  const errors=issues(input);if(errors.length)throw new Error(errors.join(' '));
  return {...state,input,binding,choice:null};
}
