import { activeFacts, conflicts, validateFact, validDate } from './engine.ts';
import type { Fact, Source, State } from './engine.ts';
import type { Plans } from './plans.ts';
import type { Morning } from './feasibility.ts';

export type MeetingBinding = {
  day: string; event: string; factId: string; sourceId: string;
  title: string; quote: string; value: string; fingerprint: string;
  status: 'confirmed' | 'review'; reason?: string;
  previous?: { title: string; value: string; quote: string };
};
export type MeetingOption = { fact: Fact; source: Source; fingerprint: string; problem: string };
export const minuteOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export function meetingOptions(plans: Plans | null, day: string, event: string): MeetingOption[] {
  const state = plans?.days[day];
  if (!state) return [];
  const peers = activeFacts(state).filter(f => f.kind === 'meeting' && f.event === event);
  const conflict = conflicts(state).find(c => c.facts[0].kind === 'meeting' && c.facts[0].event === event);
  return peers.map(fact => {
    const source = state.sources.find(s => s.id === fact.sourceId)!;
    let problem = '';
    try { validateFact(fact, state.sources); } catch { problem = 'This fact no longer matches its source.'; }
    const times = [...fact.quote.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
    if (!times.includes(fact.value)) problem = 'The selected time is not present in this exact quote. Review the fact in Documents & sources.';
    if (minuteOf(fact.value) < 240 || minuteOf(fact.value) > 720) problem = 'This calculator supports meeting times from 04:00 to 12:00.';
    if (conflict && (!conflict.resolved || conflict.selected !== fact.id)) problem = 'There are different meeting times. Review and choose the current time in Documents & sources first.';
    // Binding changes when this source, fact or same-event meeting evidence changes.
    // Unrelated task completions and other events do not invalidate the calculation.
    const fingerprint = JSON.stringify([state.day, source, fact, peers.map(f => [f.id, f.sourceId, f.value, f.quote]).sort((a,b) => a[0].localeCompare(b[0])), conflict ? [conflict.signature, conflict.selected] : null]);
    return { fact, source, fingerprint, problem };
  });
}

export function meetingEvents(state: State | undefined): string[] {
  return state ? [...new Set(activeFacts(state).filter(f => f.kind === 'meeting').map(f => f.event))] : [];
}

export function confirmMeeting(plans: Plans | null, day: string, event: string, factId: string, expectedFingerprint: string, reviewed: boolean, previous?: MeetingBinding): MeetingBinding {
  if (!reviewed) throw new Error('Confirm the day, event and exact quote before using this time.');
  const option = meetingOptions(plans, day, event).find(o => o.fact.id === factId);
  if (!option || option.fingerprint !== expectedFingerprint) throw new Error('The document changed while you were reviewing it. Select the current fact and review it again.');
  if (option.problem) throw new Error(option.problem);
  return { day, event, factId, sourceId: option.source.id, title: option.source.title, quote: option.fact.quote, value: option.fact.value, fingerprint: option.fingerprint, status: 'confirmed',
    ...(previous && previous.fingerprint !== option.fingerprint ? { previous: { title: previous.title, value: previous.value, quote: previous.quote } } : {}) };
}

export function bindingProblem(binding: MeetingBinding, input: Morning, plans: Plans | null): string {
  if (binding.status === 'review') return binding.reason || 'Review the document time again.';
  if (binding.day !== input.day) return 'The calculation day changed. Confirm a meeting for this day.';
  if (!plans) return 'Saved documents could not be read. The previous meeting time is not trusted.';
  const state = plans.days[binding.day];
  if (!state) return 'The linked day is no longer available.';
  if (state.sources.some(s => s.supersedes === binding.sourceId)) return 'A new document version replaced the linked source. Review its meeting time.';
  const option = meetingOptions(plans, binding.day, binding.event).find(o => o.fact.id === binding.factId);
  if (!option) return 'The linked meeting fact is no longer available.';
  if (option.problem) return option.problem;
  if (option.fingerprint !== binding.fingerprint) return 'The source, quote or meeting evidence changed. Confirm the current time again.';
  if (input.meeting !== minuteOf(binding.value)) return 'The meeting parameter changed. Confirm its source again.';
  return '';
}

export function validBinding(value: unknown): value is MeetingBinding {
  if (!value || typeof value !== 'object') return false;
  const b = value as MeetingBinding;
  const text = (x: unknown, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
  return validDate(b.day) && text(b.event, 200) && text(b.factId, 200) && text(b.sourceId, 200) && text(b.title, 500) && text(b.quote, 20000)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.value) && text(b.fingerprint, 500000)
    && ['confirmed', 'review'].includes(b.status) && (b.reason === undefined || text(b.reason, 1000))
    && (b.previous === undefined || (text(b.previous?.title, 500) && text(b.previous?.quote, 20000) && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.previous?.value)));
}
