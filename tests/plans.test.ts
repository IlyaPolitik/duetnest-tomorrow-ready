import test from 'node:test';
import assert from 'node:assert/strict';
import { addSource, tasks, toggleTask } from '../src/engine.ts';
import { demoState } from '../src/fixtures.ts';
import { initialPlans, parsePlans, savePlan, selectDay } from '../src/plans.ts';

test('switching days and reloading preserves independent evidence and completion', () => {
  let original = demoState();
  original = toggleTask(original, tasks(original).find(t => t.kind === 'item')!.fingerprint);
  let plans = selectDay(initialPlans(original), '2026-10-28');
  assert.deepEqual(plans.days['2026-10-28'].facts, []);
  assert.deepEqual(plans.days['2026-10-28'].completed, {});
  const next = addSource(plans.days['2026-10-28'], {id:'next',title:'Next day',text:'28 October. Bring water.',lang:'EN'});
  plans = savePlan(plans, next);
  plans = selectDay(parsePlans(JSON.stringify(plans)), original.day);
  assert.deepEqual(plans.days[plans.activeDay], original);
  plans = selectDay(plans, '2026-10-28');
  assert.deepEqual(plans.days[plans.activeDay], next);
  assert.throws(() => savePlan(plans, original));
});
test('legacy plans migrate without resetting their progress', () => {
  const state = demoState();
  assert.deepEqual(parsePlans(JSON.stringify(state)), initialPlans(state));
  assert.deepEqual(parsePlans(null), initialPlans());
});
test('invalid days, mismatched dates and corrupt archived plans are rejected', () => {
  const plans = initialPlans(demoState());
  assert.throws(() => selectDay(plans, '2026-02-30'));
  for (const bad of [null, {}, {...plans,activeDay:'2026-10-28'}, {...plans,days:{'2026-10-28':demoState()}}, {...plans,days:{...plans.days,'2026-10-28':{}}}]) {
    assert.throws(() => parsePlans(JSON.stringify(bad)));
  }
});
