import { makeDeck, shuffleFirst, evalCards, evalOmaha, categoryOf } from '../cards.js';
import { potFields, renderEquity } from './poker-common.js';

function boardError(board) {
  return [0, 3, 4, 5].includes(board.length) ? null : 'The board must have 0, 3 (flop), 4 (turn) or 5 (river) cards.';
}

/** Shared equity loop for Hold'em (2 hole cards) and Omaha (4 hole cards). */
function* communitySim(s, quality, holeCount, evaluate) {
  const { hero, board, opponents } = s;
  const dead = s.dead || [];
  const deck = makeDeck([...hero, ...board, ...dead]);
  const missing = 5 - board.length;
  const need = missing + holeCount * opponents;
  if (need > deck.length) throw new Error('Not enough cards left in the deck for that many opponents.');
  const trials = Math.max(2000, Math.round((holeCount === 2 ? 200000 : 40000) * quality));
  const full = new Array(5);
  for (let i = 0; i < board.length; i++) full[i] = board[i];
  const opp = new Array(holeCount);
  let wins = 0, ties = 0, equity = 0;
  const cats = new Array(9).fill(0);
  for (let t = 1; t <= trials; t++) {
    shuffleFirst(deck, need);
    let p = 0;
    for (let i = board.length; i < 5; i++) full[i] = deck[p++];
    const hs = evaluate(hero, full);
    cats[categoryOf(hs)]++;
    let lost = false, tied = 0;
    for (let k = 0; k < opponents; k++) {
      for (let j = 0; j < holeCount; j++) opp[j] = deck[p++];
      const os = evaluate(opp, full);
      if (os > hs) { lost = true; break; }
      if (os === hs) tied++;
    }
    if (!lost) {
      if (tied === 0) { wins++; equity += 1; } else { ties++; equity += 1 / (tied + 1); }
    }
    if (t % 1000 === 0) yield t / trials;
  }
  return { trials, wins, ties, equity: equity / trials, cats };
}

const seven = new Array(7);
function evalHoldem(hole, board) {
  seven[0] = hole[0]; seven[1] = hole[1];
  for (let i = 0; i < 5; i++) seven[2 + i] = board[i];
  return evalCards(seven, 7);
}

export const holdem = {
  id: 'holdem',
  name: "Texas Hold'em",
  description: 'Two private cards each, five shared cards on the board. Pick your hole cards and whatever board is showing.',
  fields: [
    { type: 'cards', key: 'hero', label: 'Your hole cards', min: 2, max: 2 },
    { type: 'cards', key: 'board', label: 'Board (flop / turn / river)', min: 0, max: 5 },
    { type: 'cards', key: 'dead', label: 'Other cards you saw (folded / burned)', min: 0, max: 10, optional: true },
    ...potFields,
  ],
  validate: (s) => boardError(s.board),
  simulate: (s, q) => communitySim(s, q, 2, evalHoldem),
  render: (r, s) => renderEquity(r, s),
};

export const omaha = {
  id: 'omaha',
  name: 'Omaha',
  description: 'Four private cards each; your hand must use exactly two of them plus three board cards.',
  fields: [
    { type: 'cards', key: 'hero', label: 'Your hole cards', min: 4, max: 4 },
    { type: 'cards', key: 'board', label: 'Board (flop / turn / river)', min: 0, max: 5 },
    { type: 'cards', key: 'dead', label: 'Other cards you saw (folded / burned)', min: 0, max: 10, optional: true },
    ...potFields,
  ],
  validate: (s) => boardError(s.board),
  simulate: (s, q) => communitySim(s, q, 4, evalOmaha),
  render: (r, s) => renderEquity(r, s, 'Omaha hands run close: even strong starting hands rarely have more than 65% equity heads-up.'),
};
