import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCandidates} from '../src/analysis-contract.ts';
const source={id:'new-date',title:'Fictional notice',lang:'EN',text:'Notice issued 28 October 2026. Trip on 3 November 2026. Meet at 07:50.'};
const candidate={kind:'meeting',value:'07:50',quote:'Meet at 07:50.',day:'2026-11-03',dateQuote:'3 November 2026'};
test('a real quote cannot support a different invented calendar date',()=>{
 assert.throws(()=>parseCandidates({candidates:[{...candidate,day:'2027-12-31'}],warnings:[]},source));
});
test('ambiguous numeric date is not silently resolved to the planning day',()=>{
 assert.throws(()=>parseCandidates({candidates:[{...candidate,day:'2026-04-03',dateQuote:'03/04/2026'}],warnings:[]},{...source,text:'Trip 03/04/2026. Meet at 07:50.'}));
});
test('date quote with no year cannot establish a full calendar date',()=>{
 assert.throws(()=>parseCandidates({candidates:[{...candidate,dateQuote:'3 November'}],warnings:[]},source));
});
import {dateEvidenceMatches,explicitDates} from '../src/date-evidence.ts';
for(const [quote,day] of [['3 November 2026','2026-11-03'],['November 3, 2026','2026-11-03'],['3 listopada 2026','2026-11-03'],['3 листопада 2026 року','2026-11-03'],['3 ноября 2026','2026-11-03'],['2026-11-03','2026-11-03'],['27.10.2026','2026-10-27']] as const)test(`calendar evidence: ${quote}`,()=>assert.equal(dateEvidenceMatches(day,quote),true));
test('invalid, partial and multiple calendar dates stay unresolved',()=>{
 assert.deepEqual(explicitDates('31 February 2026'),[]);
 assert.equal(dateEvidenceMatches('2026-11-03','3 November'),false);
 assert.equal(dateEvidenceMatches('2026-11-03','3 November 2026; 4 November 2026'),false);
 assert.equal(dateEvidenceMatches('2026-04-03','03/04/2026'),false);
});
