// Opponent modeling for the poker games: turn tracking stats (VPIP, PFR, AF, 3-bet %, WTSD %) plus
// what an opponent did this hand into (1) a weighted range to deal them from, and (2) how often they
// fold to a bet. All "t" values are top-fractions: 0 = the best possible hand, 1 = the worst.

import { evalCards, makeDeck } from '../cards.js';

export const PRESETS = {
  average: { name: 'Average / unknown', vpip: 25, pfr: 18, af: 2.5, threeBet: 7, wtsd: 28 },
  rock: { name: 'Rock (very tight)', vpip: 12, pfr: 9, af: 2, threeBet: 3, wtsd: 22 },
  tag: { name: 'Tight-aggressive (TAG)', vpip: 22, pfr: 18, af: 3, threeBet: 8, wtsd: 26 },
  lag: { name: 'Loose-aggressive (LAG)', vpip: 32, pfr: 26, af: 3.5, threeBet: 11, wtsd: 28 },
  station: { name: 'Calling station', vpip: 45, pfr: 8, af: 0.8, threeBet: 2, wtsd: 40 },
  maniac: { name: 'Maniac', vpip: 60, pfr: 45, af: 5, threeBet: 20, wtsd: 35 },
};

export const PRE_ACTIONS = {
  any: 'Unknown / just in the hand',
  limp: 'Limped or called, no raise',
  raise: 'Raised (open)',
  callraise: 'Called a raise',
  threebet: '3-bet (re-raised)',
  call3bet: 'Called a 3-bet',
};
export const POST_ACTIONS = {
  none: 'No later action yet',
  check: 'Checked',
  call: 'Called a bet',
  bet: 'Bet or raised',
};

export function defaultProfile(preset = 'average') {
  const p = PRESETS[preset];
  return { preset, vpip: p.vpip, pfr: p.pfr, af: p.af, threeBet: p.threeBet, wtsd: p.wtsd, pre: 'any', post: 'none' };
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Range acceptance and fold behaviour for one opponent. */
export function makeModel(profile, hasPost) {
  const v = clamp(profile.vpip, 1, 100) / 100;
  const pf = clamp(Math.min(profile.pfr, profile.vpip), 0.5, 100) / 100;
  const tb = clamp(Math.min(profile.threeBet, profile.pfr), 0.3, 100) / 100;
  const af = clamp(profile.af, 0.1, 10);
  const wt = clamp(profile.wtsd, 5, 80) / 100;
  const R = Math.random;
  const startTests = {
    any: (t) => t <= v,
    limp: (t) => t <= v && (t > pf || R() < 0.15),
    raise: (t) => t <= pf,
    callraise: (t) => t <= Math.max(pf, v * 0.6) && (t > tb || R() < 0.2),
    threebet: (t) => t <= tb,
    call3bet: (t) => t <= Math.max(2 * tb, pf * 0.5) && (t > tb * 0.5 || R() < 0.3),
  };
  // Postflop: aggressive players bet a wider range and bluff more; sticky players call wider.
  const betTop = clamp(0.25 + 0.08 * af, 0.2, 0.6);
  const bluff = clamp(0.03 + 0.04 * (af - 1), 0.02, 0.35);
  const callTop = clamp(0.3 + wt, 0.35, 0.85);
  const nowTests = {
    none: () => true,
    bet: (t) => t <= betTop || R() < bluff,
    call: (t) => (t <= betTop * 0.6 ? R() < 0.25 : t <= callTop || R() < 0.15),
    check: (t) => (t <= betTop ? R() < 0.35 : true),
  };
  const start = startTests[profile.pre] || startTests.any;
  const now = nowTests[hasPost ? profile.post : 'none'] || nowTests.none;
  return {
    start, now,
    rangePct: { any: v, limp: v - pf, raise: pf, callraise: Math.max(pf, v * 0.6) - tb, threebet: tb, call3bet: Math.max(2 * tb, pf * 0.5) - tb * 0.5 }[profile.pre] ?? v,
    /** Fraction of their (already narrowed) range that continues against a bet of size B into pot P. */
    callFraction: (B, P) => clamp((wt / 0.28) * (P / (P + B)) * 0.9, 0.08, 0.95),
  };
}

// ---------- hand-strength percentiles ----------

/** Sorted score list -> top-fraction lookup (higher score = stronger = smaller t). */
export class Dist {
  constructor(scores) { this.s = Float64Array.from(scores).sort(); }
  top(x) {
    const s = this.s, n = s.length;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= x) lo = m + 1; else hi = m; }
    const above = n - lo;
    let lo2 = 0, hi2 = n;
    while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (s[m] < x) lo2 = m + 1; else hi2 = m; }
    return (above + 0.5 * (lo - lo2)) / n;
  }
}

let holdemTable = null;
const holdemClass = (a, b) => {
  const r1 = a >> 2, r2 = b >> 2;
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (hi === lo) return hi * 13 + hi;
  return (a & 3) === (b & 3) ? hi * 13 + lo : lo * 13 + hi;
};
/** Top-fraction of each of the 169 starting-hand classes, ranked by equity against one random hand. */
function getHoldemTable() {
  if (holdemTable) return holdemTable;
  const eq = new Float64Array(169), combos = new Float64Array(169);
  const seven = new Array(7), other = new Array(7);
  for (let hi = 0; hi < 13; hi++) for (let lo = 0; lo <= hi; lo++) {
    for (const suited of hi === lo ? [false] : [true, false]) {
      const a = hi * 4, b = lo * 4 + (suited ? 0 : 1);
      const key = holdemClass(a, b);
      combos[key] = hi === lo ? 6 : suited ? 4 : 12;
      const deck = makeDeck([a, b]);
      const N = 2500;
      let score = 0;
      for (let t = 0; t < N; t++) {
        for (let i = 0; i < 7; i++) {
          const j = i + Math.floor(Math.random() * (deck.length - i));
          const x = deck[i]; deck[i] = deck[j]; deck[j] = x;
        }
        seven[0] = a; seven[1] = b; other[0] = deck[5]; other[1] = deck[6];
        for (let i = 0; i < 5; i++) { seven[2 + i] = deck[i]; other[2 + i] = deck[i]; }
        const h = evalCards(seven, 7), o = evalCards(other, 7);
        score += h > o ? 1 : h === o ? 0.5 : 0;
      }
      eq[key] = score / N;
    }
  }
  const order = Array.from({ length: 169 }, (_, i) => i).sort((x, y) => eq[y] - eq[x]);
  const top = new Float64Array(169);
  let cum = 0;
  for (const k of order) { top[k] = (cum + combos[k] / 2) / 1326; cum += combos[k]; }
  holdemTable = top;
  return top;
}
export const holdemStartT = (cards) => getHoldemTable()[holdemClass(cards[0], cards[1])];

/** Omaha starting-hand heuristic: pairs, double-suitedness, connectedness, high cards. */
export function omahaStartScore(c) {
  const ranks = c.map((x) => x >> 2), suits = [0, 0, 0, 0], suitHigh = [-1, -1, -1, -1];
  const counts = new Array(13).fill(0);
  let score = 0;
  for (const x of c) {
    counts[x >> 2]++; suits[x & 3]++;
    suitHigh[x & 3] = Math.max(suitHigh[x & 3], x >> 2);
  }
  counts.forEach((n, r) => { if (n === 2) score += (r + 2) * 1.5; if (n >= 3) score -= 6; });
  suits.forEach((n, s) => { if (n === 2) score += 4 + (suitHigh[s] === 12 ? 4 : suitHigh[s] >= 10 ? 2 : 0); if (n >= 3) score += 1; });
  const distinct = [...new Set(ranks)].sort((a, b) => a - b);
  for (let i = 1; i < distinct.length; i++) {
    const gap = distinct[i] - distinct[i - 1];
    score += gap === 1 ? 4 : gap === 2 ? 2.5 : gap === 3 ? 1 : 0;
  }
  for (const r of ranks) if (r >= 8) score += (r - 7) * 0.8;
  return score;
}

/** Seven-card stud starting (3-card) heuristic. */
export function studStartScore(c) {
  const r = c.slice(0, 3).map((x) => x >> 2).sort((a, b) => b - a);
  const flush = (c[0] & 3) === (c[1] & 3) && (c[1] & 3) === (c[2] & 3);
  if (r[0] === r[2]) return 1000 + r[0];
  if (r[0] === r[1] || r[1] === r[2]) { const p = r[1]; const k = r[0] === r[1] ? r[2] : r[0]; return 500 + p * 13 + k; }
  let s = r[0] * 6 + r[1] * 2 + r[2];
  if (flush) s += 60;
  if (r[0] - r[2] <= 4) s += 30;
  return s;
}

const startDists = {};
/** Distribution of a start-hand score over random hands, for top-fraction lookups. */
export function startDist(kind, k, scoreFn) {
  if (startDists[kind]) return startDists[kind];
  const deck = makeDeck();
  const scores = [];
  const hand = new Array(k);
  for (let n = 0; n < 20000; n++) {
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(Math.random() * (52 - i));
      const x = deck[i]; deck[i] = deck[j]; deck[j] = x;
      hand[i] = deck[i];
    }
    scores.push(scoreFn(hand));
  }
  startDists[kind] = new Dist(scores);
  return startDists[kind];
}
export const drawStartScore = (c) => evalCards(c, 5);

/**
 * Deal k cards for an opponent from deck positions [p, end), resampling until `accept(cards)`.
 * Gives up (keeps the last draw) after 400 tries so impossible ranges never hang.
 */
export function dealFromRange(deck, p, k, out, accept) {
  const n = deck.length;
  for (let attempt = 0; attempt < 400; attempt++) {
    for (let i = 0; i < k; i++) {
      const j = p + i + Math.floor(Math.random() * (n - p - i));
      const x = deck[p + i]; deck[p + i] = deck[j]; deck[j] = x;
      out[i] = deck[p + i];
    }
    if (!accept || accept(out)) return true;
  }
  return false;
}

// ---------- decision EVs ----------

/**
 * Accumulates the EV of folding/checking, calling, and betting several sizes, using each
 * opponent's chance to call based on WTSD and the bet size.
 */
export class DecisionEV {
  constructor({ pot, toCall, stack, effStack, models, nowSamples }) {
    this.pot = pot; this.toCall = toCall;
    const base = pot + toCall;
    const cap = Number.isFinite(effStack) && effStack > 0 ? effStack : Infinity;
    const totals = new Set();
    for (const x of [0.33, 0.5, 0.75, 1, 1.5]) {
      const T = Math.round(toCall + x * base);
      if (T < cap) totals.add(T);
    }
    if (Number.isFinite(cap)) totals.add(Math.round(cap));
    this.sizes = [...totals].filter((T) => T > toCall).sort((a, b) => a - b).map((T) => ({
      total: T, raise: T - toCall, allIn: Number.isFinite(cap) && T >= cap, ev: 0,
      // Call threshold per opponent: they continue if their current top-fraction <= tau.
      tau: models.map((m, i) => {
        const cf = m.callFraction(T - toCall, base);
        const smp = nowSamples[i];
        return smp[Math.min(smp.length - 1, Math.floor(cf * smp.length))];
      }),
      foldAll: 0,
    }));
    this.evCall = 0; this.evCheck = 0; this.n = 0;
  }
  add(hs, os, ot) {
    this.n++;
    let lost = false, tied = 0;
    for (let i = 0; i < os.length; i++) { if (os[i] > hs) { lost = true; break; } if (os[i] === hs) tied++; }
    const shareAll = lost ? 0 : 1 / (tied + 1);
    if (this.toCall > 0) this.evCall += shareAll * (this.pot + this.toCall) - this.toCall;
    else this.evCheck += shareAll * this.pot;
    for (const sz of this.sizes) {
      let nc = 0, l = false, tie = 0;
      for (let i = 0; i < os.length; i++) {
        if (ot[i] > sz.tau[i]) continue; // folds
        nc++;
        if (os[i] > hs) l = true; else if (os[i] === hs) tie++;
      }
      if (nc === 0) { sz.ev += this.pot; sz.foldAll++; continue; }
      const share = l ? 0 : 1 / (tie + 1);
      // The player who made the current bet already has toCall in the pot; other callers match in full.
      const added = this.toCall > 0 ? sz.total * nc - this.toCall : sz.total * nc;
      sz.ev += share * (this.pot + sz.total + added) - sz.total;
    }
  }
  result() {
    const n = this.n || 1;
    const options = [];
    if (this.toCall > 0) {
      options.push({ code: 'fold', label: 'Fold', ev: 0 });
      options.push({ code: 'call', label: `Call $${this.toCall}`, ev: this.evCall / n });
    } else {
      options.push({ code: 'check', label: 'Check', ev: this.evCheck / n });
    }
    for (const sz of this.sizes) {
      const verb = this.toCall > 0 ? 'Raise' : 'Bet';
      options.push({
        code: 'bet', label: sz.allIn ? `All-in ($${sz.total})` : this.toCall > 0 ? `${verb}: put in $${sz.total}` : `${verb} $${sz.total}`,
        ev: sz.ev / n, foldAll: sz.foldAll / n, total: sz.total,
      });
    }
    return options;
  }
}

/** Parse opponents' stacks text (shared with the bet-sizing panel). */
export function effectiveStack(s) {
  if (!s.sizing) return Infinity;
  const stack = Math.max(0, Number(s.stack) || 0);
  const opp = String(s.oppStacks || '').split(/[,\s]+/).map(Number).filter((x) => x > 0);
  return Math.min(stack, opp.length ? Math.max(...opp) : Infinity);
}

/** Profiles for each opponent in the hand, filling any missing ones with the average preset. */
export function ensureProfiles(s) {
  const out = [];
  for (let i = 0; i < s.opponents; i++) out.push({ ...defaultProfile(), ...((s.profiles || [])[i] || {}) });
  return out;
}

/** Top-fraction distribution of a "current strength" score over random k-card hands from deck. */
export function sampledDist(deckCards, k, scoreFn, n = 2500) {
  const deck = deckCards.slice();
  const buf = new Array(k);
  const scores = [];
  for (let t = 0; t < n; t++) { dealFromRange(deck, 0, k, buf, null); scores.push(scoreFn(buf)); }
  return new Dist(scores);
}

/**
 * Build models, per-opponent acceptance tests, and the decision accumulator.
 * startT / nowT map an opponent's k dealt cards to a top-fraction (0 = best).
 */
export function setupModeling(s, { deckCards, k, startT, nowT, hasPost }) {
  const profiles = ensureProfiles(s);
  const models = profiles.map((p) => makeModel(p, hasPost));
  const accepts = models.map((m) => (cards) => m.start(startT(cards)) && m.now(nowT(cards)));
  const deck = deckCards.slice();
  const buf = new Array(k);
  const nowSamples = models.map((m, i) => {
    const arr = [];
    for (let n = 0; n < 300; n++) { dealFromRange(deck, 0, k, buf, accepts[i]); arr.push(nowT(buf)); }
    return arr.sort((a, b) => a - b);
  });
  const dec = new DecisionEV({ pot: s.pot, toCall: s.toCall, effStack: effectiveStack(s), models, nowSamples });
  const info = profiles.map((p, i) => ({
    type: PRESETS[p.preset]?.name || 'Custom',
    pre: PRE_ACTIONS[p.pre] || PRE_ACTIONS.any,
    post: hasPost ? POST_ACTIONS[p.post] || POST_ACTIONS.none : null,
    rangePct: models[i].rangePct,
    foldToPot: 1 - models[i].callFraction(0.66 * (s.pot + s.toCall), s.pot + s.toCall),
  }));
  return { models, accepts, dec, info };
}
