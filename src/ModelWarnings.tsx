import {locale,translate,uiText} from './i18n.ts';

// Presentation only. Keep the model response and source evidence unchanged.
export function ModelWarnings({warnings}:{warnings:string[]}) {
 const language=locale();
 if(!warnings.length)return null;
 return <aside className="inbox-caution"><strong>{uiText('Зверніть увагу','Please check',language)}</strong>{warnings.map((warning,i)=>{
  const text=translate(warning,language);
  return <p key={i}>{text===warning&&(language==='et'||language==='uk'&&!/[А-Яа-яІіЇїЄєҐґ]/u.test(text))&&<span>{uiText('Пояснення моделі мовою оригіналу: ','Original model explanation: ',language)}</span>}{text}</p>;
 })}</aside>;
}
