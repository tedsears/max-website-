import { banner, statGrid, table, signedMoney, money, pct, note } from '../render.js';

// Ranks picked in the UI are 0..12 (2..A). Blackjack value: 2-9, ten-cards 10, ace 11.
export const bjValue = (r) => (r <= 7 ? r + 2 : r <= 11 ? 10 : 11);
const VALUE_LABEL = (v) => (v === 11 ? 'A' : v === 10 ? '10/J/Q/K' : String(v));
export const SEEN_GROUPS = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function handTotal(vals) {
  let total = 0, aces = 0;
  for (const v of vals) { total += v; if (v === 11) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

/** Basic strategy for multi-deck, dealer stands on soft 17. Returns 'H','S','D','P' or 'R' (surrender). */
export function basicStrategy(vals, up, { canDouble, canSplit, canSurrender, das }) {
  const { total, soft } = handTotal(vals);
  if (canSplit && vals.length === 2 && vals[0] === vals[1]) {
    const v = vals[0];
    const split =
      v === 11 || v === 8 ? true :
      v === 10 || v === 5 ? false :
      v === 9 ? [2, 3, 4, 5, 6, 8, 9].includes(up) :
      v === 7 ? up <= 7 :
      v === 6 ? up <= 6 && (das || up >= 3) :
      v === 4 ? das && (up === 5 || up === 6) :
      /* 2s, 3s */ das ? up <= 7 : up >= 4 && up <= 7;
    if (split) return 'P';
  }
  if (canSurrender && vals.length === 2 && !soft) {
    if (total === 16 && up >= 9) return 'R';
    if (total === 15 && up === 10) return 'R';
  }
  if (soft) {
    if (total >= 19) return 'S';
    if (total === 18) return up >= 3 && up <= 6 && canDouble ? 'D' : up <= 8 ? 'S' : 'H';
    if (total === 17) return up >= 3 && up <= 6 && canDouble ? 'D' : 'H';
    if (total >= 15) return up >= 4 && up <= 6 && canDouble ? 'D' : 'H';
    return up >= 5 && up <= 6 && canDouble ? 'D' : 'H';
  }
  if (total >= 17) return 'S';
  if (total >= 13) return up <= 6 ? 'S' : 'H';
  if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (total === 11) return canDouble && up <= 10 ? 'D' : 'H';
  if (total === 10) return canDouble && up <= 9 ? 'D' : 'H';
  if (total === 9) return canDouble && up >= 3 && up <= 6 ? 'D' : 'H';
  return 'H';
}

const ACTION_NAMES = { S: 'Stand', H: 'Hit', D: 'Double down', P: 'Split', R: 'Surrender' };

export function buildShoe(s) {
  const counts = {};
  for (const v of SEEN_GROUPS) counts[v] = s.decks * (v === 10 ? 16 : 4);
  const remove = (v, n = 1) => { counts[v] -= n; };
  s.hero.forEach((r) => remove(bjValue(r)));
  s.dealer.forEach((r) => remove(bjValue(r)));
  SEEN_GROUPS.forEach((v, i) => remove(v, (s.seen || [])[i] || 0));
  for (const v of SEEN_GROUPS) {
    if (counts[v] < 0) return { error: `More ${VALUE_LABEL(v)}s entered than a ${s.decks}-deck shoe holds.` };
  }
  const shoe = [];
  for (const v of SEEN_GROUPS) for (let i = 0; i < counts[v]; i++) shoe.push(v);
  return { shoe };
}

export const blackjack = {
  id: 'blackjack',
  name: 'Blackjack',
  description: 'Get closer to 21 than the dealer without going over. Enter your cards and the dealer\'s up-card; suits do not matter.',
  fields: [
    { type: 'ranks', key: 'hero', label: 'Your cards', min: 2, max: 8 },
    { type: 'ranks', key: 'dealer', label: "Dealer's up-card", min: 1, max: 1 },
    { type: 'counts', key: 'seen', label: 'Other cards already played from this shoe (optional, for card counting)', groups: SEEN_GROUPS.map(VALUE_LABEL) },
    { type: 'number', key: 'bet', label: 'Your bet ($)', min: 1, max: 1e6, step: 1, value: 10 },
    { type: 'number', key: 'decks', label: 'Decks in the shoe', min: 1, max: 8, step: 1, value: 6 },
    { type: 'checkbox', key: 'h17', label: 'Dealer hits soft 17', value: false },
    { type: 'checkbox', key: 'das', label: 'Double after split allowed', value: true },
    { type: 'checkbox', key: 'surrender', label: 'Surrender allowed', value: false },
  ],
  validate(s) {
    const { total } = handTotal(s.hero.map(bjValue));
    if (total > 21) return `Your hand is ${total}: you have already busted.`;
    return buildShoe(s).error || null;
  },
  *simulate(s, quality) {
    const { shoe } = buildShoe(s);
    const heroVals = s.hero.map(bjValue);
    const up = bjValue(s.dealer[0]);
    const two = heroVals.length === 2;
    const { total } = handTotal(heroVals);
    const rules = { canDouble: two, canSplit: two && heroVals[0] === heroVals[1], canSurrender: two && s.surrender, das: s.das };
    const bs = basicStrategy(heroVals, up, rules);

    if (two && total === 21) {
      return { natural: true, bs: 'S', actions: [{ code: 'S', ev: 1.5, se: 0, n: 0 }] };
    }

    let n = shoe.length;
    const draw = () => {
      const i = Math.floor(Math.random() * n);
      const v = shoe[i]; shoe[i] = shoe[n - 1]; shoe[n - 1] = v; n--;
      return v;
    };
    const dealerPlay = () => {
      // Dealer has already checked for blackjack, so the hole card cannot complete one.
      let hole;
      for (;;) {
        hole = draw();
        if ((up === 11 && hole === 10) || (up === 10 && hole === 11)) { n++; continue; }
        break;
      }
      const d = [up, hole];
      for (;;) {
        const { total: t, soft } = handTotal(d);
        if (t > 21) return 22;
        if (t > 17 || (t === 17 && !(soft && s.h17))) return t;
        d.push(draw());
      }
    };
    const playOut = (vals, canDouble) => {
      // Continue a hand with basic strategy. Returns [total, multiplier].
      let mult = 1;
      for (;;) {
        const { total: t } = handTotal(vals);
        if (t >= 21) return [t, mult];
        const a = basicStrategy(vals, up, { canDouble: canDouble && vals.length === 2, canSplit: false, canSurrender: false, das: false });
        if (a === 'S') return [t, mult];
        vals.push(draw());
        if (a === 'D') { mult = 2; return [handTotal(vals).total, mult]; }
      }
    };
    const settle = (t, mult, dealer) => (t > 21 ? -mult : dealer > 21 || t > dealer ? mult : t === dealer ? 0 : -mult);

    const actionPlans = {
      S: () => settle(total, 1, dealerPlay()),
      H: () => { const v = [...heroVals, draw()]; const [t, m] = playOut(v, false); return settle(t, m, t > 21 ? 0 : dealerPlay()); },
      D: () => { const v = [...heroVals, draw()]; const t = handTotal(v).total; return settle(t, 2, t > 21 ? 0 : dealerPlay()); },
      P: () => {
        const aces = heroVals[0] === 11;
        const hands = [[heroVals[0], draw()], [heroVals[1], draw()]];
        const outs = hands.map((h) => (aces ? [handTotal(h).total, 1] : playOut(h, s.das)));
        const dealer = outs.every(([t]) => t > 21) ? 0 : dealerPlay();
        return outs.reduce((sum, [t, m]) => sum + settle(t, m, dealer), 0);
      },
    };
    const codes = ['S', 'H'];
    if (rules.canDouble) codes.push('D');
    if (rules.canSplit) codes.push('P');

    const trials = Math.max(20000, Math.round(500000 * quality));
    const actions = [];
    let done = 0;
    const totalWork = trials * codes.length;
    for (const code of codes) {
      let sum = 0, sq = 0, win = 0, push = 0;
      for (let t = 0; t < trials; t++) {
        n = shoe.length;
        const x = actionPlans[code]();
        sum += x; sq += x * x;
        if (x > 0) win++; else if (x === 0) push++;
        if (++done % 5000 === 0) yield done / totalWork;
      }
      const ev = sum / trials;
      const se = Math.sqrt(Math.max(0, sq / trials - ev * ev) / trials);
      actions.push({ code, ev, se, n: trials, win: win / trials, push: push / trials });
    }
    if (rules.canSurrender) actions.push({ code: 'R', ev: -0.5, se: 0, n: 0 });
    actions.sort((a, b) => b.ev - a.ev);
    return { actions, bs };
  },
  render(r, s) {
    if (r.natural) {
      return banner('Stand: Blackjack!', 'good', `A natural 21 pays 3 to 2: ${signedMoney(1.5 * s.bet)}.`);
    }
    // When the top options are within simulation noise, break the tie with basic strategy.
    const top = r.actions[0];
    const isClose = (a) => a === top || top.ev - a.ev < 2 * Math.hypot(top.se, a.se);
    const bsAction = r.actions.find((a) => a.code === r.bs && isClose(a));
    const best = bsAction || top;
    const second = r.actions.find((a) => a !== best);
    const close = second && isClose(second) && isClose(best);
    const tone = best.ev > 0 ? 'good' : best.ev > -0.2 ? 'ok' : 'bad';
    let reason = `Average result: ${signedMoney(best.ev * s.bet)} on a ${money(s.bet)} bet.`;
    if (close) reason += ` It's very close to ${ACTION_NAMES[second.code]}; the difference is within simulation noise.`;
    reason += ` Basic strategy says: <b>${ACTION_NAMES[r.bs]}</b>.`;
    return banner(ACTION_NAMES[best.code], tone, reason) +
      table('Every option', ['Action', 'Average result', 'Per $1 bet', 'Win', 'Push'],
        r.actions.map((a, i) => ({
          hl: a === best,
          cells: [ACTION_NAMES[a.code], signedMoney(a.ev * s.bet),
            a.ev.toFixed(3) + (a.se ? ` ± ${(1.96 * a.se).toFixed(3)}` : ''),
            a.win != null ? pct(a.win) : '—', a.push != null ? pct(a.push) : '—'],
        }))) +
      statGrid([['Simulated hands per option', (r.actions.find((a) => a.n)?.n || 0).toLocaleString()]]) +
      note('After your first move, later decisions follow basic strategy. Split hands are not re-split. The dealer has already checked for blackjack. "±" is the 95% simulation margin; use Precise for tighter numbers.');
  },
};
