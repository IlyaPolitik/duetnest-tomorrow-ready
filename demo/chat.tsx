import React from 'react';
import {createRoot} from 'react-dom/client';
import {ActionInbox} from '../src/ActionInbox.tsx';
import {locale} from '../src/i18n.ts';
import records from '../tests/fixtures/evaluation/final-chat-2026-11-02-recorded.json';
import type {AnalysisInput,AnalysisResult} from '../src/analysis-contract.ts';
import '../src/style.css';
// Exact fictional texts and unmodified successful provider answers; never calls an API.
async function analyze(input:AnalysisInput):Promise<AnalysisResult>{
 const r=Object.values(records).find(r=>r.sourceText===input.source.text);
 return r?{...r,sourceId:input.source.id,requestId:input.requestId} as AnalysisResult:{status:'error',code:'invalid_response',reason:'Use an exact supplied example; no model was called.'};
}
const language=locale();
const labels=language==='uk'?['1 · Переписка','2 · Зміна часу','3 · Скасування']:language==='et'?['1 · Vestlus','2 · Kellaaja muutus','3 · Ärajäämine']:['1 · Chat excerpt','2 · Time change','3 · Cancellation'];
const note=language==='uk'?'Дата навчальних повідомлень: 15 грудня 2026. Оригінал українською.':language==='et'?'Näidissõnumite kuupäev: 15. detsember 2026. Algtekst on ukraina keeles.':'Sample message date: 15 December 2026. Original chat is Ukrainian.';
createRoot(document.getElementById('root')!).render(<><p className="replay-label" style={{maxWidth:884,margin:'16px auto',padding:'12px'}}>{note}</p><ActionInbox recorded textOnlyReplay analyze={analyze} examples={Object.values(records).map((r,i)=>({label:labels[i],text:r.sourceText,kind:i?'update':'initial'}))}/></>);
