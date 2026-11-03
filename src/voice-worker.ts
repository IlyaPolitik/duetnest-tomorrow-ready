import {env,pipeline} from '@huggingface/transformers';
import {transcriptText} from './voice-contract.ts';
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/voice-model/';env.useBrowserCache=false;
const wasm=env.backends.onnx.wasm!;wasm.numThreads=1;wasm.proxy=false;
wasm.wasmPaths={mjs:'/voice-runtime/ort-wasm-simd-threaded.mjs',wasm:'/voice-runtime/ort-wasm-simd-threaded.wasm'};
self.onmessage=async(event:MessageEvent<{samples:Float32Array;language:string}>)=>{
 let transcriber;
 try{
  self.postMessage({status:'loading'});
  transcriber=await pipeline('automatic-speech-recognition','whisper-base',{dtype:'q8',device:'wasm'});
  self.postMessage({status:'transcribing'});
  const language=({EN:'english',PL:'polish',UK:'ukrainian',RU:'russian'} as Record<string,string>)[event.data.language];
  if(!language)throw new Error('Unsupported language');
  const result=await transcriber(event.data.samples,{language,task:'transcribe',chunk_length_s:30,stride_length_s:5});
  if(Array.isArray(result))throw new Error('Unexpected batch');
  self.postMessage({status:'ok',text:transcriptText(result.text)});
 }catch(e){console.error('Local voice runtime:',e instanceof Error?e.message:'unavailable');self.postMessage({status:'error',message:'On-device transcription failed. Check the recording and model files; manual entry is available.'});}
 finally{await transcriber?.dispose();}
};
