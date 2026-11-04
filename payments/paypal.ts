import type {Payment} from './contract.ts';
export type PayPalConfig={clientId:string;secret:string;merchantId:string};
export const SANDBOX='https://api-m.sandbox.paypal.com';
export const ORIGIN='http://127.0.0.1:4322';
export class PayPal {
 readonly config:PayPalConfig;readonly fetcher:typeof fetch;
 constructor(config:PayPalConfig,fetcher:typeof fetch=fetch){this.config=config;this.fetcher=fetcher;}
 ready(){return !!this.config.clientId&&!!this.config.secret&&/^[A-Z0-9]{8,32}$/.test(this.config.merchantId);}
 async token(){
  if(!this.ready())throw Error('PayPal Sandbox credentials and merchant ID are not configured.');
  const r=await this.fetcher(SANDBOX+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(this.config.clientId+':'+this.config.secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  const data=await r.json();if(!r.ok||typeof data.access_token!=='string')throw Error('PayPal Sandbox authentication failed.');return data.access_token as string;
 }
 async call(path:string,token:string,method='GET',body?:unknown,requestId?:string){
  const r=await this.fetcher(SANDBOX+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw Error(`PayPal Sandbox returned HTTP ${r.status}. Check status before another payment attempt.`);return data;
 }
 async create(p:Payment,token:string){return this.call('/v2/checkout/orders',token,'POST',{intent:'CAPTURE',purchase_units:[{reference_id:p.id,custom_id:p.id,invoice_id:'TR-'+p.id,description:'Tomorrow Ready · fictional school trip',payee:{merchant_id:p.merchantId},amount:{currency_code:p.currency,value:p.amount}}],payment_source:{paypal:{experience_context:{brand_name:'Tomorrow Ready Sandbox',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW',return_url:ORIGIN+'/payments.html?approved='+p.id,cancel_url:ORIGIN+'/payments.html?cancelled='+p.id}}}},'create-'+p.id);}
 async get(p:Payment,token:string){if(!p.orderId)throw Error('The order ID is unknown. Check the PayPal sandbox dashboard using request ID create-'+p.id+'. Do not create a duplicate.');return this.call('/v2/checkout/orders/'+encodeURIComponent(p.orderId),token);}
 async capture(p:Payment,token:string){return this.call('/v2/checkout/orders/'+encodeURIComponent(p.orderId!)+'/capture',token,'POST',{},'capture-'+p.id);}
}
export function validateOrder(raw:any,p:Payment){
 if(!raw||typeof raw.id!=='string'||!/^[A-Z0-9]{10,40}$/.test(raw.id)||(p.orderId&&raw.id!==p.orderId)||!Array.isArray(raw.purchase_units)||raw.purchase_units.length!==1)throw Error('The PayPal order does not match this obligation.');
 const unit=raw.purchase_units[0];
 if(unit.custom_id!==p.id||unit.amount?.currency_code!==p.currency||unit.amount?.value!==p.amount||unit.payee?.merchant_id!==p.merchantId)throw Error('The PayPal amount, currency, merchant or reference does not match.');
 return unit;
}
export function receipt(raw:any,p:Payment){
 const unit=validateOrder(raw,p),captures=unit.payments?.captures??[];
 if(raw.status!=='COMPLETED')return null;
 if(captures.length!==1)throw Error('Expected exactly one completed capture.');
 const c=captures[0];
 if(c.status!=='COMPLETED'||c.amount?.currency_code!==p.currency||c.amount?.value!==p.amount||typeof c.id!=='string'||!/^[A-Z0-9]{10,40}$/.test(c.id))throw Error('PayPal has not confirmed the exact completed payment.');
 return {captureId:c.id,paidAt:typeof c.create_time==='string'?c.create_time:new Date().toISOString()};
}
export function approval(raw:any){
 const href=raw.links?.find((l:any)=>l.rel==='payer-action'||l.rel==='approve')?.href;
 const u=new URL(href);if(u.protocol!=='https:'||u.hostname!=='www.sandbox.paypal.com'||u.username||u.password)throw Error('PayPal did not return a valid sandbox approval link.');return u.href;
}
