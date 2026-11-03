import { emptyState, parseState, validDate } from './engine.ts';
import type { State } from './engine.ts';

export type Plans = { version: 2; activeDay: string; days: Record<string, State> };
export function initialPlans(state: State = emptyState()): Plans {
  return { version: 2, activeDay: state.day, days: { [state.day]: state } };
}
export function selectDay(plans: Plans, day: string): Plans {
  if (!validDate(day)) throw new Error('Choose a valid date.');
  return { ...plans, activeDay: day, days: { ...plans.days, [day]: plans.days[day] ?? { ...emptyState(), day } } };
}
export function savePlan(plans: Plans, state: State): Plans {
  if (state.day !== plans.activeDay) throw new Error('The day changed. Open the correct plan before saving.');
  return { ...plans, days: { ...plans.days, [state.day]: state } };
}
export function parsePlans(raw: string | null): Plans {
  if (!raw) return initialPlans();
  const data = JSON.parse(raw);
  // Preserve the original single-day plan, including its sources and progress.
  if (data?.version === 1) return initialPlans(parseState(raw));
  if (data?.version !== 2 || !validDate(data.activeDay ?? '') || !data.days || typeof data.days !== 'object' || Array.isArray(data.days)) throw new Error('The saved plans could not be read.');
  const days: Record<string, State> = {};
  for (const [day, value] of Object.entries(data.days)) {
    if (!validDate(day)) throw new Error('Saved plan date is invalid.');
    const state = parseState(JSON.stringify(value));
    if (state.day !== day) throw new Error('The plan date does not match its saved day.');
    days[day] = state;
  }
  if (!days[data.activeDay]) throw new Error('The selected plan is missing.');
  return { version: 2, activeDay: data.activeDay, days };
}
