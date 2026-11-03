import { tasks } from './engine.ts';
import type { State, Task } from './engine.ts';
export type Observation = { kind: string; score: number; box: [number,number,number,number] };
export type PhotoReview = { day: string; photoHash: string; filename: string; fingerprints: string[]; observations: Observation[] };
export type PhotoReceipt = { photoHash: string; filename: string; checkedAt: string; method: 'manual-after-photo' };
export const objectNames: Record<string,string> = {bottle:'bottle',backpack:'backpack',book:'book',umbrella:'umbrella','cell phone':'phone',banana:'banana',apple:'apple',cup:'cup','sports ball':'ball',handbag:'bag'};
const patterns: Record<string,RegExp> = {
 bottle: /(?:^|[^\p{L}])(вод[ауые]|водою|water|wod[ęay]|bottle|бутылк[а-я]*|пляшк[а-яії]*|butelk[\p{L}]*)(?=$|[^\p{L}])/iu,
 backpack: /(?:рюкзак[а-я]*|backpack|plecak)/iu, book: /(?:книг[а-я]*|книж[а-я]*|book|książk[\p{L}]*)/iu,
 umbrella: /(?:зонт[а-я]*|парасол[\p{L}]*|umbrella|parasol)/iu,
 'cell phone': /(?:телефон[а-я]*|phone|telefon)/iu,
 banana: /(?:банан[а-я]*|banana|banan)/iu, apple: /(?:яблок[а-я]*|яблук[а-я]*|apple|jabłk[\p{L}]*)/iu,
 cup: /(?:кружк[а-я]*|чашк[а-я]*|cup|kubek)/iu,
 'sports ball': /(?:мяч[а-я]*|м['’]?яч[а-я]*|ball|piłk[\p{L}]*)/iu,
 handbag: /(?:сумк[а-я]*|handbag|torb[\p{L}]*)/iu,
};
export function requiresPersonalCheck(task: Task): boolean {
  const words = [task.label, ...task.facts.map(f=>f.value+' '+f.quote)].join(' ');
  return /лекар|лік[аиі]|медика|таблет|доз[аыуі]|medicine|medication|pill|lek[iauó]|подпис|підпис|signature|podpis|разрешен|дозвіл|permission|consent|zgod|паспорт|passport|document|документ|рецепт|prescription/iu.test(words);
}
export function parseObservations(raw: unknown): Observation[] {
  if (!Array.isArray(raw) || raw.length > 20) throw new Error('Invalid recognition result.');
  return raw.flatMap(o => {
    if (!o || typeof o.kind !== 'string' || !Number.isFinite(o.score) || o.score < 0 || o.score > 1 || !Array.isArray(o.box) || o.box.length !== 4 || o.box.some((x:unknown)=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1) || o.box[2]<=0 || o.box[3]<=0 || o.box[0]+o.box[2]>1.001 || o.box[1]+o.box[3]>1.001) throw new Error('Invalid image region.');
    return Object.hasOwn(objectNames,o.kind) && o.score >= .6 ? [o as Observation] : [];
  });
}
export function suggestions(task: Task, observations: Observation[]): Observation[] {
  if (task.kind !== 'item' || requiresPersonalCheck(task)) return [];
  return observations.filter(o=>patterns[o.kind]?.test(task.label));
}
export function confirmPhotoItem(state: State, review: PhotoReview, fingerprint: string): State {
  if (review.day !== state.day || !/^[a-f0-9]{64}$/.test(review.photoHash) || !review.fingerprints.includes(fingerprint)) throw new Error('Photo or list is out of date. Check the current day and items again.');
  const task = tasks(state).find(t=>t.fingerprint===fingerprint && t.kind==='item' && !t.blocked);
  if (!task) throw new Error('This item changed. Check the updated list.');
  return {...state,completed:{...state.completed,[fingerprint]:true},photoChecks:{...state.photoChecks,[fingerprint]:{photoHash:review.photoHash,filename:review.filename,checkedAt:new Date().toISOString(),method:'manual-after-photo'}}};
}
export function validatePhotoChecks(checks: unknown): void {
  if (!checks || typeof checks!=='object'||Array.isArray(checks)) throw new Error('Photo review history is invalid.');
  for(const value of Object.values(checks)) {
    const v = value as PhotoReceipt;
    if(!v||v.method!=='manual-after-photo'||typeof v.filename!=='string'||v.filename.length>255||!/^[a-f0-9]{64}$/.test(v.photoHash)||!Number.isFinite(Date.parse(v.checkedAt)))throw new Error('Photo review receipt is invalid.');
  }
}
