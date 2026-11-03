import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { callMeta, ENDPOINT, MODEL } from '../server/meta.ts';
import { createApi } from '../server/api.ts';
import { parseCandidates, parseInput } from '../src/analysis-contract.ts';
import type { AnalysisInput, Candidate } from '../src/analysis-contract.ts';
import { addSource, emptyState, tasks } from '../src/engine.ts';
import { acceptCandidate } from '../src/review.ts';

const input: AnalysisInput = {requestId:'test-1',source:{id:'s1',title:'School',lang:'PL',text:'27.10.2026. Zbiórka o 7:55. Zabierz wodę.'},event:'School',day:'2026-10-27'};
const candidate: Candidate = {kind:'meeting',value:'07:55',quote:'Zbiórka o 7:55.',day:'2026-10-27',dateQuote:'27.10.2026'};
const payload = {candidates:[candidate],warnings:[]};
const envelope = (content = JSON.stringify(payload), finish_reason = 'stop') => new Response(JSON.stringify({choices:[{finish_reason,message:{content}}]}));
const fake: typeof fetch = async () => envelope();

test('Meta request uses current endpoint/schema and keeps secret out of document', async () => {
  let calls = 0;
  const result = await callMeta(input,{key:'server-only-secret',limit:10},async (url, options) => {
    calls++;
    assert.equal(url,ENDPOINT);
    assert.equal(options?.redirect,'error');
    assert.equal(new Headers(options?.headers).get('authorization'),'Bearer server-only-secret');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model,MODEL);
    assert.equal(body.max_completion_tokens,4096);
    assert.equal(body.response_format.type,'json_schema');
    assert.equal(body.messages[0].role,'developer');
    assert.equal(JSON.stringify(body).includes('server-only-secret'),false);
    assert.equal(JSON.parse(body.messages[1].content).document,input.source.text);
    return envelope();
  });
  assert.equal(calls,1); assert.equal(result.status,'ok');
  if(result.status==='ok') assert.equal(result.sourceText,input.source.text);
  assert.equal(JSON.stringify(result).includes('server-only-secret'),false);
});

test('rejects invented quotes/times, invalid dates, extra fields and duplicate facts', () => {
  for (const c of [{...candidate,quote:'invented'}, {...candidate,value:'08:30'}, {...candidate,day:'2026-02-30'}, {...candidate,dateQuote:'missing'}, {...candidate,extra:true}]) {
    assert.throws(() => parseCandidates({candidates:[c],warnings:[]},input.source));
  }
  assert.throws(() => parseCandidates({candidates:[candidate,candidate],warnings:[]},input.source));
  assert.throws(() => parseInput({...input,source:{...input.source,text:'a'.repeat(20001)}}));
});

test('errors, truncation and malformed output never become facts or trigger retries', async () => {
  for (const [fetcher, code] of [
    [async()=>new Response('secret upstream body',{status:401}),'provider_401'],
    [async()=>new Response('secret upstream body',{status:429}),'provider_429'],
    [async()=>envelope('{}','length'),'incomplete'],
    [async()=>envelope('not json'),'invalid_response'],
    [async()=>envelope(JSON.stringify({...payload,candidates:[{...candidate,quote:'invented'}]})),'invalid_response'],
    [async()=>{throw new TypeError('secret upstream body');},'outcome_unknown'],
  ] as const) {
    let calls = 0;
    const result = await callMeta(input,{key:'key',limit:10},async()=>{calls++;return fetcher();});
    assert.equal(calls,1); assert.equal(result.status,'error');
    if(result.status==='error') assert.equal(result.code,code);
    assert.equal(JSON.stringify(result).includes('secret upstream body'),false);
  }
});

test('model response needs explicit review, is idempotent, and cannot apply to stale evidence', async () => {
  const state = addSource(emptyState(), input.source);
  const result = await callMeta(input,{key:'key',limit:10},fake);
  assert.equal(state.facts.length,0);
  assert.equal(result.status,'ok'); if(result.status!=='ok') return;
  assert.throws(()=>acceptCandidate(state,result,0,false));
  const accepted = acceptCandidate(state,result,0,true);
  assert.equal(accepted.facts.length,1);
  assert.equal(tasks(accepted).some(t=>t.done),false);
  assert.deepEqual(acceptCandidate(accepted,result,0,true),accepted);
  assert.throws(()=>acceptCandidate({...state,day:'2026-10-28'},result,0,true));
  assert.throws(()=>acceptCandidate({...state,sources:[{...input.source,text:'changed'}]},result,0,true));
  assert.throws(()=>acceptCandidate(state,{...result,candidates:[{...candidate,day:'2026-10-28'}]},0,true));
  const undated = {...result,candidates:[{...candidate,day:null,dateQuote:null}]};
  assert.throws(()=>acceptCandidate(state,undated,0,false));
  assert.equal(acceptCandidate(state,undated,0,true).facts.length,1);
});

test('HTTP enforces local origin, CSRF, idempotency, limits and key isolation', async () => {
  let calls=0, key='private-test-secret';
  const handler = createApi(()=>({key,limit:2}),async(input,config)=>{calls++;return callMeta(input,config,fake);});
  const server = createServer((req,res)=>{void handler(req,res,()=>{res.writeHead(404);res.end();});});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const address = server.address(); assert.ok(address && typeof address!=='string');
  const url = `http://127.0.0.1:${address.port}/api/meta`;
  const headers: Record<string,string> = {host:'127.0.0.1:4318',origin:'http://127.0.0.1:4318','content-type':'application/json'};
  const http = (path:string, method:string, requestHeaders:Record<string,string>, body?:string) => new Promise<Response>((resolve,reject)=>{
    const req=request(url+path,{method,headers:requestHeaders},res=>{const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode})));});
    req.on('error',reject); req.end(body);
  });
  const status = async () => (await http('/status','GET',headers)).json();
  const post = (body:unknown,extra={})=>http('/analyze','POST',{...headers,...extra},JSON.stringify(body));
  try {
    const first = await status();
    assert.equal(first.configured,true); assert.equal(first.verified,false);
    assert.equal(JSON.stringify(first).includes(key),false);
    assert.equal((await post(input)).status,403);
    headers['x-duetnest-csrf']=first.csrf;
    assert.equal((await post(input,{origin:'https://evil.example'})).status,403);
    assert.equal((await post(input,{host:'evil.example'})).status,403);
    assert.equal(calls,0);
    assert.equal((await (await post(input)).json()).status,'ok');
    assert.equal((await (await post(input)).json()).status,'ok');
    assert.equal(calls,1); assert.equal((await status()).verified,true);
    assert.equal((await post({...input,event:'Changed'})).status,409);
    assert.equal((await (await post({...input,requestId:'test-2'})).json()).status,'ok');
    assert.equal((await post({...input,requestId:'test-3'})).status,429);
    assert.equal(calls,2);
    key='rotated-secret'; assert.equal((await status()).verified,false);
    key=''; assert.equal((await status()).configured,false);
    assert.equal((await post({...input,requestId:'test-4'})).status,503);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

test('concurrent requests are blocked and an unknown result is cached without redispatch', async () => {
  let calls=0;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const handler=createApi(()=>({key:'key',limit:10}),async()=>{calls++;await gate;throw new Error('unknown');});
  const server=createServer((req,res)=>{void handler(req,res,()=>res.end());});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address(); assert.ok(address && typeof address!=='string');
  const url=`http://127.0.0.1:${address.port}`;
  const headers:Record<string,string>={host:'127.0.0.1:4318',origin:'http://127.0.0.1:4318','content-type':'application/json'};
  const http=(method:string,path:string,body?:unknown)=>new Promise<{status:number;body:any}>((resolve,reject)=>{
    const req=request(url+path,{method,headers},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(Buffer.concat(chunks).toString())}));});
    req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  try {
    headers['x-duetnest-csrf']=(await http('GET','/api/meta/status')).body.csrf;
    const first=http('POST','/api/meta/analyze',input);
    // A status read sent after the request gives the server a chance to enter the provider call.
    while(calls===0) await http('GET','/api/meta/status');
    assert.equal((await http('POST','/api/meta/analyze',{...input,requestId:'concurrent'})).status,429);
    release();
    assert.equal((await first).body.code,'outcome_unknown');
    assert.equal((await http('POST','/api/meta/analyze',input)).body.code,'outcome_unknown');
    assert.equal(calls,1);
  } finally {release();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('Fireworks runs the Meta model through its own bounded request and strict review contract', async () => {
  const { FIREWORKS_ENDPOINT, FIREWORKS_MODEL } = await import('../server/meta.ts');
  let calls=0;
  const result=await callMeta({...input,provider:'fireworks'},{provider:'fireworks',key:'fw-only',limit:10},async(url,options)=>{
    calls++;
    assert.equal(url,FIREWORKS_ENDPOINT);
    assert.equal(options?.redirect,'error');
    assert.equal(new Headers(options?.headers).get('authorization'),'Bearer fw-only');
    const body=JSON.parse(String(options?.body));
    assert.equal(body.model,FIREWORKS_MODEL);
    assert.equal(body.max_tokens,4096);
    assert.equal(body.stream,false);
    assert.equal(body.response_format,undefined);
    assert.equal(body.messages[0].role,'system');
    assert.match(body.messages[0].content,/JSON schema:/);
    assert.equal(JSON.parse(body.messages[1].content).document,input.source.text);
    assert.equal(JSON.stringify(body).includes('fw-only'),false);
    return envelope();
  });
  assert.equal(calls,1); assert.equal(result.status,'ok');
  if(result.status!=='ok') return;
  assert.equal(result.model,FIREWORKS_MODEL);
  const before=addSource(emptyState(),input.source);
  assert.equal(before.facts.length,0);
  assert.throws(()=>acceptCandidate(before,result,0,false));
  assert.equal(acceptCandidate(before,result,0,true).facts[0].provenance?.model,FIREWORKS_MODEL);
  for(const fetcher of [async()=>envelope('```json\n'+JSON.stringify(payload)+'\n```'),async()=>envelope('{}','length'),async()=>envelope(JSON.stringify({...payload,candidates:[{...candidate,value:'09:00'}]}))]) {
    let attempts=0;
    const rejected=await callMeta(input,{provider:'fireworks',key:'fw-only',limit:10},async()=>{attempts++;return fetcher();});
    assert.equal(rejected.status,'error');assert.equal(attempts,1);
  }
});

test('server config requires explicit provider and never borrows the other provider key', async () => {
  const { mkdtempSync,writeFileSync,rmSync }=await import('node:fs');
  const { tmpdir }=await import('node:os');
  const { join }=await import('node:path');
  const { readConfig }=await import('../server/api.ts');
  const root=mkdtempSync(join(tmpdir(),'duetnest-provider-test-'));
  try {
    writeFileSync(join(root,'.env.server'),'MODEL_PROVIDER=fireworks\nMODEL_API_KEY=meta-test\nFIREWORKS_API_KEY=\n');
    assert.deepEqual(readConfig(root),{provider:'fireworks',key:'',limit:10});
    writeFileSync(join(root,'.env.server'),'MODEL_PROVIDER=fireworks\nMODEL_API_KEY=meta-test\nFIREWORKS_API_KEY=fw-test\n');
    assert.equal(readConfig(root).key,'fw-test');
    writeFileSync(join(root,'.env.server'),'MODEL_PROVIDER=meta\nMODEL_API_KEY=\nFIREWORKS_API_KEY=fw-test\n');
    assert.equal(readConfig(root).key,'');
    writeFileSync(join(root,'.env.server'),'MODEL_PROVIDER=arbitrary-url\n');
    assert.throws(()=>readConfig(root));
    assert.throws(()=>parseInput({...input,provider:'arbitrary-url'}));
  } finally {rmSync(root,{recursive:true});}
});

test('provider changes reject stale consent, invalidate verification and never replay a request on another provider', async () => {
  let provider:'meta'|'fireworks'='meta',calls=0;
  const handler=createApi(()=>({key:'same-test-key',provider,limit:10}),async(i,c)=>{calls++;return callMeta(i,c,fake);});
  const server=createServer((req,res)=>{void handler(req,res,()=>res.end());});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const headers:Record<string,string>={host:'127.0.0.1:4318',origin:'http://127.0.0.1:4318','content-type':'application/json'};
  const http=(method:string,path:string,body?:unknown)=>new Promise<any>((resolve,reject)=>{
    const req=request(`http://127.0.0.1:${address.port}/api/meta/${path}`,{method,headers},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks).toString())));});
    req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  try {
    const initial=await http('GET','status');headers['x-duetnest-csrf']=initial.csrf;
    assert.equal(initial.provider,'meta');
    assert.equal((await http('POST','analyze',input)).status,'ok');
    assert.equal((await http('GET','status')).verified,true);
    provider='fireworks';
    const changed=await http('GET','status');
    assert.equal(changed.provider,'fireworks');assert.equal(changed.verified,false);
    assert.equal((await http('POST','analyze',{...input,requestId:'stale'})).code,'provider_changed');
    assert.equal((await http('POST','analyze',{...input,provider})).code,'request_conflict');
    assert.equal(calls,1);
    const fresh={...input,requestId:'new-fw-request',provider};
    assert.equal((await http('POST','analyze',fresh)).status,'ok');
    assert.equal((await http('POST','analyze',fresh)).status,'ok');
    assert.equal(calls,2);
    assert.equal((await http('GET','status')).verified,true);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('only numeric provider usage is exposed; credentials and raw envelope stay private',async()=>{
 const result=await callMeta(input,{key:'private-key',limit:10},async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(payload)}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,private:'do-not-copy'},secret:'do-not-copy'})));
 assert.equal(result.status,'ok');if(result.status!=='ok')return;
 assert.equal(result.metrics?.promptTokens,100);assert.equal(result.metrics?.completionTokens,20);assert.equal(result.metrics?.totalTokens,120);
 assert.ok(result.metrics!.elapsedMs>=0);assert.equal(JSON.stringify(result).includes('do-not-copy'),false);assert.equal(JSON.stringify(result).includes('private-key'),false);
});

test('diagnostics distinguish header timeout, interrupted body and validation without exposing provider text',async()=>{
 const header=await callMeta(input,{key:'private-key',limit:10},async()=>{throw new DOMException('private upstream','TimeoutError');});
 assert.equal(header.status,'error');assert.equal(header.metrics?.phase,'headers');assert.equal(header.metrics?.failure,'timeout');assert.equal(header.metrics?.headersMs,undefined);
 const body=await callMeta(input,{key:'private-key',limit:10},async()=>new Response(new ReadableStream({start(c){c.error(new TypeError('private upstream'));}})));
 assert.equal(body.status,'error');assert.equal(body.metrics?.phase,'body');assert.equal(body.metrics?.failure,'network');assert.ok(body.metrics!.headersMs!>=0);
 const invalid=await callMeta(input,{key:'private-key',limit:10},async()=>envelope('private upstream'));
 assert.equal(invalid.status,'error');assert.equal(invalid.metrics?.phase,'validation');assert.equal(invalid.metrics?.failure,'response');
 assert.equal(JSON.stringify([header,body,invalid]).includes('private'),false);
});
