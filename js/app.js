// UI: game tabs, card pickers, inputs, and the time-sliced simulation runner.
import { GAMES } from './games/index.js';
import { cardLabel, cardClass, SUIT_NAMES, SUIT_SYMBOLS, RANK_LABELS, JOKER } from './cards.js';
import { esc } from './render.js';

const $ = (sel) => document.querySelector(sel);
const RANK_ORDER = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // A K Q J 10 ... 2
const PICK_ORDER = [12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // A 2 3 ... K
const QUALITY = { fast: 0.3, normal: 1, precise: 4 };

let game, state, activeKey, runToken = 0;
let quality = 'normal';

const pickerFields = () => game.fields.filter((f) => f.type === 'cards' || f.type === 'ranks');
const usedCards = () => new Set(game.fields.filter((f) => f.type === 'cards').flatMap((f) => state[f.key]));

function defaults(g) {
  const s = {};
  for (const f of g.fields) {
    if (f.type === 'cards' || f.type === 'ranks') s[f.key] = [];
    else if (f.type === 'counts') s[f.key] = new Array(f.groups.length).fill(0);
    else s[f.key] = f.value;
  }
  return s;
}

function selectGame(id) {
  game = GAMES.find((g) => g.id === id) || GAMES[0];
  state = defaults(game);
  activeKey = pickerFields()[0]?.key;
  runToken++;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.id === game.id));
  if (location.hash.slice(1) !== game.id) history.replaceState(null, '', '#' + game.id);
  renderForm();
  $('#results').innerHTML = `<div class="placeholder">Enter what you know, then press <b>Run simulation</b>.</div>`;
}

// ---------- rendering ----------

function chip(field, value) {
  if (field.type === 'cards') {
    return `<button class="playing-card ${cardClass(value)}" data-remove="${field.key}" data-value="${value}" title="Remove">${cardLabel(value)}</button>`;
  }
  return `<button class="playing-card rank" data-remove="${field.key}" data-value="${value}" title="Remove">${RANK_LABELS[value]}</button>`;
}

function slotGroup(f) {
  const vals = state[f.key];
  const empties = Math.max(0, Math.min(f.max, Math.max(f.min, vals.length + 1)) - vals.length);
  const range = f.min === f.max ? `${f.max}` : `${f.min}–${f.max}`;
  return `<div class="slot-group ${activeKey === f.key ? 'active' : ''}" data-activate="${f.key}">
    <div class="slot-label">${esc(f.label)} <span class="muted">(${range})</span></div>
    <div class="slots">${vals.map((v) => chip(f, v)).join('')}${'<span class="slot-empty"></span>'.repeat(vals.length < f.max ? empties : 0)}</div>
  </div>`;
}

function cardGrid() {
  const used = usedCards();
  const joker = game.fields.some((f) => f.joker);
  return `<div class="card-grid">${joker ? `<div class="joker-row"><button class="pick joker" data-card="${JOKER}" ${used.has(JOKER) ? 'disabled' : ''}>Joker <span>★</span></button></div>` : ''}${[0, 1, 2, 3].map((s) => `<div class="grid-row">${RANK_ORDER.map((r) => {
    const c = r * 4 + s;
    return `<button class="pick ${SUIT_NAMES[s]}" data-card="${c}" ${used.has(c) ? 'disabled' : ''}>${RANK_LABELS[r]}<span>${SUIT_SYMBOLS[s]}</span></button>`;
  }).join('')}</div>`).join('')}</div>`;
}

function rankGrid() {
  const excluded = new Set(game.fields.flatMap((f) => f.excludeRanks || []));
  return `<div class="rank-grid">${PICK_ORDER.map((r) => `<button class="pick rank" data-rank="${r}" ${excluded.has(r) ? 'disabled title="Not in this deck"' : ''}>${RANK_LABELS[r]}</button>`).join('')}</div>`;
}

function countsField(f) {
  return `<div class="field counts"><div class="slot-label">${esc(f.label)}</div><div class="counters">${f.groups.map((g, i) =>
    `<div class="counter"><span class="counter-label">${esc(g)}</span>
      <button data-count="${f.key}" data-i="${i}" data-d="-1" aria-label="fewer ${esc(g)}">−</button>
      <span class="counter-val">${state[f.key][i]}</span>
      <button data-count="${f.key}" data-i="${i}" data-d="1" aria-label="more ${esc(g)}">+</button></div>`).join('')}</div></div>`;
}

function inputField(f) {
  if (f.type === 'checkbox') {
    return `<label class="field check${f.toggle ? ' toggle' : ''}"><input type="checkbox" data-key="${f.key}" ${state[f.key] ? 'checked' : ''}> ${esc(f.label)}</label>`;
  }
  if (f.type === 'text') {
    return `<label class="field num"><span>${esc(f.label)}</span>
      <input type="text" data-key="${f.key}" value="${esc(state[f.key])}" placeholder="${esc(f.placeholder || '')}">
      ${f.help ? `<small>${esc(f.help)}</small>` : ''}</label>`;
  }
  return `<label class="field num"><span>${esc(f.label)}</span>
    <input type="number" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${state[f.key]}">
    ${f.help ? `<small>${esc(f.help)}</small>` : ''}</label>`;
}

const visible = (f) => !f.showIf || state[f.showIf];

function renderForm() {
  const fields = game.fields.filter(visible);
  const hasCards = fields.some((f) => f.type === 'cards');
  const hasRanks = fields.some((f) => f.type === 'ranks');
  const pickers = pickerFields();
  $('#form').innerHTML = `
    <p class="desc">${esc(game.description)}</p>
    ${pickers.length ? `<div class="pickers">${pickers.map(slotGroup).join('')}</div>
      <p class="hint">Click a box above to choose where cards go, then click cards below. Click a chosen card to remove it.</p>` : ''}
    ${hasCards ? cardGrid() : ''}${hasRanks ? rankGrid() : ''}
    ${fields.filter((f) => f.type === 'counts').map(countsField).join('')}
    <div class="inputs">${fields.filter((f) => ['number', 'checkbox', 'text'].includes(f.type) && !f.showIf && !f.toggle).map(inputField).join('')}</div>
    ${fields.filter((f) => f.toggle).map((t) => `<div class="optional-panel${state[t.key] ? ' open' : ''}">${inputField(t)}
      ${state[t.key] ? `<div class="inputs">${fields.filter((f) => f.showIf === t.key).map(inputField).join('')}</div>` : ''}</div>`).join('')}
    <div class="actions">
      <label class="quality">Accuracy
        <select id="quality">${Object.keys(QUALITY).map((q) => `<option value="${q}" ${q === quality ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select>
      </label>
      ${pickers.length ? '<button class="secondary" id="random">Deal random</button><button class="secondary" id="clear">Clear</button>' : ''}
      <button class="primary" id="run">Run simulation</button>
    </div>`;
}

// ---------- interaction ----------

function addValue(value) {
  const pickers = pickerFields().filter((f) => (game.fields.find((x) => x.key === activeKey)?.type === f.type));
  let target = pickers.find((f) => f.key === activeKey && state[f.key].length < f.max)
    || pickers.find((f) => !f.optional && state[f.key].length < f.max);
  if (!target) return;
  state[target.key].push(value);
  const below = pickers.find((f) => !f.optional && state[f.key].length < f.min);
  const n = state[target.key].length;
  if (n >= target.max) activeKey = (below || pickers.find((f) => !f.optional && state[f.key].length < f.max) || target).key;
  else if (n >= target.min && below) activeKey = below.key;
  else activeKey = target.key;
  renderForm();
}

function dealRandom() {
  for (const f of pickerFields()) state[f.key] = [];
  const n = game.fields.some((f) => f.joker) ? 53 : 52;
  const excluded = new Set(game.fields.flatMap((f) => f.excludeRanks || []));
  const deck = Array.from({ length: n }, (_, i) => i).filter((c) => c === JOKER || !excluded.has(c >> 2)).sort(() => Math.random() - 0.5);
  for (const f of pickerFields()) {
    if (f.optional) continue;
    const n = f.key === 'board' ? [0, 3, 4, 5][Math.floor(Math.random() * 4)] : f.min;
    for (let i = 0; i < n; i++) state[f.key].push(f.type === 'cards' ? deck.pop() : deck.pop() >> 2);
  }
  renderForm();
}

function onClick(e) {
  const t = e.target.closest('button, .slot-group');
  if (!t) return;
  if (t.dataset.remove) {
    const arr = state[t.dataset.remove];
    arr.splice(arr.indexOf(Number(t.dataset.value)), 1);
    activeKey = t.dataset.remove;
    renderForm();
  } else if (t.dataset.card) {
    if (game.fields.find((f) => f.key === activeKey)?.type !== 'cards') activeKey = pickerFields().find((f) => f.type === 'cards').key;
    addValue(Number(t.dataset.card));
  } else if (t.dataset.rank) {
    if (game.fields.find((f) => f.key === activeKey)?.type !== 'ranks') activeKey = pickerFields().find((f) => f.type === 'ranks').key;
    addValue(Number(t.dataset.rank));
  } else if (t.dataset.count) {
    const arr = state[t.dataset.count];
    arr[t.dataset.i] = Math.max(0, arr[t.dataset.i] + Number(t.dataset.d));
    renderForm();
  } else if (t.dataset.activate) {
    activeKey = t.dataset.activate;
    renderForm();
  } else if (t.id === 'clear') {
    for (const f of pickerFields()) state[f.key] = [];
    activeKey = pickerFields()[0]?.key;
    renderForm();
  } else if (t.id === 'random') {
    dealRandom();
  } else if (t.id === 'run') {
    run();
  }
}

function onInput(e) {
  if (e.target.id === 'quality') { quality = e.target.value; return; }
  const key = e.target.dataset.key;
  if (!key) return;
  const f = game.fields.find((x) => x.key === key);
  if (f.type === 'checkbox') {
    state[key] = e.target.checked;
    if (e.type === 'change' && game.fields.some((x) => x.showIf === key)) renderForm();
  } else if (f.type === 'text') state[key] = e.target.value;
  else {
    const v = parseFloat(e.target.value);
    state[key] = Number.isFinite(v) ? Math.min(f.max, Math.max(f.min, v)) : f.value;
  }
}

// ---------- simulation runner ----------

function showError(msg) {
  $('#results').innerHTML = `<div class="error">${esc(msg)}</div>`;
}

function run() {
  for (const f of pickerFields()) {
    if (state[f.key].length < f.min) return showError(`${f.label}: pick at least ${f.min}.`);
  }
  for (const f of game.fields.filter((x) => x.type === 'number' && visible(x))) {
    if (f.step === 1 && !Number.isInteger(state[f.key])) state[f.key] = Math.round(state[f.key]);
  }
  const snapshot = structuredClone(state);
  const err = game.validate(snapshot);
  if (err) return showError(err);

  const token = ++runToken;
  const g = game;
  $('#results').innerHTML = `<div class="running">Simulating…<div class="progress"><div class="progress-fill" id="prog"></div></div></div>`;
  $('#run').disabled = true;
  let gen;
  try { gen = g.simulate(snapshot, QUALITY[quality]); } catch (ex) { return showError(ex.message); }
  const started = performance.now();

  const step = () => {
    if (token !== runToken) return;
    const sliceEnd = performance.now() + 30;
    try {
      let r;
      do {
        r = gen.next();
        if (r.done) {
          $('#results').innerHTML = g.render(r.value, snapshot) +
            `<p class="note muted">Finished in ${((performance.now() - started) / 1000).toFixed(1)} s.</p>`;
          if (window.innerWidth < 900) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
          $('#run').disabled = false;
          return;
        }
      } while (performance.now() < sliceEnd);
      const bar = $('#prog');
      if (bar) bar.style.width = `${Math.round((r.value || 0) * 100)}%`;
    } catch (ex) {
      showError(ex.message);
      $('#run').disabled = false;
      return;
    }
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

// ---------- boot ----------

$('#tabs').innerHTML = GAMES.map((g) => `<button class="tab" data-id="${g.id}">${esc(g.name)}</button>`).join('');
$('#tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) selectGame(t.dataset.id); });
$('#form').addEventListener('click', onClick);
$('#form').addEventListener('change', onInput);
$('#form').addEventListener('input', onInput);
window.addEventListener('hashchange', () => { if (location.hash.slice(1) !== game?.id) selectGame(location.hash.slice(1)); });
selectGame(location.hash.slice(1));
