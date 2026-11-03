import { addFact } from './engine.ts';
import type { State } from './engine.ts';
import { parseCandidates } from './analysis-contract.ts';
import type { AnalysisResult } from './analysis-contract.ts';
type ReviewedResult = Extract<AnalysisResult, {status:'ok'}>;
// Clock alternatives from one answer must enter the plan atomically. Otherwise
// accepting just the first one temporarily hides an already known conflict.
export function candidateReviewGroup(result: ReviewedResult, index: number): number[] {
  const candidate=result.candidates[index];
  if (!candidate || !['meeting','departure'].includes(candidate.kind)) return [index];
  const peers=result.candidates.map((c,i)=>({c,i})).filter(({c})=>c.kind===candidate.kind);
  return new Set(peers.map(({c})=>JSON.stringify([c.value,c.day]))).size>1 ? peers.map(({i})=>i) : [index];
}
export function acceptCandidate(state: State, result: ReviewedResult, index: number, dateConfirmed: boolean): State {
  if (candidateReviewGroup(result,index).length>1) throw new Error('Review and add all conflicting times together; choosing one must not hide the others.');
  return addReviewedCandidate(state,result,index,dateConfirmed);
}
export function acceptCandidateGroup(state: State, result: ReviewedResult, index: number, confirmedDates: Record<number,boolean>): State {
  const group=candidateReviewGroup(result,index);
  // Immutable accumulation: if any member fails, no partial state is committed.
  return group.reduce((next,i)=>addReviewedCandidate(next,result,i,!!confirmedDates[i]),state);
}
function addReviewedCandidate(state: State, result: ReviewedResult, index: number, dateConfirmed: boolean): State {
  const source = state.sources.find(s => s.id === result.sourceId);
  if (!source || source.text !== result.sourceText || state.sources.some(s => s.supersedes === source.id) || state.day !== result.day) throw new Error('The source or day changed. This result is out of date.');
  const candidate = parseCandidates({candidates:result.candidates,warnings:result.warnings}, source).candidates[index];
  if (!candidate) throw new Error('Fact not found.');
  if (candidate.day !== null && candidate.day !== state.day) throw new Error('This document belongs to another day.');
  if (!dateConfirmed) throw new Error('Confirm the day yourself; the suggested date needs review.');
  if (state.facts.some(f => f.sourceId === source.id && f.event === result.event && f.kind === candidate.kind && f.value === candidate.value && f.quote === candidate.quote)) return state;
  return addFact(state, { id:`meta-${result.requestId}-${index}`, sourceId:source.id, event:result.event, kind:candidate.kind, value:candidate.value, quote:candidate.quote, minutes:candidate.kind === 'dependency' ? 0 : 2,
    provenance: { model:result.model, requestId:result.requestId, extractedAt:result.extractedAt, confirmedDay:state.day } });
}
