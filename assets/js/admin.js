/* Beheer: inloggen met een GitHub-sleutel en het menu bewerken.
   De gegevens staan als één JSON-bestand in een Gist; bezoekers lezen die
   zonder sleutel, alleen de beheerder kan schrijven. */

import { CONFIG } from './config.js';
import { el, $, clear, formatPrice, uid, toast } from './dom.js';
import { checkToken, readGist, createGist, writeGist, GistError } from './gist.js';
import {
  normalize, bundledDoc, activeGistId, setLocalGistId,
  demoDoc, setDemoDoc, cacheDoc, storageGet, storageSet,
} from './store.js';

const SESSION_KEY = 'ptd.admin';
const DRAFT_KEY = 'ptd.draft';

const state = {
  session: null,       // { token, login } of { demo: true }
  gistId: '',
  doc: null,           // werkversie
  savedJson: '',       // laatst gepubliceerde versie, om "gewijzigd" te bepalen
  baseUpdatedAt: null, // updated_at van de Gist toen we hem lazen
  gistOwner: '',
  tab: 'menu',
  menuId: null,
  open: new Set(),     // opengeklapte categorieën
  saving: false,
};

const app = () => $('#app');

/* =============================================================== helpers */

const isDirty = () => state.doc && JSON.stringify(state.doc) !== state.savedJson;
const draftKey = () => (state.session?.demo ? 'demo' : state.gistId);
const money = (v) => formatPrice(v, state.doc?.info.currency || '$');

function changed({ rerender = true } = {}) {
  storageSet(DRAFT_KEY, { key: draftKey(), doc: state.doc, base: state.baseUpdatedAt });
  if (rerender) renderTab();
  renderSaveBar();
}

function move(list, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  const [x] = list.splice(index, 1);
  list.splice(to, 0, x);
}

function errorText(err) {
  return err instanceof GistError ? err.message : (err?.message || 'Er ging iets mis.');
}

function iconBtn(label, symbol, onclick, extra = '') {
  return el('button', { type: 'button', class: `icon-btn ${extra}`, title: label, 'aria-label': label, text: symbol, onclick });
}

function field(label, input, help) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    input,
    help ? el('span', { class: 'field-help', text: help }) : null,
  ]);
}

function toggle(label, checked, onchange) {
  return el('label', { class: 'switch' }, [
    el('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }),
    el('span', { class: 'switch-track', 'aria-hidden': 'true' }),
    el('span', { class: 'switch-label', text: label }),
  ]);
}

/* ================================================================= modal */

/**
 * Generiek formulier in een dialoog.
 * fields: [{ key, label, type: text|textarea|price|checkbox|select, value, placeholder, help, options }]
 */
function openForm({ title, fields, submitText = 'Opslaan', onSave, onDelete, deleteText = 'Verwijderen' }) {
  const dialog = $('#modal');
  const form = clear($('#modal-form'));
  const inputs = {};

  const body = el('div', { class: 'modal-body' });
  for (const f of fields) {
    let input;
    if (f.type === 'textarea') {
      input = el('textarea', { rows: 3, placeholder: f.placeholder || '', value: f.value ?? '' });
    } else if (f.type === 'checkbox') {
      input = el('input', { type: 'checkbox', checked: !!f.value });
      body.append(el('label', { class: 'switch' }, [input, el('span', { class: 'switch-track' }), el('span', { class: 'switch-label', text: f.label })]));
      inputs[f.key] = input;
      continue;
    } else if (f.type === 'select') {
      input = el('select', { value: f.value }, f.options.map((o) => el('option', { value: o.value, text: o.label })));
    } else if (f.type === 'price') {
      input = el('input', {
        type: 'text', inputmode: 'decimal', placeholder: f.placeholder || 'bijv. 12.50',
        value: f.value === null || f.value === undefined ? '' : String(f.value),
      });
    } else {
      input = el('input', { type: 'text', placeholder: f.placeholder || '', value: f.value ?? '', maxlength: f.maxlength || null });
    }
    inputs[f.key] = input;
    body.append(field(f.label, input, f.help));
  }

  const error = el('p', { class: 'form-error', hidden: true });

  form.append(
    el('header', { class: 'modal-head' }, [
      el('h2', { text: title }),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sluiten', text: '✕', onclick: () => dialog.close() }),
    ]),
    body,
    error,
    el('footer', { class: 'modal-foot' }, [
      onDelete ? el('button', {
        type: 'button', class: 'btn btn-danger btn-sm', text: deleteText,
        onclick: () => { dialog.close(); onDelete(); },
      }) : null,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Annuleren', onclick: () => dialog.close() }),
      el('button', { type: 'submit', class: 'btn btn-gold btn-sm', text: submitText }),
    ]),
  );

  form.onsubmit = (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const input = inputs[f.key];
      if (f.type === 'checkbox') values[f.key] = input.checked;
      else if (f.type === 'price') {
        const raw = input.value.trim().replace(',', '.').replace(/^[$€£ƒ]\s*/, '');
        if (raw === '') values[f.key] = null;
        else if (!Number.isFinite(Number(raw)) || Number(raw) < 0) {
          error.textContent = `"${f.label}" moet een bedrag zijn, bijvoorbeeld 12 of 12.50 — of leeg.`;
          error.hidden = false;
          input.focus();
          return;
        } else values[f.key] = Math.round(Number(raw) * 100) / 100;
      } else values[f.key] = input.value.trim();
    }
    const problem = onSave(values);
    if (typeof problem === 'string') {
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    dialog.close();
  };

  dialog.showModal();
  const first = form.querySelector('input:not([type=checkbox]), textarea, select');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
}

function confirmBox(message, { okText = 'Doorgaan', danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = $('#modal');
    const form = clear($('#modal-form'));
    // Bewust niet op het 'close'-event wachten: dat komt asynchroon binnen en kan
    // nog van de vorige dialoog zijn.
    const finish = (answer) => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.close();
      resolve(answer);
    };
    const onCancel = () => finish(false);
    form.append(
      el('div', { class: 'modal-body' }, [el('p', { class: 'confirm-text', text: message })]),
      el('footer', { class: 'modal-foot' }, [
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Annuleren', onclick: () => finish(false) }),
        el('button', {
          type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-gold'} btn-sm`, text: okText,
          onclick: () => finish(true),
        }),
      ]),
    );
    form.onsubmit = (e) => e.preventDefault();
    dialog.addEventListener('cancel', onCancel);
    if (!dialog.open) dialog.showModal();
  });
}

/* ================================================================= login */

function renderLogin(message = '') {
  const keyInput = el('input', {
    type: 'password', id: 'key', autocomplete: 'current-password', spellcheck: 'false',
    placeholder: 'github_pat_… of ghp_…',
  });
  const btn = el('button', { type: 'submit', class: 'btn btn-gold', text: 'Inloggen' });

  const submit = async (e) => {
    e.preventDefault();
    const token = keyInput.value.trim();
    if (!token) return keyInput.focus();
    btn.disabled = true;
    btn.textContent = 'Controleren…';
    try {
      await login(token);
    } catch (err) {
      renderLogin(errorText(err));
      $('#key').value = token;
    }
  };

  clear(app()).append(el('div', { class: 'login' }, [
    el('form', { class: 'login-card', onsubmit: submit }, [
      el('img', { src: 'assets/img/logo.jpg', alt: '', class: 'login-logo', width: 96, height: 96 }),
      el('p', { class: 'eyebrow', text: 'Pass The Dutchie' }),
      el('h1', { text: 'Beheer' }),
      el('p', { class: 'muted', text: 'Log in met je sleutel om het menu, de agenda en de openingstijden aan te passen.' }),
      field('Sleutel', keyInput),
      message ? el('p', { class: 'form-error', text: message }) : null,
      btn,
      el('details', { class: 'help' }, [
        el('summary', { text: 'Hoe kom ik aan een sleutel?' }),
        el('ol', {}, [
          el('li', {}, ['Ga naar ', el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener', text: 'GitHub → Fine-grained token' }), '.']),
          el('li', {}, ['Zet bij ', el('strong', { text: 'Account permissions → Gists' }), ' de waarde op ', el('strong', { text: 'Read and write' }), '. De rest mag uit.']),
          el('li', { text: 'Kies een vervaldatum, maak de sleutel en plak hem hierboven.' }),
        ]),
        el('p', { class: 'muted small', text: 'De sleutel blijft alleen op dit apparaat bewaard en gaat rechtstreeks naar GitHub — nergens anders heen.' }),
      ]),
    ]),
    el('div', { class: 'login-alt' }, [
      el('p', { class: 'muted small', text: 'Eerst rondkijken? In de demo werkt alles, maar blijven wijzigingen in deze browser.' }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '🧪 Demo zonder sleutel', onclick: () => startDemo() }),
      el('a', { class: 'btn btn-ghost btn-sm', href: './', text: '← Naar de website' }),
    ]),
  ]));
  setTimeout(() => keyInput.focus(), 50);
}

async function login(token) {
  const login = await checkToken(token);
  state.session = { token, login };
  storageSet(SESSION_KEY, state.session);
  await openGistOrSetup();
}

async function openGistOrSetup() {
  state.gistId = activeGistId();
  if (!state.gistId) return renderSetup();
  clear(app()).append(el('p', { class: 'loading', text: 'Menu ophalen…' }));
  try {
    const remote = await readGist(state.gistId, CONFIG.gistFile, state.session.token);
    if (remote.owner && state.session.login && remote.owner !== state.session.login) {
      toast(`Let op: deze Gist is van ${remote.owner}, je sleutel van ${state.session.login}. Publiceren gaat dan niet.`, 'bad', 8000);
    }
    state.gistOwner = remote.owner || '';
    loadDoc(normalize(remote.doc), remote.updatedAt);
  } catch (err) {
    if (err.status === 404 && !CONFIG.gistId) {
      setLocalGistId('');
      toast('De gekoppelde Gist bestaat niet meer.', 'bad', 5000);
      return renderSetup();
    }
    renderLogin(errorText(err));
  }
}

async function startDemo({ fresh = true } = {}) {
  state.session = { demo: true };
  storageSet(SESSION_KEY, state.session);
  let doc = demoDoc();
  if (!doc) {
    doc = await bundledDoc();
    setDemoDoc(doc);
  }
  loadDoc(normalize(doc), null);
  if (fresh) toast('Demo gestart. "Publiceren" toont je wijzigingen op de website in déze browser.', 'good', 5000);
}

function loadDoc(doc, updatedAt) {
  state.doc = doc;
  state.savedJson = JSON.stringify(doc);
  state.baseUpdatedAt = updatedAt;
  state.menuId = doc.menus[0]?.id ?? null;

  const draft = storageGet(DRAFT_KEY);
  if (draft?.key === draftKey() && draft.doc) {
    const draftDoc = normalize(draft.doc);
    if (JSON.stringify(draftDoc) !== state.savedJson) {
      state.doc = draftDoc;
      toast('Je niet-gepubliceerde wijzigingen zijn teruggezet.', 'good', 4000);
    }
  }
  renderShell();
}

/* ================================================================= setup */

function renderSetup() {
  const idInput = el('input', { type: 'text', placeholder: 'bijv. 3f9a2c…', spellcheck: 'false' });
  clear(app()).append(el('div', { class: 'login' }, [
    el('div', { class: 'login-card wide' }, [
      el('p', { class: 'eyebrow', text: `Ingelogd als ${state.session.login || 'beheerder'}` }),
      el('h1', { text: 'Nog één stap' }),
      el('p', { class: 'muted', text: 'Het menu wordt bewaard in een Gist op GitHub. Die is er nog niet. Maak er één aan — hij wordt gevuld met het huidige menu — of koppel een bestaande.' }),
      el('button', {
        type: 'button', class: 'btn btn-gold', id: 'create', text: '✨ Nieuwe Gist aanmaken',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Bezig…';
          try {
            const doc = await bundledDoc();
            const { id, updatedAt } = await createGist(state.session.token, CONFIG.gistFile, doc);
            setLocalGistId(id);
            state.gistId = id;
            loadDoc(doc, updatedAt);
            state.tab = 'settings';
            renderShell();
            toast('Gist aangemaakt! Zet het id nog in config.js (zie Instellingen).', 'good', 7000);
          } catch (err) {
            e.target.disabled = false;
            e.target.textContent = '✨ Nieuwe Gist aanmaken';
            toast(errorText(err), 'bad', 6000);
          }
        },
      }),
      el('div', { class: 'divider', text: 'of' }),
      field('Bestaande Gist-id', idInput, 'Het laatste stuk van de Gist-link: gist.github.com/<naam>/<id>'),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Koppelen',
        onclick: async () => {
          const id = idInput.value.trim().split('/').pop();
          if (!id) return idInput.focus();
          setLocalGistId(id);
          await openGistOrSetup();
        },
      }),
      el('button', { type: 'button', class: 'linkish', text: 'Uitloggen', onclick: logout }),
    ]),
  ]));
}

/* ================================================================= shell */

const TABS = [
  ['menu', 'Menu', '🍽'],
  ['events', 'Agenda', '🎶'],
  ['info', 'Info', 'ℹ️'],
  ['settings', 'Instellingen', '⚙️'],
];

function renderShell() {
  const demo = !!state.session.demo;
  clear(app()).append(...[
    demo ? el('div', { class: 'demo-strip', text: '🧪 Demo — wijzigingen blijven in deze browser' }) : null,
    el('header', { class: 'admin-top' }, [
      el('a', { class: 'admin-brand', href: './', title: 'Naar de website' }, [
        el('img', { src: 'assets/img/icon-192.png', alt: '', width: 36, height: 36 }),
        el('span', {}, [el('strong', { text: 'Beheer' }), el('small', { text: state.doc.info.name })]),
      ]),
      el('span', { class: 'status', id: 'status' }),
      el('a', { class: 'btn btn-ghost btn-xs hide-sm', href: './', target: '_blank', rel: 'noopener', text: 'Bekijk site ↗' }),
    ]),
    el('nav', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label, emoji]) => el('button', {
      type: 'button', role: 'tab', class: state.tab === id ? 'active' : '', 'aria-selected': String(state.tab === id),
      onclick: () => { state.tab = id; renderShell(); window.scrollTo(0, 0); },
    }, [el('span', { class: 'tab-emoji', text: emoji, 'aria-hidden': 'true' }), el('span', { text: label })]))),
    el('main', { class: 'admin-main', id: 'tab' }),
    el('div', { class: 'savebar', id: 'savebar' }),
  ].filter(Boolean));
  renderTab();
  renderSaveBar();
}

function renderTab() {
  const main = $('#tab');
  if (!main) return;
  const y = window.scrollY;
  clear(main);
  if (state.tab === 'menu') renderMenuTab(main);
  else if (state.tab === 'events') renderEventsTab(main);
  else if (state.tab === 'info') renderInfoTab(main);
  else renderSettingsTab(main);
  window.scrollTo(0, y);
}

function renderSaveBar() {
  const dirty = isDirty();
  const status = $('#status');
  if (status) {
    status.textContent = dirty ? 'Niet gepubliceerd' : 'Alles gepubliceerd';
    status.className = `status ${dirty ? 'dirty' : 'clean'}`;
  }
  const bar = $('#savebar');
  if (!bar) return;
  bar.classList.toggle('show', dirty);
  clear(bar).append(el('div', { class: 'savebar-inner' }, [
    el('span', { class: 'savebar-text', text: 'Je hebt wijzigingen die nog niet op de website staan.' }),
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Ongedaan maken', disabled: state.saving, onclick: revert }),
    el('button', { type: 'button', class: 'btn btn-gold btn-sm', text: state.saving ? 'Publiceren…' : 'Publiceren', disabled: state.saving, onclick: publish }),
  ]));
}

async function revert() {
  if (!(await confirmBox('Alle wijzigingen sinds de laatste keer publiceren weggooien?', { okText: 'Weggooien', danger: true }))) return;
  state.doc = JSON.parse(state.savedJson);
  storageSet(DRAFT_KEY, null);
  renderShell();
}

async function publish() {
  if (state.saving) return;
  state.saving = true;
  renderSaveBar();
  try {
    if (state.session.demo) {
      setDemoDoc(state.doc);
    } else {
      // Kijk eerst of iemand anders intussen iets heeft gepubliceerd.
      const remote = await readGist(state.gistId, CONFIG.gistFile, state.session.token);
      const remoteJson = JSON.stringify(normalize(remote.doc));
      if (state.baseUpdatedAt && remote.updatedAt !== state.baseUpdatedAt && remoteJson !== state.savedJson) {
        const ok = await confirmBox('Het menu is intussen op een ander apparaat aangepast. Als je nu publiceert, overschrijf je die wijzigingen.', { okText: 'Toch publiceren', danger: true });
        if (!ok) return;
      }
      const { updatedAt } = await writeGist(state.session.token, state.gistId, CONFIG.gistFile, state.doc);
      state.baseUpdatedAt = updatedAt;
      cacheDoc(state.doc, updatedAt);
    }
    state.savedJson = JSON.stringify(state.doc);
    storageSet(DRAFT_KEY, null);
    toast('Gepubliceerd! De website is bijgewerkt.', 'good');
  } catch (err) {
    toast(`Publiceren mislukt: ${errorText(err)}`, 'bad', 7000);
  } finally {
    state.saving = false;
    renderSaveBar();
  }
}

/* ============================================================== menu tab */

function currentMenu() {
  return state.doc.menus.find((m) => m.id === state.menuId) || state.doc.menus[0];
}

function renderMenuTab(main) {
  const menu = currentMenu();
  if (menu) state.menuId = menu.id;

  main.append(el('div', { class: 'toolbar' }, [
    el('div', { class: 'segmented' }, state.doc.menus.map((m) => el('button', {
      type: 'button', class: m.id === state.menuId ? 'active' : '', text: m.name,
      onclick: () => { state.menuId = m.id; renderTab(); },
    }))),
    menu ? iconBtn('Menu hernoemen of verwijderen', '✎', () => editMenu(menu)) : null,
    el('button', { type: 'button', class: 'btn btn-ghost btn-xs', text: '+ Menu', onclick: addMenu }),
  ]));

  if (!menu) {
    main.append(el('p', { class: 'empty', text: 'Nog geen menu. Voeg er één toe, bijvoorbeeld "Food".' }));
    return;
  }

  const allOpen = menu.categories.every((c) => state.open.has(c.id));
  main.append(el('div', { class: 'list-head' }, [
    el('h2', { text: `${menu.categories.length} categorieën` }),
    el('button', {
      type: 'button', class: 'linkish', text: allOpen ? 'Alles inklappen' : 'Alles uitklappen',
      onclick: () => {
        for (const c of menu.categories) allOpen ? state.open.delete(c.id) : state.open.add(c.id);
        renderTab();
      },
    }),
  ]));

  menu.categories.forEach((cat, ci) => main.append(categoryCard(menu, cat, ci)));

  main.append(el('button', { type: 'button', class: 'add-row', text: '+ Categorie toevoegen', onclick: () => addCategory(menu) }));
}

function categoryCard(menu, cat, ci) {
  const open = state.open.has(cat.id);
  const soldOut = cat.items.filter((i) => i.soldOut).length;

  const head = el('div', { class: 'cat-row' }, [
    el('button', {
      type: 'button', class: 'cat-toggle', 'aria-expanded': String(open),
      onclick: () => { open ? state.open.delete(cat.id) : state.open.add(cat.id); renderTab(); },
    }, [
      el('span', { class: 'chev', text: open ? '▾' : '▸', 'aria-hidden': 'true' }),
      el('span', { class: 'cat-emoji', text: cat.icon || '•' }),
      el('span', { class: 'cat-text' }, [
        el('strong', { text: cat.name || '(naamloos)' }),
        el('small', {
          text: [
            `${cat.items.length} items`,
            cat.price !== null ? `${money(cat.price)} p/st` : '',
            soldOut ? `${soldOut} uitverkocht` : '',
          ].filter(Boolean).join(' · '),
        }),
      ]),
      cat.hidden ? el('span', { class: 'badge', text: 'Verborgen' }) : null,
    ]),
    el('div', { class: 'row-actions' }, [
      iconBtn('Omhoog', '↑', () => { move(menu.categories, ci, -1); changed(); }, ci === 0 ? 'off' : ''),
      iconBtn('Omlaag', '↓', () => { move(menu.categories, ci, 1); changed(); }, ci === menu.categories.length - 1 ? 'off' : ''),
      iconBtn('Categorie bewerken', '✎', () => editCategory(menu, cat)),
    ]),
  ]);

  const body = open ? el('div', { class: 'cat-body' }, [
    cat.note ? el('p', { class: 'cat-note', text: cat.note }) : null,
    el('ul', { class: 'item-list' }, cat.items.map((item, ii) => el('li', { class: `item-row${item.soldOut ? ' is-sold' : ''}${item.hidden ? ' is-hidden' : ''}` }, [
      el('button', { type: 'button', class: 'item-main', onclick: () => editItem(cat, item) }, [
        el('span', { class: 'item-top' }, [
          el('strong', { text: item.name || '(naamloos)' }),
          item.popular ? el('span', { class: 'badge hot', text: 'Populair' }) : null,
          item.hidden ? el('span', { class: 'badge', text: 'Verborgen' }) : null,
          el('span', { class: 'item-price', text: item.price !== null ? money(item.price) : (cat.price !== null ? `(${money(cat.price)})` : '—') }),
        ]),
        item.description ? el('small', { text: item.description }) : null,
      ]),
      el('div', { class: 'row-actions' }, [
        toggle('Uitverkocht', item.soldOut, (v) => { item.soldOut = v; changed(); }),
        iconBtn('Omhoog', '↑', () => { move(cat.items, ii, -1); changed(); }, ii === 0 ? 'off' : ''),
        iconBtn('Omlaag', '↓', () => { move(cat.items, ii, 1); changed(); }, ii === cat.items.length - 1 ? 'off' : ''),
      ]),
    ]))),
    el('button', { type: 'button', class: 'add-row small', text: '+ Item toevoegen', onclick: () => addItem(cat) }),
  ]) : null;

  return el('section', { class: `cat-card${open ? ' open' : ''}${cat.hidden ? ' is-hidden' : ''}` }, [head, body]);
}

function itemFields(item = {}) {
  return [
    { key: 'name', label: 'Naam', value: item.name, placeholder: 'bijv. Dutchie Burger' },
    { key: 'description', label: 'Omschrijving', type: 'textarea', value: item.description, placeholder: 'bijv. Egg, bacon & cheese' },
    { key: 'price', label: 'Prijs', type: 'price', value: item.price ?? null, help: 'Leeg laten als de categorieprijs geldt.' },
    { key: 'soldOut', label: 'Uitverkocht', type: 'checkbox', value: item.soldOut },
    { key: 'popular', label: 'Markeer als populair', type: 'checkbox', value: item.popular },
    { key: 'hidden', label: 'Verbergen op de website', type: 'checkbox', value: item.hidden },
  ];
}

function addItem(cat) {
  openForm({
    title: `Nieuw item in ${cat.name}`,
    fields: itemFields(),
    submitText: 'Toevoegen',
    onSave: (v) => {
      if (!v.name) return 'Geef het item een naam.';
      cat.items.push({ id: uid('item'), ...v });
      changed();
    },
  });
}

function editItem(cat, item) {
  openForm({
    title: 'Item bewerken',
    fields: itemFields(item),
    onSave: (v) => {
      if (!v.name) return 'Geef het item een naam.';
      Object.assign(item, v);
      changed();
    },
    onDelete: () => {
      cat.items.splice(cat.items.indexOf(item), 1);
      changed();
      toast(`"${item.name}" verwijderd`);
    },
  });
}

function categoryFields(cat = {}) {
  return [
    { key: 'name', label: 'Naam', value: cat.name, placeholder: 'bijv. Burgers' },
    { key: 'icon', label: 'Icoon (emoji)', value: cat.icon, placeholder: '🍔', maxlength: 8 },
    { key: 'note', label: 'Toelichting', value: cat.note, placeholder: 'bijv. All burgers come with fries' },
    { key: 'price', label: 'Prijs voor de hele categorie', type: 'price', value: cat.price ?? null, help: 'Bijv. "$14" bij cocktails. Leeg = elk item heeft een eigen prijs.' },
    { key: 'hidden', label: 'Verbergen op de website', type: 'checkbox', value: cat.hidden },
  ];
}

function addCategory(menu) {
  openForm({
    title: `Nieuwe categorie in ${menu.name}`,
    fields: categoryFields(),
    submitText: 'Toevoegen',
    onSave: (v) => {
      if (!v.name) return 'Geef de categorie een naam.';
      const cat = { id: uid('cat'), ...v, items: [] };
      menu.categories.push(cat);
      state.open.add(cat.id);
      changed();
    },
  });
}

function editCategory(menu, cat) {
  const others = state.doc.menus.filter((m) => m !== menu);
  const fields = categoryFields(cat);
  if (others.length) {
    fields.push({
      key: 'menu', label: 'Staat in menu', type: 'select', value: menu.id,
      options: state.doc.menus.map((m) => ({ value: m.id, label: m.name })),
    });
  }
  openForm({
    title: 'Categorie bewerken',
    fields,
    onSave: ({ menu: target, ...v }) => {
      if (!v.name) return 'Geef de categorie een naam.';
      Object.assign(cat, v);
      if (target && target !== menu.id) {
        menu.categories.splice(menu.categories.indexOf(cat), 1);
        state.doc.menus.find((m) => m.id === target).categories.push(cat);
      }
      changed();
    },
    deleteText: 'Categorie verwijderen',
    onDelete: () => {
      confirmBox(`"${cat.name}" met ${cat.items.length} items verwijderen?`, { okText: 'Verwijderen', danger: true }).then((ok) => {
        if (!ok) return;
        menu.categories.splice(menu.categories.indexOf(cat), 1);
        changed();
      });
    },
  });
}

function addMenu() {
  openForm({
    title: 'Nieuw menu',
    fields: [{ key: 'name', label: 'Naam', placeholder: 'bijv. Desserts' }],
    submitText: 'Toevoegen',
    onSave: ({ name }) => {
      if (!name) return 'Geef het menu een naam.';
      const menu = { id: uid('menu'), name, categories: [] };
      state.doc.menus.push(menu);
      state.menuId = menu.id;
      changed();
    },
  });
}

function editMenu(menu) {
  const i = state.doc.menus.indexOf(menu);
  openForm({
    title: 'Menu bewerken',
    fields: [{ key: 'name', label: 'Naam', value: menu.name }],
    onSave: ({ name }) => {
      if (!name) return 'Geef het menu een naam.';
      menu.name = name;
      changed();
    },
    deleteText: 'Menu verwijderen',
    onDelete: () => {
      confirmBox(`Menu "${menu.name}" met ${menu.categories.length} categorieën verwijderen?`, { okText: 'Verwijderen', danger: true }).then((ok) => {
        if (!ok) return;
        state.doc.menus.splice(i, 1);
        state.menuId = state.doc.menus[0]?.id ?? null;
        changed();
      });
    },
  });
  // De volgorde van de menu's regel je ook hier, met pijltjes links in de dialoog.
  const foot = $('#modal-form .modal-foot');
  foot.prepend(
    iconBtn('Menu naar links', '←', () => { move(state.doc.menus, i, -1); $('#modal').close(); changed(); }, i === 0 ? 'off' : ''),
    iconBtn('Menu naar rechts', '→', () => { move(state.doc.menus, i, 1); $('#modal').close(); changed(); }, i === state.doc.menus.length - 1 ? 'off' : ''),
  );
}

/* ============================================================ events tab */

function renderEventsTab(main) {
  const events = state.doc.events;
  main.append(el('div', { class: 'list-head' }, [
    el('h2', { text: 'Wekelijkse agenda' }),
    el('span', { class: 'muted small', text: 'Staat op de site onder "Weekly vibes".' }),
  ]));
  main.append(el('ul', { class: 'item-list boxed' }, events.map((ev, i) => el('li', { class: `item-row${ev.hidden ? ' is-hidden' : ''}` }, [
    el('button', { type: 'button', class: 'item-main', onclick: () => editEvent(ev) }, [
      el('span', { class: 'item-top' }, [
        el('span', { class: 'day-pill', text: ev.day || '—' }),
        el('strong', { text: ev.title || '(naamloos)' }),
        ev.hidden ? el('span', { class: 'badge', text: 'Verborgen' }) : null,
      ]),
      el('small', { text: [ev.time, ev.description].filter(Boolean).join(' · ') }),
    ]),
    el('div', { class: 'row-actions' }, [
      iconBtn('Omhoog', '↑', () => { move(events, i, -1); changed(); }, i === 0 ? 'off' : ''),
      iconBtn('Omlaag', '↓', () => { move(events, i, 1); changed(); }, i === events.length - 1 ? 'off' : ''),
    ]),
  ]))));
  main.append(el('button', { type: 'button', class: 'add-row', text: '+ Activiteit toevoegen', onclick: () => editEvent(null) }));
}

function editEvent(ev) {
  openForm({
    title: ev ? 'Activiteit bewerken' : 'Nieuwe activiteit',
    fields: [
      { key: 'day', label: 'Dag', value: ev?.day, placeholder: 'bijv. Friday', help: 'Gebruik de Engelse dagnaam, dan krijgt hij op die dag het label "Tonight".' },
      { key: 'title', label: 'Titel', value: ev?.title, placeholder: 'bijv. Ladies night' },
      { key: 'time', label: 'Tijd', value: ev?.time, placeholder: 'bijv. 19:00 – 23:00' },
      { key: 'description', label: 'Omschrijving', type: 'textarea', value: ev?.description },
      { key: 'hidden', label: 'Verbergen op de website', type: 'checkbox', value: ev?.hidden },
    ],
    submitText: ev ? 'Opslaan' : 'Toevoegen',
    onSave: (v) => {
      if (!v.title) return 'Geef de activiteit een titel.';
      if (ev) Object.assign(ev, v);
      else state.doc.events.push({ id: uid('ev'), ...v });
      changed();
    },
    onDelete: ev ? () => { state.doc.events.splice(state.doc.events.indexOf(ev), 1); changed(); } : null,
  });
}

/* ============================================================== info tab */

function bound(obj, key, { textarea = false, placeholder = '' } = {}) {
  const input = el(textarea ? 'textarea' : 'input', {
    type: textarea ? null : 'text', rows: textarea ? 3 : null, placeholder, value: obj[key] ?? '',
    oninput: (e) => { obj[key] = e.target.value; changed({ rerender: false }); },
  });
  return input;
}

function pairList(title, list, labels) {
  const wrap = el('div', { class: 'pairs' });
  const draw = () => {
    clear(wrap);
    list.forEach((row, i) => wrap.append(el('div', { class: 'pair' }, [
      bound(row, 'label', { placeholder: labels[0] }),
      bound(row, 'value', { placeholder: labels[1] }),
      iconBtn('Omhoog', '↑', () => { move(list, i, -1); changed({ rerender: false }); draw(); }, i === 0 ? 'off' : ''),
      iconBtn('Verwijderen', '✕', () => { list.splice(i, 1); changed({ rerender: false }); draw(); }),
    ])));
    wrap.append(el('button', {
      type: 'button', class: 'add-row small', text: '+ Regel toevoegen',
      onclick: () => { list.push({ label: '', value: '' }); changed({ rerender: false }); draw(); wrap.querySelector('.pair:last-of-type input')?.focus(); },
    }));
  };
  draw();
  return el('section', { class: 'panel' }, [el('h3', { text: title }), wrap]);
}

function renderInfoTab(main) {
  const { info } = state.doc;
  main.append(
    el('section', { class: 'panel' }, [
      el('h3', { text: 'Algemeen' }),
      field('Naam', bound(info, 'name')),
      field('Slogan', bound(info, 'tagline', { placeholder: 'Dutch bites, island vibes' })),
      field('Introductie', bound(info, 'intro', { textarea: true })),
      field('Mededeling bovenaan', bound(info, 'announcement', { placeholder: 'bijv. Closed on Christmas day' }), 'Leeg = geen mededeling. Handig voor tijdelijke berichten.'),
      field('Valuta-teken', bound(info, 'currency', { placeholder: '$' })),
    ]),
    el('section', { class: 'panel' }, [
      el('h3', { text: 'Contact & adres' }),
      field('Adres', bound(info, 'address')),
      field('Google Maps-link', bound(info, 'mapsUrl', { placeholder: 'https://maps.google.com/…' })),
      field('Telefoon', bound(info, 'phone', { placeholder: '+1 721 …' })),
      field('WhatsApp', bound(info, 'whatsapp', { placeholder: '+1 721 …' }), 'Wordt de "Order"-knop op de site.'),
      field('Instagram', bound(info, 'instagram', { placeholder: 'passthedutchie.sxm' })),
      field('Facebook', bound(info, 'facebook', { placeholder: 'passthedutchie.sxm' })),
    ]),
    pairList('Openingstijden', info.hours, ['bijv. Kitchen', 'bijv. Daily 9:00 – 16:00']),
    pairList('Bezorgkosten', info.delivery, ['bijv. Town', 'bijv. $2']),
    el('section', { class: 'panel' }, [
      el('h3', { text: 'Wi-Fi' }),
      field('Netwerknaam', bound(info.wifi, 'name'), 'Leeg = Wi-Fi niet tonen op de site.'),
      field('Wachtwoord', bound(info.wifi, 'password')),
    ]),
  );
}

/* ========================================================== settings tab */

function renderSettingsTab(main) {
  const demo = !!state.session.demo;
  const siteUrl = new URL('./', location.href).href;
  const owner = state.gistOwner || state.session.login || '';
  const needsConfig = !demo && state.gistId && (CONFIG.gistId !== state.gistId || (owner && CONFIG.gistOwner !== owner));

  if (needsConfig) {
    const line = `  gistId: '${state.gistId}',\n  gistOwner: '${owner}',`;
    main.append(el('section', { class: 'panel attention' }, [
      el('h3', { text: '⚠️ Nog één ding: bezoekers zien de Gist nog niet' }),
      el('p', { text: 'Op dit apparaat leest de site al uit je Gist, maar voor bezoekers moet hij nog in de code staan. Zet deze regels in assets/js/config.js en push:' }),
      el('pre', { class: 'code', text: line }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Kopieer regels', onclick: () => copy(line) }),
    ]));
  }

  main.append(el('section', { class: 'panel' }, [
    el('h3', { text: 'Opslag' }),
    demo
      ? el('p', { class: 'muted', text: 'Je zit in de demo. Alles staat in deze browser; de website toont de demogegevens alleen hier.' })
      : el('dl', { class: 'kv' }, [
        el('dt', { text: 'Ingelogd als' }), el('dd', { text: state.session.login || '—' }),
        el('dt', { text: 'Gist' }), el('dd', {}, [el('a', { href: `https://gist.github.com/${state.gistId}`, target: '_blank', rel: 'noopener', text: state.gistId })]),
        el('dt', { text: 'Laatst gepubliceerd' }), el('dd', { text: state.baseUpdatedAt ? new Date(state.baseUpdatedAt).toLocaleString('nl-NL') : '—' }),
      ]),
    el('div', { class: 'btn-row' }, [
      el('a', { class: 'btn btn-ghost btn-sm', href: siteUrl, target: '_blank', rel: 'noopener', text: 'Website openen ↗' }),
      demo ? null : el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Opnieuw ophalen', onclick: reload }),
    ]),
  ]));

  if (!demo) {
    main.append(el('section', { class: 'panel' }, [
      el('h3', { text: 'Inloggen op je telefoon' }),
      el('p', { class: 'muted', text: 'Een link waarin je sleutel zit. Eén keer openen op je telefoon en je bent ingelogd. Deel hem met niemand: wie de link heeft, kan het menu aanpassen.' }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '🔑 Kopieer beheerlink',
        onclick: () => copy(`${new URL('beheer.html', location.href).href}#k=${encodeURIComponent(state.session.token)}`),
      }),
    ]));
  }

  main.append(el('section', { class: 'panel' }, [
    el('h3', { text: 'Back-up' }),
    el('p', { class: 'muted', text: 'Download het hele menu als bestand, of zet een eerder bestand terug. Terugzetten wordt pas zichtbaar na publiceren.' }),
    el('div', { class: 'btn-row' }, [
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '⬇ Download back-up', onclick: exportJson }),
      el('label', { class: 'btn btn-ghost btn-sm' }, [
        '⬆ Back-up terugzetten',
        el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importJson }),
      ]),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '↺ Standaardmenu',
        onclick: async () => {
          if (!(await confirmBox('Het hele menu vervangen door het standaardmenu uit de website-code?', { okText: 'Vervangen', danger: true }))) return;
          state.doc = await bundledDoc();
          state.menuId = state.doc.menus[0]?.id;
          changed();
          renderShell();
        },
      }),
    ]),
  ]));

  main.append(el('section', { class: 'panel' }, [
    el('h3', { text: demo ? 'Demo' : 'Afmelden' }),
    el('button', {
      type: 'button', class: 'btn btn-danger btn-sm',
      text: demo ? 'Demo verlaten en gegevens wissen' : 'Uitloggen op dit apparaat',
      onclick: logout,
    }),
  ]));
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Gekopieerd', 'good');
  } catch {
    window.prompt('Kopieer:', text);
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.doc, null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `passthedutchie-menu-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed?.menus)) throw new Error('Dit bestand bevat geen menu.');
    state.doc = normalize(parsed);
    state.menuId = state.doc.menus[0]?.id;
    changed();
    renderShell();
    toast('Back-up geladen. Controleer en publiceer.', 'good', 4000);
  } catch (err) {
    toast(`Kon het bestand niet lezen: ${err.message}`, 'bad', 5000);
  }
}

async function reload() {
  if (isDirty() && !(await confirmBox('Je niet-gepubliceerde wijzigingen gaan verloren. Doorgaan?', { danger: true }))) return;
  storageSet(DRAFT_KEY, null);
  await openGistOrSetup();
}

async function logout() {
  if (isDirty() && !(await confirmBox('Je hebt niet-gepubliceerde wijzigingen. Toch afmelden?', { okText: 'Afmelden', danger: true }))) return;
  if (state.session?.demo) setDemoDoc(null);
  storageSet(SESSION_KEY, null);
  storageSet(DRAFT_KEY, null);
  state.session = null;
  state.doc = null;
  renderLogin();
}

/* ================================================================== boot */

window.addEventListener('beforeunload', (e) => {
  if (isDirty() && !state.session?.demo) e.preventDefault();
});

async function boot() {
  // Inloggen via een link: beheer.html#k=<sleutel>. Meteen uit de adresbalk halen.
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromLink = hash.get('k');
  if (fromLink) history.replaceState(null, '', location.pathname + location.search);

  const saved = storageGet(SESSION_KEY);
  try {
    if (fromLink) return await login(fromLink);
    if (saved?.demo) return await startDemo({ fresh: false });
    if (saved?.token) {
      state.session = saved;
      return await openGistOrSetup();
    }
  } catch (err) {
    return renderLogin(errorText(err));
  }
  renderLogin();
}

boot();
