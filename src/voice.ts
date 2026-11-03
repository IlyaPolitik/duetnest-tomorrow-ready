import {monoSamples,validateDuration,validateVoiceFile,VOICE_LIMITS} from './voice-contract.ts';
export type PreparedVoice={samples:Float32Array<ArrayBuffer>;duration:number;filename:string;sha256:string};
function aborted(signal:AbortSignal){if(signal.aborted)throw new Error('Transcription cancelled. Your previous text is preserved.');}
export async function prepareVoice(file:File,signal:AbortSignal):Promise<PreparedVoice>{
 validateVoiceFile(file.name,file.size);aborted(signal);
 const url=URL.createObjectURL(file),audio=document.createElement('audio');
 try{
  await new Promise<void>((resolve,reject)=>{
   const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);audio.onloadedmetadata=null;audio.onerror=null;error?reject(error):resolve();};
   const abort=()=>finish(new Error('Transcription cancelled. Your previous text is preserved.'));
   const timer=setTimeout(()=>finish(new Error('Could not read the duration. Try WAV or MP3.')),15000);
   signal.addEventListener('abort',abort,{once:true});audio.onloadedmetadata=()=>finish();audio.onerror=()=>finish(new Error('Audio is damaged or uses an unsupported codec.'));audio.preload='metadata';audio.src=url;
  });
  validateDuration(audio.duration);aborted(signal);
  const bytes=await file.arrayBuffer();aborted(signal);
  const ctx=new OfflineAudioContext(1,1,VOICE_LIMITS.sampleRate);
  const decoded=await ctx.decodeAudioData(bytes.slice(0)).catch(()=>{throw new Error('Could not decode audio. Try WAV or MP3.');});
  aborted(signal);validateDuration(decoded.duration);
  const samples=monoSamples(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)));
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');aborted(signal);
  return {samples:samples as Float32Array<ArrayBuffer>,duration:decoded.duration,filename:file.name.slice(0,255),sha256};
 }finally{audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}
}
