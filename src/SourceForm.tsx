import {t as tr,locale} from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Source } from './engine.ts';
import type { DocumentImport, ExtractedDocument } from './document-contract.ts';
import { checkedText } from './document-contract.ts';
import { VoiceImport } from './VoiceImport.tsx';
import type { VoiceImport as VoiceMetadata } from './voice-contract.ts';
import { extractDocument } from './documents.ts';

export function SourceForm({ onSave, replaces }: { onSave: (source: Source) => void; replaces?:Source }) {
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState(locale()==='uk'?'UK':'EN');
  const [text, setText] = useState('');
  const [forceOCR, setForceOCR] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExtractedDocument | null>(null);
  const [provenance, setProvenance] = useState<DocumentImport | undefined>();
  const [reviewed, setReviewed] = useState(false);
  const [voice, setVoice] = useState<VoiceMetadata | undefined>();
  const [voiceBusy, setVoiceBusy] = useState(false), [voicePending, setVoicePending] = useState(false);
  const blocked = busy || voiceBusy;
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => { job.current?.abort(); job.current = null; }, []);
  async function importFile(file: File) {
    job.current?.abort();
    const controller = new AbortController(); job.current = controller;
    setBusy(true); setError(''); setProgress(tr("Reading file…")); setResult(null);
    try {
      const extracted = await extractDocument(file, lang, controller.signal, label => { if (job.current === controller) setProgress(label); }, forceOCR);
      if (job.current === controller && !controller.signal.aborted) setResult(extracted);
    } catch (e) { if (job.current === controller) setError(e instanceof Error ? e.message : tr("Could not read this file. Try another file or enter the text manually.")); }
    finally { if (job.current === controller) { setBusy(false); setProgress(''); job.current = null; } }
  }
  function useResult() {
    if (!result) return;
    setVoice(undefined); setText(result.text); if (!title.trim()) setTitle(result.filename.slice(0,100));
    setProvenance({ filename: result.filename, sha256: result.sha256, language: result.language, pages: result.pages, reviewed: true });
    setReviewed(false);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (blocked || voicePending || ((provenance || voice) && !reviewed) || (result && provenance?.sha256 !== result.sha256)) return;
    try { onSave({id:crypto.randomUUID(), title, lang, text:checkedText(text), ...(provenance ? {import:provenance} : {}), ...(voice ? {voice} : {})}); }
    catch (e) { setError((e as Error).message); }
  }
  return <form onSubmit={submit} className="source-form">
    {replaces&&<p className="notice">{tr("You are revising “")}{replaces.title}{tr("”. The previous text stays in history. Its facts will leave the current plan; review the revised timing before using it.")}</p>}
    <label>{tr("Title")}<input name="title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} placeholder={tr("For example, a school letter")}/></label>
    <label>{tr("Document language")}<select value={lang} onChange={e => {setLang(e.target.value);setVoicePending(false);setReviewed(false);}} disabled={blocked}><option>PL</option><option>UK</option><option>EN</option><option>RU</option></select></label>
    <section className="document-import" aria-label={tr("Document import")}>
      <strong>{tr("PDF or photo of a letter")}</strong>
      <p>{tr("Up to 15 MB and 5 PDF pages. Text extraction runs on this device. Importing does not send your document to an AI provider.")}</p>
      <label className="check-label"><input type="checkbox" checked={forceOCR} onChange={e => setForceOCR(e.target.checked)} disabled={blocked}/>{tr("Scanned PDF: run OCR on every page")}</label>
      <label>{tr("Choose document")}<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md" disabled={blocked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file); }}/></label>
      <small>{tr("TXT / Markdown: up to 80 KB. Printed text in EN / PL / UK / RU. Handwriting and HEIC are not supported yet.")}</small>
      {busy && <div role="status" aria-live="polite"><p>{progress}</p><button type="button" className="secondary" onClick={() => job.current?.abort()}>{tr("Cancel extraction")}</button></div>}
      {result && <div className="document-review">
        <h3>{tr("Check against the original")}</h3><p>{result.filename} {tr("· pages:")} {result.pages.length}</p>
        {result.warnings.map((warning,i) => <p className="import-warning" key={i}>{warning}</p>)}
        {result.pages.map((page,i) => <details key={page.number} open={result.pages.length === 1}>
          <summary>{tr("Page")} {page.number} · {page.method === 'ocr' ? 'OCR' : tr("Text layer")}</summary>
          {result.previews[i] && <img src={result.previews[i]} alt={tr("Original, page {0}", page.number)}/>}
          <pre>{page.text || tr("No text found")}</pre>
        </details>)}
        <button type="button" className="secondary" onClick={useResult}>{tr("Use extracted text")}</button>
        <button type="button" className="text-button" onClick={() => setResult(null)}>{tr("Close preview and keep the text below")}</button>
      </div>}
    </section>
    <VoiceImport key={lang} language={lang} disabled={busy} onBusy={setVoiceBusy} onPending={setVoicePending} onUse={value=>{setVoice(value);setProvenance(undefined);setResult(null);setText(value.rawText);setReviewed(false);if(!title.trim())setTitle(value.filename.slice(0,100));}}/>
    <label>{tr("Message text")}<textarea value={text} onChange={e => { setText(e.target.value); setReviewed(false); }} name="text" required maxLength={20000} rows={7} placeholder={tr("Paste text or use an imported document")} disabled={blocked}/></label>
    <small>{text.length} {tr("/ 20 000 characters. You can correct the extracted text.")}</small>
    {voice && <p className="import-note">{tr("Voice source:")} {voice.filename}{tr(". Only the transcript is saved, not the audio. Keep your original.")}</p>}
    {provenance && <p className="import-note">{tr("Source:")} {provenance.filename}{tr(". Text and page details are saved. The file and page images are not retained after closing this dialog; keep your original.")}</p>}
    {(provenance || voice) && <label className="check-label"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} required/>{tr("I checked the text, dates, and times against the original")}</label>}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" type="submit" disabled={blocked || voicePending || Boolean((provenance || voice) && !reviewed) || Boolean(result && provenance?.sha256 !== result.sha256)}>{tr("Save source")}</button>
  </form>;
}
