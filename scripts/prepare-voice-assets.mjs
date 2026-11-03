import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const lock=JSON.parse(await readFile(new URL('./voice-model-lock.json',import.meta.url),'utf8'));
const root=new URL('../public/voice-model/whisper-base/',import.meta.url);
for(const [name,hash] of Object.entries(lock.files)){
 if(!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.includes('..'))throw new Error('Invalid voice model path');
 const target=new URL(name,root);let bytes;try{bytes=await readFile(target);}catch{}
 if(!bytes||createHash('sha256').update(bytes).digest('hex')!==hash){
  const response=await fetch(`https://huggingface.co/${lock.model}/resolve/${lock.revision}/${name}`,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Voice model download failed: ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('Voice model checksum mismatch');
  await mkdir(new URL('.',target),{recursive:true});await writeFile(target,bytes);
 }
}
const runtime=new URL('../public/voice-runtime/',import.meta.url);await mkdir(runtime,{recursive:true});
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await copyFile(new URL('../node_modules/onnxruntime-web/dist/'+name,import.meta.url),new URL(name,runtime));
console.log('Local voice model and WASM ready.');
