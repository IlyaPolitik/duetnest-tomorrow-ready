import et from './locales/et.json' with {type:'json'};
import uk from './locales/uk.json' with {type:'json'};
export type Locale='en'|'uk'|'et';
export function locale(search=typeof location==='undefined'?'':location.search):Locale{const value=new URLSearchParams(search).get('lang');return value==='uk'||value==='et'?value:'en';}
export function translate(key:string,language:Locale,...values:unknown[]):string{
 const dictionary:Record<string,string>=language==='et'?et:uk;let template=language!=='en'?(dictionary[key]??key):key;
 if(language!=='en'&&!dictionary[key]&&!values.length){
  for(const [pattern,translated]of Object.entries(dictionary)){
   if(!/\{\d+\}/.test(pattern))continue;
   const escaped=pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const regex=new RegExp('^'+escaped.replace(/\\\{\d+\\\}/g,'(.+?)')+'$');
   const found=key.match(regex);if(found){template=translated;values=found.slice(1);break;}
  }
 }
 return template.replace(/\{(\d+)\}/g,(match,n)=>Number(n)<values.length?String(values[Number(n)]):match);
}
export function t(key:string,...values:unknown[]):string{return translate(key,locale(),...values);}
export function languageUrl(language:Locale):string{const u=new URL(location.href);u.searchParams.set('lang',language);return u.pathname+u.search+u.hash;}

export function uiText(ukrainian:string,english:string,language:Locale=locale()):string{return language==='uk'?ukrainian:translate(english,language);}
export function dateLocale(language:Locale):string{return language==='uk'?'uk-UA':language==='et'?'et-EE':'en-GB';}
