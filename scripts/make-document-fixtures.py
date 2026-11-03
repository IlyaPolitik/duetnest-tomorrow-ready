from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.pdfencrypt import StandardEncryption
root = Path(__file__).resolve().parent.parent / 'tests/fixtures/documents'
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 42)
fixtures = {
 'pl': ['DOKUMENT TESTOWY - fikcyjne dane', 'Wycieczka szkolna: 28.10.2026', 'Zbiórka o 07:55. Wyjazd o 08:10.', 'Prosimy zabrać wodę i kurtkę.'],
 'uk': ['ТЕСТОВИЙ ДОКУМЕНТ - вигадані дані', 'Шкільна поїздка: 28.10.2026', 'Збір о 07:55. Виїзд о 08:10.', 'Візьміть воду та куртку.'],
 'en': ['SYNTHETIC SCHOOL DOCUMENT', 'School trip: 28.10.2026', 'Meet at 07:55. Departure at 08:10.', 'Bring water and a jacket.'],
 'ru': ['ТЕСТОВЫЙ ДОКУМЕНТ - вымышленные данные', 'Школьная поездка: 28.10.2026', 'Сбор в 07:55. Отправление в 08:10.', 'Возьмите воду и куртку.'],
}
for lang, lines in fixtures.items():
 image = Image.new('RGB', (1600, 650), 'white')
 draw = ImageDraw.Draw(image)
 for i,line in enumerate(lines): draw.text((70,70+i*100),line,font=font,fill='black')
 image.save(root/f'school-{lang}.png')
image = Image.open(root/'school-pl.png')
pdf = canvas.Canvas(str(root/'scan-pl.pdf'),pagesize=(800,325))
pdf.drawImage(ImageReader(image),0,0,width=800,height=325)
pdf.save()
pdf = canvas.Canvas(str(root/'text-and-scan.pdf'),pagesize=(800,500))
pdf.setFont('Helvetica',20)
for i,line in enumerate(fixtures['en']): pdf.drawString(40,440-i*50,line)
pdf.showPage();pdf.drawImage(ImageReader(image),0,100,width=800,height=325);pdf.save()
pdf = canvas.Canvas(str(root/'six-pages.pdf'))
for i in range(6): pdf.drawString(40,700,f'Synthetic test page {i+1}');pdf.showPage()
pdf.save()
pdf = canvas.Canvas(str(root/'locked.pdf'),encrypt=StandardEncryption('synthetic-test'))
pdf.drawString(40,700,'Synthetic protected document');pdf.save()
Image.new('RGB',(900,500),'white').save(root/'blank.png')
(root/'broken.pdf').write_text('%PDF-1.7\ninvalid synthetic fixture')
(root/'unsupported.heic').write_text('synthetic invalid fixture')
print('Synthetic image/PDF and failure fixtures created.')

pdf = canvas.Canvas(str(root/'five-scans.pdf'),pagesize=(800,500))
for _ in range(5):
 pdf.drawImage(str(root/'school-pl.png'),0,100,width=800,height=325)
 pdf.showPage()
pdf.save()
