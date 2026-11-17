import { makeDeck, shuffleFirst, evalCards, categoryOf } from '../cards.js';
import { potFields, renderEquity } from './poker-common.js';
import { setupModeling, studStartScore, startDist, sampledDist, dealFromRange } from './opponents.js';

export const stud = {
  id: 'stud',
  name: 'Seven-Card Stud',
  description: 'No shared board: everyone gets seven cards of their own. Enter all your cards so far, plus any opponent up-cards you can see.',
  hasPostflop: true,
  fields: [
    { type: 'cards', key: 'hero', label: 'Your cards (down and up)', min: 3, max: 7 },
    { type: 'cards', key: 'dead', label: "Opponents' up-cards and folded cards", min: 0, max: 24, optional: true },
    ...potFields.map((f) => (f.key === 'opponents' ? { ...f, max: 6 } : f)),
  ],
  validate: () => null,
  *simulate(s, quality) {
    const { hero, opponents } = s;
    const deck = makeDeck([...hero, ...(s.dead || [])]);
    const k = hero.length; // opponents have the same number of cards as you
    const need = (7 - k) + 7 * opponents;
    if (need > deck.length) throw new Error('Not enough unseen cards for that many opponents.');

    let modeling = null, nowT = null;
    if (s.modeling) {
      const startT = (c) => startDist('stud', 3, studStartScore).top(studStartScore(c));
      nowT = startT;
      if (k >= 5) { const d = sampledDist(deck, k, (c) => evalCards(c, k)); nowT = (c) => d.top(evalCards(c, k)); }
      modeling = setupModeling(s, { deckCards: deck, k, startT, nowT, hasPost: k >= 4 });
    }
    yield 0.02;

    const trials = Math.max(2000, Math.round(200000 * quality * (modeling ? 0.2 : 1)));
    const h = new Array(7);
    const o = Array.from({ length: opponents }, () => new Array(7));
    const os = new Array(opponents), ot = new Array(opponents);
    for (let i = 0; i < k; i++) h[i] = hero[i];
    let wins = 0, ties = 0, equity = 0;
    const cats = new Array(9).fill(0);
    const n = deck.length;
    for (let t = 1; t <= trials; t++) {
      let p = 0;
      if (modeling) {
        for (let j = 0; j < opponents; j++) {
          dealFromRange(deck, p, k, o[j], modeling.accepts[j]);
          ot[j] = nowT(o[j]);
          p += k;
        }
        const rest = (7 - k) * (opponents + 1);
        for (let i = 0; i < rest; i++) {
          const r = p + i + Math.floor(Math.random() * (n - p - i));
          const x = deck[p + i]; deck[p + i] = deck[r]; deck[r] = x;
        }
        for (let j = 0; j < opponents; j++) for (let i = k; i < 7; i++) o[j][i] = deck[p++];
      } else {
        shuffleFirst(deck, need);
        for (let j = 0; j < opponents; j++) for (let i = 0; i < 7; i++) o[j][i] = deck[p++];
      }
      for (let i = k; i < 7; i++) h[i] = deck[p++];
      const hs = evalCards(h, 7);
      cats[categoryOf(hs)]++;
      let lost = false, tied = 0;
      for (let j = 0; j < opponents; j++) {
        os[j] = evalCards(o[j], 7);
        if (os[j] > hs) lost = true; else if (os[j] === hs) tied++;
      }
      if (!lost) {
        if (tied === 0) { wins++; equity += 1; } else { ties++; equity += 1 / (tied + 1); }
      }
      if (modeling) modeling.dec.add(hs, os, ot);
      if (t % 1000 === 0) yield 0.02 + 0.98 * t / trials;
    }
    return {
      trials, wins, ties, equity: equity / trials, cats,
      ...(modeling ? { options: modeling.dec.result(), oppInfo: modeling.info } : {}),
    };
  },
  render: (r, s) => renderEquity(r, s, "Up-cards you enter are removed from the deck but not tied to a specific opponent. A player showing three hearts is more likely to be on a flush than this assumes."),
};
