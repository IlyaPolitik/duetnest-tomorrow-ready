from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import json,hashlib
root=Path(__file__).resolve().parent.parent
out=root/'tests/fixtures/document-journey';out.mkdir(exist_ok=False)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',40)
def picture(lines):
 im=Image.new('RGB',(1800,900),'white');d=ImageDraw.Draw(im)
 for i,line in enumerate(lines):d.text((80,75+i*85),line,font=font,fill=(25,25,25))
 return im
base=['FICTIONAL SCHOOL NOTICE','Observatory visit: 23 November 2026.','Meet at 08:30. Bring water and a packed lunch.']
p=canvas.Canvas(str(out/'original-two-pages.pdf'),pagesize=(900,500));p.setFont('Helvetica',22)
for i,line in enumerate(base):p.drawString(45,430-i*60,line)
p.showPage();p.setFont('Helvetica',22);p.drawString(45,430,'FICTIONAL NOTICE - page 2');p.drawString(45,360,'Observatory visit: 23 November 2026.');p.drawString(45,300,'Bring a warm jacket.');p.save()
lines=['FIKCYJNE PISMO - pelna aktualizacja','Wycieczka do obserwatorium: 23 listopada 2026.','Zbiorka o 08:50 zamiast 08:30.','Zabierz wode i ciepla kurtke.','Nie przynos obiadu. Posilek jest zapewniony.']
# Generated raster fixture: skew, uneven illumination, mild blur and JPEG artifacts.
im=picture(lines).rotate(3,resample=Image.Resampling.BICUBIC,expand=True,fillcolor='white')
pix=im.load()
for x in range(im.width):
 factor=.55+.45*x/im.width
 for y in range(im.height):pix[x,y]=tuple(int(v*factor) for v in pix[x,y])
im.filter(ImageFilter.GaussianBlur(.65)).save(out/'revision-skew-shadow.jpg',quality=66)
cancel=picture(['FICTIONAL CANCELLATION NOTICE','Observatory visit: 23 November 2026.','The entire visit is cancelled. No new date is set.','Previous meeting at 08:50 and all preparation','requirements for this visit no longer apply.'])
cancel.save(out/'cancellation-raster.png');p=canvas.Canvas(str(out/'cancellation-scan.pdf'),pagesize=(900,450));p.drawImage(ImageReader(cancel),0,0,width=900,height=450);p.save()
mixed=picture(['FICTIONAL CORRECTION','Observatory visit: 23 November 2026.','Meet at 09:05, replacing the old 08:30 time.','Bring water and a warm jacket.','Do not bring lunch; food is provided.'])
mixed.save(out/'mixed-raster.png');p=canvas.Canvas(str(out/'mixed-header-and-scan.pdf'),pagesize=(900,520));p.setFont('Helvetica',20);p.drawString(45,480,'School notice - see the scanned correction below.');p.drawImage(ImageReader(mixed),0,0,width=900,height=450);p.save()
cases=[dict(id='original-pdf',file='original-two-pages.pdf',lang='EN',meeting=['08:30'],must=['water','lunch','jacket'],pages=2),dict(id='revision-photo',file='revision-skew-shadow.jpg',lang='PL',meeting=['08:50'],must=['water','jacket'],forbidden=['lunch'],pages=1),dict(id='cancellation-scan',file='cancellation-scan.pdf',lang='EN',meeting=[],must=[],count=0,warning='cancel',pages=1),dict(id='mixed-pdf',file='mixed-header-and-scan.pdf',lang='EN',meeting=['09:05'],must=['water','jacket'],forbidden=['lunch'],pages=1)]
for c in cases:c.update(event='Observatory visit',planningDay='2026-11-23',day='2026-11-23',sha256=hashlib.sha256((out/c['file']).read_bytes()).hexdigest())
(out/'manifest.json').write_text(json.dumps(cases,indent=2)+'\n');(root/'proof/document-journey-2026-10-28/frozen-expectations.json').write_text(json.dumps(cases,indent=2)+'\n')
print('Three PDFs and a degraded synthetic photo created; expectations frozen.')
