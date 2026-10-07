/* The public website: renders the menu document into the page. */

import { el, $, $$, clear, formatPrice, telLink, whatsappLink, toast } from './dom.js';
import { loadForVisitors } from './store.js';

let doc = null;
let activeMenu = null;
let query = '';

const ICONS = {
  phone: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z',
  chat: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .3-3.3-.7a11.7 11.7 0 0 1-4.6-4c-.3-.5-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z',
  menu: 'M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h10v2H4v-2Z',
  pin: 'M12 2a7 7 0 0 1 7 7c0 5.3-7 13-7 13S5 14.3 5 9a7 7 0 0 1 7-7Zm0 4.5A2.5 2.5 0 1 0 12 11.5 2.5 2.5 0 0 0 12 6.5Z',
  clock: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 5h-2v6l5 3 1-1.7-4-2.3V7Z',
  bike: 'M3 6h11v9H3V6Zm11 3h4l3 3v3h-7V9ZM6.5 20a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm11 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z',
  wifi: 'M12 18.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM2 8.8a14.5 14.5 0 0 1 20 0l-1.5 1.5a12.4 12.4 0 0 0-17 0L2 8.8Zm3.5 3.5a9.5 9.5 0 0 1 13 0L17 13.8a7.4 7.4 0 0 0-10 0l-1.5-1.5Zm3.5 3.5a4.5 4.5 0 0 1 6 0l-3 3-3-3Z',
  insta: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM17.3 5.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z',
  fb: 'M14 8V6.5c0-.8.2-1.3 1.4-1.3H17V2.2C16.6 2.1 15.6 2 14.4 2 11.9 2 10 3.6 10 6.3V8H7.5v3.3H10V22h4V11.3h2.8L17.2 8H14Z',
};

const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
};

const visible = (list) => list.filter((x) => !x.hidden);
const money = (v) => formatPrice(v, doc.info.currency);

/* ------------------------------------------------------------------ hero */

function renderHero() {
  const { info } = doc;
  document.title = `${info.name} · ${info.tagline || 'Beach bar & restaurant'}`;
  $('#hero-tagline').textContent = info.tagline;
  $('#hero-intro').textContent = info.intro;
  $('#hero-eyebrow').textContent = info.address ? shortPlace(info.address) : 'Sint Maarten';

  const wa = $('#hero-whatsapp');
  if (info.whatsapp) {
    wa.href = whatsappLink(info.whatsapp, `Hi ${info.name}! I'd like to order:`);
    wa.target = '_blank';
    wa.rel = 'noopener';
  }

  const facts = clear($('#hero-facts'));
  const first = info.hours[0];
  if (first) facts.append(el('li', {}, [icon('clock'), el('span', { text: first.value })]));
  if (info.address) facts.append(el('li', {}, [icon('pin'), el('span', { text: info.address })]));

  const ann = $('#announcement');
  ann.hidden = !info.announcement;
  ann.textContent = info.announcement;

  const order = $('#order-top');
  if (info.whatsapp) {
    order.href = whatsappLink(info.whatsapp, `Hi ${info.name}! I'd like to order:`);
    order.target = '_blank';
    order.rel = 'noopener';
  }
}

function shortPlace(address) {
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  const street = parts[0]?.replace(/\s*\d+.*$/, '') || '';
  return [street, parts[parts.length - 1]].filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------ menu */

function renderTabs() {
  const menus = doc.menus.filter((m) => visible(m.categories).length);
  if (!menus.find((m) => m.id === activeMenu)) activeMenu = menus[0]?.id ?? null;
  const tabs = clear($('#menu-tabs'));
  tabs.hidden = menus.length < 2;
  for (const m of menus) {
    tabs.append(el('button', {
      type: 'button',
      role: 'tab',
      class: m.id === activeMenu ? 'active' : '',
      'aria-selected': String(m.id === activeMenu),
      text: m.name,
      onclick: () => {
        activeMenu = m.id;
        renderTabs();
        renderMenu();
        const head = $('#menu-controls');
        if (head.getBoundingClientRect().top < 0) head.scrollIntoView({ behavior: 'smooth' });
      },
    }));
  }
}

function matches(item, category) {
  if (!query) return true;
  const hay = `${item.name} ${item.description} ${category.name}`.toLowerCase();
  return query.split(/\s+/).every((w) => hay.includes(w));
}

function renderMenu() {
  const grid = clear($('#menu-grid'));
  const chips = clear($('#menu-chips'));
  // While searching, look through every menu — guests don't know whether
  // a "Painkiller" is food or drink.
  const menus = query ? doc.menus : doc.menus.filter((m) => m.id === activeMenu);
  let shown = 0;

  for (const menu of menus) {
    for (const cat of visible(menu.categories)) {
      const items = visible(cat.items).filter((i) => matches(i, cat));
      if (!items.length) continue;
      shown += items.length;
      const anchor = `cat-${cat.id}`;

      chips.append(el('a', { href: `#${anchor}`, class: 'chip', dataset: { target: anchor } }, [
        cat.icon ? el('span', { class: 'chip-icon', text: cat.icon }) : null,
        cat.name,
      ]));

      grid.append(el('article', { class: 'cat-card', id: anchor }, [
        el('header', { class: 'cat-head' }, [
          cat.icon ? el('span', { class: 'cat-icon', text: cat.icon, 'aria-hidden': 'true' }) : null,
          el('div', { class: 'cat-title' }, [
            el('h3', { text: cat.name }),
            cat.note ? el('p', { class: 'cat-note', text: cat.note }) : null,
          ]),
          cat.price !== null ? el('span', { class: 'cat-price', text: money(cat.price) }) : null,
        ]),
        el('ul', { class: 'items' }, items.map((item) => el('li', { class: `item${item.soldOut ? ' sold-out' : ''}` }, [
          el('div', { class: 'item-line' }, [
            el('span', { class: 'item-name' }, [
              item.name,
              item.popular ? el('span', { class: 'badge hot', text: 'Popular' }) : null,
              item.soldOut ? el('span', { class: 'badge', text: 'Sold out' }) : null,
            ]),
            el('span', { class: 'dots', 'aria-hidden': 'true' }),
            el('span', { class: 'item-price', text: item.price !== null ? money(item.price) : '' }),
          ]),
          item.description ? el('p', { class: 'item-desc', text: item.description }) : null,
        ]))),
      ]));
    }
  }

  $('#menu-tabs').classList.toggle('searching', !!query);
  $('#menu-empty').hidden = shown > 0;
  chips.hidden = !chips.children.length;
  observeChips();
}

let chipObserver;
function observeChips() {
  chipObserver?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  chipObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.id;
      for (const chip of $$('#menu-chips .chip')) {
        const on = chip.dataset.target === id;
        chip.classList.toggle('active', on);
        if (on) {
          const bar = chip.parentElement;
          bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
        }
      }
    }
  }, { rootMargin: '-35% 0px -60% 0px' });
  $$('#menu-grid .cat-card').forEach((card) => chipObserver.observe(card));
}

/* ----------------------------------------------------------------- vibes */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function renderVibes() {
  const events = visible(doc.events);
  $('#vibes').hidden = !events.length;
  const today = DAYS[new Date().getDay()];
  clear($('#vibe-grid')).append(...events.map((ev) => {
    const isToday = ev.day.toLowerCase().startsWith(today.slice(0, 3)) && ev.day.length >= 3;
    return el('article', { class: `vibe${isToday ? ' today' : ''}` }, [
      el('p', { class: 'vibe-day' }, [ev.day, isToday ? el('span', { class: 'badge hot', text: 'Tonight' }) : null]),
      el('h3', { text: ev.title }),
      ev.time ? el('p', { class: 'vibe-time' }, [icon('clock'), ev.time]) : null,
      ev.description ? el('p', { class: 'vibe-desc', text: ev.description }) : null,
    ]);
  }));
}

/* ----------------------------------------------------------------- visit */

function card(title, iconName, body) {
  return el('article', { class: 'info-card' }, [
    el('h3', {}, [el('span', { class: 'info-icon' }, [icon(iconName)]), title]),
    body,
  ]);
}

function rows(list) {
  return el('dl', { class: 'rows' }, list.map((r) => el('div', {}, [el('dt', { text: r.label }), el('dd', { text: r.value })])));
}

function renderVisit() {
  const { info } = doc;
  const grid = clear($('#visit-grid'));

  if (info.address || info.phone || info.whatsapp) {
    grid.append(card('Find & reach us', 'pin', el('div', { class: 'stack' }, [
      info.address ? el('p', { class: 'big', text: info.address }) : null,
      el('div', { class: 'btn-row' }, [
        info.mapsUrl ? el('a', { class: 'btn btn-ghost btn-sm', href: info.mapsUrl, target: '_blank', rel: 'noopener' }, [icon('pin'), 'Directions']) : null,
        info.phone ? el('a', { class: 'btn btn-ghost btn-sm', href: telLink(info.phone) }, [icon('phone'), info.phone]) : null,
        info.whatsapp ? el('a', { class: 'btn btn-gold btn-sm', href: whatsappLink(info.whatsapp, `Hi ${info.name}! I'd like to order:`), target: '_blank', rel: 'noopener' }, [icon('chat'), 'WhatsApp']) : null,
      ]),
    ])));
  }
  if (info.hours.length) grid.append(card('Opening hours', 'clock', rows(info.hours)));
  if (info.delivery.length) grid.append(card('Delivery', 'bike', rows(info.delivery)));
  if (info.wifi.name) {
    grid.append(card('Free Wi-Fi', 'wifi', el('div', { class: 'stack' }, [
      rows([{ label: 'Network', value: info.wifi.name }, { label: 'Password', value: info.wifi.password }]),
      info.wifi.password ? el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        text: 'Copy password',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(info.wifi.password);
            toast('Password copied — enjoy!');
          } catch {
            toast(`Password: ${info.wifi.password}`);
          }
        },
      }) : null,
    ])));
  }

  $('#footer-sub').textContent = [info.tagline, info.address].filter(Boolean).join(' · ');
  const socials = clear($('#socials'));
  if (info.instagram) socials.append(el('a', { href: `https://instagram.com/${info.instagram.replace(/^@/, '')}`, target: '_blank', rel: 'noopener', 'aria-label': 'Instagram' }, [icon('insta')]));
  if (info.facebook) socials.append(el('a', { href: `https://facebook.com/${info.facebook.replace(/^@/, '')}`, target: '_blank', rel: 'noopener', 'aria-label': 'Facebook' }, [icon('fb')]));
  if (info.whatsapp) socials.append(el('a', { href: whatsappLink(info.whatsapp), target: '_blank', rel: 'noopener', 'aria-label': 'WhatsApp' }, [icon('chat')]));

  const dock = clear($('#dock'));
  dock.append(el('a', { href: '#menu' }, [icon('menu'), el('span', { text: 'Menu' })]));
  if (info.phone) dock.append(el('a', { href: telLink(info.phone) }, [icon('phone'), el('span', { text: 'Call' })]));
  if (info.whatsapp) dock.append(el('a', { class: 'accent', href: whatsappLink(info.whatsapp, `Hi ${info.name}! I'd like to order:`), target: '_blank', rel: 'noopener' }, [icon('chat'), el('span', { text: 'Order' })]));
  if (info.mapsUrl) dock.append(el('a', { href: info.mapsUrl, target: '_blank', rel: 'noopener' }, [icon('pin'), el('span', { text: 'Directions' })]));
}

/* ------------------------------------------------------------------ boot */

function render(newDoc, meta) {
  doc = newDoc;
  $('#demo-banner').hidden = meta.source !== 'demo';
  renderHero();
  renderTabs();
  renderMenu();
  renderVibes();
  renderVisit();
}

$('#year').textContent = new Date().getFullYear();

let searchTimer;
$('#menu-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = e.target.value.trim().toLowerCase();
    if (doc) renderMenu();
  }, 120);
});

// Shrink the top bar once the visitor scrolls past the hero.
const topbar = $('.topbar');
const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

loadForVisitors(render).catch((err) => {
  console.error(err);
  clear($('#menu-grid')).append(el('p', { class: 'empty', text: 'The menu could not be loaded. Please refresh the page.' }));
});
