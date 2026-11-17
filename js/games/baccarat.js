import { banner, statGrid, table, pct, money, signedMoney, note } from '../render.js';

// Baccarat point values: A = 1, 2-9 face value, 10/J/Q/K = 0.
const GROUP_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10/J/Q/K'];
const GROUP_POINTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** Banker's drawing rule given banker total and the player's third card (or -1 if none). */
export function bankerDraws(b, p3) {
  if (p3 < 0) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}

export const baccarat = {
  id: 'baccarat',
  name: 'Baccarat',
  description: 'Bet on Player, Banker or Tie; the cards are drawn by fixed rules, so the only choice is the bet. Enter cards already dealt from the shoe to see if that shifts the odds.',
  fields: [
    { type: 'counts', key: 'seen', label: 'Cards already dealt from this shoe (optional)', groups: GROUP_LABELS },
    { type: 'number', key: 'bet', label: 'Bet size ($)', min: 1, max: 1e6, step: 1, value: 10 },
    { type: 'number', key: 'decks', label: 'Decks in the shoe', min: 1, max: 8, step: 1, value: 8 },
  ],
  validate(s) {
    for (let i = 0; i < 10; i++) {
      const have = s.decks * (i === 9 ? 16 : 4);
      if (((s.seen || [])[i] || 0) > have) return `More ${GROUP_LABELS[i]} cards entered than a ${s.decks}-deck shoe holds.`;
    }
    const left = s.decks * 52 - (s.seen || []).reduce((a, b) => a + b, 0);
    if (left < 6) return 'Fewer than 6 cards left in the shoe.';
    return null;
  },
  *simulate(s, quality) {
    const shoe = [];
    for (let i = 0; i < 10; i++) {
      const left = s.decks * (i === 9 ? 16 : 4) - ((s.seen || [])[i] || 0);
      for (let k = 0; k < left; k++) shoe.push(GROUP_POINTS[i]);
    }
    const trials = Math.max(200000, Math.round(2000000 * quality));
    let pw = 0, bw = 0, tie = 0, n;
    const draw = () => {
      const i = Math.floor(Math.random() * n);
      const v = shoe[i]; shoe[i] = shoe[n - 1]; shoe[n - 1] = v; n--;
      return v;
    };
    for (let t = 1; t <= trials; t++) {
      n = shoe.length;
      let p = (draw() + draw()) % 10;
      let b = (draw() + draw()) % 10;
      if (p < 8 && b < 8) {
        let p3 = -1;
        if (p <= 5) { p3 = draw(); p = (p + p3) % 10; }
        if (bankerDraws(b, p3)) b = (b + draw()) % 10;
      }
      if (p > b) pw++; else if (b > p) bw++; else tie++;
      if (t % 20000 === 0) yield t / trials;
    }
    const P = pw / trials, B = bw / trials, T = tie / trials;
    const bets = [
      { name: 'Banker', ev: 0.95 * B - P, pays: '0.95 to 1 (5% commission)' },
      { name: 'Player', ev: P - B, pays: '1 to 1' },
      { name: 'Tie', ev: 8 * T - (1 - T), pays: '8 to 1' },
    ].sort((a, b) => b.ev - a.ev);
    return { trials, P, B, T, bets };
  },
  render(r, s) {
    const best = r.bets[0];
    const positive = best.ev > 0;
    const reason = positive
      ? `With these cards gone, ${best.name} has the edge: ${signedMoney(best.ev * s.bet)} per bet on average. Rare. Check with a Precise run.`
      : `Every bet loses money over time; ${best.name} loses least, ${signedMoney(best.ev * s.bet)} per ${money(s.bet)} bet (house edge ${pct(-best.ev, 2)}).`;
    return banner(`Bet ${best.name}`, positive ? 'good' : 'ok', reason) +
      statGrid([
        ['Banker wins', pct(r.B, 2)],
        ['Player wins', pct(r.P, 2)],
        ['Tie', pct(r.T, 2)],
      ]) +
      table('Each bet', ['Bet', 'Pays', 'Average result', 'House edge'],
        r.bets.map((b, i) => ({ hl: i === 0, cells: [b.name, b.pays, signedMoney(b.ev * s.bet), pct(-b.ev, 2)] }))) +
      note(`Based on ${r.trials.toLocaleString()} simulated coups. A fresh 8-deck shoe gives Banker a 1.06% house edge, Player 1.24% and Tie 14.4%. Simulation margin here is about ±${(196 / Math.sqrt(r.trials)).toFixed(2)}%.`);
  },
};
