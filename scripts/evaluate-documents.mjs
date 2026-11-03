// Explicit local development runner. Synthetic fixtures only; never invoked by npm test.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2), conflicts=args[0]==='--conflicts', documents=args[0]==='--documents';
const dir=resolve(root,documents?'proof/document-journey-2026-10-28':conflicts?'proof/conflict-cancellation-2026-10-28':'proof/document-evaluation-2026-10-28');
const cases=JSON.parse(readFileSync(resolve(root,documents?'tests/fixtures/evaluation/document-journey.json':conflicts?'tests/fixtures/evaluation/conflict-cancellation.json':'tests/fixtures/evaluation/development-documents.json'),'utf8'));
const requested=(conflicts||documents)?args.slice(1):args;
if(!requested.length||requested.some(id=>!cases.some(c=>c.id===id)))throw Error('Provide explicit fixture IDs. No all/default mode.');
const base='http://127.0.0.1:4318/api/meta';
const total=readdirSync(dir).filter(f=>f.endsWith('.intent.json')).length;
if(total+requested.length>(documents?4:conflicts?6:10))throw Error('Evaluation budget exhausted, including uncertain outcomes.');
if((conflicts||documents) && requested.some(id=>readdirSync(dir).filter(f=>f.endsWith('.intent.json')).some(f=>JSON.parse(readFileSync(resolve(dir,f),'utf8')).id===id)))throw Error('This fixture was already dispatched. No automatic or uncertain replay.');
const status=await (await fetch(base+'/status')).json();
if(!status.configured||status.provider!=='fireworks'||status.remaining<requested.length)throw Error('Insufficient configured local request budget. Do not restart to bypass it.');
for(const id of requested){
 const c=cases.find(c=>c.id===id),run=`${id}-${randomUUID()}`;
 const input={requestId:randomUUID(),provider:status.provider,source:{id:run,title:`Synthetic evaluation ${id}`,lang:c.lang,text:c.text},event:c.event,day:c.planningDay};
 const intent={id,requestId:input.requestId,startedAt:new Date().toISOString(),inputSha256:createHash('sha256').update(JSON.stringify(input)).digest('hex'),model:status.model,promptFileSha256:createHash('sha256').update(readFileSync(resolve(root,'server/meta.ts'))).digest('hex')};
 writeFileSync(resolve(dir,run+'.intent.json'),JSON.stringify(intent,null,2),{flag:'wx'});
 const start=performance.now();let result;
 try{const response=await fetch(base+'/analyze',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:4318','x-duetnest-csrf':status.csrf},body:JSON.stringify(input),signal:AbortSignal.timeout(85000)});result={httpStatus:response.status,body:await response.json()};}
 catch{result={body:{status:'error',code:'outcome_unknown',reason:'No completed local response. No retry.'}};}
 const output={...intent,elapsedMs:Math.round(performance.now()-start),...result};
 writeFileSync(resolve(dir,run+'.result.json'),JSON.stringify(output,null,2),{flag:'wx'});
 console.log(JSON.stringify({id,elapsedMs:output.elapsedMs,status:output.body.status,candidates:output.body.candidates,warnings:output.body.warnings,code:output.body.code,metrics:output.body.metrics}));
 if(output.body.status!=='ok')break;
}
