import { checkedText, combinePages, documentKind, DOCUMENT_LIMITS, checkOcrQuality } from './document-contract.ts';
import type { ExtractedDocument, ImportPage } from './document-contract.ts';
import type { Worker } from 'tesseract.js';

export async function extractDocument(file: File, language: string, signal: AbortSignal, progress: (label: string) => void, forceOCR = false): Promise<ExtractedDocument> {
  const kind = documentKind(file.name, file.size);
  const languages: Record<string, string> = { EN: 'eng', PL: 'pol', UK: 'ukr', RU: 'rus' };
  if (!languages[language]) throw new Error('Choose the document language.');
  let worker: Worker | undefined;
  let ocrPage = 1;
  let destroyPdf: (() => Promise<void>) | undefined;
  const local = new AbortController();
  const cancel = () => local.abort(new Error('Import cancelled. Your previous text is preserved.'));
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(() => local.abort(new Error('Extraction exceeded two minutes. Try a smaller document.')), DOCUMENT_LIMITS.timeout);
  const check = () => { if (local.signal.aborted) throw local.signal.reason; };
  const run = async <T,>(promise: Promise<T>): Promise<T> => {
    check();
    let stop: () => void;
    const aborted = new Promise<never>((_, reject) => { stop = () => reject(local.signal.reason); local.signal.addEventListener('abort', stop, { once: true }); });
    try { return await Promise.race([promise, aborted]); }
    finally { local.signal.removeEventListener('abort', stop!); }
  };
  async function ocr(canvas: HTMLCanvasElement, page: number) {
    ocrPage = page;
    if (!worker) {
      progress('Loading on-device OCR…');
      const { createWorker } = await import('tesseract.js');
      check();
      const pending = createWorker(languages[language], 1, {
        workerPath: '/document-assets/worker.min.js', corePath: '/document-assets/core', langPath: '/document-assets/lang', workerBlobURL: false, cacheMethod: 'none',
        logger: m => { if (!local.signal.aborted && m.status === 'recognizing text') progress(`Recognizing page ${ocrPage}: ${Math.round(m.progress * 100)}%`); },
        errorHandler: () => {},
      });
      // Initialization may finish after cancellation; never leave its worker alive.
      void pending.then(w => { if (local.signal.aborted) void w.terminate(); }).catch(() => {});
      worker = await run(pending);
      // Local adaptive thresholding handles uneven illumination in photographed pages.
      await run(worker.setParameters({thresholding_method:'2'}));
    }
    progress(`Recognizing page ${page}…`);
    const { data } = await run(worker.recognize(canvas,{rotateAuto:true}));
    checkOcrQuality(data.text,data.confidence,page);
    return { text: data.text.trim(), confidence: data.confidence };
  }
  function preview(canvas: HTMLCanvasElement) {
    const thumb = document.createElement('canvas');
    const scale = Math.min(1, 1200 / Math.max(canvas.width, canvas.height));
    thumb.width = Math.max(1, Math.round(canvas.width * scale)); thumb.height = Math.max(1, Math.round(canvas.height * scale));
    thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const url = thumb.toDataURL('image/jpeg', .85); thumb.width = thumb.height = 0; return url;
  }
  try {
    progress('Reading document…');
    const bytes = await run(file.arrayBuffer());
    const sha256 = [...new Uint8Array(await run(crypto.subtle.digest('SHA-256', bytes)))].map(x => x.toString(16).padStart(2, '0')).join('');
    const pages: ImportPage[] = [], previews: string[] = [], warnings: string[] = [];
    if (kind === 'text') {
      let text: string;
      try { text = checkedText(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch (error) { if (error instanceof TypeError) throw new Error('Use a UTF-8 text file.'); throw error; }
      pages.push({ number: 1, method: 'text', text });
    } else if (kind === 'image') {
      let bitmap: ImageBitmap;
      try { const pending = createImageBitmap(file); void pending.then(image => { if (local.signal.aborted) image.close(); }).catch(() => {}); bitmap = await run(pending); } catch (error) { check(); throw new Error('Could not open this image. Try a valid JPG, PNG, or WebP.'); }
      const canvas = document.createElement('canvas');
      try {
        if (bitmap.width * bitmap.height > DOCUMENT_LIMITS.pixels) throw new Error('Image exceeds 24 megapixels. Resize it and try again.');
        const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        previews.push(preview(canvas));
        pages.push({ number: 1, method: 'ocr', ...await ocr(canvas, 1) });
      } finally { bitmap.close(); canvas.width = canvas.height = 0; }
    } else {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('This file is not a valid PDF.');
      const pdfjs = await import('pdfjs-dist');
      const { default: workerURL } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerURL;
      check();
      const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, cMapUrl: '/document-assets/pdf/cmaps/', cMapPacked: true, standardFontDataUrl: '/document-assets/pdf/standard_fonts/', wasmUrl: '/document-assets/pdf/wasm/', maxImageSize: DOCUMENT_LIMITS.pixels });
      destroyPdf = () => loading.destroy();
      const pdf = await run(loading.promise);
      if (pdf.numPages > DOCUMENT_LIMITS.pages) throw new Error('This PDF exceeds 5 pages. Split it into smaller files; no pages were partially saved.');
      for (let n = 1; n <= pdf.numPages; n++) {
        check(); progress(`Reading page ${n} of ${pdf.numPages}…`);
        const page = await run(pdf.getPage(n));
        const content = await run(page.getTextContent());
        const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        // A text header does not mean the scanned body has a text layer.
        const operators=await run(page.getOperatorList());
        const imageOps=new Set([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject,pdfjs.OPS.paintImageXObjectRepeat,pdfjs.OPS.paintInlineImageXObjectGroup,pdfjs.OPS.paintImageMaskXObjectGroup,pdfjs.OPS.paintImageMaskXObjectRepeat]);
        const hasImages=operators.fnArray.some(op=>imageOps.has(op));
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, 2200 / Math.max(base.width, base.height));
        if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid PDF page dimensions.');
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
        try {
          const render = page.render({ canvas, viewport });
          const stopRender = () => render.cancel();
          local.signal.addEventListener('abort', stopRender, { once: true });
          try { await run(render.promise); } finally { local.signal.removeEventListener('abort', stopRender); }
          previews.push(preview(canvas));
          if (forceOCR || hasImages || !text.trim()) {
            pages.push({ number: n, method: 'ocr', ...await ocr(canvas, n) });
            if(hasImages && text.trim())warnings.push(`Page ${n}: contains both text and images. The visible page was read with OCR so scanned content is not silently omitted.`);
          }
          else pages.push({ number: n, method: 'text', text });
        } finally { canvas.width = canvas.height = 0; page.cleanup(); }
      }
      warnings.push('Check every page: reading order and hidden PDF text may differ from the image. For mixed scans, use OCR on every page.');
    }
    if (!pages.some(p => p.text.trim())) checkedText('');
    for (const page of pages) {
      if (!page.text.trim()) warnings.push(`Page ${page.number}: no text found. Check the original; a blank result does not mean there are no requirements.`);
      if (page.method === 'ocr') warnings.push(`Page ${page.number}: OCR can misread dates, times, and letters. Compare it with the image.`);
    }
    const text = kind === 'text' ? checkedText(pages[0].text) : combinePages(pages);
    check();
    return { filename: file.name.slice(0,255), sha256, language, pages, previews, warnings, text };
  } catch (error) {
    check();
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('This PDF is password protected. Export an accessible copy without a password and import it again.');
    if (error instanceof Error && ['InvalidPDFException','UnknownErrorException'].includes(error.name)) throw new Error('Could not read this PDF. It may be damaged or use an unsupported format.');
    throw error;
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', cancel);
    if (worker) await worker.terminate().catch(() => {});
    if (destroyPdf) await destroyPdf().catch(() => {});
  }
}
