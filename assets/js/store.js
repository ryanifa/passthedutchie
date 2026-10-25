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
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? v : '');
let counter = 0;
const ensureId = (v, prefix) => str(v) || `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Paid add-ons: "+ Cheese $3". */
const extras = (list) => arr(list).map((x) => ({
  id: ensureId(x?.id, 'x'),
  name: str(x?.name),
  price: price(x?.price),
  soldOut: !!x?.soldOut,
})).filter((x) => x.name);

/** Pick-one options without extra cost: "Choose 1 side: Fries · Rice". */
const choices = (list) => arr(list).map((c) => ({
  id: ensureId(c?.id, 'ch'),
  label: str(c?.label),
  values: arr(c?.values).map((v) => str(v).trim()).filter(Boolean),
})).filter((c) => c.values.length);

/** Fills in anything missing so the renderers never have to guard. */
export function normalize(input) {
  const doc = input && typeof input === 'object' ? input : {};
  const info = doc.info || {};
  return {
    version: 1,
    migrations: arr(doc.migrations).map((m) => str(m)).filter(Boolean),
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
      posters: { gistId: str(info.posters?.gistId), owner: str(info.posters?.owner) },
    },
    happenings: arr(doc.happenings).map((h) => ({
      id: ensureId(h?.id, 'hap'),
      title: str(h?.title),
      date: isoDate(h?.date),
      endDate: isoDate(h?.endDate),
      time: str(h?.time),
      description: str(h?.description),
      poster: str(h?.poster),
      featured: h?.featured === undefined ? true : !!h.featured,
      hidden: !!h?.hidden,
    })),
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
        extras: extras(c?.extras),
        choices: choices(c?.choices),
        items: arr(c?.items).map((i) => ({
          id: ensureId(i?.id, 'item'),
          name: str(i?.name),
          description: str(i?.description),
          price: price(i?.price),
          soldOut: !!i?.soldOut,
          popular: !!i?.popular,
          hidden: !!i?.hidden,
          extras: extras(i?.extras),
          choices: choices(i?.choices),
        })),
      })),
    })),
  };
}

/* ------------------------------------------------------- dated events */

/** Today as YYYY-MM-DD in the visitor's own timezone. */
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Events that haven't finished yet, soonest first. */
export function upcoming(happenings, today = todayIso()) {
  return happenings
    .filter((h) => h.date && (h.endDate || h.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/* -------------------------------------------- one-time data improvements */

const EXTRAS_V1 = 'extras-v1';
const xid = () => `x-${Math.random().toString(36).slice(2, 8)}`;
const chid = () => `ch-${Math.random().toString(36).slice(2, 8)}`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Turns the old workarounds into real extras and choices, once:
 * "Extra cheese" items, "add fries +$3" notes, the side dish for meats,
 * the wing sauces and "with alcohol $16" for frozen drinks.
 * Only touches what it recognises; returns the number of changes.
 */
export function migrateExtras(doc) {
  if (doc.migrations.includes(EXTRAS_V1)) return 0;
  let n = 0;
  for (const cat of doc.menus.flatMap((m) => m.categories)) {
    // Losse "Extra …"-items worden extra's van de categorie.
    const addOns = cat.items.filter((i) => /^extra\s+\S/i.test(i.name) && i.price !== null);
    if (addOns.length) {
      for (const i of addOns) cat.extras.push({ id: xid(), name: cap(i.name.replace(/^extra\s+/i, '')), price: i.price, soldOut: i.soldOut });
      cat.items = cat.items.filter((i) => !addOns.includes(i));
      n += addOns.length;
    }
    // "add fries +$3" in de toelichting.
    const fries = cat.note.match(/(^|\s*[·,;-]\s*)add fries \+?\s*\$?\s*(\d+(?:\.\d+)?)/i);
    if (fries) {
      cat.extras.push({ id: xid(), name: 'Fries', price: Number(fries[2]), soldOut: false });
      cat.note = cat.note.replace(fries[0], '').trim();
      n++;
    }
    // "+ 1 side: fries, mashed potato, rice or mac & cheese"
    const side = cat.note.match(/\s*\+\s*1 side:\s*(.+)$/i);
    if (side) {
      const values = side[1].split(/,\s*|\s+or\s+/i).map((v) => cap(v.trim())).filter(Boolean);
      cat.choices.push({ id: chid(), label: 'Choose 1 side', values });
      cat.note = cat.note.replace(side[0], '').trim();
      n++;
    }
    // "$12 · with alcohol $16" bij een categorieprijs van $12.
    const alc = cat.note.match(/^\s*\$?\d+(?:\.\d+)?\s*·\s*with alcohol \$?(\d+(?:\.\d+)?)\s*$/i);
    if (alc && cat.price !== null && Number(alc[1]) > cat.price) {
      cat.extras.push({ id: xid(), name: 'With alcohol', price: Number(alc[1]) - cat.price, soldOut: false });
      cat.note = '';
      n++;
    }
    // Sauskeuze bij chicken wings: "BBQ, Buffalo, Sweet & Sour or Jerk".
    for (const item of cat.items) {
      if (/wing/i.test(item.name) && /^[\w &]+(,\s*[\w &]+)+\s+or\s+[\w &]+$/i.test(item.description) && !item.choices.length) {
        item.choices.push({ id: chid(), label: 'Sauce', values: item.description.split(/,\s*|\s+or\s+/i).map((v) => v.trim()) });
        item.description = '';
        n++;
      }
    }
  }
  doc.migrations.push(EXTRAS_V1);
  return n;
}
