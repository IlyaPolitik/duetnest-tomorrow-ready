import test from 'node:test';
import assert from 'node:assert/strict';
import { addFact, addSource, conflicts, emptyState, parseState, resolveConflict, tasks, toggleTask, validDate } from '../src/engine.ts';
import { applyDemoUpdate, demoState, school, schoolFacts } from '../src/fixtures.ts';
import { callMeta } from '../server/meta.ts';

test('one user gets independent actions while time and pickup remain unresolved', () => {
  const state = demoState(), list = tasks(state);
  assert.equal(conflicts(state).length, 1);
  assert.equal(list.length, 6);
  assert.equal(list.filter(t => t.blocked).length, 2);
  const water = list.find(t => t.label === 'Положить воду')!;
  assert.equal(tasks(toggleTask(state, water.fingerprint)).find(t => t.id === water.id)?.done, true);
  assert.throws(() => toggleTask(state, list.find(t => t.kind === 'dependency')!.fingerprint));
  assert.throws(() => toggleTask(state, list.find(t => t.kind === 'meeting')!.fingerprint));
});
test('a time choice applies only to current conflicting evidence', () => {
  let state = demoState();
  const c = conflicts(state)[0];
  assert.throws(() => resolveConflict(state, c.key, 'unrelated'));
  state = resolveConflict(state, c.key, 'arrival-v1');
  assert.equal(conflicts(state)[0].resolved, true);
  assert.match(tasks(state).find(t => t.kind === 'meeting')!.label, /07:55/);
  state = toggleTask(state, tasks(state).find(t => t.kind === 'meeting')!.fingerprint);
  state = applyDemoUpdate(state);
  assert.equal(conflicts(state)[0].resolved, false);
  const meeting = tasks(state).find(t => t.kind === 'meeting')!;
  assert.equal(meeting.done, false);
  assert.equal(meeting.needsRecheck, true);
  assert.equal(meeting.blocked, true);
  assert.throws(() => resolveConflict(state, c.key, 'arrival-v1'));
  state = resolveConflict(state, c.key, 'arrival-v1-update');
  assert.equal(tasks(state).find(t => t.kind === 'meeting')!.facts[0].sourceId, 'school-v2');
});
test('revision preserves unchanged completions and reopens changed departure', () => {
  let state = demoState();
  for (const t of tasks(state).filter(t => !t.blocked)) state = toggleTask(state, t.fingerprint);
  state = applyDemoUpdate(state);
  const list = tasks(state);
  assert.equal(list.filter(t => t.done).length, 3);
  assert.equal(list.find(t => t.kind === 'departure')!.done, false);
  assert.equal(list.find(t => t.kind === 'departure')!.needsRecheck, true);
  assert.equal(state.sources.length, 4);
  assert.ok(state.facts.some(f => f.sourceId === 'school-v1'));
  assert.equal(list.some(t => t.facts.some(f => f.sourceId === 'school-v1')), false);
  assert.throws(() => applyDemoUpdate(state));
});
test('source evidence, exact quote, time and IDs are enforced', () => {
  const state = addSource(emptyState(), school);
  const fact = schoolFacts[0];
  assert.throws(() => addFact(state, { ...fact, quote: 'Invented quote' }));
  assert.throws(() => addFact(state, { ...fact, sourceId: 'missing' }));
  assert.throws(() => addFact(state, { ...fact, value: '25:72' }));
  assert.throws(() => addFact(state, { ...fact, minutes: -1 }));
  assert.throws(() => addSource(state, school));
  assert.throws(() => addFact(addFact(state, fact), fact));
  assert.throws(() => addFact(applyDemoUpdate(demoState()), { ...fact, id: 'new-old-fact' }));
});
test('independent events do not conflict or merge their preparation', () => {
  let state = addSource(emptyState(), school, schoolFacts);
  state = addSource(state, { id: 'other', title: 'Another event', text: 'Meet at 10:00', lang: 'EN' }, [{ ...schoolFacts[0], id: 'other-time', sourceId: 'other', event: 'Other event', value: '10:00', quote: 'Meet at 10:00' }]);
  assert.equal(conflicts(state).length, 0);
  assert.equal(tasks(state).filter(t => t.kind === 'meeting').length, 2);
});
test('local restore preserves completion and rejects corrupt or duplicate data', () => {
  let state = demoState();
  state = toggleTask(state, tasks(state).find(t => t.kind === 'item')!.fingerprint);
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  assert.deepEqual(parseState(null), emptyState());
  for (const broken of ['{', '{}', JSON.stringify({ ...state, day: '2026-02-30' }), JSON.stringify({ ...state, completed: { a: 'yes' } }), JSON.stringify({ ...state, facts: [...state.facts, state.facts[0]] })]) assert.throws(() => parseState(broken));
});
test('completion is bound to day and invalid dates are refused', () => {
  let state = demoState();
  state = toggleTask(state, tasks(state).find(t => t.kind === 'item')!.fingerprint);
  assert.equal(tasks({ ...state, day: '2026-10-28' }).some(t => t.done), false);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('tomorrow'), false);
});
test('unconnected Meta reports unavailable instead of inventing analysis', async () => {
  const result = await callMeta({requestId:'missing-key',source:school,event:'School',day:'2026-10-27'}, {key:'',limit:10});
  assert.equal(result.status, 'unavailable');
  assert.equal('facts' in result, false);
});
