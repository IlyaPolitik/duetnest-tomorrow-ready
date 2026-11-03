export const VOICE_LIMITS={bytes:10*1024*1024,seconds:60,sampleRate:16000,timeout:120000};
export const VOICE_MODEL='onnx-community/whisper-base';
export const VOICE_REVISION='1846881b6b3a3024392c1eea3ad983695bc23925';
export type VoiceImport={filename:string;sha256:string;language:string;duration:number;rawText:string;model:string;revision:string;reviewed:true};
export function validateVoiceFile(name:string,size:number){
 if(!size||size>VOICE_LIMITS.bytes)throw new Error('Choose a nonempty audio file up to 10 MB.');
 if(!/\.(wav|mp3|m4a)$/i.test(name))throw new Error('Choose WAV, MP3, or M4A. Other formats are not supported yet.');
}
export function validateDuration(seconds:number){if(!Number.isFinite(seconds)||seconds<=0||seconds>VOICE_LIMITS.seconds)throw new Error('Choose a recording up to 60 seconds with a readable duration. Audio is not truncated.');}
export function transcriptText(value:unknown):string{
 if(typeof value!=='string'||!value.trim())throw new Error('No speech recognized. Enter the note manually or choose another recording.');
 if(value.length>20000||value.includes('\0'))throw new Error('Invalid transcript. Nothing was saved.');
 return value.trim();
}
export function validateVoice(value:VoiceImport){
 if(!value||typeof value.filename!=='string'||!value.filename||value.filename.length>255||!/^[a-f0-9]{64}$/.test(value.sha256)||!['EN','PL','UK','RU'].includes(value.language)||value.reviewed!==true||value.model!==VOICE_MODEL||value.revision!==VOICE_REVISION)throw new Error('Voice note details are invalid.');
 validateDuration(value.duration);transcriptText(value.rawText);
}
export function monoSamples(channels:Float32Array[]):Float32Array{
 if(!channels.length||channels.length>2||!channels[0].length||channels[0].length>VOICE_LIMITS.seconds*VOICE_LIMITS.sampleRate||channels.some(c=>c.length!==channels[0].length))throw new Error('Unsupported recording. Use mono or stereo audio up to 60 seconds.');
 const output=new Float32Array(channels[0].length);let energy=0;
 for(let i=0;i<output.length;i++){let v=0;for(const c of channels){if(!Number.isFinite(c[i]))throw new Error('Audio data is invalid.');v+=c[i]/channels.length;}output[i]=v;energy+=v*v;}
 if(Math.sqrt(energy/output.length)<.0001)throw new Error('This recording is nearly silent. Transcription was not started; enter the text manually.');
 return output;
}
