from pathlib import Path
import subprocess, wave
root=Path(__file__).resolve().parent.parent/'tests/fixtures/voice'
root.mkdir(parents=True,exist_ok=True)
fixtures=[('en','Samantha','Tomorrow I start work at nine. I need to pack water and a raincoat.'),('pl','Zosia','Jutro zaczynam pracę o dziewiątej. Muszę zabrać wodę i kurtkę.'),('uk','Lesya','Завтра я працюю з девʼятої. Треба взяти воду та куртку.')]
for lang,voice,text in fixtures:
 aiff=root/f'{lang}.aiff'
 subprocess.run(['say','-v',voice,'-r','145','-o',str(aiff),text],check=True)
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(aiff),'-ar','16000','-ac','1',str(root/f'note-{lang}.wav')],check=True)
 aiff.unlink()
 (root/f'note-{lang}.txt').write_text(text+'\n')
for name,seconds in [('silence',3),('too-long',61)]:
 with wave.open(str(root/f'{name}.wav'),'wb') as w:
  w.setparams((1,2,16000,0,'NONE','not compressed'));w.writeframes(b'\0\0'*(16000*seconds))
(root/'broken.wav').write_bytes(b'not a wave file')

for ext in ["mp3", "m4a"]:
 subprocess.run(["ffmpeg","-y","-v","error","-i",str(root/"note-en.wav"),str(root/f"note-en.{ext}")],check=True)
