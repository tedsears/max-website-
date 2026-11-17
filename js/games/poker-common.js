// Shared betting advice and result rendering for the poker games.
import { HAND_NAMES } from '../cards.js';
import { banner, statGrid, bars, pct, money, signedMoney, trialsNote, note } from '../render.js';

export const potFields = [
  { type: 'number', key: 'opponents', label: 'Opponents still in the hand', min: 1, max: 9, step: 1, value: 2 },
  { type: 'number', key: 'pot', label: 'Money in the pot ($)', min: 0, max: 1e7, step: 1, value: 100,
    help: 'Everything already in the middle, including bets made this round.' },
  { type: 'number', key: 'toCall', label: 'Amount you must call ($)', min: 0, max: 1e7, step: 1, value: 20,
    help: '0 if nobody has bet yet.' },
];

/**
 * Turn win equity into an action.
 * Fold when equity is below the pot odds; raise when equity clearly beats a fair share.
 */
export function pokerAdvice(equity, opponents, pot, toCall) {
  const fair = 1 / (opponents + 1);
  const strong = fair + (1 - fair) * 0.25;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const evCall = equity * (pot + toCall) - toCall;
  let action, tone, reason;
  if (toCall <= 0) {
    if (equity >= strong) {
      action = 'Bet'; tone = 'good';
      reason = `You win ${pct(equity)} of the pot on average, well above a fair share of ${pct(fair)}. Build the pot.`;
    } else {
      action = 'Check'; tone = 'neutral';
      reason = `Your ${pct(equity)} equity is not strong enough to bet into ${opponents} opponent${opponents > 1 ? 's' : ''}. Check and see a free card.`;
    }
  } else if (equity < potOdds) {
    action = 'Fold'; tone = 'bad';
    reason = `You need ${pct(potOdds)} equity to call profitably and you have ${pct(equity)}. Calling loses ${money(-evCall)} on average.`;
  } else if (equity >= strong) {
    action = 'Raise'; tone = 'good';
    reason = `Your ${pct(equity)} equity beats the ${pct(potOdds)} needed and a fair share of ${pct(fair)}. Make them pay to draw.`;
  } else {
    action = 'Call'; tone = 'ok';
    reason = `Your ${pct(equity)} equity beats the ${pct(potOdds)} the pot odds require. Calling earns ${signedMoney(evCall)} on average.`;
  }
  return { action, tone, reason, potOdds, evCall, fair };
}

/** Standard result panel for an equity simulation. */
export function renderEquity(r, s, extraNote = '') {
  const adv = pokerAdvice(r.equity, s.opponents, s.pot, s.toCall);
  const total = r.trials;
  const catRows = r.cats
    .map((n, i) => [HAND_NAMES[i], n / total, pct(n / total), false])
    .filter((row) => row[1] > 0)
    .reverse();
  return banner(adv.action, adv.tone, adv.reason) +
    statGrid([
      ['Win', pct(r.wins / total)],
      ['Split pot', pct(r.ties / total)],
      ['Lose', pct(1 - (r.wins + r.ties) / total)],
      ['Your equity', pct(r.equity), 'share of the pot you win on average'],
      ['Equity needed', s.toCall > 0 ? pct(adv.potOdds) : '—', 'pot odds'],
      ['EV of calling', s.toCall > 0 ? signedMoney(adv.evCall) : '—'],
    ]) +
    bars('Your final hand', catRows) +
    trialsNote(total, 'Opponents are dealt random cards; real opponents who are still betting usually hold better than random.') +
    (extraNote ? note(extraNote) : '');
}
