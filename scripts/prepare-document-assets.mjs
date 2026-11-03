import { cp, mkdir, readdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = path.join(root, 'node_modules');
const target = path.join(root, 'public/document-assets');
await mkdir(target, { recursive: true });
await copyFile(path.join(modules, 'tesseract.js/dist/worker.min.js'), path.join(target, 'worker.min.js'));
await mkdir(path.join(target, 'core'), { recursive: true });
for (const name of await readdir(path.join(modules, 'tesseract.js-core'))) {
  if (/\.wasm(?:\.js)?$/.test(name) || name === 'LICENSE') await copyFile(path.join(modules, 'tesseract.js-core', name), path.join(target, 'core', name));
}
await mkdir(path.join(target, 'lang'), { recursive: true });
for (const lang of ['eng', 'pol', 'ukr', 'rus']) {
  await copyFile(path.join(modules, `@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`), path.join(target, `lang/${lang}.traineddata.gz`));
}
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(path.join(modules, 'pdfjs-dist', name), path.join(target, 'pdf', name), { recursive: true });
}
await copyFile(path.join(modules, 'pdfjs-dist/LICENSE'), path.join(target, 'pdf/LICENSE'));
console.log('PDF/OCR runtime and four languages prepared locally.');
