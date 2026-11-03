import { validDate, validateFact } from './engine.ts';
import {dateEvidenceMatches} from './date-evidence.ts';
import type { Source, FactKind } from './engine.ts';
export type Candidate = { kind: FactKind; value: string; quote: string; day: string | null; dateQuote: string | null };
export type AnalysisInput = { requestId: string; provider?: 'meta' | 'fireworks'; source: Source; event: string; day: string; purpose?:'actions'; outputLanguage?:'en'|'uk'|'et' };
export type AnalysisMetrics = { elapsedMs:number; headersMs?:number; responseBytes?:number; promptTokens?:number; completionTokens?:number; totalTokens?:number; phase?:'headers'|'body'|'validation'; failure?:'timeout'|'network'|'response' };
export type AnalysisResult = { status: 'unavailable' | 'error'; reason: string; code: string; metrics?:AnalysisMetrics }
  | { status: 'ok'; candidates: Candidate[]; warnings: string[]; model: string; requestId: string; extractedAt: string; sourceId: string; sourceText: string; messageDate?: string; event: string; day: string; metrics?:AnalysisMetrics };
export type ProviderStatus = { configured: boolean; provider: 'meta' | 'fireworks'; model: string; csrf: string; remaining: number; verified: boolean };
const kinds = ['meeting', 'departure', 'task', 'item', 'dependency'];
const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseInput(raw: unknown): AnalysisInput {
  if (!record(raw) || !string(raw.requestId, 80) || !/^[a-zA-Z0-9-]+$/.test(raw.requestId) || !string(raw.event, 100) || !string(raw.day, 10) || !validDate(raw.day) || !record(raw.source)) throw new Error('Invalid analysis request.');
  if (raw.provider !== undefined && raw.provider !== 'meta' && raw.provider !== 'fireworks') throw new Error('Unknown provider.');
  if(raw.purpose!==undefined&&raw.purpose!=='actions')throw new Error('Unknown analysis purpose.');
  if(raw.outputLanguage!==undefined&&(typeof raw.outputLanguage!=='string'||!['en','uk','et'].includes(raw.outputLanguage)))throw new Error('Unsupported output language.');
  const s = raw.source;
  if (!string(s.id, 100) || !string(s.title, 100) || !string(s.text, 20000) || !string(s.lang, 20)) throw new Error('Provide a text source of up to 20,000 characters.');
  if(s.messageDate!==undefined&&(!string(s.messageDate,10)||!validDate(s.messageDate)))throw new Error('Invalid message date.');
  return { ...(raw.provider ? {provider:raw.provider} : {}), ...(raw.purpose?{purpose:raw.purpose}:{}), ...(raw.outputLanguage?{outputLanguage:raw.outputLanguage as 'en'|'uk'|'et'}:{}), requestId: raw.requestId, event: raw.event.trim(), day: raw.day, source: { id: s.id, title: s.title, text: s.text, lang: s.lang, ...(s.messageDate?{messageDate:s.messageDate as string}:{}) } };
}
export function parseCandidates(raw: unknown, source: Source): { candidates: Candidate[]; warnings: string[] } {
  if (!record(raw) || Object.keys(raw).some(k => !['candidates', 'warnings'].includes(k)) || !Array.isArray(raw.candidates) || raw.candidates.length > 30 || !Array.isArray(raw.warnings) || raw.warnings.length > 10 || raw.warnings.some(w => !string(w, 500))) throw new Error('The model returned an invalid response structure.');
  const seen = new Set<string>();
  const candidates = raw.candidates.map((v: unknown) => {
    if (!record(v) || Object.keys(v).sort().join(',') !== 'dateQuote,day,kind,quote,value' || !string(v.kind, 20) || !kinds.includes(v.kind) || !string(v.value, 200) || !string(v.quote, 2000)) throw new Error('The model returned an invalid fact.');
    if (v.day !== null && (!string(v.day, 10) || !validDate(v.day))) throw new Error('The model returned an invalid date.');
    if ((v.day === null && v.dateQuote !== null) || (v.day !== null && (!string(v.dateQuote, 500) || !source.text.includes(v.dateQuote) || !dateEvidenceMatches(v.day as string,v.dateQuote as string,source.messageDate)))) throw new Error('The date is not supported by an exact quote.');
    const c = v as Candidate;
    validateFact({ ...c, id: 'candidate', event: 'candidate', sourceId: source.id, minutes: 0 }, [source]);
    if (['meeting','departure'].includes(c.kind)) {
      const times = [...c.quote.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(m => `${m[1].padStart(2,'0')}:${m[2]}`);
      if (!times.includes(c.value)) throw new Error('The time was not found in the source quote.');
    }
    const key = JSON.stringify([c.kind,c.value,c.quote,c.day]);
    if (seen.has(key)) throw new Error('The model repeated a fact.');
    seen.add(key); return c;
  });
  return { candidates, warnings: raw.warnings as string[] };
}
export const extractionSchema = {
  type: 'object', additionalProperties: false, required: ['candidates','warnings'],
  properties: {
    candidates: { type: 'array', maxItems: 30, items: { type: 'object', additionalProperties: false,
      required: ['kind','value','quote','day','dateQuote'], properties: {
        kind: { type: 'string', enum: kinds }, value: { type: 'string' }, quote: { type: 'string' },
        day: { type: ['string','null'] }, dateQuote: { type: ['string','null'] },
      } } }, warnings: { type: 'array', maxItems: 10, items: { type: 'string' } },
  },
};
