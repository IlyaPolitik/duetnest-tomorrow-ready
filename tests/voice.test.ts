import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVoiceFile,validateDuration,monoSamples,transcriptText,validateVoice,VOICE_MODEL,VOICE_REVISION} from '../src/voice-contract.ts';
import type {VoiceImport} from '../src/voice-contract.ts';
import {addFact,addSource,emptyState,parseState} from '../src/engine.ts';
import {parseInput} from '../src/analysis-contract.ts';
const voice:VoiceImport={filename:'synthetic.wav',sha256:'b'.repeat(64),duration:8,language:'EN',rawText:'To moralize start work at 9.',model:VOICE_MODEL,revision:VOICE_REVISION,reviewed:true};
test('audio limits reject unsupported, oversized, empty and long files without truncating',()=>{
 validateVoiceFile('Note.WAV',100);validateDuration(60);
 for(const [name,size] of [['a.wav',0],['a.wav',10*1024*1024+1],['a.exe',100]] as const)assert.throws(()=>validateVoiceFile(name,size));
 for(const duration of [0,NaN,Infinity,-1,60.01])assert.throws(()=>validateDuration(duration));
});
test('mono conversion preserves signal, rejects silence and malformed samples before recognition',()=>{
 assert.deepEqual([...monoSamples([new Float32Array([.5,-.5]),new Float32Array([.25,-.25])])],[.375,-.375]);
 assert.throws(()=>monoSamples([new Float32Array(16000)]));
 assert.throws(()=>monoSamples([new Float32Array([NaN])]));
 assert.throws(()=>monoSamples([new Float32Array([1,2]),new Float32Array([1])]));
 assert.throws(()=>monoSamples([new Float32Array(960001)]));
});
test('empty or corrupt transcripts and unreviewed provenance cannot be saved',()=>{
 for(const text of ['',null,'x'.repeat(20001),'text\0'])assert.throws(()=>transcriptText(text));
 for(const bad of [{...voice,reviewed:false},{...voice,duration:61},{...voice,rawText:''},{...voice,sha256:'wrong'},{...voice,model:'fake'}]){
 assert.throws(()=>validateVoice(bad as VoiceImport));
 assert.throws(()=>parseState(JSON.stringify({...emptyState(),sources:[{id:'v',title:'Voice',text:'Text',lang:'EN',voice:bad}]})));
 }
});
test('corrected text and raw transcript survive reload separately; facts quote only reviewed text',()=>{
 const source={id:'v',title:'Voice',lang:'EN',text:'Tomorrow I start work at nine.',voice};
 const state=parseState(JSON.stringify(addSource(emptyState(),source)));
 assert.equal(state.sources[0].voice?.rawText,voice.rawText);
 assert.equal(state.sources[0].text,source.text);assert.equal(state.facts.length,0);
 const fact={id:'f',sourceId:'v',event:'Work',kind:'task' as const,value:'Plan work',quote:source.text,minutes:2};
 assert.equal(addFact(state,fact).facts.length,1);
 assert.throws(()=>addFact(state,{...fact,quote:voice.rawText}));
});
test('Meta payload includes only reviewed source text without raw transcript or audio metadata',()=>{
 const input=parseInput({requestId:'voice-test',source:{id:'v',title:'Voice',lang:'EN',text:'Checked text',voice},event:'Work',day:'2026-10-28'});
 assert.equal(input.source.text,'Checked text');assert.equal('voice' in input.source,false);assert.equal(JSON.stringify(input).includes(voice.rawText),false);
});
