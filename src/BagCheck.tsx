import {t as tr,locale} from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import { tasks } from './engine.ts';
import type { Fact, State } from './engine.ts';
import { confirmPhotoItem, objectNames, parseObservations, requiresPersonalCheck, suggestions } from './bag-contract.ts';
import type { PhotoReview } from './bag-contract.ts';

type Photo = {url:string;hash:string;name:string;canvas:HTMLCanvasElement};
export function BagCheck({state,commit,showSource}:{state:State;commit:(s:State,message:string)=>void;showSource:(f:Fact)=>void}) {
  const [photo,setPhoto]=useState<Photo|null>(null);
  const [review,setReview]=useState<PhotoReview|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [dismissed,setDismissed]=useState<number[]>([]);
  const worker=useRef<Worker|null>(null), timer=useRef<ReturnType<typeof setTimeout>|null>(null), generation=useRef(0);
  const currentPhoto=useRef<Photo|null>(null);
  const items=tasks(state).filter(t=>t.kind==='item');
  function stop() {worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;}
  useEffect(()=>()=>{generation.current++;stop();if(currentPhoto.current){URL.revokeObjectURL(currentPhoto.current.url);currentPhoto.current.canvas.width=0;}},[]);
  function resetPhoto() {generation.current++;stop();setBusy(false);setReview(null);setDismissed([]);setError('');setMessage('');if(currentPhoto.current){URL.revokeObjectURL(currentPhoto.current.url);currentPhoto.current.canvas.width=0;}currentPhoto.current=null;setPhoto(null);}
  async function select(file:File) {
    resetPhoto(); const gen=generation.current;
    setBusy(true);setMessage(tr("Opening photo…"));
    let bitmap:ImageBitmap|undefined;
    try {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>8*1024*1024)throw new Error(tr("Choose JPG, PNG, or WebP up to 8 MB."));
      bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>24_000_000)throw new Error(tr("Image exceeds 24 megapixels. Resize it first."));
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(gen!==generation.current)return;
      const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const next={url:URL.createObjectURL(file),hash,name:file.name.slice(0,255),canvas}; currentPhoto.current=next;setPhoto(next);setMessage(tr("Photo ready. Find items or check them yourself."));
    } catch(e){if(gen===generation.current){setMessage('');setError(e instanceof Error?e.message:tr("Could not open this photo."));}}
    finally{bitmap?.close();if(gen===generation.current)setBusy(false);}
  }
  function analyze() {
    if(!photo||busy)return;
    stop();const gen=++generation.current;
    setBusy(true);setReview(null);setDismissed([]);setError('');setMessage(tr("Loading on-device model…"));
    const snapshot:PhotoReview={day:state.day,photoHash:photo.hash,filename:photo.name,fingerprints:items.map(t=>t.fingerprint),observations:[]};
    try {
      const w=new Worker(new URL('./bag-worker.ts',import.meta.url),{type:'module'});worker.current=w;
      const fail=(reason:string)=>{if(gen!==generation.current)return;stop();setBusy(false);setError(reason);setMessage('');};
      w.onerror=()=>fail(tr("Could not start recognition. You can check items manually."));
      w.onmessage=event=>{
        if(gen!==generation.current)return;
        if(event.data.status==='loading'){setMessage(tr("Loading on-device model…"));return;}
        if(event.data.status==='detecting'){setMessage(tr("Looking for familiar objects…"));return;}
        if(event.data.status==='error'){fail(event.data.reason);return;}
        try{const observations=parseObservations(event.data.observations);setReview({...snapshot,observations});setMessage(observations.length?tr("Suggestions ready. Check them against the photo and your list."):tr("No familiar objects recognized. This does not mean they are absent."));stop();setBusy(false);}catch{fail(tr("The result failed validation. Your checkmarks are unchanged."));}
      };
      timer.current=setTimeout(()=>fail(tr("Recognition exceeded one minute. Try another photo or check manually.")),60000);
      const pixels=photo.canvas.getContext('2d')!.getImageData(0,0,photo.canvas.width,photo.canvas.height);
      w.postMessage({pixels:pixels.data,width:pixels.width,height:pixels.height},[pixels.data.buffer]);
    }catch{stop();setBusy(false);setError(tr("Recognition did not start. Manual review is available."));}
  }
  function confirm(fingerprint:string) {
    if(!photo)return;
    try{commit(confirmPhotoItem(state,{day:state.day,photoHash:photo.hash,filename:photo.name,fingerprints:items.map(t=>t.fingerprint),observations:[]},fingerprint),tr("Item checked after your personal review. A photo cannot prove everything is packed."));}
    catch(e){setError((e as Error).message);}
  }
  const observations=review?.observations.filter((_,i)=>!dismissed.includes(i))??[];
  return <div className="plan-grid bag-check"><section className="panel photo-panel"><span className="eyebrow">{tr("CHECK AGAINST A PHOTO")}</span><h2>{tr("What is already packed?")}</h2><p>{tr("The photo stays on this device. A local model suggests familiar objects; you make the final decision.")}</p>
    {photo?<div className="bag-photo"><img src={photo.url} alt={tr("Photo of items for personal review")}/>{review?.observations.map((o,i)=>!dismissed.includes(i)&&<span key={i} className="object-box" style={{left:`${o.box[0]*100}%`,top:`${o.box[1]*100}%`,width:`${o.box[2]*100}%`,height:`${o.box[3]*100}%`}} aria-hidden="true"><b>{i+1}</b></span>)}</div>:<div className="photo-placeholder">{tr("Choose a photo of demo items")}</div>}
    <label className="photo-picker">{tr("Photo of items")}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void select(file);}}/></label>
    <div className="bag-actions"><button className="primary" disabled={!photo||busy} onClick={analyze}>{tr("Find items in photo")}</button>{busy&&<button className="secondary" onClick={()=>{generation.current++;stop();setBusy(false);setMessage(tr("Recognition cancelled. Checkmarks are unchanged."));}}>{tr("Cancel")}</button>}{photo&&<button className="text-button" onClick={resetPhoto}>{tr("Remove photo")}</button>}</div>
    {message&&<p role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}
    {review?.observations.map((o,i)=>!dismissed.includes(i)&&<div className="object-candidate" key={i}><span>{i+1}{tr(". Looks like")} {objectNames[o.kind]}{o.kind==='bottle'&&tr(". Contents are unknown.")}</span><button className="text-button" onClick={()=>{setDismissed([...dismissed,i]);if(dismissed.length+1===review.observations.length)setMessage(tr("Suggestions dismissed. Check the list yourself."));}}>{tr("Not this item ·")} {i+1}</button></div>)}
    <p className="rail-note">{tr("The model recognizes a limited set of objects. Check clothing, documents, signatures, and medication yourself. Photos and suggestions are cleared when you leave; your checkmarks are saved.")}</p>
  </section><section className="panel"><div className="panel-heading"><h2>{tr("Check every item")}</h2><span className="counter">{items.filter(t=>t.done).length}/{items.length}</span></div>
    {!items.length&&<p className="panel-empty">{tr("No items in this plan yet. Add an Item fact from a source; photo recognition does not create requirements.")}</p>}
    {items.map(task=>{
      const matches=review?.fingerprints.includes(task.fingerprint)?suggestions(task,observations):[];
      const hint=!photo?tr("Choose a photo or check the item in My day."):requiresPersonalCheck(task)?tr("Personal review only. A photo cannot establish correctness or safety."):matches.length?`A similar object is visible: ${matches.map(o=>objectNames[o.kind]).join(', ')}. Check whether it is the right item.`:review?tr("Not established from this photo. Check yourself; the item may be outside the frame."):tr("Check yourself or run photo recognition.");
      return <article className="bag-item" key={task.fingerprint}><strong>{task.label}</strong><p>{task.done?tr("Checked by you, not a model conclusion."):hint}</p>{state.photoChecks?.[task.fingerprint]&&task.done&&<small>{tr("Your photo review:")} {state.photoChecks[task.fingerprint].filename}</small>}<div><button className="source-link" onClick={()=>showSource(task.facts[0])}>{tr("Source ↗")}</button>{!task.done&&<button className="secondary" disabled={!photo||busy||task.blocked} onClick={()=>confirm(task.fingerprint)}>{tr("I checked and packed this")}</button>}{task.done&&<button className="text-button" onClick={()=>{const completed={...state.completed,[task.fingerprint]:false},photoChecks={...state.photoChecks};delete photoChecks[task.fingerprint];commit({...state,completed,photoChecks},tr("You unchecked this item."));}}>{tr("Uncheck")}</button>}</div></article>;
    })}<p className="rail-note">{tr("An unrecognized item is not considered missing. No task is completed automatically.")}</p>
  </section></div>;
}
