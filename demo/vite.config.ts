import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

// Static recorded-text demo only: no API plugin, credentials, or model assets.
export default defineConfig({
 root:fileURLToPath(new URL('..',import.meta.url)),
 base:'./',
 publicDir:false,
 plugins:[{name:'judge-entry',generateBundle(){this.emitFile({type:'asset',fileName:'index.html',source:'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./demo/chat.html?session=judge-chat-20261102&lang=en"><title>Tomorrow Ready</title><a href="./demo/chat.html?session=judge-chat-20261102&lang=en">Open the recorded school-message demo</a></html>'});}}],
 build:{outDir:'dist-demo',emptyOutDir:true,rolldownOptions:{input:{cycle:fileURLToPath(new URL('cycle.html',import.meta.url)),chat:fileURLToPath(new URL('chat.html',import.meta.url))}}},
 preview:{host:'127.0.0.1',port:4320,strictPort:true},
});
