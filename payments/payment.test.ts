import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Ledger} from './ledger.ts';
import {PayPal,receipt,approval,SANDBOX,ORIGIN} from './paypal.ts';
import {requirement,SAMPLE,CANCEL_SAMPLE,label} from './contract.ts';
import type {Payment} from './contract.ts';
const req={event:'Museum trip · 18 November',source:SAMPLE,quote:'Please pay EUR 12.50 by 2026-11-12.',amount:'12.50',currency:'EUR',due:'2026-11-12',dueQuote:'Please pay EUR 12.50 by 2026-11-12.'};
const config={clientId:'fictional-client',secret:'fictional-secret',merchantId:'TESTMERCHANT01'};
function order(p:Payment,status='APPROVED'){return {id:'TESTORDER1234567',status,purchase_units:[{custom_id:p.id,payee:{merchant_id:p.merchantId},amount:{currency_code:p.currency,value:p.amount},...(status==='COMPLETED'?{payments:{captures:[{id:'TESTCAPTURE12345',status:'COMPLETED',amount:{currency_code:p.currency,value:p.amount},create_time:'2026-11-04T15:00:00Z'}]}}:{})}],links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER1234567'}]};}
function setup(t: any){const dir=mkdtempSync(join(tmpdir(),'tomorrow-paypal-'));t.after(()=>rmSync(dir,{recursive:true}));const pp=new PayPal({...config});let calls={create:0,capture:0,get:0};pp.token=async()=> 'test-token';pp.create=async p=>{calls.create++;return order(p,'CREATED');};pp.get=async p=>{calls.get++;return order(p);};pp.capture=async p=>{calls.capture++;return order(p,'COMPLETED');};const path=join(dir,'ledger.json');const ledger=new Ledger(path,pp);return {pp,ledger,path,calls};}
test('source evidence rejects ambiguous/missing/invented amount and invalid date',()=>{
 assert.equal(requirement(req).amount,'12.50');
 for(const patch of [{amount:'13.50'},{currency:'USD'},{quote:'Pay EUR 12.50'},{due:'2026-11-13'},{due:'2026-02-30',source:'EUR 12.50 by 2026-02-30',quote:'EUR 12.50',dueQuote:'2026-02-30'},{source:'EUR 12.50 or EUR 15.00 by 2026-11-12',quote:'EUR 12.50 or EUR 15.00'}])assert.throws(()=>requirement({...req,...patch}));
});
test('review consent and same-event deduplication block duplicate obligations',t=>{
 const {ledger}=setup(t);assert.throws(()=>ledger.add(req,false));const p=ledger.add(req,true);assert.equal(ledger.add(req,true).id,p.id);assert.throws(()=>ledger.add({...req,source:SAMPLE+' Updated.'},true));assert.equal(ledger.payments.length,1);
});
test('approval, capture, repeat clicks and restart retain one verified receipt',async t=>{
 const {ledger,path,pp,calls}=setup(t),p=ledger.add(req,true);await ledger.create(p.id);await ledger.create(p.id);assert.equal(calls.create,1);await Promise.all([ledger.run(()=>ledger.capture(p.id)),ledger.run(()=>ledger.capture(p.id))]);assert.equal(calls.capture,1);assert.equal(p.state,'paid');assert.equal(p.captureId,'TESTCAPTURE12345');assert.equal(new Ledger(path,pp).find(p.id).captureId,p.captureId);
});
test('capture is not sent before PayPal reports approval',async t=>{
 const {ledger,pp,calls}=setup(t),p=ledger.add(req,true);await ledger.create(p.id);pp.get=async p=>order(p,'CREATED');await assert.rejects(ledger.capture(p.id),/Approve/);assert.equal(calls.capture,0);assert.equal(p.state,'created');
});
test('a completed order is reconciled without another capture',async t=>{
 const {ledger,pp,calls}=setup(t),p=ledger.add(req,true);await ledger.create(p.id);pp.get=async p=>order(p,'COMPLETED');await ledger.capture(p.id);assert.equal(p.state,'paid');assert.equal(calls.capture,0);
});
test('unknown create outcome blocks resending after restart',async t=>{
 const {ledger,pp,path,calls}=setup(t),p=ledger.add(req,true);pp.create=async()=>{calls.create++;throw Error('timeout');};await assert.rejects(ledger.create(p.id),/not verified/);const restored=new Ledger(path,pp);await assert.rejects(restored.create(p.id),/existing payment/);await assert.rejects(restored.reconcile(p.id),/No order ID/);assert.equal(calls.create,1);assert.equal(restored.find(p.id).state,'unknown');
});
test('unknown capture is resolved by GET, never blind retry',async t=>{
 const {ledger,pp,path,calls}=setup(t),p=ledger.add(req,true);await ledger.create(p.id);pp.capture=async()=>{calls.capture++;throw Error('timeout');};await assert.rejects(ledger.capture(p.id),/not verified/);const restored=new Ledger(path,pp);await assert.rejects(restored.capture(p.id),/status first/);pp.get=async p=>order(p,'COMPLETED');await restored.reconcile(p.id);assert.equal(calls.capture,1);assert.equal(restored.find(p.id).state,'paid');
});
test('wrong amount, merchant, reference, pending capture never produces paid state',t=>{
 const {ledger}=setup(t),p=ledger.add(req,true);
 for(const mutate of [(o:any)=>o.purchase_units[0].amount.value='13.00',(o:any)=>o.purchase_units[0].payee.merchant_id='OTHER',(o:any)=>o.purchase_units[0].custom_id='OTHER',(o:any)=>o.purchase_units[0].payments.captures[0].status='PENDING',(o:any)=>o.purchase_units[0].payments.captures.push(o.purchase_units[0].payments.captures[0])]){const o=order(p,'COMPLETED');mutate(o);assert.throws(()=>receipt(o,p));}assert.equal(receipt(order(p,'APPROVED'),p),null);
});
test('cancellation blocks payment and preserves completed receipt after restart',async t=>{
 const {ledger,path,pp,calls}=setup(t),p=ledger.add(req,true);await ledger.create(p.id);await ledger.capture(p.id);assert.throws(()=>ledger.cancel(p.id,CANCEL_SAMPLE,'invented cancellation',true));ledger.cancel(p.id,CANCEL_SAMPLE,'The museum trip is cancelled.',true);assert.equal(label(p),'Refund needs attention');await assert.rejects(ledger.create(p.id),/cancelled/);const restored=new Ledger(path,pp).find(p.id);assert.equal(restored.captureId,p.captureId);assert.ok(restored.cancelledAt);assert.equal(calls.capture,1);
});
test('unpaid cancellation prevents order creation',async t=>{
 const {ledger,calls}=setup(t),p=ledger.add(req,true);ledger.cancel(p.id,CANCEL_SAMPLE,'The museum trip is cancelled.',true);await assert.rejects(ledger.create(p.id),/cancelled/);assert.equal(calls.create,0);
});
test('interrupted state becomes unknown, corrupt ledger preserved unchanged',t=>{
 const {ledger,path,pp}=setup(t),p=ledger.add(req,true);p.state='capturing';ledger.save();assert.equal(new Ledger(path,pp).find(p.id).state,'unknown');const x=JSON.parse(readFileSync(path,'utf8'));x.payments[0].state='invented';const raw=JSON.stringify(x);writeFileSync(path,raw);assert.throws(()=>new Ledger(path,pp),/invalid/);assert.equal(readFileSync(path,'utf8'),raw);
});
test('REST adapter uses sandbox only, exact capture route and stable idempotency keys',async t=>{
 const {ledger}=setup(t),p=ledger.add(req,true);p.orderId='TESTORDER1234567';const requests:Array<{url:string;init:any}>=[];const pp=new PayPal(config,(async (url:any,init:any)=>{requests.push({url:String(url),init});return new Response(JSON.stringify({access_token:'test-token'}),{status:200});}) as typeof fetch);
 await pp.token();await pp.create(p,'test-token');await pp.get(p,'test-token');await pp.capture(p,'test-token');await pp.capture(p,'test-token');assert.ok(requests.every(r=>r.url.startsWith(SANDBOX+'/')));assert.equal(requests[3].url,SANDBOX+'/v2/checkout/orders/TESTORDER1234567/capture');assert.equal(requests[3].init.headers['PayPal-Request-Id'],requests[4].init.headers['PayPal-Request-Id']);const body=JSON.parse(requests[1].init.body);assert.equal(body.purchase_units[0].payee.merchant_id,config.merchantId);assert.equal(body.payment_source.paypal.experience_context.return_url,ORIGIN+'/payments.html?approved='+p.id);
});
test('approval navigation rejects live, foreign and credential-bearing destinations',()=>{
 for(const href of ['https://www.paypal.com/checkoutnow','https://evil.test','https://user@www.sandbox.paypal.com/x','http://www.sandbox.paypal.com'])assert.throws(()=>approval({links:[{rel:'approve',href}]}));
});
