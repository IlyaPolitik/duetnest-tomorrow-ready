import test from 'node:test';
import assert from 'node:assert/strict';
import {callMeta} from '../server/meta.ts';
import {parseInput} from '../src/analysis-contract.ts';
const input=parseInput({"provider": "fireworks", "purpose": "actions", "outputLanguage": "uk", "requestId": "b31904c0-8661-4e42-a9a9-116978b512bb", "event": "One school museum trip", "day": "2026-11-02", "source": {"id": "chat-first", "title": "Музей · переписка", "text": "[18:10] Вчителька: Привіт! Завтра йдемо до музею. Зустрічаємось біля школи о 08:20. Візьміть воду та дощовик.\n[18:12] Мама: А іграшку можна?\n[18:13] Тато: Я вже поклав воду своїй дитині.\n[18:14] Вчителька: Іграшки не потрібні. Форму згоди поверніть сьогодні до 20:00.", "lang": "UK", "messageDate": "2026-12-15"}});
test('Fireworks extraction explicitly requests low reasoning without weakening evidence checks or retrying',async()=>{
 let calls=0;
 const r=await callMeta(input,{provider:'fireworks',key:'test',limit:1},async(_url,options)=>{
  calls++;const body=JSON.parse(String(options?.body));
  assert.equal(body.reasoning_effort,'low');assert.equal(body.max_tokens,4096);assert.equal(body.stream,false);
  assert.match(body.messages[0].content,/Copy quote and dateQuote EXACTLY/);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidates:[{kind:'meeting',value:'08:05',quote:'invented quote',day:null,dateQuote:null}],warnings:[]})}}]}));
 });assert.equal(calls,1);assert.equal(r.status,'error');if(r.status==='error')assert.equal(r.code,'invalid_response');
});
