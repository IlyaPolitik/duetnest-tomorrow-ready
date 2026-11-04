import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {requirement} from './contract.ts';
import type {Payment} from './contract.ts';
import {PayPal,approval,receipt,validateOrder} from './paypal.ts';
export class Ledger {
 payments:Payment[]=[];aiUsed=0;private queue:Promise<unknown>=Promise.resolve();
 readonly path:string;readonly paypal:PayPal;
 constructor(path:string,paypal:PayPal){
  this.path=path;this.paypal=paypal;
  if(existsSync(path)){const x=JSON.parse(readFileSync(path,'utf8'));if(x.version!==1||!Array.isArray(x.payments)||!Number.isInteger(x.aiUsed)||x.aiUsed<0)throw Error('Payment ledger is invalid; original file preserved.');this.payments=x.payments;this.aiUsed=x.aiUsed;
   const ids=new Set<string>();
   for(const p of this.payments){requirement(p);if(!/^[a-f0-9-]{36}$/.test(p.id)||ids.has(p.id)||!['reviewed','creating','created','capturing','paid','unknown'].includes(p.state)||!/^[A-Z0-9]{8,32}$/.test(p.merchantId)||(p.orderId&&!/^[A-Z0-9]{10,40}$/.test(p.orderId))||(p.state==='paid'&&(!p.captureId||!p.paidAt)))throw Error('Payment ledger is invalid; original file preserved.');ids.add(p.id);}
   for(const p of this.payments){if(['creating','capturing'].includes(p.state)){p.state='unknown';p.note='The server restarted during a payment request. Check PayPal before any new attempt.';}}
   this.save();
  }
 }
 save(){mkdirSync(dirname(this.path),{recursive:true,mode:0o700});const tmp=this.path+'.tmp';writeFileSync(tmp,JSON.stringify({version:1,aiUsed:this.aiUsed,payments:this.payments},null,2),{mode:0o600});renameSync(tmp,this.path);}
 run<T>(work:()=>Promise<T>|T):Promise<T>{const next=this.queue.then(work);this.queue=next.catch(()=>{});return next;}
 find(id:string){const p=this.payments.find(p=>p.id===id);if(!p)throw Error('Payment not found.');return p;}
 add(raw:unknown,confirmed:boolean){
  if(!confirmed)throw Error('Review the evidence and sandbox merchant before saving.');
  const r=requirement(raw),fingerprint=createHash('sha256').update(JSON.stringify(r)).digest('hex');
  const same=this.payments.find(p=>p.fingerprint===fingerprint);if(same)return same;
  if(this.payments.some(p=>p.event.toLocaleLowerCase()===r.event.toLocaleLowerCase()))throw Error('This event already has a payment record. Review the existing record; a changed message must not create a second charge.');
  if(this.payments.length>=100)throw Error('The local prototype supports up to 100 payment records.');
  const p:Payment={...r,id:randomUUID(),fingerprint,state:'reviewed',createdAt:new Date().toISOString(),merchantId:this.paypal.config.merchantId};this.payments.unshift(p);this.save();return p;
 }
 async create(id:string){
  const p=this.find(id);if(p.cancelledAt)throw Error('The event is cancelled. No payment can be started.');
  if(p.state==='created')return p;
  if(p.state!=='reviewed')throw Error('Check the existing payment status before any new attempt.');
  if(p.merchantId!==this.paypal.config.merchantId)throw Error('The sandbox merchant changed. Reconcile the saved record first.');
  const token=await this.paypal.token();p.state='creating';this.save();
  try{const raw=await this.paypal.create(p,token);if(typeof raw.id==='string'&&/^[A-Z0-9]{10,40}$/.test(raw.id)){p.orderId=raw.id;this.save();}validateOrder(raw,p);p.approvalUrl=approval(raw);p.state='created';p.note=undefined;this.save();return p;}
  catch{p.state='unknown';p.note='Order creation was dispatched, but its outcome is not verified. Do not start another payment.';this.save();throw Error(p.note);}
 }
 async reconcile(id:string){
  const p=this.find(id);if(!p.orderId)throw Error('No order ID is available. Inspect PayPal Sandbox using request ID create-'+p.id+'.');
  const raw=await this.paypal.get(p,await this.paypal.token());validateOrder(raw,p);const paid=receipt(raw,p);
  if(paid){Object.assign(p,paid);p.state='paid';p.note=undefined;}
  else if(p.state!=='paid'&&['CREATED','PAYER_ACTION_REQUIRED','APPROVED'].includes(raw.status)){p.state='created';p.note='PayPal has not reported a completed payment.';}
  else if(p.state!=='paid'){p.state='unknown';p.note='PayPal returned '+String(raw.status)+'. No payment completion is claimed.';}
  this.save();return p;
 }
 async capture(id:string){
  const p=this.find(id);if(p.state==='paid')return p;if(p.cancelledAt)throw Error('Event cancelled. Do not complete this payment.');
  if(p.state!=='created')throw Error('Check PayPal status first.');
  const token=await this.paypal.token(),raw=await this.paypal.get(p,token);validateOrder(raw,p);const prior=receipt(raw,p);
  if(prior){Object.assign(p,prior);p.state='paid';this.save();return p;}
  if(raw.status!=='APPROVED')throw Error('Approve the order in PayPal Sandbox first.');
  p.state='capturing';this.save();
  try{const completed=receipt(await this.paypal.capture(p,token),p);if(!completed)throw Error('Payment is not completed.');Object.assign(p,completed);p.state='paid';p.note=undefined;this.save();return p;}
  catch{p.state='unknown';p.note='Capture was dispatched, but completion is not verified. Use Check PayPal status; do not pay again.';this.save();throw Error(p.note);}
 }
 cancel(id:string,source:string,quote:string,confirmed:boolean){
  const p=this.find(id);if(!confirmed||typeof source!=='string'||source.length>20000||typeof quote!=='string'||quote.length<5||quote.length>2000||!source.includes(quote))throw Error('Confirm the event and quote the cancellation exactly.');
  p.cancelledAt??=new Date().toISOString();p.cancellationQuote=quote;this.save();return p;
 }
}
