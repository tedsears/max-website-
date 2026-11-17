// Sanity checks against published odds. Run: node tests/run.js
import { GAMES } from '../js/games/index.js';
import { evalCards, categoryOf, makeDeck, forEachCombo, eval3 } from '../js/cards.js';

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

console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
