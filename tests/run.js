// Sanity checks against published odds. Run: node tests/run.js
import { GAMES } from '../js/games/index.js';
import { evalCards, categoryOf, makeDeck, forEachCombo, eval3, JOKER } from '../js/cards.js';
import { evalPG5, settings } from '../js/games/paigow.js';
import { spanish21Bonus } from '../js/games/blackjack.js';
import { renderSizing, pokerAdvice } from '../js/games/poker-common.js';
import { defaultProfile, holdemStartT } from '../js/games/opponents.js';

const G = Object.fromEntries(GAMES.map((g) => [g.id, g]));
const card = (s) => '23456789TJQKA'.indexOf(s[0]) * 4 + 'shdc'.indexOf(s[1]);
const cards = (s) => s.split(' ').filter(Boolean).map(card);
const rank = (s) => '23456789TJQKA'.indexOf(s);
function run(game, state, q = 1) {
  const err = game.validate(state);
  if (err) throw new Error(err);
  const gen = game.simulate(state, q);
  let r;
  do { r = gen.next(); } while (!r.done);
  game.render(r.value, state); // must not throw
  return r.value;
}
let fails = 0;
function check(name, got, lo, hi) {
  const ok = got >= lo && got <= hi;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${got.toFixed(4)} (expect ${lo}..${hi})`);
}

// 5-card category counts (exact)
const c5 = new Array(9).fill(0);
forEachCombo(makeDeck(), 5, (c) => c5[categoryOf(evalCards(c, 5))]++);
check('5-card straight flushes', c5[8], 40, 40);
check('5-card full houses', c5[6], 3744, 3744);
const c3 = new Array(6).fill(0);
forEachCombo(makeDeck(), 3, (c) => c3[categoryOf(eval3(c[0], c[1], c[2]))]++);
check('3-card straights', c3[3], 720, 720);

const pot = { pot: 100, toCall: 0 };
check("Hold'em AA vs 1 random", run(G.holdem, { hero: cards('As Ah'), board: [], dead: [], opponents: 1, ...pot }).equity, 0.84, 0.865);
check("Hold'em 72o vs 1 random", run(G.holdem, { hero: cards('7s 2h'), board: [], dead: [], opponents: 1, ...pot }).equity, 0.335, 0.36);
check("Hold'em AA vs 9 random", run(G.holdem, { hero: cards('As Ah'), board: [], dead: [], opponents: 9, ...pot }).equity, 0.30, 0.335);
check('Omaha AAKK ds vs 1 random', run(G.omaha, { hero: cards('As Ah Ks Kh'), board: [], dead: [], opponents: 1, ...pot }).equity, 0.64, 0.75);
check('Stud rolled-up aces vs 1', run(G.stud, { hero: cards('As Ah Ad'), dead: [], opponents: 1, ...pot }).equity, 0.88, 0.96);
const dr = run(G.draw, { hero: cards('Ks Kh 7d 4c 2s'), opponents: 1, ...pot }, 0.5);
check('Draw KK: best hold keeps both kings', ['Ks','Kh'].every((c) => dr.results[0].kept.includes(card(c))) ? 1 : 0, 1, 1);

const vp = (h) => run(G.videopoker, { hero: cards(h), coins: 5, coinValue: 0.25 }).results[0];
check('Video poker dealt royal EV', vp('As Ks Qs Js Ts').ev, 800, 800);
check('Video poker 4 to royal EV (exact 872/47)', vp('As Ks Qs Js 2h').ev, 872 / 47 - 1e-9, 872 / 47 + 1e-9);
check('Video poker high pair EV', vp('Js Jh 7d 4c 2s').ev, 1.53, 1.54);

const bj = (h, up, extra = {}) => run(G.blackjack, { hero: h.split(' ').map(rank), dealer: [rank(up)], seen: [], bet: 10, decks: 6, h17: false, das: true, surrender: false, ...extra }, 1.5);
const ev = (r, code) => r.actions.find((a) => a.code === code).ev;
const r16 = bj('T 6', 'T');
check('BJ 16 vs 10 stand EV', ev(r16, 'S'), -0.555, -0.525);
check('BJ 16 vs 10 hit EV', ev(r16, 'H'), -0.555, -0.52);
const r11 = bj('6 5', '6');
check('BJ 11 vs 6 double EV', ev(r11, 'D'), 0.63, 0.70);
check('BJ 11 vs 6 best is double', r11.actions[0].code === 'D' ? 1 : 0, 1, 1);
const r88 = bj('8 8', 'T');
check('BJ 8,8 vs 10 split beats stand', ev(r88, 'P') - ev(r88, 'S'), 0.02, 0.3);
check('BJ 20 vs 6 stand EV', ev(bj('T T', '6'), 'S'), 0.67, 0.73);

const tc = (h) => run(G.threecard, { hero: cards(h), ante: 10 });
check('3CP Q-6-4 play EV > fold', tc('Qs 6h 4d').evPlay + 1, 0, 0.05);
check('3CP Q-6-3 play EV < fold', tc('Qs 6h 3d').evPlay + 1, -0.05, 0);

const bac = run(G.baccarat, { seen: [], bet: 10, decks: 8 }, 3);
const be = (n) => bac.bets.find((b) => b.name === n).ev;
check('Baccarat banker EV', be('Banker'), -0.0136, -0.0076);
check('Baccarat player EV', be('Player'), -0.0154, -0.0094);
check('Baccarat tie EV', be('Tie'), -0.16, -0.128);

// Spanish 21
const sp = (h, up, extra = {}) => run(G.spanish21, { hero: h.split(' ').map(rank), dealer: [rank(up)], seen: [], bet: 10, decks: 6, h17: true, das: true, surrender: true, redouble: false, ...extra }, 0.2);
check('S21 bonus: 5-card 21 pays 3:2', spanish21Bonus([4, 4, 4, 4, 5]), 1.5, 1.5);
check('S21 bonus: 7-7-7 pays 3:2', spanish21Bonus([7, 7, 7]), 1.5, 1.5);
check('S21 bonus: 6-card 21 pays 2:1', spanish21Bonus([2, 2, 3, 4, 5, 5]), 2, 2);
check('S21 standing on 5-card 21 always wins 1.5', sp('4 4 4 4 5', 'A').actions.find((a) => a.code === 'S').ev, 1.5, 1.5);
check('S21 rejects 10s', G.spanish21.validate({ hero: [8, 4], dealer: [5], seen: [], decks: 6 }) ? 1 : 0, 1, 1);
const s20 = sp('K Q', '6');
check('S21 hard 20 vs 6: stand is best', s20.actions[0].code === 'S' ? 1 : 0, 1, 1);
check('S21 hard 20 vs 6 stand EV', s20.actions[0].ev, 0.6, 0.75);
check('S21 11 vs 6: double is best', sp('6 5', '6').actions[0].code === 'D' ? 1 : 0, 1, 1);
check('S21 redouble raises double EV for 5 vs 6', (() => {
  const a = sp('3 2', '6', { redouble: true }).actions.find((x) => x.code === 'D').ev;
  const b = sp('3 2', '6', { redouble: false }).actions.find((x) => x.code === 'D').ev;
  return a - b;
})(), -0.05, 1);

// Pai Gow
const pg = (h) => categoryOf(evalPG5(h.split(' ').map((x) => (x === 'Jk' ? JOKER : card(x)))));
check('Pai Gow joker completes flush', pg('2h 5h 9h Jh Jk'), 5, 5);
check('Pai Gow joker completes straight', pg('9s Th Jd Qc Jk'), 4, 4);
check('Pai Gow joker with pair of aces = trips', pg('As Ah Jk 5d 2c'), 3, 3);
check('Pai Gow joker otherwise = ace (pair)', pg('Ac 9h 6d 3s Jk'), 1, 1);
check('Pai Gow five aces beats straight flush', evalPG5([48, 49, 50, 51, JOKER]) > evalCards(cards('Ts Js Qs Ks As'), 5) ? 1 : 0, 1, 1);
check('Pai Gow foul splits excluded (no-pair hand)', settings(cards('As Kd 9h 7c 5s 3d 2h')).every((x) => x.high > 0) ? 1 : 0, 1, 1);
const pgRes = run(G.paigow, { hero: cards('As Kd 9h 7c 5s 3d 2h'), bet: 25 }, 0.3).results[0];
check('Pai Gow A-K no pair: ace stays high, king goes low', pgRes.low.some((c) => c >> 2 === 11) && pgRes.high.some((c) => c >> 2 === 12) ? 1 : 0, 1, 1);
const pg2 = run(G.paigow, { hero: cards('As Ad Kh Kc 5s 3d 2h'), bet: 25 }, 0.3).results[0];
check('Pai Gow AA KK: split, kings in the low hand', pg2.low.every((c) => c >> 2 === 11) ? 1 : 0, 1, 1);
let tot = 0; const N = 300;
for (let i = 0; i < N; i++) {
  const d = Array.from({ length: 53 }, (_, k) => k);
  for (let j = 52; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); [d[j], d[r]] = [d[r], d[j]]; }
  d.length = 7;
  tot += run(G.paigow, { hero: d, bet: 1 }, 0.16).results[0].ev;
}
check(`Pai Gow average EV over ${N} random hands`, tot / N, -0.085, 0.035); // known house edge about -2.5%; per-hand spread is wide

// Bet sizing
const st = { pot: 100, toCall: 0, opponents: 1, sizing: true, stack: 1000, oppStacks: '1000' };
const strongAdv = pokerAdvice(0.85, 1, 100, 0);
check('Sizing: strong hand deep stacks bets ~pot, not all-in', /Bet \$/.test(renderSizing(0.85, st, strongAdv)) ? 1 : 0, 1, 1);
check('Sizing: short effective stack goes all-in', /All-in: \$120/.test(renderSizing(0.85, { ...st, oppStacks: '120' }, strongAdv)) ? 1 : 0, 1, 1);
const callAdv = pokerAdvice(0.3, 1, 100, 20);
check('Sizing: call shows call amount', /Call \$20/.test(renderSizing(0.3, { ...st, toCall: 20 }, callAdv)) ? 1 : 0, 1, 1);

// Opponent modeling
const prof = (preset, pre = 'any', post = 'none') => ({ ...defaultProfile(preset), pre, post });
check('Start table: AA is top 1%', holdemStartT(cards('As Ah')), 0, 0.01);
check('Start table: 72o is bottom 5%', holdemStartT(cards('7s 2h')), 0.95, 1);
check('Start table: AKs in top 7%', holdemStartT(cards('As Ks')), 0, 0.07);
const base = { board: [], dead: [], pot: 100, toCall: 0, modeling: true };
const aaVsRock3b = run(G.holdem, { ...base, hero: cards('As Ah'), opponents: 1, profiles: [prof('rock', 'threebet')] }, 0.5).equity;
check("AA vs a rock's 3-bet range is below 85% (vs random)", aaVsRock3b, 0.6, 0.83);
const kqVsRaise = run(G.holdem, { ...base, hero: cards('Kd Qc'), opponents: 1, profiles: [prof('tag', 'raise')] }, 0.5).equity;
const kqVsStation = run(G.holdem, { ...base, hero: cards('Kd Qc'), opponents: 1, profiles: [prof('station', 'limp')] }, 0.5).equity;
check('KQo does worse vs TAG raise than vs station limp', kqVsStation - kqVsRaise, 0.03, 0.5);
const riverNuts = (preset) => run(G.holdem, { ...base, hero: cards('As Ks'), board: cards('Qs Js Ts 2h 3d'), opponents: 1, profiles: [prof(preset, 'callraise', 'check')] }, 0.5);
const rn = riverNuts('station');
const bestOpt = [...rn.options].sort((a, b) => b.ev - a.ev)[0];
check('Royal flush on river vs station: best option is a bet', bestOpt.code === 'bet' ? 1 : 0, 1, 1);
const foldAll = (r) => Math.max(...r.options.filter((o) => o.code === 'bet').map((o) => o.foldAll));
check('Stations fold less than rocks', foldAll(riverNuts('rock')) - foldAll(rn), 0.05, 1);
const bluffSpot = run(G.holdem, { ...base, hero: cards('7d 2c'), board: cards('Ks 9h 4s 3c Jd'), opponents: 1, profiles: [prof('rock', 'callraise', 'check')] }, 0.5);
const bOpt = [...bluffSpot.options].sort((a, b) => b.ev - a.ev)[0];
check('Air on river vs a rock who checked: bluffing beats checking', bOpt.code === 'bet' ? 1 : 0, 1, 1);
for (const id of ['omaha', 'stud', 'draw']) {
  const st = { omaha: { hero: cards('As Ah Ks Kh'), board: [], dead: [] }, stud: { hero: cards('As Ah Kd 7c'), dead: [] }, draw: { hero: cards('Ks Kh 7d 4c 2s') } }[id];
  const r = run(G[id], { ...st, opponents: 2, pot: 100, toCall: 20, modeling: true, profiles: [prof('lag', 'raise', 'bet'), prof('station', 'limp', 'call')] }, 0.3);
  check(`${id} modeled run returns fold/call/raise options`, r.options && r.options.some((o) => o.code === 'fold') && r.options.some((o) => o.code === 'bet') ? 1 : 0, 1, 1);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
