import { makeDeck, eval3, forEachCombo, categoryOf, THREE_CARD_NAMES } from '../cards.js';
import { banner, statGrid, bars, pct, signedMoney, note } from '../render.js';

const ANTE_BONUS = [0, 0, 0, 1, 4, 5]; // by category: straight 1:1, trips 4:1, straight flush 5:1
const QUEEN = 10;

export const threecard = {
  id: 'threecard',
  name: 'Three Card Poker',
  description: 'Casino game against the dealer. After seeing your three cards you either fold (lose the ante) or play (bet the ante again).',
  fields: [
    { type: 'cards', key: 'hero', label: 'Your three cards', min: 3, max: 3 },
    { type: 'number', key: 'ante', label: 'Ante bet ($)', min: 1, max: 1e6, step: 1, value: 10 },
  ],
  validate: () => null,
  *simulate(s) {
    const [a, b, c] = s.hero;
    const mine = eval3(a, b, c);
    const bonus = ANTE_BONUS[categoryOf(mine)];
    const deck = makeDeck(s.hero);
    let n = 0, noQualify = 0, win = 0, tie = 0, lose = 0;
    forEachCombo(deck, 3, (d) => {
      n++;
      const ds = eval3(d[0], d[1], d[2]);
      const qualifies = categoryOf(ds) >= 1 || Math.floor(ds / 65536) % 16 >= QUEEN;
      if (!qualifies) noQualify++;
      else if (mine > ds) win++;
      else if (mine === ds) tie++;
      else lose++;
    });
    yield 1;
    // Results in units of the ante. Play = ante + play bet of equal size.
    const evPlay = (noQualify * 1 + win * 2 - lose * 2) / n + bonus;
    return { n, noQualify, win, tie, lose, evPlay, evFold: -1, bonus, cat: categoryOf(mine) };
  },
  render(r, s) {
    const play = r.evPlay >= r.evFold;
    const reason = play
      ? `Playing loses less (or wins more) than folding: ${signedMoney(r.evPlay * s.ante)} on average versus ${signedMoney(-s.ante)} for folding.`
      : `Folding costs your ${signedMoney(-s.ante)} ante; playing would average ${signedMoney(r.evPlay * s.ante)}.`;
    return banner(play ? 'Play' : 'Fold', play ? (r.evPlay > 0 ? 'good' : 'ok') : 'bad', reason) +
      statGrid([
        ['Your hand', THREE_CARD_NAMES[r.cat]],
        ['EV if you play', signedMoney(r.evPlay * s.ante)],
        ['EV if you fold', signedMoney(-s.ante)],
        ['Ante bonus', r.bonus ? `+${r.bonus}× ante` : 'none'],
      ]) +
      bars('If you play, the dealer…', [
        ["doesn't qualify (you win the ante)", r.noQualify / r.n, pct(r.noQualify / r.n)],
        ['qualifies, you win', r.win / r.n, pct(r.win / r.n)],
        ['qualifies, tie', r.tie / r.n, pct(r.tie / r.n)],
        ['qualifies, you lose', r.lose / r.n, pct(r.lose / r.n)],
      ]) +
      note(`Exact: all ${r.n.toLocaleString()} possible dealer hands checked. The dealer needs queen-high or better to qualify. The textbook rule is to play Q-6-4 or better.`);
  },
};
