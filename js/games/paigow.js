import { evalCards, categoryOf, JOKER, HAND_NAMES } from '../cards.js';
import { banner, statGrid, table, pct, signedMoney, money, miniCards, note } from '../render.js';

// Pai Gow Poker: 53-card deck (joker = 52). Split 7 cards into a 5-card high hand and a 2-card
// low hand; the high hand must outrank the low. Win both = win (minus 5% commission), lose both =
// lose, otherwise push. Ties ("copies") go to the dealer.

const FIVE_ACES = 9 * 1048576 + 12 * 65536;

/** 5-card score. The joker is an ace unless it completes a straight, flush or straight flush. */
export function evalPG5(cards) {
  const j = cards.indexOf(JOKER);
  if (j < 0) return evalCards(cards, 5);
  const others = cards.filter((c) => c !== JOKER);
  const aces = others.filter((c) => c >> 2 === 12);
  if (aces.length === 4) return FIVE_ACES;
  const used = new Set(others);
  let aceCard = 48;
  while (used.has(aceCard)) aceCard++;
  const buf = [...others, aceCard];
  let best = evalCards(buf, 5);
  for (let c = 0; c < 52; c++) {
    if (used.has(c)) continue;
    buf[4] = c;
    const sc = evalCards(buf, 5);
    const cat = categoryOf(sc);
    if ((cat === 4 || cat === 5 || cat === 8) && sc > best) best = sc;
  }
  return best;
}

/** 2-card score: pairs above high cards. The joker is an ace. */
export function evalPG2(a, b) {
  const ra = a === JOKER ? 12 : a >> 2;
  const rb = b === JOKER ? 12 : b >> 2;
  if (ra === rb) return 200 + ra; // above every non-pair (max 12*13+11 = 167)
  return Math.max(ra, rb) * 13 + Math.min(ra, rb);
}

/** The 5-card hand must outrank the 2-card hand. */
export function validSplit(high, low) {
  const cat = categoryOf(high);
  const k1 = Math.floor(high / 65536) % 16;
  const k2 = Math.floor(high / 4096) % 16;
  if (low >= 200) return cat >= 2 || (cat === 1 && k1 >= low - 200);
  if (cat >= 1) return true;
  const l1 = Math.floor(low / 13), l2 = low % 13;
  return k1 > l1 || (k1 === l1 && k2 >= l2);
}

const PAIRS = [];
for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) PAIRS.push([a, b]);

/** All valid (high, low) settings of 7 cards. */
export function settings(cards) {
  const out = [];
  const high = new Array(5);
  for (const [a, b] of PAIRS) {
    let k = 0;
    for (let i = 0; i < 7; i++) if (i !== a && i !== b) high[k++] = cards[i];
    const hs = evalPG5(high), ls = evalPG2(cards[a], cards[b]);
    if (validSplit(hs, ls)) out.push({ a, b, high: hs, low: ls });
  }
  return out;
}

// Dealer model: set the hand to maximize P(high wins) + P(low wins), using percentile tables of
// how strong set hands typically are. This approximates a casino "house way".
let tables = null;
function lowerBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
function strength(t, s) { return lowerBound(t.high, s.high) / t.high.length + lowerBound(t.low, s.low) / t.low.length; }
function bestSetting(cards, t) {
  let best = null, bv = -1;
  for (const s of settings(cards)) {
    const v = strength(t, s);
    if (v > bv) { bv = v; best = s; }
  }
  return best;
}
function randomHand(deck) {
  for (let i = 0; i < 7; i++) {
    const j = i + Math.floor(Math.random() * (deck.length - i));
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck.slice(0, 7);
}
export function getTables() {
  if (tables) return tables;
  const deck = Array.from({ length: 53 }, (_, i) => i);
  // Pass 1: every valid setting. Pass 2: settings chosen with the pass-1 tables.
  let t = { high: [], low: [] };
  for (let i = 0; i < 4000; i++) for (const s of settings(randomHand(deck))) { t.high.push(s.high); t.low.push(s.low); }
  t.high.sort((a, b) => a - b); t.low.sort((a, b) => a - b);
  const t2 = { high: [], low: [] };
  for (let i = 0; i < 8000; i++) {
    const s = bestSetting(randomHand(deck), t);
    t2.high.push(s.high); t2.low.push(s.low);
  }
  t2.high.sort((a, b) => a - b); t2.low.sort((a, b) => a - b);
  tables = t2;
  return tables;
}

function describeHigh(score) {
  return score === FIVE_ACES ? 'Five Aces' : HAND_NAMES[categoryOf(score)];
}

export const paigow = {
  id: 'paigow',
  name: 'Pai Gow Poker',
  description: 'Seven cards, split into a 5-card high hand and a 2-card low hand (the high hand must be stronger). Beat the dealer with both to win, lose both to lose; one each is a push. The joker is wild for straights and flushes, otherwise an ace.',
  fields: [
    { type: 'cards', key: 'hero', label: 'Your seven cards', min: 7, max: 7, joker: true },
    { type: 'number', key: 'bet', label: 'Your bet ($)', min: 1, max: 1e6, step: 1, value: 25 },
  ],
  validate: () => null,
  *simulate(s, quality) {
    const t = getTables();
    yield 0.05;
    const hero = s.hero;
    const mine = settings(hero);
    const used = new Set(hero);
    const deck = Array.from({ length: 53 }, (_, i) => i).filter((c) => !used.has(c));
    const trials = Math.max(4000, Math.round(25000 * quality));
    const stats = mine.map(() => ({ win: 0, lose: 0, push: 0 }));
    for (let n = 1; n <= trials; n++) {
      const d = bestSetting(randomHand(deck), t);
      for (let i = 0; i < mine.length; i++) {
        const m = mine[i];
        const hi = m.high > d.high, lo = m.low > d.low;
        if (hi && lo) stats[i].win++; else if (!hi && !lo) stats[i].lose++; else stats[i].push++;
      }
      if (n % 1000 === 0) yield 0.05 + 0.95 * n / trials;
    }
    const results = mine.map((m, i) => {
      const st = stats[i];
      return {
        low: [hero[m.a], hero[m.b]],
        high: hero.filter((_, k) => k !== m.a && k !== m.b),
        highName: describeHigh(m.high),
        ev: (0.95 * st.win - st.lose) / trials,
        win: st.win / trials, lose: st.lose / trials, push: st.push / trials,
      };
    }).sort((a, b) => b.ev - a.ev);
    return { results, trials };
  },
  render(r, s) {
    const best = r.results[0];
    const tone = best.ev > 0 ? 'good' : best.ev > -0.1 ? 'ok' : 'bad';
    const reason = `High hand (5): ${miniCards(best.high)} ${best.highName}<br>Low hand (2): ${miniCards(best.low)}<br>`
      + `Average result ${signedMoney(best.ev * s.bet)} on a ${money(s.bet)} bet.`;
    return banner('Set it like this', tone, reason) +
      statGrid([
        ['Win both', pct(best.win)],
        ['Push', pct(best.push)],
        ['Lose both', pct(best.lose)],
      ]) +
      table('Best ways to set your hand', ['Low (2)', 'High (5)', 'Win', 'Lose', 'Average'],
        r.results.slice(0, 8).map((x, i) => ({ hl: i === 0, cells: [miniCards(x.low), `${miniCards(x.high)} <span class="muted">${x.highName}</span>`, pct(x.win), pct(x.lose), signedMoney(x.ev * s.bet)] }))) +
      note(`Based on ${r.trials.toLocaleString()} simulated dealer hands per setting. Wins pay even money minus a 5% commission; ties on either hand go to the dealer. The dealer sets each hand to make both halves as strong as possible, a stand-in for the casino's "house way". Settings where the 2-card hand would beat the 5-card hand are fouls and not shown.`);
  },
};
