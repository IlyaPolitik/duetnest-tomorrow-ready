import { validateVoice } from './voice-contract.ts';
import type { VoiceImport } from './voice-contract.ts';
import { validatePhotoChecks } from './bag-contract.ts';
import type { PhotoReceipt } from './bag-contract.ts';
import { validateImport } from './document-contract.ts';
import type { DocumentImport } from './document-contract.ts';
import {validateSourceReview} from './source-review.ts';
import type {SourceReview} from './source-review.ts';
export type FactKind = 'meeting' | 'departure' | 'task' | 'item' | 'dependency';
export type Source = { id: string; title: string; text: string; lang: string; messageDate?: string; import?: DocumentImport; voice?: VoiceImport; supersedes?: string; review?:SourceReview };
export type Fact = { id: string; sourceId: string; event: string; kind: FactKind; value: string; quote: string; minutes: number; provenance?: {model:string; requestId:string; extractedAt:string; confirmedDay:string} };
export type Resolution = { signature: string; factId: string };
export type State = { version: 1; day: string; budget: number; sources: Source[]; facts: Fact[]; resolutions: Record<string, Resolution>; completed: Record<string, boolean>; photoChecks?: Record<string, PhotoReceipt> };
export type Conflict = { key: string; signature: string; facts: Fact[]; resolved: boolean; selected?: string };
export type Task = { id: string; fingerprint: string; label: string; kind: FactKind; minutes: number; facts: Fact[]; done: boolean; blocked: boolean; needsRecheck: boolean };
const kinds: FactKind[] = ['meeting', 'departure', 'task', 'item', 'dependency'];
export const emptyState = (): State => ({ version: 1, day: '2026-10-27', budget: 20, sources: [], facts: [], resolutions: {}, completed: {} });
export function validDate(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === day;
}
export function validateFact(fact: Fact, sources: Source[]): void {
  const source = sources.find(s => s.id === fact.sourceId);
  if (!source || !fact.quote.trim() || !source.text.includes(fact.quote)) throw new Error('The quote must match the source text exactly.');
  if (!fact.id || !fact.event.trim() || !fact.value.trim() || !kinds.includes(fact.kind)) throw new Error('Enter a value, event, and fact type.');
  if (!Number.isInteger(fact.minutes) || fact.minutes < 0 || fact.minutes > 120) throw new Error('Time estimate must be between 0 and 120 minutes.');
  if (['meeting', 'departure'].includes(fact.kind) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(fact.value)) throw new Error('Enter time as HH:MM.');
}
export function addSource(state: State, source: Source, facts: Fact[] = []): State {
  validateSourceReview(source);
  if (!source.id || !source.title.trim() || !source.text.trim() || source.text.length > 20000) throw new Error('A source needs a title and up to 20,000 characters of text.');
  if (source.import !== undefined) validateImport(source.import);
  if (source.voice !== undefined) validateVoice(source.voice);
  if (source.voice && source.import) throw new Error('A source cannot be both audio and a document.');
  if (state.sources.some(s => s.id === source.id)) throw new Error('This source has already been added.');
  if (source.supersedes && (!state.sources.some(s => s.id === source.supersedes) || state.sources.some(s => s.supersedes === source.supersedes))) throw new Error('Only the current source version can be replaced.');
  const sources = [...state.sources, source];
  const seen = new Set(state.facts.map(f => f.id));
  for (const fact of facts) {
    if (fact.sourceId !== source.id || seen.has(fact.id)) throw new Error('Invalid fact-to-source link.');
    validateFact(fact, sources); seen.add(fact.id);
  }
  const next = { ...state, sources, facts: [...state.facts, ...facts] };
  if (!source.supersedes) return next;
  const after = tasks(next), completed = { ...next.completed };
  const meaning = (task: Task) => JSON.stringify(task.facts.map(f => [f.kind, f.value, f.quote, f.minutes]).sort());
  for (const previous of tasks(state).filter(t => t.done)) {
    const same = after.find(t => t.id === previous.id && !t.blocked && meaning(t) === meaning(previous));
    if (same) completed[same.fingerprint] = true;
  }
  return { ...next, completed };
}
export function addFact(state: State, fact: Fact): State {
  validateFact(fact, state.sources);
  if (state.facts.some(f => f.id === fact.id)) throw new Error('This fact has already been added.');
  if (state.sources.some(s => s.supersedes === fact.sourceId)) throw new Error('This source was replaced. Select the current version.');
  const next = { ...state, facts: [...state.facts, fact], sources:state.sources.map(s=>s.id===fact.sourceId && s.review ? {...s,review:undefined}:s) };
  const source = state.sources.find(s => s.id === fact.sourceId)!;
  if (!source.supersedes) return next;
  // The import UI saves a replacement first, then reviews its facts one by one.
  // Reuse completion only for an identical task from the immediately prior version.
  const previous = { ...state, sources: state.sources.filter(s => s.id !== source.id), facts: state.facts.filter(f => f.sourceId !== source.id) };
  const after = tasks(next), completed = { ...next.completed };
  const meaning = (task: Task) => JSON.stringify(task.facts.map(f => [f.kind, f.value, f.quote, f.minutes]).sort());
  for (const old of tasks(previous).filter(t => t.done && t.facts.some(f => f.sourceId === source.supersedes))) {
    const same = after.find(t => t.id === old.id && !t.blocked && meaning(t) === meaning(old));
    if (same && !Object.prototype.hasOwnProperty.call(completed, same.fingerprint)) completed[same.fingerprint] = true;
  }
  return { ...next, completed };
}
export function activeFacts(state: State): Fact[] {
  const replaced = new Set(state.sources.map(s => s.supersedes).filter(Boolean));
  return state.facts.filter(f => !replaced.has(f.sourceId));
}
export function conflicts(state: State): Conflict[] {
  const groups = new Map<string, Fact[]>();
  for (const fact of activeFacts(state).filter(f => ['meeting', 'departure'].includes(f.kind))) {
    const key = `${fact.event}:${fact.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return [...groups.entries()].filter(([, fs]) => new Set(fs.map(f => f.value)).size > 1).map(([key, facts]) => {
    const signature = JSON.stringify(facts.map(f => [f.id, f.value, f.quote]).sort());
    const resolution = state.resolutions[key];
    const resolved = resolution?.signature === signature && facts.some(f => f.id === resolution.factId);
    return { key, signature, facts, resolved, selected: resolved ? resolution.factId : undefined };
  });
}
export function resolveConflict(state: State, key: string, factId: string): State {
  const conflict = conflicts(state).find(c => c.key === key);
  if (!conflict || !conflict.facts.some(f => f.id === factId)) throw new Error('Choose a fact from the current conflict.');
  return { ...state, resolutions: { ...state.resolutions, [key]: { signature: conflict.signature, factId } } };
}
export function tasks(state: State): Task[] {
  const allConflicts = conflicts(state);
  const groups = new Map<string, Fact[]>();
  for (const fact of activeFacts(state)) {
    const clock = ['meeting', 'departure'].includes(fact.kind);
    const key = JSON.stringify([fact.event, fact.kind, clock ? '' : fact.value.trim().toLocaleLowerCase()]);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return [...groups.entries()].map(([id, facts]) => {
    const first = facts[0];
    const conflict = allConflicts.find(c => c.key === `${first.event}:${first.kind}`);
    const chosen = conflict?.selected ? facts.find(f => f.id === conflict.selected)! : first;
    const blocked = Boolean(conflict && !conflict.resolved) || first.kind === 'dependency';
    const fingerprint = JSON.stringify([id, state.day, facts.map(f => [f.id, f.value, f.quote]).sort(), conflict?.selected ?? null]);
    const prior = Object.keys(state.completed).some(k => {
      try { return state.completed[k] && JSON.parse(k)[0] === id && k !== fingerprint; } catch { return false; }
    });
    const label = first.kind === 'meeting' ? `Check meeting time: ${blocked ? 'conflicting times' : chosen.value}`
      : first.kind === 'departure' ? `Plan for departure at ${chosen.value}` : chosen.value;
    return { id, fingerprint, label, kind: first.kind, minutes: Math.max(...facts.map(f => f.minutes)), facts: [chosen, ...facts.filter(f => f !== chosen)], done: !blocked && Boolean(state.completed[fingerprint]), blocked, needsRecheck: prior && !state.completed[fingerprint] };
  });
}
export function toggleTask(state: State, fingerprint: string): State {
  const task = tasks(state).find(t => t.fingerprint === fingerprint);
  if (!task || task.blocked) throw new Error('Resolve the dependency or conflict first.');
  const photoChecks = { ...state.photoChecks }; delete photoChecks[fingerprint];
  return { ...state, photoChecks, completed: { ...state.completed, [fingerprint]: !task.done } };
}
export function parseState(raw: string | null): State {
  if (!raw) return emptyState();
  const s = JSON.parse(raw) as State;
  if (s.version !== 1 || typeof s.day !== 'string' || !validDate(s.day) || !Number.isInteger(s.budget) || s.budget < 1 || s.budget > 120 || !Array.isArray(s.sources) || !Array.isArray(s.facts) || !s.resolutions || typeof s.resolutions !== 'object' || Array.isArray(s.resolutions) || !s.completed || typeof s.completed !== 'object' || Array.isArray(s.completed)) throw new Error('The saved state could not be read.');
  let checked = emptyState();
  for (const source of s.sources) {
    if (typeof source.id !== 'string' || typeof source.title !== 'string' || typeof source.text !== 'string' || typeof source.lang !== 'string') throw new Error('Source data is invalid.');
    checked = addSource(checked, source);
  }
  const ids = new Set<string>();
  for (const fact of s.facts) { validateFact(fact, s.sources); if (ids.has(fact.id)) throw new Error('Duplicate fact.'); ids.add(fact.id); }
  if(s.sources.some(source=>source.review?.status==='cancelled' && s.facts.some(f=>f.sourceId===source.id && f.event===source.review!.event))) throw new Error('A cancelled source cannot contain active facts for that event.');
  if (Object.values(s.completed).some(v => typeof v !== 'boolean') || Object.values(s.resolutions).some(v => !v || typeof v.signature !== 'string' || typeof v.factId !== 'string')) throw new Error('Saved progress is invalid.');
  if (s.photoChecks !== undefined) validatePhotoChecks(s.photoChecks);
  return s;
}
