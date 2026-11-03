import { parseInput } from '../src/analysis-contract.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentKind, checkedText, combinePages, validateImport, DOCUMENT_LIMITS, checkOcrQuality } from '../src/document-contract.ts';
import { addFact, addSource, emptyState, parseState } from '../src/engine.ts';
import type { DocumentImport } from '../src/document-contract.ts';
const imported: DocumentImport = {filename:'school.pdf',sha256:'a'.repeat(64),language:'PL',reviewed:true,pages:[{number:1,method:'ocr',text:'Zbiórka o 07:55.',confidence:90}]};
test('observed fragmented low-confidence OCR is rejected instead of becoming a successful import',()=>{
 assert.throws(()=>checkOcrQuality('A uda 2026.\nada\nZAJ od',54,1),/Nothing was imported/);
 assert.throws(()=>checkOcrQuality('text',NaN,1));
 assert.doesNotThrow(()=>checkOcrQuality('Meet at 08:50.',95,1));
 assert.doesNotThrow(()=>checkOcrQuality('',0,2),'empty page still uses existing blank-page handling');
});

test('document limits reject unsupported, empty and oversized input without truncation', () => {
  assert.equal(documentKind('school.PDF',15),'pdf');
  assert.equal(documentKind('school.jpeg',15),'image');
  assert.equal(documentKind('school.md',15),'text');
  for (const [name,size] of [['a.heic',20],['a.pdf',0],['a.jpg',DOCUMENT_LIMITS.bytes+1],['a.txt',80001]] as const) assert.throws(() => documentKind(name,size));
  for (const text of ['', '   ', 'x'.repeat(20001), 'bad\0text']) assert.throws(() => checkedText(text));
  assert.equal(combinePages(imported.pages),'— Page 1 —\nZbiórka o 07:55.');
});
test('page provenance survives save/reload and manual facts still require exact reviewed text', () => {
  let state = addSource(emptyState(),{id:'ocr1',title:'School',text:'Сбор в 07:55.',lang:'PL',import:imported});
  state = parseState(JSON.stringify(state));
  assert.deepEqual(state.sources[0].import,imported);
  const fact = {id:'time',sourceId:'ocr1',event:'Trip',kind:'meeting' as const,value:'07:55',quote:'Сбор в 07:55.',minutes:2};
  assert.equal(addFact(state,fact).facts.length,1);
  assert.throws(() => addFact(state,{...fact,quote:'Zbiórka o 07:55.'}));
  assert.equal(state.sources[0].import?.pages[0].text,'Zbiórka o 07:55.');
});
test('unreviewed or corrupt provenance cannot enter or restore a plan', () => {
  const variants = [{...imported,reviewed:false},{...imported,sha256:'bad'},{...imported,pages:[]},{...imported,pages:[{...imported.pages[0],number:2}]},{...imported,pages:[{...imported.pages[0],confidence:101}]},{...imported,pages:[{...imported.pages[0],text:'x'.repeat(20001)}]}];
  for (const value of variants) {
    assert.throws(() => validateImport(value as DocumentImport));
    assert.throws(() => parseState(JSON.stringify({...emptyState(),sources:[{id:'ocr',title:'School',text:'text',lang:'PL',import:value}]})));
  }
});

test('Meta request strips OCR provenance and sends only the reviewed source text', () => {
  const source = {id:'ocr1',title:'School',text:'Reviewed text',lang:'PL',import:imported};
  const request = parseInput({requestId:'test-import',source,event:'Trip',day:'2026-10-28'});
  assert.equal('import' in request.source,false);
  assert.equal(request.source.text,'Reviewed text');
});
