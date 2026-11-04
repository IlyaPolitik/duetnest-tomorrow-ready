import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {paymentApi} from './api.ts';
import {extractPayment} from './ai.ts';
import {SAMPLE} from './contract.ts';
test('local API rejects foreign origin/host and missing CSRF; no credentials or AI enabled by default',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'tomorrow-api-')),handler=paymentApi(dir),server=createServer((req,res)=>{void handler(req,res,()=>{res.writeHead(404);res.end();});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Missing test listener');const port=address.port;
 t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true});});
 function call(path:string,method='GET',headers:Record<string,string>={}){return new Promise<{code:number;body:any}>((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path,method,headers:{host:'127.0.0.1:4322',...headers}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({code:res.statusCode!,body:JSON.parse(body)}));});req.on('error',reject);if(method==='POST')req.write('{}');req.end();});}
 const status=await call('/api/payments/status');assert.equal(status.code,200);assert.equal(status.body.configured,false);assert.equal(status.body.ai.remaining,0);assert.equal(status.body.secret,undefined);assert.equal(status.body.clientId,undefined);
 for(const headers of [{origin:'https://evil.example'}, {host:'evil.example'}, {'sec-fetch-site':'cross-site'}] as Record<string,string>[])assert.equal((await call('/api/payments/status','GET',headers)).code,403);
 assert.equal((await call('/api/payments/capture','POST',{origin:'http://127.0.0.1:4322','content-type':'application/json'})).code,403);
 const disabled=await call('/api/payments/analyze','POST',{origin:'http://127.0.0.1:4322','content-type':'application/json','x-payment-csrf':status.body.csrf});assert.equal(disabled.code,400);assert.match(disabled.body.error,/not enabled/);
});
test('AI draft validates exact source and rejects invented facts or malformed answers without retry',async()=>{
 const valid={amount:'12.50',currency:'EUR',quote:'Please pay EUR 12.50 by 2026-11-12.',due:'2026-11-12',dueQuote:'Please pay EUR 12.50 by 2026-11-12.'};let calls=0;
 const provider=(answer:unknown)=>(async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:typeof answer==='string'?answer:JSON.stringify(answer)}}]}));}) as typeof fetch;
 const r=await extractPayment(SAMPLE,'Museum','test-only',provider(valid));assert.equal(r.source,SAMPLE);assert.equal(r.amount,'12.50');
 await assert.rejects(extractPayment(SAMPLE,'Museum','test-only',provider({...valid,amount:'999.00'})),/quote/);
 await assert.rejects(extractPayment(SAMPLE,'Museum','test-only',provider({error:'ambiguous'})),/one explicit payment/);
 await assert.rejects(extractPayment(SAMPLE,'Museum','test-only',provider('not JSON')),/invalid JSON/);assert.equal(calls,4);
});
