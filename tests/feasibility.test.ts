import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {acceptRepair,currentChoice,evaluateMorning,findRepair,issues} from '../src/feasibility.ts';
import type {Morning} from '../src/feasibility.ts';
import {changeInputs,newRehearsal,REHEARSAL_KEY,restoreRehearsal} from '../src/rehearsal-state.ts';
const cases=JSON.parse(readFileSync(new URL('./fixtures/feasibility/development.json',import.meta.url),'utf8'));
for(const c of cases)test(`development: ${c.name}`,()=>{
 const base=newRehearsal().input;
 if(c.allow)base.preparation[0].mayMove=true;
 const input={...base,...c.patch} as Morning;
 const before=JSON.stringify(input),result=evaluateMorning(input),repair=findRepair(input);
 assert.equal(result.status,c.status);
 if(c.arrival)assert.deepEqual([result.arrival?.min,result.arrival?.max],c.arrival);
 assert.deepEqual(repair.variant?.moved??null,c.repair);
 if(repair.variant){assert.equal(repair.variant.verdict.status,'feasible');assert.ok(repair.variant.verdict.slack!.min>=input.buffer!);assert.ok(repair.variant.verdict.eveningMinutes!<=input.evening!);}
 assert.equal(JSON.stringify(input),before,'evaluation must not mutate the user inputs');
});
test('choice persists separately and any changed source parameters invalidate it',()=>{
 const original=newRehearsal(),input={...original.input,meeting:465};input.preparation[0].mayMove=true;
 const choice=acceptRepair(input,['bag']);
 const restored=restoreRehearsal(JSON.stringify({...original,input,choice}));
 assert.deepEqual(currentChoice(restored.input,restored.choice),['bag']);
 const changed={...input,travel:{min:40,max:45}};
 assert.deepEqual(currentChoice(changed,choice),[]);
 assert.equal(changeInputs(restored,changed).choice,null);
 assert.throws(()=>acceptRepair(changed,['bag']));
 assert.equal(restoreRehearsal(JSON.stringify({...restored,input:changed})).choice,null);
 assert.notEqual(REHEARSAL_KEY,'duetnest-meta-hackathon:readiness:v1');
});
test('restoration rejects corrupt, cyclic, oversized and missing prerequisite scenarios',()=>{
 const x=newRehearsal();
 assert.throws(()=>restoreRehearsal('{'));
 assert.throws(()=>restoreRehearsal(JSON.stringify({...x,input:null})));
 const p=x.input;
 assert.ok(issues({...p,preparation:[...p.preparation,...p.preparation]}).length);
 assert.ok(issues({...p,preparation:Array.from({length:13},(_,i)=>({...p.preparation[0],id:`t${i}`}))}).length);
 assert.ok(issues({...p,preparation:[{...p.preparation[0],after:['missing']}]}).length);
 assert.ok(issues({...p,preparation:[{...p.preparation[0],after:['bag']}]}).length);
 assert.ok(issues({...p,day:'2026-02-30'}).length);
 assert.ok(issues({...p,ready:150}).length,'exclude DST transition hours from this bounded morning model');
});
test('repairs never duplicate actions or bypass permissions, capacity or dependencies',()=>{
 const p=newRehearsal().input;
 assert.equal(evaluateMorning(p,['bag']).status,'invalid');
 p.preparation[0].mayMove=true;
 assert.equal(evaluateMorning(p,['bag','bag']).status,'invalid');
 assert.equal(evaluateMorning(p,['missing']).status,'invalid');
 assert.equal(evaluateMorning({...p,evening:null},['bag']).status,'unknown');
 assert.equal(evaluateMorning({...p,evening:14},['bag']).status,'infeasible');
});
test('bounded exhaustive search favours fewer moves then less evening work',()=>{
 const p=newRehearsal().input;p.meeting=490;p.evening=25;
 p.preparation=[{id:'a',label:'A',duration:{min:15,max:15},after:[],mayMove:true},{id:'b',label:'B',duration:{min:10,max:10},after:[],mayMove:true},{id:'c',label:'C',duration:{min:5,max:5},after:[],mayMove:true}];
 // Arrival 08:10, buffer 5: moving C alone is sufficient and cheapest.
 assert.deepEqual(findRepair(p).variant?.moved,['c']);
 assert.equal(findRepair(p).checked,7);
});
test('wider travel estimates never improve worst-case slack and missing durations stay unknown',()=>{
 const p=newRehearsal().input;
 for(let max=25;max<=60;max+=5)assert.ok(evaluateMorning({...p,travel:{min:20,max}}).slack!.min<=evaluateMorning(p).slack!.min);
 assert.equal(evaluateMorning({...p,preparation:[{...p.preparation[0],duration:null}]}).status,'unknown');
});
