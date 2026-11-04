import {randomBytes} from 'node:crypto';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Plugin} from 'vite';
import {Ledger} from './ledger.ts';
import {PayPal,ORIGIN} from './paypal.ts';
import {extractPayment,AI_MODEL} from './ai.ts';
export function paymentApi(root:string){
 const envPath=resolve(root,'.env.paypal');
 const env=existsSync(envPath)?parseEnv(readFileSync(envPath,'utf8')):{};
 const config={clientId:env.PAYPAL_SANDBOX_CLIENT_ID??'',secret:env.PAYPAL_SANDBOX_SECRET??'',merchantId:env.PAYPAL_SANDBOX_MERCHANT_ID??''};
 const paypal=new PayPal(config), ledger=new Ledger(resolve(root,'.payment-data/ledger.json'),paypal),csrf=randomBytes(32).toString('hex');
 const aiKey=env.PAYPAL_AI_KEY??'',aiLimit=Math.min(20,Math.max(0,Number(env.PAYPAL_AI_CALL_LIMIT)||0));
 return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
  if(!req.url?.startsWith('/api/payments/'))return next();
  const send=(code:number,data:unknown)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  if(req.headers.host!=='127.0.0.1:4322'||(req.headers.origin&&req.headers.origin!==ORIGIN)||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'This prototype only accepts requests from its local interface.'});
  if(req.method==='GET'&&req.url==='/api/payments/status')return send(200,{csrf,sandbox:true,configured:paypal.ready(),merchantId:config.merchantId,payments:ledger.payments,ai:{configured:!!aiKey,model:AI_MODEL,remaining:Math.max(0,aiLimit-ledger.aiUsed)}});
  if(req.method!=='POST'||req.headers.origin!==ORIGIN||req.headers['x-payment-csrf']!==csrf||req.headers['content-type']!=='application/json')return send(403,{error:'Refresh the local page before continuing.'});
  try{
   let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>50000)return send(413,{error:'Message too large.'});chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const result=await ledger.run(async()=>{
    switch(req.url){
     case '/api/payments/configure':{
      if(ledger.payments.length)throw Error('Sandbox credentials cannot be changed after a payment record exists.');
      if(typeof data.clientId!=='string'||!/^[A-Za-z0-9_-]{40,200}$/.test(data.clientId)||typeof data.secret!=='string'||!/^[A-Za-z0-9_-]{40,200}$/.test(data.secret)||typeof data.merchantId!=='string'||!/^[A-Z0-9]{8,32}$/.test(data.merchantId))throw Error('Enter the existing Sandbox client ID, secret and merchant ID.');
      const probe=new PayPal(data);await probe.token();
      writeFileSync(envPath,'PAYPAL_SANDBOX_CLIENT_ID='+data.clientId+'\nPAYPAL_SANDBOX_SECRET='+data.secret+'\nPAYPAL_SANDBOX_MERCHANT_ID='+data.merchantId+'\n'+(aiKey?'PAYPAL_AI_KEY='+aiKey+'\n':'')+'PAYPAL_AI_CALL_LIMIT='+aiLimit+'\n',{mode:0o600});Object.assign(config,data);return {configured:true};
     }
     case '/api/payments/analyze':{
      if(!aiKey||ledger.aiUsed>=aiLimit)throw Error('AI calls are not enabled or the approved limit is exhausted. Manual review remains available.');
      if(typeof data.source!=='string'||!data.source.trim()||data.source.length>20000||typeof data.event!=='string'||!data.event.trim()||data.event.length>100||data.confirmed!==true)throw Error('Confirm sending this fictional message to Fireworks first.');
      ledger.aiUsed++;ledger.save();return {requirement:await extractPayment(data.source,data.event,aiKey)};
     }
     case '/api/payments/review':if(!paypal.ready())throw Error('Configure the sandbox merchant first.');return {payment:ledger.add(data.requirement,data.confirmed===true)};
     case '/api/payments/create':if(data.confirmed!==true)throw Error('Confirm opening PayPal Sandbox.');return {payment:await ledger.create(data.id)};
     case '/api/payments/capture':if(data.confirmed!==true)throw Error('Confirm completing the sandbox payment.');return {payment:await ledger.capture(data.id)};
     case '/api/payments/reconcile':return {payment:await ledger.reconcile(data.id)};
     case '/api/payments/cancel':return {payment:ledger.cancel(data.id,data.source,data.quote,data.confirmed===true)};
     default:throw Error('Unknown operation.');
    }
   });send(200,result);
  }catch(e){send(400,{error:e instanceof Error?e.message:'The operation failed. Check status before continuing.'});}
 };
}
export function paymentsPlugin():Plugin{return {name:'tomorrow-ready-payments',configureServer(server){server.middlewares.use(paymentApi(server.config.root));},configurePreviewServer(server){server.middlewares.use(paymentApi(server.config.root));}};}
