import { addSource, emptyState } from './engine.ts';
import type { Source, Fact, State } from './engine.ts';
export const school: Source = { id: 'school-v1', title: 'Письмо из школы', lang: 'PL', text: 'Wycieczka szkolna — 27.10.2026\nZbiórka o 07:55 przy wejściu do szkoły. Autobus odjeżdża o 08:10.\nProsimy podpisać zgodę dziś wieczorem. Dziecko powinno zabrać wodę i kurtkę przeciwdeszczową.' };
const make = (id: string, kind: Fact['kind'], value: string, quote: string, minutes = 2, sourceId = school.id): Fact => ({ id, sourceId, event: 'Школьная поездка', kind, value, quote, minutes });
export const schoolFacts: Fact[] = [
  make('arrival-v1', 'meeting', '07:55', 'Zbiórka o 07:55 przy wejściu do szkoły.'),
  make('departure-v1', 'departure', '08:10', 'Autobus odjeżdża o 08:10.', 1),
  make('consent-v1', 'task', 'Подписать разрешение на поездку', 'Prosimy podpisać zgodę dziś wieczorem.', 5),
  make('water-v1', 'item', 'Положить воду', 'Dziecko powinno zabrać wodę i kurtkę przeciwdeszczową.'),
  make('coat-v1', 'item', 'Подготовить непромокаемую куртку', 'Dziecko powinno zabrać wodę i kurtkę przeciwdeszczową.', 3),
];
export function demoState(): State {
  let s = addSource(emptyState(), school, schoolFacts);
  s = addSource(s, { id: 'calendar', title: 'Моя запись в календаре', lang: 'RU', text: '27 октября: сбор на школьную поездку в 08:30.' }, [make('calendar-arrival', 'meeting', '08:30', 'сбор на школьную поездку в 08:30', 2, 'calendar')]);
  return addSource(s, { id: 'note', title: 'Моя заметка', lang: 'UK', text: 'Я працюю з дев’ятої. Ще не знаю, хто забере дитину після поїздки.' }, [make('pickup', 'dependency', 'Уточнить, кто забирает ребёнка после поездки', 'Ще не знаю, хто забере дитину після поїздки.', 0, 'note')]);
}
export function applyDemoUpdate(state: State): State {
  const source: Source = { ...school, id: 'school-v2', title: 'Школа: уточнение времени', supersedes: school.id, text: school.text.replace('07:55', '07:40').replace('08:10', '07:55') };
  // Each revision has distinct fact IDs; the engine preserves unchanged task completions.
  const facts = schoolFacts.map(f => ({ ...f, id: `${f.id}-update`, sourceId: source.id,
    value: f.kind === 'meeting' ? '07:40' : f.kind === 'departure' ? '07:55' : f.value,
    quote: f.quote.replace('07:55', '07:40').replace('08:10', '07:55') }));
  return addSource(state, source, facts);
}
