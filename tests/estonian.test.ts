import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {locale,translate,uiText,dateLocale} from '../src/i18n.ts';
import et from '../src/locales/et.json' with {type:'json'};
import {parseInput} from '../src/analysis-contract.ts';
import {callMeta} from '../server/meta.ts';
import records from './fixtures/evaluation/holdout-2026-10-29-recorded.json' with {type:'json'};

test('Estonian locale, dates and dynamic plan counters preserve values',()=>{
 assert.equal(locale('?session=qa-cycle-20261029&lang=et'),'et');
 assert.equal(locale('?lang=unsupported'),'en');
 assert.equal(dateLocale('et'),'et-EE');
 assert.equal(uiText('українська','Done','et'),'Tehtud');
 assert.equal(translate('2 of 4 done','et'),'Tehtud 2/4');
 assert.equal(translate('Message history (3)','et'),'Kirjade ajalugu (3)');
 assert.equal(translate('When opened: 3 messages, 1 completion marks.','et'),'Avamisel: 3 kirja ja 1 tehtud töö märget.');
 assert.equal(translate('unrecognized original text','et'),'unrecognized original text');
});

test('Estonian dictionary covers literal text in the full action/revision journey',()=>{
 const dictionary:Record<string,string>=et;
 for(const filename of ['ActionInbox.tsx','EventPlans.tsx','RevisionReview.tsx']){
  const code=readFileSync(new URL('../src/'+filename,import.meta.url),'utf8');
  for(const match of code.matchAll(/(?:say|uiText)\('(?:[^'\\]|\\.)*',\s*'((?:[^'\\]|\\.)*)'/g)){
   const key=match[1].replace(/\\n/g,'\n').replace(/\\'/g,"'");
   assert.ok(dictionary[key]?.trim(),`${filename}: missing Estonian text for ${key}`);
  }
 }
});

test('Estonian output language reaches model instructions without translating evidence',async()=>{
 const result=records.table;
 const input=parseInput({requestId:'et-request',provider:'fireworks',source:{id:'et-source',title:'School',text:result.sourceText,lang:'EN'},event:'Actions',day:'2026-11-02',purpose:'actions',outputLanguage:'et'});
 assert.equal(input.outputLanguage,'et');
 assert.throws(()=>parseInput({...input,outputLanguage:'EST'}));
 let calls=0;
 const actual=await callMeta(input,{key:'test',limit:1,provider:'fireworks'},async(_url,options)=>{
  calls++;const body=JSON.parse(String(options?.body));
  assert.match(body.messages[0].content,/Write value and warnings in Estonian/);
  assert.match(body.messages[0].content,/Copy quote and dateQuote EXACTLY/);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidates:result.candidates,warnings:[]})}}]}));
 });
 assert.equal(calls,1);assert.equal(actual.status,'ok');
 if(actual.status==='ok')assert.deepEqual(actual.candidates.map(c=>[c.quote,c.dateQuote,c.day]),result.candidates.map(c=>[c.quote,c.dateQuote,c.day]));
});
