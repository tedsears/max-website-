// Practice Pen: no-limit Texas Hold'em against simulated players of level 1-10.
// Every decision (bots and you) is scored with the same Monte Carlo used on the main site:
// level 10 always takes the highest-EV option; lower levels pick more randomly among options.
import { holdem } from './games/holdem.js';
import { evalCards, cardLabel, cardClass, makeDeck } from './cards.js';
import { esc } from './render.js';

const $ = (s) => document.querySelector(s);
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const SIM_QUALITY = 0.05; // ~2,500 simulated outcomes per decision

let setup = { bots: [5, 5], stack: 1000, bb: 10 };
let g = null; // game state
let review = []; // your decisions

// ---------- decision engine ----------

/** Option list (label, ev, put-in amount) for player i, from the Monte Carlo. */
function options(i) {
  const p = g.players[i];
  const opps = g.players.filter((q, k) => k !== i && !q.folded);
  const toCall = Math.min(g.currentBet - p.bet, p.stack);
  const pot = g.players.reduce((a, q) => a + q.total, 0);
  const st = {
    hero: p.cards, board: g.board, dead: [], opponents: opps.length, pot, toCall,
    modeling: true, profiles: [], sizing: true, stack: p.stack, oppStacks: opps.map((q) => q.stack + q.bet).join(','),
  };
  const gen = holdem.simulate(st, SIM_QUALITY);
  let r;
  do r = gen.next(); while (!r.done);
  const minRaise = toCall + Math.max(g.bb, g.lastRaise);
  return r.value.options
    .map((o) => ({ ...o, put: o.code === 'call' ? toCall : o.code === 'bet' ? o.total : 0 }))
    .filter((o) => o.code !== 'bet' || (o.put >= minRaise && o.put <= p.stack) || o.put === p.stack)
    .filter((o) => !(o.code === 'bet' && toCall >= p.stack));
}

/** Level 10: best EV. Lower levels: softmax over EV with temperature growing as level drops. */
function botChoose(opts, level) {
  const best = opts.reduce((a, b) => (b.ev > a.ev ? b : a));
  if (level >= 10) return best;
  const pot = g.players.reduce((a, q) => a + q.total, 0) || g.bb;
  const temp = pot * 0.04 * Math.pow(10 - level, 1.5);
  const w = opts.map((o) => Math.exp((o.ev - best.ev) / temp));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < opts.length; k++) { x -= w[k]; if (x <= 0) return opts[k]; }
  return best;
}

// ---------- game flow ----------

function newSession() {
  g = {
    bb: setup.bb, button: -1, hand: 0, log: [],
    players: [{ name: 'You', level: null, stack: setup.stack },
      ...setup.bots.map((lv, i) => ({ name: `Bot ${i + 1}`, level: lv, stack: setup.stack }))],
  };
  review = [];
  startHand();
}

function seated() { return g.players.map((p, i) => i).filter((i) => g.players[i].stack > 0); }
function nextSeat(i, list) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) { const j = (((i + k) % n) + n) % n; if (list.includes(j)) return j; }
  return i;
}

function startHand() {
  const live = seated();
  if (g.players[0].stack <= 0 || live.length < 2) return endSession();
  g.hand++;
  g.deck = makeDeck();
  for (let i = g.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [g.deck[i], g.deck[j]] = [g.deck[j], g.deck[i]]; }
  g.board = []; g.street = 0; g.done = false; g.result = '';
  g.players.forEach((p, i) => Object.assign(p, { cards: [], bet: 0, total: 0, folded: p.stack <= 0, allIn: false, out: p.stack <= 0 }));
  g.button = nextSeat(g.button, live);
  for (const i of live) g.players[i].cards = [g.deck.pop(), g.deck.pop()];
  const sb = live.length === 2 ? g.button : nextSeat(g.button, live);
  const bbSeat = nextSeat(sb, live);
  put(sb, Math.min(g.bb / 2, g.players[sb].stack));
  put(bbSeat, Math.min(g.bb, g.players[bbSeat].stack));
  g.currentBet = g.bb; g.lastRaise = g.bb;
  g.pending = order(nextSeat(bbSeat, live), live);
  g.log = [`Hand ${g.hand}: ${g.players[g.button].name} has the button.`];
  step();
}

function order(from, list) {
  const out = [];
  let i = from;
  for (let k = 0; k < list.length; k++) { const p = g.players[i]; if (!p.folded && !p.allIn) out.push(i); i = nextSeat(i, list); }
  return out;
}

function put(i, amt) {
  const p = g.players[i];
  amt = Math.min(amt, p.stack);
  p.stack -= amt; p.bet += amt; p.total += amt;
  if (p.stack === 0) p.allIn = true;
}

const v = (p, verb) => `${p.name} ${p.name === 'You' ? verb : verb.replace(/^(\w+)/, (w) => w + 's')}`;

function act(i, o) {
  const p = g.players[i];
  if (o.code === 'fold') { p.folded = true; g.log.push(`${v(p, 'fold')}.`); }
  else if (o.code === 'check') g.log.push(`${v(p, 'check')}.`);
  else if (o.code === 'call') { put(i, o.put); g.log.push(`${v(p, 'call')} $${o.put}${p.allIn ? ' (all-in)' : ''}.`); }
  else {
    const raiseBy = p.bet + o.put - g.currentBet;
    const verb = g.currentBet > 0 ? 'raise' : 'bet';
    put(i, o.put);
    if (p.bet > g.currentBet) {
      g.lastRaise = Math.max(g.lastRaise, raiseBy);
      g.currentBet = p.bet;
      g.pending = order(nextSeat(i, seatedIn()), seatedIn()).filter((k) => k !== i);
    }
    g.log.push(`${v(p, verb)} to $${p.bet}${p.allIn ? ' (all-in)' : ''}.`);
  }
}
const seatedIn = () => g.players.map((p, i) => i).filter((i) => !g.players[i].out);

function step() {
  render();
  const alive = g.players.filter((p) => !p.folded);
  if (alive.length === 1) return finish();
  if (!g.pending.length) return nextStreet();
  const i = g.pending[0];
  if (i === 0) { g.heroOpts = options(0); return render(); }
  setTimeout(() => {
    g.pending.shift();
    const opts = options(i);
    act(i, botChoose(opts, g.players[i].level));
    step();
  }, 350);
}

function heroAct(k) {
  const o = g.heroOpts[k];
  const best = g.heroOpts.reduce((a, b) => (b.ev > a.ev ? b : a));
  review.push({ hand: g.hand, street: STREETS[g.street], cards: g.players[0].cards.slice(), board: g.board.slice(),
    pot: g.players.reduce((a, q) => a + q.total, 0), options: g.heroOpts, chosen: o, best });
  g.heroOpts = null;
  g.pending.shift();
  act(0, o);
  step();
}

function nextStreet() {
  g.players.forEach((p) => { p.bet = 0; });
  g.currentBet = 0; g.lastRaise = g.bb;
  const canAct = g.players.filter((p) => !p.folded && !p.allIn).length;
  if (g.street === 3) return finish();
  g.street++;
  g.deck.pop(); // burn
  const n = g.street === 1 ? 3 : 1;
  for (let k = 0; k < n; k++) g.board.push(g.deck.pop());
  g.log.push(`${STREETS[g.street]}: ${g.board.map(cardLabel).join(' ')}`);
  g.pending = canAct >= 2 ? order(nextSeat(g.button, seatedIn()), seatedIn()) : [];
  step();
}

function finish() {
  while (g.board.length < 5 && g.players.filter((p) => !p.folded).length > 1) { g.deck.pop(); g.board.push(g.deck.pop()); }
  const alive = g.players.map((p, i) => i).filter((i) => !g.players[i].folded);
  const score = (i) => evalCards([...g.players[i].cards, ...g.board], 7);
  const levels = [...new Set(g.players.filter((p) => !p.folded).map((p) => p.total))].sort((a, b) => a - b);
  let prev = 0, lastWinners = [];
  const won = {};
  for (const L of levels) {
    const slice = g.players.reduce((a, p) => a + Math.max(0, Math.min(p.total, L) - prev), 0);
    const elig = alive.filter((i) => g.players[i].total >= L);
    const top = alive.length === 1 ? 0 : Math.max(...elig.map(score));
    const winners = alive.length === 1 ? elig : elig.filter((i) => score(i) === top);
    winners.forEach((i, k) => {
      const share = Math.floor(slice / winners.length) + (k === 0 ? slice % winners.length : 0);
      g.players[i].stack += share; won[i] = (won[i] || 0) + share;
    });
    lastWinners = winners;
    prev = L;
  }
  // Chips a folded player put in above every live player's total go to the last winners.
  const extra = g.players.reduce((a, p) => a + (p.folded ? Math.max(0, p.total - prev) : 0), 0);
  if (extra) { g.players[lastWinners[0]].stack += extra; won[lastWinners[0]] += extra; }
  g.result = Object.entries(won).map(([i, amt]) => `${v(g.players[i], 'win')} $${amt}`).join(', ');
  g.log.push(g.result + '.');
  g.done = true; g.showdown = alive.length > 1;
  render();
}

// ---------- rendering ----------

const card = (c, hidden) => hidden ? '<span class="pcard back"></span>' : `<span class="pcard ${cardClass(c)}">${cardLabel(c)}</span>`;

function renderSetup() {
  $('#pen').innerHTML = `<div class="panel">
    <h2>Set up the table</h2>
    <p class="desc">No-limit Texas Hold'em. Add up to 8 simulated players. Level 10 always makes the move the Monte Carlo rates best; each level below it chooses more randomly.</p>
    <div class="bots">${setup.bots.map((lv, i) => `<div class="bot-row">Bot ${i + 1}
      <select data-bot="${i}">${Array.from({ length: 10 }, (_, k) => `<option value="${k + 1}" ${k + 1 === lv ? 'selected' : ''}>Level ${k + 1}</option>`).join('')}</select>
      <button class="secondary" data-remove-bot="${i}" ${setup.bots.length < 2 ? 'disabled' : ''}>Remove</button></div>`).join('')}</div>
    <div class="actions"><button class="secondary" id="add-bot" ${setup.bots.length >= 8 ? 'disabled' : ''}>Add a player</button>
      <label class="quality">Starting stack $<input type="number" id="stack" value="${setup.stack}" min="100" step="100"></label>
      <label class="quality">Big blind $<input type="number" id="bb" value="${setup.bb}" min="2" step="2"></label>
      <button class="primary" id="start">Start playing</button></div></div>`;
}

function render() {
  if (!g) return renderSetup();
  const pot = g.players.reduce((a, q) => a + q.total, 0);
  const heroTurn = g.heroOpts && !g.done;
  $('#pen').innerHTML = `<div class="panel">
    <div class="table-top"><b>Hand ${g.hand}</b> · ${STREETS[g.street]} · Pot $${pot}
      <button class="secondary" id="end">End session &amp; review</button></div>
    <div class="board">${g.board.map((c) => card(c)).join('') || '<span class="muted">No board yet</span>'}</div>
    <div class="seats">${g.players.map((p, i) => p.out ? '' : `<div class="seat${p.folded ? ' folded' : ''}${g.pending[0] === i && !g.done ? ' turn' : ''}">
      <div><b>${esc(p.name)}</b>${p.level ? ` <span class="muted">L${p.level}</span>` : ''}${i === g.button ? ' <span class="dealer">D</span>' : ''}</div>
      <div>${p.cards.map((c) => card(c, i !== 0 && !(g.done && g.showdown && !p.folded))).join('')}</div>
      <div class="muted">$${p.stack}${p.bet ? ` · bet $${p.bet}` : ''}${p.allIn ? ' · all-in' : ''}${p.folded ? ' · folded' : ''}</div></div>`).join('')}</div>
    <div class="actions">${heroTurn ? g.heroOpts.map((o, k) => `<button class="${o.code === 'fold' ? 'secondary' : 'primary'}" data-opt="${k}">${esc(o.label)}</button>`).join('')
      : g.done ? `<span>${esc(g.result)}</span><button class="primary" id="next">Next hand</button>` : '<span class="muted">Waiting for other players…</span>'}</div>
    <div class="log">${g.log.slice(-8).map(esc).join('<br>')}</div></div>`;
}

function grade(lost, pot) {
  const x = lost / Math.max(pot, 1);
  return x <= 0.02 ? ['Best', 'good'] : x <= 0.1 ? ['Close', 'ok'] : ['Mistake', 'bad'];
}

function endSession() {
  const net = g.players[0].stack - setup.stack;
  const totalLost = review.reduce((a, d) => a + (d.best.ev - d.chosen.ev), 0);
  const best = review.filter((d) => grade(d.best.ev - d.chosen.ev, d.pot)[0] === 'Best').length;
  g = null;
  $('#pen').innerHTML = `<div class="panel">
    <h2>Session review</h2>
    <div class="stats">
      <div class="stat"><div class="stat-value">${net >= 0 ? '+' : '-'}$${Math.abs(net)}</div><div class="stat-label">Result</div></div>
      <div class="stat"><div class="stat-value">${review.length}</div><div class="stat-label">Decisions</div></div>
      <div class="stat"><div class="stat-value">${review.length ? Math.round((100 * best) / review.length) : 0}%</div><div class="stat-label">Best decisions</div></div>
      <div class="stat"><div class="stat-value">$${Math.round(totalLost)}</div><div class="stat-label">Expected $ given up</div></div>
    </div>
    <p class="note">Each decision is scored by the average result of every option from that moment (Monte Carlo against average-player ranges, with fold equity, assuming no more betting). Your result in chips also includes luck; this review measures only your decisions.</p>
    <div class="tbl"><table><thead><tr><th>Hand</th><th>Street</th><th>Cards</th><th>You chose</th><th>Best choice</th><th>Given up</th><th></th></tr></thead><tbody>
    ${review.map((d) => { const lost = d.best.ev - d.chosen.ev; const [gr, tone] = grade(lost, d.pot); return `<tr>
      <td>${d.hand}</td><td>${d.street}</td><td>${d.cards.map((c) => card(c)).join('')}${d.board.length ? ' | ' + d.board.map((c) => card(c)).join('') : ''}</td>
      <td>${esc(d.chosen.label)}<br><span class="muted">${fmt(d.chosen.ev)}</span></td><td>${esc(d.best.label)}<br><span class="muted">${fmt(d.best.ev)}</span></td>
      <td>$${Math.round(lost)}</td><td><span class="grade ${tone}">${gr}</span></td></tr>`; }).join('') || '<tr><td colspan="7">No decisions recorded.</td></tr>'}
    </tbody></table></div>
    <div class="actions"><button class="primary" id="again">New session</button></div></div>`;
}
const fmt = (x) => (x >= 0 ? '+$' : '-$') + Math.abs(x).toFixed(0);

// ---------- events ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'add-bot') { setup.bots.push(5); renderSetup(); }
  else if (t.dataset.removeBot) { setup.bots.splice(Number(t.dataset.removeBot), 1); renderSetup(); }
  else if (t.id === 'start') {
    setup.stack = Math.max(100, Number($('#stack').value) || 1000);
    setup.bb = Math.max(2, Number($('#bb').value) || 10);
    $('#pen').innerHTML = '<div class="panel running">Shuffling up and dealing…</div>';
    setTimeout(newSession, 30);
  }
  else if (t.dataset.opt) heroAct(Number(t.dataset.opt));
  else if (t.id === 'next') startHand();
  else if (t.id === 'end') endSession();
  else if (t.id === 'again') { g = null; renderSetup(); }
});
document.addEventListener('change', (e) => { if (e.target.dataset.bot) setup.bots[Number(e.target.dataset.bot)] = Number(e.target.value); });
renderSetup();
