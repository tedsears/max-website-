import { makeDeck, shuffleFirst, jobIndex, JOB_PAYTABLE, forEachCombo, choose } from '../cards.js';
import { banner, statGrid, table, bars, pct, money, signedMoney, miniCards, note } from '../render.js';

const EXACT_LIMIT = 20000; // enumerate every draw when there are at most this many

export const videopoker = {
  id: 'videopoker',
  name: 'Video Poker',
  description: 'Jacks or Better, full-pay 9/6 machine. Enter the five cards dealt to find which ones to hold.',
  fields: [
    { type: 'cards', key: 'hero', label: 'Cards dealt', min: 5, max: 5 },
    { type: 'number', key: 'coins', label: 'Coins bet (1-5)', min: 1, max: 5, step: 1, value: 5,
      help: 'Bet 5 coins: the royal flush pays 800 per coin instead of 250.' },
    { type: 'number', key: 'coinValue', label: 'Coin value ($)', min: 0.01, max: 100, step: 0.25, value: 0.25 },
  ],
  validate: () => null,
  *simulate(s, quality) {
    const hand = s.hero;
    const deck = makeDeck(hand);
    const pays = JOB_PAYTABLE.map((p, i) => (i === 0 && s.coins === 5 ? p.pay5 : p.pay));
    const samples = Math.max(5000, Math.round(100000 * quality));
    const results = [];
    const five = new Array(5);
    for (let mask = 0; mask < 32; mask++) {
      const kept = hand.filter((_, i) => mask & (1 << i));
      const k = 5 - kept.length;
      for (let i = 0; i < kept.length; i++) five[i] = kept[i];
      const counts = new Array(JOB_PAYTABLE.length).fill(0);
      let n = 0;
      const total = choose(deck.length, k);
      if (total <= EXACT_LIMIT) {
        forEachCombo(deck, k, (combo) => {
          for (let i = 0; i < k; i++) five[kept.length + i] = combo[i];
          counts[jobIndex(five)]++; n++;
        });
      } else {
        for (let t = 0; t < samples; t++) {
          shuffleFirst(deck, k);
          for (let i = 0; i < k; i++) five[kept.length + i] = deck[i];
          counts[jobIndex(five)]++; n++;
        }
      }
      const ev = counts.reduce((sum, c, i) => sum + c * pays[i], 0) / n;
      results.push({ mask, kept, ev, counts, n, exact: total <= EXACT_LIMIT });
      yield (mask + 1) / 32;
    }
    results.sort((a, b) => b.ev - a.ev);
    return { results, pays };
  },
  render(r, s) {
    const best = r.results[0];
    const bet = s.coins * s.coinValue;
    const keepText = best.kept.length === 5 ? 'Hold all 5' : best.kept.length === 0 ? 'Discard all 5' : `Hold ${best.kept.length}`;
    const reason = `Hold ${miniCards(best.kept)}. This returns ${best.ev.toFixed(4)} coins per coin bet, `
      + `${signedMoney((best.ev - 1) * bet)} per hand versus your ${money(bet)} bet.`;
    const rows = JOB_PAYTABLE.map((p, i) => [p.name, best.counts[i] / best.n, pct(best.counts[i] / best.n, 2), false])
      .filter((x) => x[1] > 0);
    return banner(keepText, best.ev >= 1 ? 'good' : 'ok', reason) +
      statGrid([
        ['Expected return', best.ev.toFixed(3) + '×', 'of your bet'],
        ['Average result', signedMoney((best.ev - 1) * bet), 'per hand'],
        ['Runner-up play', r.results[1].ev.toFixed(3) + '×'],
      ]) +
      bars('What the best hold turns into', rows) +
      table('Every hold, best first (top 10)', ['Hold', 'Return per coin', 'Method'],
        r.results.slice(0, 10).map((x, i) => ({ hl: i === 0, cells: [miniCards(x.kept), x.ev.toFixed(4), x.exact ? 'exact' : `${x.n.toLocaleString()} sims`] }))) +
      note('Holds drawing three or fewer cards are counted exactly; bigger draws are estimated by simulation. Over every possible deal, perfect play on this machine returns about 99.54%.');
  },
};
