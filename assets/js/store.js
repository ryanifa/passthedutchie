/* Loading the menu document for visitors and admin alike.
   Order of trust: demo data (only in the browser that turned demo mode on),
   then the live Gist, with a local cache and the bundled data/menu.json as
   fallbacks so the page always shows something, even offline. */

import { CONFIG } from './config.js';
import { readGist, readGistRaw } from './gist.js';

const KEYS = {
  cache: 'ptd.cache',
  demo: 'ptd.demo',
  gistId: 'ptd.gistId',
};

export function storageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode: fine, only this visit */ }
}

/** The gist the site reads from: the one in config.js, or the one the admin linked on this device. */
export function activeGistId() {
  return CONFIG.gistId || storageGet(KEYS.gistId, '') || '';
}

export function setLocalGistId(id) { storageSet(KEYS.gistId, id || null); }

export function demoDoc() { return storageGet(KEYS.demo); }
export function setDemoDoc(doc) { storageSet(KEYS.demo, doc); }

export function cacheDoc(doc, updatedAt) { storageSet(KEYS.cache, { doc, updatedAt, gistId: activeGistId() }); }

export async function bundledDoc() {
  const res = await fetch(new URL('../../data/menu.json', import.meta.url), { cache: 'no-cache' });
  return normalize(await res.json());
}

/**
 * Calls `render(doc, meta)` as soon as something is available, and again when
 * fresher data arrives. Visitors never wait on GitHub before seeing a menu.
 */
export async function loadForVisitors(render) {
  const demo = demoDoc();
  if (demo) {
    render(normalize(demo), { source: 'demo' });
    return;
  }

  const gistId = activeGistId();
  const cached = storageGet(KEYS.cache);
  const cachedValid = cached?.doc && cached.gistId === gistId;
  let shown = false;
  if (cachedValid) {
    render(normalize(cached.doc), { source: 'cache' });
    shown = true;
  }

  if (gistId) {
    try {
      const { doc, updatedAt } = await readGist(gistId, CONFIG.gistFile);
      if (!cachedValid || cached.updatedAt !== updatedAt) {
        cacheDoc(doc, updatedAt);
        render(normalize(doc), { source: 'gist' });
      }
      return;
    } catch (err) {
      console.warn('Live menu API unavailable:', err.message);
    }
    if (CONFIG.gistOwner && gistId === CONFIG.gistId) {
      try {
        const { doc } = await readGistRaw(CONFIG.gistOwner, gistId, CONFIG.gistFile);
        if (!cachedValid || JSON.stringify(doc) !== JSON.stringify(cached.doc)) {
          cacheDoc(doc, cached?.updatedAt ?? null);
          render(normalize(doc), { source: 'gist-raw' });
        }
        return;
      } catch (err) {
        console.warn('Live menu CDN unavailable, using fallback:', err.message);
      }
    }
    if (shown) return;
  }

  if (!shown) render(await bundledDoc(), { source: 'bundled' });
}

/* ------------------------------------------------------------- the model */

const str = (v, d = '') => (typeof v === 'string' ? v : v === null || v === undefined ? d : String(v));
const price = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const arr = (v) => (Array.isArray(v) ? v : []);
let counter = 0;
const ensureId = (v, prefix) => str(v) || `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Fills in anything missing so the renderers never have to guard. */
export function normalize(input) {
  const doc = input && typeof input === 'object' ? input : {};
  const info = doc.info || {};
  return {
    version: 1,
    info: {
      name: str(info.name, 'Pass The Dutchie'),
      tagline: str(info.tagline),
      intro: str(info.intro),
      announcement: str(info.announcement),
      address: str(info.address),
      mapsUrl: str(info.mapsUrl),
      phone: str(info.phone),
      whatsapp: str(info.whatsapp),
      instagram: str(info.instagram),
      facebook: str(info.facebook),
      currency: str(info.currency, '$') || '$',
      hours: arr(info.hours).map((h) => ({ label: str(h?.label), value: str(h?.value) })),
      delivery: arr(info.delivery).map((h) => ({ label: str(h?.label), value: str(h?.value) })),
      wifi: { name: str(info.wifi?.name), password: str(info.wifi?.password) },
    },
    events: arr(doc.events).map((e) => ({
      id: ensureId(e?.id, 'ev'),
      day: str(e?.day),
      title: str(e?.title),
      time: str(e?.time),
      description: str(e?.description),
      hidden: !!e?.hidden,
    })),
    menus: arr(doc.menus).map((m) => ({
      id: ensureId(m?.id, 'menu'),
      name: str(m?.name, 'Menu'),
      categories: arr(m?.categories).map((c) => ({
        id: ensureId(c?.id, 'cat'),
        name: str(c?.name),
        icon: str(c?.icon),
        note: str(c?.note),
        price: price(c?.price),
        hidden: !!c?.hidden,
        items: arr(c?.items).map((i) => ({
          id: ensureId(i?.id, 'item'),
          name: str(i?.name),
          description: str(i?.description),
          price: price(i?.price),
          soldOut: !!i?.soldOut,
          popular: !!i?.popular,
          hidden: !!i?.hidden,
        })),
      })),
    })),
  };
}
