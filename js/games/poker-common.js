// Shared betting advice and result rendering for the poker games.
import { HAND_NAMES } from '../cards.js';
import { banner, statGrid, bars, pct, money, signedMoney, trialsNote, note, esc } from '../render.js';

export const potFields = [
  { type: 'number', key: 'opponents', label: 'Opponents still in the hand', min: 1, max: 9, step: 1, value: 2 },
  { type: 'number', key: 'pot', label: 'Money in the pot ($)', min: 0, max: 1e7, step: 1, value: 100,
    help: 'Everything already in the middle, including bets made this round.' },
  { type: 'number', key: 'toCall', label: 'Amount you must call ($)', min: 0, max: 1e7, step: 1, value: 20,
    help: '0 if nobody has bet yet.' },
  { type: 'checkbox', key: 'sizing', label: 'Bet sizing: tell me how much to bet', value: false, toggle: true },
  { type: 'number', key: 'stack', label: 'Your stack ($)', min: 0, max: 1e9, step: 1, value: 500, showIf: 'sizing',
    help: 'Money in front of you, not counting what is already in the pot.' },
  { type: 'text', key: 'oppStacks', label: "Opponents' stacks ($)", value: '500, 500', placeholder: 'e.g. 400, 1200', showIf: 'sizing',
    help: 'One amount per opponent still in, separated by commas. Leave blank if unknown.' },
];

const round = (x) => Math.max(0, Math.round(x));

/** Largest bet B you could call, if it were bet into the current pot, and still break even. */
function maxCallableBet(equity, pot) {
  return equity >= 0.5 ? Infinity : (equity * pot) / (1 - 2 * equity);
}

/** Bet-sizing advice from equity, pot, and stacks. Returns HTML. */
export function renderSizing(equity, s, adv) {
  const stack = Math.max(0, Number(s.stack) || 0);
  const opp = String(s.oppStacks || '').split(/[,\s]+/).map(Number).filter((x) => x > 0);
  const biggest = opp.length ? Math.max(...opp) : Infinity;
  const smallest = opp.length ? Math.min(...opp) : Infinity;
  const eff = Math.min(stack, biggest); // the most anyone can win or lose against you
  const toCall = Math.min(s.toCall, stack);
  const pot = s.pot;
  const lines = [];
  let main;

  if (stack <= 0) return `<div class="sizing"><h3>Bet sizing</h3><div class="sizing-main">No chips behind</div></div>`;

  if (adv.action === 'Fold') {
    main = 'Fold: bet $0';
    const breakEven = equity >= 1 ? Infinity : (equity * pot) / (1 - equity);
    lines.push(`Calling would only pay off if the amount to call were ${money(breakEven)} or less; it is ${money(s.toCall)}.`);
  } else if (adv.action === 'Check') {
    main = 'Check: bet $0';
    const b = maxCallableBet(equity, pot);
    lines.push(b === Infinity ? 'If someone bets, you can call any amount.'
      : `If someone bets, calling is profitable up to a bet of about ${money(Math.min(b, stack))}.`);
  } else if (adv.action === 'Call') {
    main = toCall >= stack ? `Call all-in (${money(stack)})` : `Call ${money(toCall)}`;
    const breakEven = equity >= 1 ? Infinity : (equity * pot) / (1 - equity);
    lines.push(`Calling stays profitable up to ${money(Math.min(breakEven, stack))} to call.`);
  } else {
    // Bet or raise: bigger with a bigger edge, from half the pot up to the full pot.
    const strength = Math.max(0, Math.min(1, (equity - adv.fair) / (1 - adv.fair)));
    const frac = 0.5 + 0.5 * strength;
    let raise = frac * (pot + toCall);
    let total = toCall + raise;
    const spr = eff / (pot + toCall);
    if (total >= 0.6 * eff || spr <= 1.5) {
      total = eff;
      main = `All-in: ${money(eff)}`;
      lines.push(`Your stack is small compared to the pot (stack-to-pot ratio ${spr.toFixed(1)}), so a normal bet would commit you anyway.`);
    } else {
      total = round(total);
      main = s.toCall > 0
        ? `Raise: put in ${money(total)} (${money(toCall)} to call + ${money(total - toCall)} more)`
        : `Bet ${money(total)} (${Math.round(frac * 100)}% of the pot)`;
      lines.push(`Size grows with your edge: ${Math.round(frac * 100)}% of the pot here. Strong hands want callers to pay a lot to chase.`);
    }
  }

  if (opp.length) {
    lines.push(`Effective stack is ${money(eff)}: the most you can win or lose against the biggest stack (${money(biggest)}).`);
    if (smallest < eff) lines.push(`An opponent with ${money(smallest)} can only call that much; anything above it goes into a side pot against the others.`);
  } else {
    lines.push('Enter opponents\' stacks to cap the bet at what they can actually call.');
  }
  return `<div class="sizing"><h3>Bet sizing</h3><div class="sizing-main">${esc(main)}</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
}

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
    (s.sizing ? renderSizing(r.equity, s, adv) : '') +
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
