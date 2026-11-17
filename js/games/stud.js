import { makeDeck, shuffleFirst, evalCards, categoryOf } from '../cards.js';
import { potFields, renderEquity } from './poker-common.js';

export const stud = {
  id: 'stud',
  name: 'Seven-Card Stud',
  description: 'No shared board: everyone gets seven cards of their own. Enter all your cards so far, plus any opponent up-cards you can see.',
  fields: [
    { type: 'cards', key: 'hero', label: 'Your cards (down and up)', min: 3, max: 7 },
    { type: 'cards', key: 'dead', label: "Opponents' up-cards and folded cards", min: 0, max: 24, optional: true },
    ...potFields.map((f) => (f.key === 'opponents' ? { ...f, max: 6 } : f)),
  ],
  validate: () => null,
  *simulate(s, quality) {
    const { hero, opponents } = s;
    const deck = makeDeck([...hero, ...(s.dead || [])]);
    const need = (7 - hero.length) + 7 * opponents;
    if (need > deck.length) throw new Error('Not enough unseen cards for that many opponents.');
    const trials = Math.max(2000, Math.round(200000 * quality));
    const h = new Array(7), o = new Array(7);
    for (let i = 0; i < hero.length; i++) h[i] = hero[i];
    let wins = 0, ties = 0, equity = 0;
    const cats = new Array(9).fill(0);
    for (let t = 1; t <= trials; t++) {
      shuffleFirst(deck, need);
      let p = 0;
      for (let i = hero.length; i < 7; i++) h[i] = deck[p++];
      const hs = evalCards(h, 7);
      cats[categoryOf(hs)]++;
      let lost = false, tied = 0;
      for (let k = 0; k < opponents; k++) {
        for (let j = 0; j < 7; j++) o[j] = deck[p++];
        const os = evalCards(o, 7);
        if (os > hs) { lost = true; break; }
        if (os === hs) tied++;
      }
      if (!lost) {
        if (tied === 0) { wins++; equity += 1; } else { ties++; equity += 1 / (tied + 1); }
      }
      if (t % 1000 === 0) yield t / trials;
    }
    return { trials, wins, ties, equity: equity / trials, cats };
  },
  render: (r, s) => renderEquity(r, s, "Up-cards you enter are removed from the deck, but opponents' hands are still simulated as random. A player showing three hearts is more likely to be on a flush than this assumes."),
};
