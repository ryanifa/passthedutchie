/* Posters: images stored as data-URL text files in their own Gist, so the
   menu itself stays small and fast. Each poster gets a new id and never
   changes, which makes caching safe. */

import { readRawFile } from './gist.js';
import { storageGet, storageSet } from './store.js';

const DEMO_KEY = 'ptd.demo.posters';
const memory = new Map();

export const posterFile = (id) => `${id}.txt`;

export function demoPosters() { return storageGet(DEMO_KEY, {}) || {}; }
export function setDemoPoster(id, dataUrl) {
  const all = demoPosters();
  if (dataUrl === null) delete all[id];
  else all[id] = dataUrl;
  storageSet(DEMO_KEY, Object.keys(all).length ? all : null);
}
export function clearDemoPosters() { storageSet(DEMO_KEY, null); }

export function rememberPoster(id, dataUrl) { memory.set(id, Promise.resolve(dataUrl)); }

/** Resolves to a data URL, or null when the poster can't be found. */
export function loadPoster(id, posters, { demo = false } = {}) {
  if (!id) return Promise.resolve(null);
  if (memory.has(id)) return memory.get(id);
  let job;
  if (demo) job = Promise.resolve(demoPosters()[id] || null);
  else if (posters?.gistId && posters?.owner) {
    job = readRawFile(posters.owner, posters.gistId, posterFile(id))
      .then((text) => (text.startsWith('data:image/') ? text : null))
      .catch(() => null);
  } else job = Promise.resolve(null);
  memory.set(id, job);
  job.then((v) => { if (v === null) memory.delete(id); });
  return job;
}

/** Shrinks a photo in the browser to a JPEG data URL of at most ~450 KB. */
export async function compressImage(file, { maxSide = 1400, maxBytes = 450_000 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Dit bestand is geen afbeelding die de browser kan openen.'));
      i.src = url;
    });
    let side = maxSide;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // transparante PNG's niet zwart laten worden
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', attempt < 3 ? 0.82 : 0.7);
      if (dataUrl.length <= maxBytes || attempt === 5) return dataUrl;
      side = Math.round(side * 0.8);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return null;
}
