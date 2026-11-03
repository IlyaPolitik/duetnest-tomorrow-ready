import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/';
const root = new URL('../public/bag-model/', import.meta.url);
const lockPath = new URL('./bag-model-lock.json',import.meta.url);
const lock = JSON.parse(await readFile(lockPath,'utf8'));
await mkdir(root,{recursive:true});
for (const [name,hash] of Object.entries(lock.files)) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Invalid model file');
  const target = new URL(name,root);
  let bytes;
  try { bytes=await readFile(target); } catch {}
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== hash) {
    const response=await fetch(base+name,{signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
    if(createHash('sha256').update(bytes).digest('hex')!==hash) throw new Error('Model checksum mismatch');
    await writeFile(target,bytes);
  }
}
console.log('Local bag model verified.');
