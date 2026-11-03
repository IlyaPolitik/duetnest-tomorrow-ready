import React from 'react';
import {createRoot} from 'react-dom/client';
import {ActionInbox} from '../src/ActionInbox.tsx';
import {locale,translate} from '../src/i18n.ts';
import records from '../tests/fixtures/evaluation/holdout-2026-10-29-recorded.json';
import ukrainian from '../tests/fixtures/evaluation/uk-cycle-2026-11-02-recorded.json';
import type {AnalysisInput,AnalysisResult} from '../src/analysis-contract.ts';
import '../src/style.css';
// Replay ONLY exact fictional source texts. No API, key, model call or altered response.
async function analyze(input:AnalysisInput):Promise<AnalysisResult>{
 const r=[records.table,records.partial,records.cancel,ukrainian.first,ukrainian.update,ukrainian.cancel].find(r=>r.sourceText===input.source.text);
 return r?{...r,sourceId:input.source.id,requestId:input.requestId} as AnalysisResult:{status:'error',code:'invalid_response',reason:'Use an exact supplied demo letter; no model was called.'};
}
const language=locale(),uk=language==='uk';
const examples=[
 {label:uk?'1 · Перший лист':translate('1 · First message',language),text:uk?ukrainian.first.sourceText:records.table.sourceText,kind:'initial' as const},
 {label:uk?'2 · Зміна часу':translate('2 · Time change',language),text:uk?ukrainian.update.sourceText:records.partial.sourceText,kind:'update' as const},
 {label:uk?'3 · Скасування':translate('3 · Cancellation',language),text:uk?ukrainian.cancel.sourceText:records.cancel.sourceText,kind:'update' as const},
];
createRoot(document.getElementById('root')!).render(<ActionInbox analyze={analyze} recorded examples={examples} textOnlyReplay={import.meta.env.MODE==='judge'}/>);
