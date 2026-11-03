import {ActionInbox} from './ActionInbox.tsx';
import {t as tr,locale,languageUrl} from './i18n.ts';
import {storageKey,browserSearch} from './storage-scope.ts';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { addFact, addSource, conflicts, emptyState, resolveConflict, tasks, toggleTask } from './engine.ts';
import type { Fact, FactKind, Source, State, Task } from './engine.ts';
import { initialPlans, parsePlans, savePlan, selectDay } from './plans.ts';
import type { Plans } from './plans.ts';
import { applyDemoUpdate, demoState } from './fixtures.ts';
import { providerStatus } from './provider.ts';
import type { ProviderStatus } from './analysis-contract.ts';
import { AnalysisPanel } from './AnalysisPanel.tsx';
import { SourceForm } from './SourceForm.tsx';
import { SourceChanges } from './SourceChanges.tsx';
import { BagCheck } from './BagCheck.tsx';
import { Rehearsal } from './Rehearsal.tsx';
import { StoryDemo } from './StoryDemo.tsx';
import './style.css';

const STORAGE = storageKey('duetnest-meta-hackathon:readiness:v1',browserSearch());
type View = 'plan' | 'sources' | 'bag';
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    plan: <><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 2v4m8-4v4M4 10h16M8 14h3m-3 3h6"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8m-8 4h5"/></>,
    bag: <><rect x="4" y="8" width="16" height="14" rx="3"/><path d="M8 8V6a4 4 0 0 1 8 0v2M8 14h8v5H8z"/></>,
    check: <path d="m5 12 4 4L19 6"/>, plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    alert: <><path d="m12 3 10 18H2zM12 9v5m0 3v1"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
function load() { try { return { plans: parsePlans(localStorage.getItem(STORAGE)), error: '' }; } catch { return { plans: initialPlans(), error: tr("The saved plan could not be read. The original record is unchanged. You can open a new demo plan.") }; } }
function App() {
  const [initial] = useState(load);
  const [plans, setPlans] = useState<Plans>(initial.plans);
  const state = plans.days[plans.activeDay];
  const [dayDraft, setDayDraft] = useState(state.day);
  const [view, setView] = useState<View>('plan');
  const [notice, setNotice] = useState(initial.error);
  const [saveError, setSaveError] = useState('');
  const [replacement, setReplacement] = useState<string|null>(null);
  const [modal, setModal] = useState<'source' | 'fact' | null>(null);
  const [focusSource, setFocusSource] = useState<string | null>(null);
  const [inputError, setInputError] = useState('');
  const [metaStatus,setMetaStatus] = useState<ProviderStatus|null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const taskList = tasks(state), conflictList = conflicts(state);
  const unresolved = conflictList.filter(c => !c.resolved);
  const actionable = taskList.filter(t => t.kind !== 'dependency');
  const done = actionable.filter(t => t.done).length;
  const remaining = actionable.filter(t => !t.done).reduce((n, t) => n + t.minutes, 0);
  const dependencyCount = taskList.filter(t => t.kind === 'dependency').length;
  const selectedSource = state.sources.find(s => s.id === focusSource) ?? state.sources.at(-1);
  const hasDemo = state.sources.some(s => s.id === 'school-v1');
  const updated = state.sources.some(s => s.id === 'school-v2');
  const dayLabel = new Intl.DateTimeFormat(locale()==='uk'?'uk-UA':'en-GB', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${state.day}T12:00:00Z`));
  function persist(next: Plans, message = '') {
    setPlans(next); setNotice(message);
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); setSaveError(''); } catch { setSaveError(tr("Your browser could not save these changes. Keep this tab open to retain your plan.")); }
  }
  function commit(next: State, message = '') { persist(savePlan(plans, next), message); }
  function openDay(day: string) {
    try { persist(selectDay(plans, day), tr("Opened a separate day. Your other plans are saved.")); setFocusSource(null); }
    catch (error) { setNotice((error as Error).message); }
  }
  useEffect(() => { setDayDraft(state.day); }, [state.day]);
  useEffect(() => { if (modal) modalRef.current?.showModal(); else modalRef.current?.close(); }, [modal]);
  function showSource(f: Fact) { setFocusSource(f.sourceId); setView('sources'); }
  function changeTask(t: Task) { try { commit(toggleTask(state, t.fingerprint), t.done ? tr("Marked as not done.") : tr("Marked done by you.")); } catch (e) { setNotice((e as Error).message); } }
  function loadDemo() {
    const demo = demoState();
    const existing = plans.days[demo.day];
    const selected = selectDay(plans, demo.day);
    if (existing && (existing.sources.length || existing.facts.length)) persist(selected, tr("Opened your saved plan for October 27. Your data is preserved."));
    else persist(savePlan(selected, demo), tr("Opened the fictional October 27 scenario. These facts were prepared in advance, not generated by AI."));
    setFocusSource(null); setView('plan');
  }
  useEffect(() => { providerStatus().then(setMetaStatus).catch(() => {}); }, []);
  function exportPlan() {
    const content = [`DuetNest · My preparation plan`, dayLabel, tr("Fictional local demo plan"), '', ...taskList.map(t => `${t.done ? '[x]' : '[ ]'} ${t.label}${t.blocked ? ' — needs clarification' : ''}`), '', tr("Checkmarks record your confirmation, not proof of physical readiness.")].join('\n');
    const blob = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = blob; a.download = `duetnest-${state.day}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(blob), 1000);
  }
  function TaskRow({ task }: { task: Task }) {
    return <div className={`task ${task.done ? 'done' : ''}`}>
      <button className="tick" aria-label={`${task.done ? tr("Uncheck") : tr("Check")}: ${tr(task.label)}`} aria-pressed={task.done} disabled={task.blocked} onClick={() => changeTask(task)}>{task.done && <Icon name="check" size={17}/>}</button>
      <div className="task-copy"><span>{tr(task.label)}</span><div className="task-meta"><button className="source-link" onClick={() => showSource(task.facts[0])}>{tr("Source ↗")}</button>{task.needsRecheck && <span className="recheck">{tr("Review after the change")}</span>}{task.blocked && <span>{tr("Clarify first")}</span>}</div></div>
      {task.minutes > 0 && <span className="duration">~{task.minutes}{tr("min")}</span>}
    </div>;
  }
  function submitFact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    try {
      const fact: Fact = { id: crypto.randomUUID(), sourceId: String(f.get('source')), event: String(f.get('event')), kind: String(f.get('kind')) as FactKind, quote: String(f.get('quote')), value: String(f.get('value')), minutes: Number(f.get(tr("minutes"))) };
      commit(addFact(state, fact), tr("You added a fact with an exact source quote.")); setModal(null); setInputError('');
    } catch (e) { setInputError((e as Error).message); }
  }
  return <div className="shell">
    <a className="skip" href="#main">{tr("Skip to content")}</a>
    <aside className="sidebar">
      <a href="#" className="brand" onClick={e => { e.preventDefault(); setView('plan'); }}><span className="monogram">dn</span><span>DuetNest<small>{tr("META HACKATHON · LAB")}</small></span></a>
      <div className="workspace"><span className="workspace-dot"/>{tr("Your space")}<small>{tr("Your day, your decisions")}</small></div>
      <nav aria-label={tr("Navigation")}>
        <button aria-current={view === 'plan' ? 'page' : undefined} onClick={() => setView('plan')}><Icon name="plan"/>{tr("My day")}{unresolved.length > 0 && <span className="nav-count">{unresolved.length}</span>}</button>
        <button aria-current={view === 'sources' ? 'page' : undefined} onClick={() => setView('sources')}><Icon name="file"/>{tr("Sources")}<span className="nav-count quiet">{state.sources.length}</span></button>
        <button aria-current={view === 'bag' ? 'page' : undefined} onClick={() => setView('bag')}><Icon name="bag"/>{tr("Check my bag")}</button>
      </nav>
      <div className="sidebar-note"><Icon name="sun" size={27}/><p>{tr("Less to remember.")}<br/>{tr("More room for life.")}</p><small>{tr("One prepared day")}<br/>{tr("starts with you.")}</small></div>
      <div className="local-status"><span/>{tr("Local prototype")}<small>{tr("Fictional data only")}</small></div>
    </aside>
    <main id="main">
      <header className="topbar"><span>Tomorrow Ready <span className="slash">/</span> {view === 'plan' ? tr("My day") : view === 'sources' ? tr("Sources") : tr("Bag check")}</span><span className="provider-status">{metaStatus?.provider === 'fireworks' && 'Fireworks · '}{metaStatus?.verified ? tr("Meta: live response verified") : metaStatus?.configured ? tr("Meta: key configured") : metaStatus ? tr("Meta: key needed") : tr("Meta: status unavailable")}</span></header>
      <div className="content">
        <div className="page-heading"><div><p className="eyebrow">{tr("YOUR PERSONAL PLAN")}</p><h1>{view === 'plan' ? tr("Make room for tomorrow.") : view === 'sources' ? tr("Every fact has a source.") : tr("Everything you need, ready.")}</h1><p className="subheading">{view === 'plan' ? tr("Prepare what matters today. Make tomorrow morning easier.") : view === 'sources' ? tr("The original messages and exact quotes behind your plan.") : tr("Check your things and confirm each item yourself.")}</p></div>
          <button className="primary" onClick={() => { setInputError(''); setReplacement(null); setModal('source'); }}><Icon name="plus"/>{tr("Add source")}</button>
        </div>
        <div className="demo-banner"><span><strong>{tr("Demo lab.")}</strong> {tr("The built-in example has prepared facts. Run a live document analysis from Sources.")}</span>{!state.sources.length && <button onClick={loadDemo}>{tr("Open demo")} <Icon name="arrow" size={16}/></button>}</div>
        <a className="demo-entry" href="#demo"><div><span>{tr("MEET TOMORROW READY")}</span><strong>{tr("A small change. A whole different morning.")}</strong><small>{tr("Play the interactive story · fictional example")}</small></div><b aria-hidden="true">↗</b></a><a className="lab-entry" href="#rehearsal">{tr("Rehearse your morning →")}</a>
        {notice && <div className="notice" role="status">{notice}</div>}{saveError && <div className="error" role="alert">{saveError}</div>}
        {view === 'plan' && <>
          <div className="overview">
            <section className="day-card"><div><span className="eyebrow light">{tr("YOUR DAY")}</span><h2>{dayLabel}</h2><p>{state.sources.length ? tr("{0} of {1} actions checked by you", done, actionable.length) : tr("Your plan is empty. Start with one message.")}</p></div><div className="sun-art"><Icon name="sun" size={58}/></div>
              <form className="day-controls" onSubmit={e => { e.preventDefault(); openDay(dayDraft); }}><label>{tr("Date")}<input type="date" value={dayDraft} onChange={e => setDayDraft(e.target.value)} onInput={e => setDayDraft(e.currentTarget.value)} required aria-label={tr("Plan date")}/></label><button className="secondary" type="submit" disabled={dayDraft === state.day}>{tr("Open day")}</button><label>{tr("Preparation budget")}<select value={state.budget} onChange={e => commit({ ...state, budget: Number(e.target.value) })}>{[10, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n} {tr("minutes")}</option>)}</select></label></form><label className="saved-days">{tr("Saved days")}<select aria-label={tr("Saved days")} value={state.day} onChange={e => openDay(e.target.value)}>{Object.keys(plans.days).sort().map(day => <option key={day} value={day}>{day}</option>)}</select></label>
            </section>
            <section className="progress-card"><div className="progress-title"><Icon name="clock"/><span>{tr("Preparation")}</span></div><strong>{remaining}<small>{tr("min")}</small></strong><p>{tr("Estimated time for remaining actions")}</p><div className="progress-track"><span style={{ width: `${actionable.length ? done / actionable.length * 100 : 0}%` }}/></div><small>{remaining > state.budget ? tr("{0} min over your budget. All tasks remain visible.", remaining - state.budget) : tr("{0} min available · times are estimates", state.budget)}</small></section>
          </div>
          {!state.sources.length ? <section className="empty"><Icon name="file" size={36}/><h2>{tr("One message is enough to start.")}</h2><p>{tr("Try a school trip: a Polish letter, a calendar entry, and a Ukrainian note.")}</p><button className="primary" onClick={loadDemo}>{tr("Try the school trip")} <Icon name="arrow"/></button><span>{tr("No signup or second account needed")}</span></section> : <div className="plan-grid"><div>
            {state.sources.filter(s=>!state.sources.some(x=>x.supersedes===s.id) && (s.supersedes || s.review?.status==='cancelled')).map(s=><SourceChanges key={s.id} state={state} source={s} onOpen={()=>{setFocusSource(s.id);setView('sources');}}/>)}
            {conflictList.map(c => <section className={`conflict ${c.resolved ? 'resolved' : ''}`} key={c.key}><div className="section-label"><Icon name={c.resolved ? 'check' : 'alert'}/><strong>{c.resolved ? tr("Time selected for your plan") : tr("Check the time first")}</strong><span>{c.resolved ? tr("Your decision") : tr("Conflicting sources")}</span></div><p>{tr("The sources show different times for")} {c.facts[0].kind === 'meeting' ? 'meeting' : 'departure'}{tr(". Check the originals before choosing one.")}</p><div className="time-options">{c.facts.map(f => <button key={f.id} aria-pressed={c.selected === f.id} onClick={() => commit(resolveConflict(state, c.key, f.id), tr("Time selected for your personal plan only."))}><strong>{f.value}</strong><span>{state.sources.find(s => s.id === f.sourceId)?.title}</span>{c.selected === f.id && <Icon name="check" size={18}/>}</button>)}</div><button className="text-button" onClick={() => showSource(c.facts[0])}>{tr("View the original and quote ↗")}</button></section>)}
            <section className="panel"><div className="panel-heading"><div><span className="eyebrow">{tr("WITHIN MY CONTROL")}</span><h2>{tr("Prepare ahead")}</h2></div><span className="counter">{done}/{actionable.length}</span></div>
              {actionable.length ? actionable.map(t => <React.Fragment key={t.id}>{TaskRow({ task: t })}</React.Fragment>) : <p className="panel-empty">{tr("Open a source and add a fact to create your first action.")}</p>}
              <div className="panel-footer"><span>{tr("Only you can mark tasks done")}</span><button className="text-button" onClick={exportPlan} disabled={!taskList.length}>{tr("Download plan ↓")}</button></div>
            </section>
          </div><aside className="right-rail">
            <section className="panel dependencies"><div className="panel-heading"><div><span className="eyebrow">{tr("OPEN QUESTIONS")}</span><h2>{dependencyCount ? tr("Needs clarification") : tr("No open dependencies")}</h2></div><span className="counter">{dependencyCount}</span></div>{taskList.filter(t => t.kind === 'dependency').map(t => <div className="dependency" key={t.id}><span className="question">?</span><div><strong>{t.label}</strong><button className="source-link" onClick={() => showSource(t.facts[0])}>{tr("Open source ↗")}</button></div></div>)}<p className="rail-note">{dependencyCount ? tr("These questions stay open. You can still prepare everything else.") : tr("No dependencies in your reviewed facts. Unreviewed sources may contain more.")}</p></section>
            <section className="source-summary"><span className="eyebrow">{tr("BEHIND YOUR PLAN")}</span><h3>{tr("Your sources:")} {state.sources.length}</h3>{state.sources.map(s => <button key={s.id} onClick={() => { setFocusSource(s.id); setView('sources'); }}><span className="lang">{s.lang}</span><span>{s.title}</span><Icon name="arrow" size={15}/></button>)}</section>
            {hasDemo && <section className="update-card"><span className="eyebrow">{tr("TRY A CHANGE")}</span><p>{tr("What if the school changes the meeting time?")}</p><button className="secondary" disabled={updated} onClick={() => { try { commit(applyDemoUpdate(state), 'New letter: meet at 07:40, depart at 07:55. Review the timing; unchanged checkmarks are preserved.'); } catch (e) { setNotice((e as Error).message); } }}>{updated ? tr("Update already added") : tr("Add demo update")}<Icon name="arrow" size={16}/></button></section>}
          </aside></div>}
        </>}
        {view === 'sources' && <div className="sources-layout"><section className="source-list"><h2>{tr("My sources")}</h2>{state.sources.map(s => <button className={s.id === selectedSource?.id ? 'selected' : ''} key={s.id} onClick={() => setFocusSource(s.id)}><span className="lang">{s.lang}</span><span>{s.title}<small>{state.sources.some(x => x.supersedes === s.id) ? tr("Replaced · kept in history") : tr("Current version")}</small></span></button>)}{!state.sources.length && <p>{tr("Add a fictional message or open the demo.")}</p>}</section>
          {selectedSource && <section className="panel original"><div className="panel-heading"><div><span className="eyebrow">{selectedSource.import || selectedSource.voice ? tr("REVIEWED TEXT") : tr("ORIGINAL")} · {selectedSource.lang}</span><h2>{selectedSource.title}</h2></div><Icon name="file"/></div><pre>{selectedSource.text}</pre>{selectedSource.import && <div className="import-provenance"><p>{tr("File:")} {selectedSource.import.filename} {tr("· pages:")} {selectedSource.import.pages.length} {tr("· text reviewed by you. Keep the original file.")}</p><details><summary>{tr("Extracted text by page")}</summary>{selectedSource.import.pages.map(page => <section key={page.number}><h4>{tr("Page")} {page.number} · {page.method === 'ocr' ? 'OCR, review for errors' : tr("Text layer")}</h4><pre>{page.text || tr("No text found")}</pre></section>)}</details></div>}{selectedSource.voice && <div className="import-provenance"><p>{tr("Audio:")} {selectedSource.voice.filename} · {Math.round(selectedSource.voice.duration)} {tr("sec · text reviewed by you. Audio is not stored.")}</p><details><summary>{tr("Original draft transcript, may contain errors")}</summary><pre>{selectedSource.voice.rawText}</pre><small>{tr("Local model:")} {selectedSource.voice.model}</small></details></div>}<div className="source-actions"><button className="secondary" onClick={() => { setInputError(''); setModal('fact'); }} disabled={state.sources.some(s => s.supersedes === selectedSource.id)}>{tr("Add fact manually")}</button><button className="secondary" disabled={state.sources.some(s=>s.supersedes===selectedSource.id)} onClick={()=>{setReplacement(selectedSource.id);setInputError('');setModal('source');}}>{tr("Add revised source")}</button></div><AnalysisPanel key={`${state.day}:${selectedSource.id}`} source={selectedSource} state={state} commit={commit} onStatus={setMetaStatus} status={metaStatus}/><SourceChanges key={`review:${selectedSource.id}`} state={state} source={selectedSource} commit={commit}/><h3>{tr("Facts and exact quotes")}</h3>{state.facts.filter(f => f.sourceId === selectedSource.id).map(f => <div className="fact" key={f.id}><strong>{f.value}</strong><blockquote>{f.quote}</blockquote><small>{f.event} · {f.provenance ? tr("Meta {0} · reviewed by you", f.provenance.model) : ['school-v1','school-v2','calendar','note'].includes(f.sourceId) ? tr("Prepared demo example") : tr("Entered by you")}</small></div>)}{!state.facts.some(f => f.sourceId === selectedSource.id) && <p className="rail-note">{tr("No facts yet. Copy an exact quote from the original and add its meaning.")}</p>}</section>}
        </div>}
        {view === 'bag' && <BagCheck key={state.day} state={state} commit={commit} showSource={showSource}/>}
        <footer className="footnote"><span>DuetNest · Tomorrow Ready</span><button className="text-button" onClick={() => { if (window.confirm(tr("Clear this day? Your other days will stay saved."))) { commit({ ...emptyState(), day: state.day }, tr("This day has been cleared.")); setView("plan"); } }}>{tr("Clear this day")}</button><span>{saveError ? tr("Saving unavailable") : tr("Changes saved in this browser")} {tr("· You choose when to call Meta")}</span></footer>
      </div>
    </main>
    <dialog ref={modalRef} onCancel={() => { setModal(null); setInputError(''); }} aria-labelledby="modal-title">
      <button className="close" aria-label={tr("Close dialog")} onClick={() => { setModal(null); setInputError(''); }}>×</button>
      <h2 id="modal-title">{modal === 'source' ? replacement ? tr("Revised source") : tr("Add source") : tr("Fact from source")}</h2><p>{tr("Use fictional data only. After saving, you can choose to send the text for AI analysis.")}</p>
      {modal === 'source' ? <SourceForm replaces={replacement?state.sources.find(s=>s.id===replacement):undefined} onSave={source => {
        commit(addSource(state, replacement?{...source,supersedes:replacement}:source), replacement?tr("Revision saved. Review the timing again; the previous source remains in history."):tr("Source saved. Add facts manually or choose to analyze with Meta."));
        setFocusSource(source.id); setModal(null); setView('sources');
      }}/> : modal === 'fact' && <form onSubmit={submitFact}><input type="hidden" name="source" value={selectedSource?.id}/><label>{tr("Event")}<input name="event" required defaultValue="School trip" maxLength={100}/></label><label>{tr("Type")}<select name="kind"><option value="task">{tr("Action")}</option><option value="item">{tr("Item")}</option><option value="meeting">{tr("Meeting time")}</option><option value="departure">{tr("Departure time")}</option><option value="dependency">{tr("Needs clarification")}</option></select></label><label>{tr("Value / action")}<input name="value" required maxLength={200} placeholder={tr("Action or time HH:MM")}/></label><label>{tr("Exact quote")}<textarea name="quote" rows={3} required placeholder={tr("Copy a passage from the original without changing it")}/></label><label>{tr("Estimated preparation, minutes")}<input name="minutes" type="number" min="0" max="120" defaultValue="2" required/></label>{inputError && <p className="error" role="alert">{inputError}</p>}<button className="primary" type="submit">{tr("Add fact")}</button></form>}
    </dialog>
  </div>;
}
function Root() {
  const [route, setRoute] = useState(location.hash);
  const rehearsal=['#rehearsal', '#rehearsal-main', '#meeting-evidence'].includes(route);
  const demo=['#demo', '#demo-main'].includes(route);
  useEffect(() => { const change = () => setRoute(location.hash); addEventListener('hashchange', change); return () => removeEventListener('hashchange', change); }, []);
  useEffect(() => { document.title = rehearsal ? 'Tomorrow Ready · DuetNest' : 'Tomorrow Ready · DuetNest'; document.documentElement.lang = locale(); }, [rehearsal]);
  return <>{(demo||rehearsal||['#lab','#main'].includes(route))&&<nav className="language-bar" aria-label="Мова / Language"><span>Мова / Language</span><a href={languageUrl('uk')} aria-current={locale()==='uk'?'true':undefined}>Українська</a><a href={languageUrl('en')} aria-current={locale()==='en'?'true':undefined}>English</a>{locale()==='uk'&&<small>Цитати зберігаються мовою оригіналу.</small>}</nav>}{demo ? <StoryDemo/> : rehearsal ? <Rehearsal/> : ['#lab','#main'].includes(route) ? <App/> : <ActionInbox/>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>);
