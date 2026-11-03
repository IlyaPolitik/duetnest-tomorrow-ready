export const DOCUMENT_LIMITS = { bytes: 15 * 1024 * 1024, pages: 5, characters: 20000, pixels: 24_000_000, timeout: 120000 };
// A conservative rejection guard, not an accuracy or completeness score.
export function checkOcrQuality(text:string,confidence:number,page:number):void {
  if(text.trim() && (!Number.isFinite(confidence) || confidence<70)) throw new Error(`OCR is too uncertain on page ${page}. Use a clearer, straight photo or enter the checked text manually. Nothing was imported.`);
}
export type ImportPage = { number: number; method: 'text' | 'ocr'; text: string; confidence?: number };
export type DocumentImport = { filename: string; sha256: string; language: string; pages: ImportPage[]; reviewed: true };
export type ExtractedDocument = Omit<DocumentImport, 'reviewed'> & { text: string; previews: string[]; warnings: string[] };
export function documentKind(name: string, size: number): 'pdf' | 'image' | 'text' {
  if (!size || size > DOCUMENT_LIMITS.bytes) throw new Error('Choose a nonempty file up to 15 MB.');
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.(png|jpe?g|webp)$/i.test(name)) return 'image';
  if (/\.(txt|md)$/i.test(name)) {
    if (size > 80000) throw new Error('TXT / Markdown: maximum 80 KB.');
    return 'text';
  }
  throw new Error('Choose PDF, JPG, PNG, WebP, TXT, or Markdown. HEIC is not supported yet.');
}
export function checkedText(text: string): string {
  if (!text.trim()) throw new Error('No readable text found. Try a clearer photo or enter the text manually.');
  if (text.length > DOCUMENT_LIMITS.characters) throw new Error('Document exceeds 20,000 characters. Split it into smaller documents; no text was truncated.');
  if (text.includes('\0')) throw new Error('Text contains invalid characters. Use UTF-8 or another file.');
  return text.trim();
}
export function combinePages(pages: ImportPage[]): string {
  return checkedText(pages.map(p => `— Page ${p.number} —\n${p.text}`).join('\n\n'));
}
export function validateImport(value: DocumentImport): void {
  if (!value || typeof value.filename !== 'string' || value.filename.length > 255 || !/^[a-f0-9]{64}$/.test(value.sha256) || !['EN','PL','UK','RU'].includes(value.language) || value.reviewed !== true || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > DOCUMENT_LIMITS.pages) throw new Error('Import details are invalid.');
  let total = 0;
  value.pages.forEach((p, i) => {
    if (!p || p.number !== i + 1 || !['text','ocr'].includes(p.method) || typeof p.text !== 'string' || p.text.includes('\0') || (p.confidence !== undefined && (!Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 100))) throw new Error('Document page data is invalid.');
    total += p.text.length;
  });
  if (total > DOCUMENT_LIMITS.characters) throw new Error('Imported text is too large.');
}
