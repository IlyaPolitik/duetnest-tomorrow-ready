import {t as tr,locale} from './i18n.ts';
import { useRef, useState } from 'react';
import type { Source, State } from './engine.ts';
import type { AnalysisResult, ProviderStatus } from './analysis-contract.ts';
import { metaAnalyzer, providerStatus } from './provider.ts';
import { acceptCandidate, acceptCandidateGroup, candidateReviewGroup } from './review.ts';

export function AnalysisPanel({ source, state, commit, onStatus, status }: { source:Source; state:State; commit:(s:State, message:string)=>void; onStatus:(s:ProviderStatus)=>void; status:ProviderStatus|null }) {
  const [event, setEvent] = useState(source.review?.event ?? state.facts.find(f => f.sourceId === source.id)?.event ?? state.facts.find(f => f.sourceId === source.supersedes)?.event ?? tr("School trip"));
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const [result, setResult] = useState<AnalysisResult|null>(null);
  const [confirmedDates, setConfirmedDates] = useState<Record<number,boolean>>({});
  const [error,setError] = useState('');
  const recipient = status?.provider === 'fireworks' ? tr("Fireworks (Meta model, US servers)") : 'Meta Model API';
  const replaced = state.sources.some(s => s.supersedes === source.id);
  async function analyze() {
    if (lock.current || replaced || !event.trim() || !status) return;
    lock.current = true; setBusy(true); setError(''); setResult(null); setConfirmedDates({});
    try { setResult(await metaAnalyzer.analyze({requestId:crypto.randomUUID(),provider:status.provider,source,event:event.trim(),day:state.day})); }
    finally { lock.current = false; setBusy(false); providerStatus().then(onStatus).catch(() => {}); }
  }
  return <section className="analysis-panel" aria-busy={busy}>
    <h3>{tr("Analyze with Meta")}</h3>
    <p>{tr("Sent to:")} <strong>{recipient}</strong>{tr(". Only this source text, event name, and selected date will be sent. Use fictional documents. Review every fact before adding it to your plan.")}</p>
    <p>{status?.configured ? tr("Key configured. Requests left in this session: {0}.", status.remaining) : tr("No dedicated key configured yet. You can still add facts manually.")}</p><button className="text-button" disabled={busy} onClick={() => providerStatus().then(onStatus).catch(() => setError(tr("Provider status is unavailable.")))}>{tr("Refresh connection status")}</button>
    <label>{tr("Event to analyze")}<input maxLength={100} value={event} disabled={busy} onChange={e => setEvent(e.target.value)}/></label>
    <button className="primary" onClick={analyze} disabled={busy || replaced || !event.trim() || !status?.configured || status.remaining === 0}>{busy ? tr("Meta is analyzing the document…") : tr("Send text to {0}", status?.provider === 'fireworks' ? 'Fireworks' : 'Meta')}</button>
    {busy && <p role="status">{tr("Allow up to 75 seconds. Keep this source open until the result arrives.")}</p>}
    {result && result.status !== 'ok' && <p className="error" role="alert">{result.reason}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {result?.status === 'ok' && <div className="analysis-results">
      <p role="status">{tr("Response received from")} {result.model}{tr(". Candidates:")} {result.candidates.length}{tr(". Nothing was added automatically.")}</p>
      {result.warnings.map((w,i) => <p className="notice" key={i}>{w}</p>)}
      {!result.candidates.length && <p>{tr("No explicit requirements found. You can add a fact manually.")}</p>}
      {result.candidates.map((c,i) => {
        const accepted = state.facts.some(f => f.sourceId === source.id && f.event === result.event && f.kind === c.kind && f.value === c.value && f.quote === c.quote);
        const otherDay = c.day !== null && c.day !== state.day;
        const group=candidateReviewGroup(result,i), grouped=group.length>1;
        const groupReady=group.every(n=>confirmedDates[n] && (result.candidates[n].day===null || result.candidates[n].day===state.day));
        const groupAccepted=group.every(n=>state.facts.some(f=>f.sourceId===source.id && f.event===result.event && f.kind===result.candidates[n].kind && f.value===result.candidates[n].value && f.quote===result.candidates[n].quote));
        return <article className="candidate" key={i}><strong>{tr(c.value)}</strong><blockquote>{c.quote}</blockquote><p>{c.day ? tr("Date suggested by Meta: {0}. Quote: {1}", c.day, c.dateQuote) : tr("The full date could not be established. Check the original; the planning day is not evidence.")}</p>
          {otherDay && <p className="error">{tr("This fact belongs to another day and cannot be added to this plan.")}</p>}
          {!otherDay && <label className="date-confirm"><input type="checkbox" checked={!!confirmedDates[i]} onChange={e => setConfirmedDates({...confirmedDates,[i]:e.target.checked})}/>{tr("I confirm this applies to")} {state.day}</label>}
          {grouped ? <>
            <p className="notice">{tr("This answer contains conflicting times or dates. Review every alternative below. Add them together to keep the conflict visible; the calculation stays blocked until you resolve it. Different dates need clarification in the source first.")}</p>
            {i===group[0] && <button className="secondary" disabled={groupAccepted || !groupReady || replaced} onClick={()=>{try{commit(acceptCandidateGroup(state,result,i,confirmedDates),tr("Conflicting alternatives added together. Resolve them before calculating."));setError('');}catch(e){setError((e as Error).message);}}}>{groupAccepted?tr("Alternatives in your plan"):tr("Reviewed all — add conflicting alternatives")}</button>}
          </> : <button className="secondary" disabled={accepted || otherDay || !confirmedDates[i] || replaced} onClick={() => { try { commit(acceptCandidate(state,result,i,!!confirmedDates[i]),tr("You reviewed and added this Meta suggestion.")); setError(''); } catch(e) {setError((e as Error).message);} }}>{accepted ? tr("In your plan") : tr("Reviewed — add to plan")}</button>}
        </article>;
      })}
      <small>{tr("An exact quote does not guarantee the interpretation is correct. Default action estimate: 2 minutes.")}</small>
    </div>}
  </section>;
}
