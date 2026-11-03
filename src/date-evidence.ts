// A bounded calendar check, not a claim that the quote belongs to the intended event.
// Ambiguous formats and unsupported dates fail closed; manual source review remains available.
const monthGroups=[
 'january jan stycznia січня января','february feb lutego лютого февраля','march mar marca березня марта',
 'april apr kwietnia квітня апреля','may maja травня мая','june jun czerwca червня июня',
 'july jul lipca липня июля','august aug sierpnia серпня августа','september sep sept września вересня сентября',
 'october oct października жовтня октября','november nov listopada листопада ноября','december dec grudnia грудня декабря',
];
const months=new Map(monthGroups.flatMap((group,i)=>group.split(' ').map(name=>[name,i+1] as const)));
export function explicitDates(quote:string):string[]{
 const dates=new Set<string>(),text=quote.normalize('NFKC').toLowerCase();
 function add(y:number,m:number,d:number){
  const value=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const parsed=new Date(value+'T12:00:00Z');
  if(y>=1000&&y<=9999&&!Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value)dates.add(value);
 }
 for(const m of text.matchAll(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g))add(+m[1],+m[2],+m[3]);
 for(const m of text.matchAll(/(?<![\d-])(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g)){
  // Without a locale contract, 03/04 and 03.04 each have two possible readings.
  add(+m[3],+m[2],+m[1]);add(+m[3],+m[1],+m[2]);
 }
 for(const m of text.matchAll(/(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+([\p{L}]+)\.?\s*,?\s*(\d{4})(?!\d)/gu)){
  const month=months.get(m[2]);if(month)add(+m[3],month,+m[1]);
 }
 for(const m of text.matchAll(/([\p{L}]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})(?!\d)/gu)){
  const month=months.get(m[1]);if(month)add(+m[3],month,+m[2]);
 }
 return [...dates];
}
// Relative dates require an explicitly supplied message date, never the current day.
export function dateEvidenceMatches(day:string,quote:string,messageDate?:string):boolean{
 const dates=explicitDates(quote);
 if(dates.length)return dates.length===1&&dates[0]===day;
 if(!messageDate||!/^\d{4}-\d{2}-\d{2}$/.test(messageDate))return false;
 const anchor=new Date(messageDate+'T12:00:00Z');
 if(Number.isNaN(anchor.valueOf())||anchor.toISOString().slice(0,10)!==messageDate)return false;
 const text=quote.normalize('NFKC').toLowerCase();
 const offsets=new Set<number>();
 const groups:[number,string[]][]=[[0,['today','сьогодні','сегодня','dzisiaj','dziś','täna']],[1,['tomorrow','завтра','jutro','homme']],[2,['the day after tomorrow','післязавтра','послезавтра','pojutrze','ülehomme']]];
 // Match complete Unicode words; remove compound phrases before shorter terms.
 let remaining=text;
 for(const [offset,words] of [...groups].reverse())for(const word of words){
  const re=new RegExp('(?<![\\p{L}])'+word+'(?![\\p{L}])','gu');
  if(re.test(remaining)){offsets.add(offset);remaining=remaining.replace(re,' ');}
 }
 if(offsets.size!==1)return false;
 anchor.setUTCDate(anchor.getUTCDate()+[...offsets][0]);
 return anchor.toISOString().slice(0,10)===day;
}
