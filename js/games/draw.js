import { makeDeck, shuffleFirst, evalCards, categoryOf, HAND_NAMES } from '../cards.js';
import { potFields, pokerAdvice, renderSizing, renderModeled } from './poker-common.js';
import { setupModeling, startDist, drawStartScore, dealFromRange } from './opponents.js';
import { banner, statGrid, table, pct, signedMoney, miniCards, trialsNote } from '../render.js';

/** Simple opponent draw policy: stand on straight+, keep pairs/trips, keep 4-flushes, else keep the high card. */
function opponentKeepMask(hand) {
  const s = evalCards(hand, 5);
  if (categoryOf(s) >= 4) return 31;
  const counts = new Array(13).fill(0);
  const suits = [0, 0, 0, 0];
  for (const c of hand) { counts[c >> 2]++; suits[c & 3]++; }
  let mask = 0;
  hand.forEach((c, i) => { if (counts[c >> 2] >= 2) mask |= 1 << i; });
  if (mask) return mask;
  const fs = suits.findIndex((n) => n === 4);
  if (fs >= 0) { hand.forEach((c, i) => { if ((c & 3) === fs) mask |= 1 << i; }); return mask; }
  let hi = 0;
  hand.forEach((c, i) => { if ((c >> 2) > (hand[hi] >> 2)) hi = i; });
  return 1 << hi;
}

export const draw = {
  id: 'draw',
  name: 'Five-Card Draw',
  description: 'You get five cards, may throw some away and draw replacements once. Finds the best cards to keep and whether to stay in.',
  fields: [
    { type: 'cards', key: 'hero', label: 'Your five cards', min: 5, max: 5 },
    ...potFields.map((f) => (f.key === 'opponents' ? { ...f, max: 4 } : f)),
  ],
  validate: () => null,
  *simulate(s, quality) {
    const { hero, opponents } = s;
    const deck = makeDeck(hero);
    let modeling = null;
    const startT = (c) => startDist('draw', 5, drawStartScore).top(drawStartScore(c));
    if (s.modeling) modeling = setupModeling(s, { deckCards: deck, k: 5, startT, nowT: startT, hasPost: false });
    const perHold = Math.max(800, Math.round(10000 * quality * (modeling ? 0.3 : 1)));
    const results = [];
    const mine = new Array(5);
    const opp = Array.from({ length: opponents }, () => new Array(5));
    const os = new Array(opponents), ot = new Array(opponents);
    const n = deck.length;

    // One deal: you draw for the given hold, opponents get (range-weighted) hands and draw.
    const deal = (kept) => {
      let p = 0;
      for (let k = 0; k < opponents; k++) {
        dealFromRange(deck, p, 5, opp[k], modeling ? modeling.accepts[k] : null);
        ot[k] = modeling ? startT(opp[k]) : 0;
        p += 5;
      }
      const rest = (5 - kept.length) + 5 * opponents;
      for (let i = 0; i < rest; i++) {
        const r = p + i + Math.floor(Math.random() * (n - p - i));
        const x = deck[p + i]; deck[p + i] = deck[r]; deck[r] = x;
      }
      for (let i = 0; i < kept.length; i++) mine[i] = kept[i];
      for (let i = kept.length; i < 5; i++) mine[i] = deck[p++];
      for (let k = 0; k < opponents; k++) {
        const keep = opponentKeepMask(opp[k]);
        for (let j = 0; j < 5; j++) if (!(keep & (1 << j))) opp[k][j] = deck[p++];
        os[k] = evalCards(opp[k], 5);
      }
      return evalCards(mine, 5);
    };

    for (let mask = 0; mask < 32; mask++) {
      const kept = hero.filter((_, i) => mask & (1 << i));
      let equity = 0, wins = 0;
      const cats = new Array(9).fill(0);
      for (let t = 0; t < perHold; t++) {
        const hs = deal(kept);
        cats[categoryOf(hs)]++;
        let lost = false, tied = 0;
        for (let k = 0; k < opponents; k++) { if (os[k] > hs) { lost = true; break; } if (os[k] === hs) tied++; }
        if (!lost) { if (tied === 0) { equity += 1; wins++; } else equity += 1 / (tied + 1); }
      }
      results.push({ mask, kept, equity: equity / perHold, wins: wins / perHold, cats });
      yield (mask + 1) / (modeling ? 40 : 32);
    }
    results.sort((a, b) => b.equity - a.equity);
    let options = null;
    if (modeling) {
      // Decision pass for the best hold: fold / call / bet sizes with fold equity.
      const kept = results[0].kept;
      const N = perHold * 4;
      for (let t = 1; t <= N; t++) {
        const hs = deal(kept);
        modeling.dec.add(hs, os, ot);
        if (t % 1000 === 0) yield (32 + 8 * t / N) / 40;
      }
      options = modeling.dec.result();
    }
    return { results, perHold, options, oppInfo: modeling?.info };
  },
  render(r, s) {
    const best = r.results[0];
    const keepRow = table('Best things to keep', ['Keep', 'Draw', 'Win share'],
      r.results.slice(0, 8).map((x, i) => ({ hl: i === 0, cells: [miniCards(x.kept), 5 - x.kept.length, pct(x.equity)] })));
    if (r.options) {
      return renderModeled(r, s, best.equity).replace('<div class="banner-reason">', `<div class="banner-reason">Keep ${miniCards(best.kept)}<br>`) +
        keepRow + trialsNote(r.perHold * 32, 'Opponents get hands from the ranges their stats imply, then draw with a simple strategy. Results assume no more betting after this decision.');
    }
    const adv = pokerAdvice(best.equity, s.opponents, s.pot, s.toCall);
    const topCat = best.cats.indexOf(Math.max(...best.cats));
    const keepText = best.kept.length === 5 ? 'Stand pat (keep all 5)'
      : best.kept.length === 0 ? 'Draw 5 new cards' : `Keep ${best.kept.length}, draw ${5 - best.kept.length}`;
    return banner(`${adv.action} · ${keepText}`, adv.tone,
      `Best cards to keep: ${miniCards(best.kept)}<br>${adv.reason}`) +
      (s.sizing ? renderSizing(best.equity, s, adv) : '') +
      statGrid([
        ['Equity with best draw', pct(best.equity)],
        ['Equity needed', s.toCall > 0 ? pct(adv.potOdds) : '—', 'pot odds'],
        ['EV of calling', s.toCall > 0 ? signedMoney(adv.evCall) : '—'],
        ['Most likely final hand', HAND_NAMES[topCat]],
      ]) +
      keepRow +
      trialsNote(r.perHold * 32, 'Opponents draw with a simple strategy: keep pairs or better, keep four-flushes, otherwise keep their highest card.');
  },
};
