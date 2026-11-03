import {t as tr,locale} from './i18n.ts';
import {useEffect,useRef,useState} from 'react';
import {prepareVoice} from './voice.ts';
import type {PreparedVoice} from './voice.ts';
import {transcriptText,VOICE_LIMITS,VOICE_MODEL,VOICE_REVISION} from './voice-contract.ts';
import type {VoiceImport as VoiceMetadata} from './voice-contract.ts';
type Clip=PreparedVoice&{url:string};
export function VoiceImport({language,disabled,onUse,onBusy,onPending}:{language:string;disabled:boolean;onUse:(value:VoiceMetadata)=>void;onBusy:(busy:boolean)=>void;onPending:(pending:boolean)=>void}){
 const [clip,setClip]=useState<Clip|null>(null),[result,setResult]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),current=useRef<Clip|null>(null),controller=useRef<AbortController|null>(null),worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function stop(){controller.current?.abort();controller.current=null;worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;}
 function working(value:boolean){setBusy(value);onBusy(value);}
 function clear(){generation.current++;stop();if(current.current)URL.revokeObjectURL(current.current.url);current.current=null;setClip(null);setResult('');setError('');setStatus('');working(false);onPending(false);}
 useEffect(()=>()=>{generation.current++;stop();if(current.current)URL.revokeObjectURL(current.current.url);},[]);
 async function select(file:File){
  clear();const gen=generation.current,c=new AbortController();controller.current=c;working(true);onPending(true);setStatus(tr("Checking audio…"));
  try{const prepared=await prepareVoice(file,c.signal);if(gen!==generation.current)return;const next={...prepared,url:URL.createObjectURL(file)};current.current=next;setClip(next);setStatus(tr("Recording ready. Listen to it before starting transcription."));}
  catch(e){if(gen===generation.current){setError((e as Error).message);setStatus('');onPending(false);}}
  finally{if(gen===generation.current){controller.current=null;working(false);}}
 }
 function analyze(){
  if(!clip||busy||disabled)return;stop();const gen=++generation.current;working(true);onPending(true);setResult('');setError('');setStatus(tr("Loading on-device speech model…"));
  const fail=(message:string)=>{if(gen!==generation.current)return;stop();working(false);setError(message);setStatus('');onPending(false);};
  try{const w=new Worker(new URL('./voice-worker.ts',import.meta.url),{type:'module'});worker.current=w;
   w.onerror=()=>fail(tr("Could not start the speech model. Manual entry is available."));
   w.onmessage=e=>{if(gen!==generation.current)return;if(e.data.status==='loading')return;if(e.data.status==='transcribing'){setStatus(tr("Transcribing on this device…"));return;}if(e.data.status==='error'){fail(e.data.message);return;}
    try{setResult(transcriptText(e.data.text));setStatus(tr("Draft ready. Listen to the original: the model may omit or invent words."));stop();working(false);}catch(err){fail((err as Error).message);}
   };
   timer.current=setTimeout(()=>fail(tr("Transcription exceeded two minutes. Try a shorter recording or manual entry.")),VOICE_LIMITS.timeout);
   const samples=clip.samples.slice();w.postMessage({samples,language},[samples.buffer]);
  }catch{fail(tr("Transcription could not start. Manual entry is available."));}
 }
 return <section className="document-import voice-import" aria-label="Voice note"><strong>{tr("Voice note · experimental")}</strong><p>{tr("WAV, MP3, or M4A up to 60 seconds and 10 MB. Audio stays on this device. Language:")} {language}.</p>
 <label>{tr("Choose recording")}<input type="file" accept=".wav,.mp3,.m4a" disabled={disabled||busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void select(f);}}/></label>
 {clip&&<><p>{clip.filename} · {Math.round(clip.duration)} {tr("sec")}</p><audio controls preload="metadata" src={clip.url} aria-label={tr("Listen to the original voice note")}/><button type="button" className="secondary" onClick={analyze} disabled={busy||disabled}>{tr("Transcribe on device")}</button></>}
 {busy&&<button type="button" className="secondary" onClick={()=>{generation.current++;stop();working(false);onPending(false);setStatus(tr("Transcription cancelled. Your previous text is preserved."));}}>{tr("Cancel transcription")}</button>}
 {status&&<p role="status">{status}</p>}{error&&<p className="error" role="alert">{error}</p>}
 {result&&clip&&<div className="document-review"><h3>{tr("Draft transcript")}</h3><pre>{result}</pre><p>{tr("Check dates, times, names, and negations carefully. Edit the text below if needed.")}</p><button type="button" className="secondary" disabled={busy||disabled} onClick={()=>{onUse({filename:clip.filename,sha256:clip.sha256,duration:clip.duration,language,rawText:result,model:VOICE_MODEL,revision:VOICE_REVISION,reviewed:true});onPending(false);setStatus(tr("Text copied below. Correct any errors and confirm your review."));}}>{tr("Use transcript")}</button></div>}
 {(clip||result)&&<button type="button" className="text-button" onClick={clear}>{tr("Remove audio and keep the text below")}</button>}
 <small>{tr("Audio is available until this dialog closes. Only reviewed text and transcript details are saved. Use fictional recordings.")}</small></section>;
}
