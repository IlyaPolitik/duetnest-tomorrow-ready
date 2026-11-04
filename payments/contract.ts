export type Requirement = { event: string; source: string; quote: string; amount: string; currency: 'EUR'|'USD'|'PLN'; due: string; dueQuote: string };
export type PaymentState = 'reviewed'|'creating'|'created'|'capturing'|'paid'|'unknown';
export type Payment = Requirement & { id:string; fingerprint:string; state:PaymentState; createdAt:string; merchantId:string; orderId?:string; approvalUrl?:string; captureId?:string; paidAt?:string; cancelledAt?:string; cancellationQuote?:string; note?:string };
export const SAMPLE = 'School office — 2026-11-04\nThe museum trip is on 2026-11-18. Please pay EUR 12.50 by 2026-11-12. Bring water and a raincoat. Payment is collected by the school office.';
export const CANCEL_SAMPLE = 'School office — 2026-11-05\nThe museum trip is cancelled. Families who have already paid should contact the school office about a refund.';
export function object(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==='object'&&!Array.isArray(x);}
function str(x:unknown,max:number){if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('Please complete the required fields.');return x.trim();}
export function requirement(raw:unknown):Requirement{
 if(!object(raw))throw Error('Invalid payment requirement.');
 const event=str(raw.event,100),source=str(raw.source,20000),quote=str(raw.quote,2000),amount=str(raw.amount,12),currency=str(raw.currency,3),due=str(raw.due,10),dueQuote=str(raw.dueQuote,500);
 if(!/^(?:0|[1-9]\d{0,3})\.\d{2}$/.test(amount)||Number(amount)<=0||Number(amount)>1000)throw Error('Use an amount between 0.01 and 1,000.00.');
 if(!['EUR','USD','PLN'].includes(currency))throw Error('Choose EUR, USD or PLN explicitly.');
 if(!source.includes(quote)||!source.includes(dueQuote))throw Error('Quotes must match the source exactly.');
 const money=[...quote.matchAll(/\b(EUR|USD|PLN)\s+(\d+(?:[.,]\d{2})?)(?![\d.,])|(?<![\d.,])(\d+(?:[.,]\d{2})?)\s+(EUR|USD|PLN)\b/g)].map(m=>({currency:m[1]||m[4],amount:Number((m[2]||m[3]).replace(',','.')).toFixed(2)}));
 if(money.length!==1||money[0].currency!==currency||money[0].amount!==amount)throw Error('Use a quote containing exactly one explicit currency and amount, for example EUR 12.50.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due||!dueQuote.includes(due))throw Error('Use a complete ISO date quoted from the message.');
 return {event,source,quote,amount,currency:currency as Requirement['currency'],due,dueQuote};
}
export function label(p:Payment){if(p.cancelledAt)return p.state==='paid'?'Refund needs attention':p.state==='unknown'||p.state==='capturing'?'Cancelled · verify payment':'Event cancelled';return {reviewed:'Ready for review',creating:'Creating order',created:'Awaiting PayPal approval',capturing:'Verifying payment',paid:'Paid in sandbox',unknown:'Payment status needs checking'}[p.state];}
