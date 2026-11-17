import { makeDeck, shuffleFirst, evalCards, evalOmaha, categoryOf } from '../cards.js';
import { potFields, renderEquity } from './poker-common.js';
import { setupModeling, holdemStartT, omahaStartScore, startDist, sampledDist, dealFromRange } from './opponents.js';

function boardError(board) {
  return [0, 3, 4, 5].includes(board.length) ? null : 'The board must have 0, 3 (flop), 4 (turn) or 5 (river) cards.';
}

const five = new Array(5);
/** Omaha hand on a partial board (3 or 4 cards): exactly 2 hole + 3 board. */
function evalOmahaPartial(hole, board) {
  let best = -1;
  const m = board.length;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) {
    five[0] = hole[a]; five[1] = hole[b];
    for (let x = 0; x < m - 2; x++) for (let y = x + 1; y < m - 1; y++) for (let z = y + 1; z < m; z++) {
      five[2] = board[x]; five[3] = board[y]; five[4] = board[z];
      const sc = evalCards(five, 5);
      if (sc > best) best = sc;
    }
  }
  return best;
}

/** Shared equity loop for Hold'em (2 hole cards) and Omaha (4 hole cards). */
function* communitySim(s, quality, holeCount, evaluate) {
  const { hero, board, opponents } = s;
  const dead = s.dead || [];
  const deck = makeDeck([...hero, ...board, ...dead]);
  const missing = 5 - board.length;
  const need = missing + holeCount * opponents;
  if (need > deck.length) throw new Error('Not enough cards left in the deck for that many opponents.');

  let modeling = null, nowT = null;
  if (s.modeling) {
    const omaha = holeCount === 4;
    const startT = omaha ? ((c) => startDist('omaha', 4, omahaStartScore).top(omahaStartScore(c))) : holdemStartT;
    nowT = startT;
    if (board.length >= 3) {
      const cur = omaha ? (c) => evalOmahaPartial(c, board) : (c) => evalCards([c[0], c[1], ...board], 2 + board.length);
      const dist = sampledDist(deck, holeCount, cur);
      nowT = (c) => dist.top(cur(c));
    }
    modeling = setupModeling(s, { deckCards: deck, k: holeCount, startT, nowT, hasPost: board.length >= 3 });
  }
  yield 0.02;

  const baseTrials = holeCount === 2 ? 200000 : 40000;
  const trials = Math.max(2000, Math.round(baseTrials * quality * (modeling ? 0.25 : 1)));
  const full = new Array(5);
  for (let i = 0; i < board.length; i++) full[i] = board[i];
  const opp = Array.from({ length: opponents }, () => new Array(holeCount));
  const os = new Array(opponents), ot = new Array(opponents);
  let wins = 0, ties = 0, equity = 0;
  const cats = new Array(9).fill(0);
  for (let t = 1; t <= trials; t++) {
    let p = 0;
    if (modeling) {
      for (let k = 0; k < opponents; k++) {
        dealFromRange(deck, p, holeCount, opp[k], modeling.accepts[k]);
        ot[k] = nowT(opp[k]);
        p += holeCount;
      }
      partialShuffle(deck, p, missing);
      for (let i = board.length; i < 5; i++) full[i] = deck[p++];
    } else {
      shuffleFirst(deck, need);
      for (let i = board.length; i < 5; i++) full[i] = deck[p++];
      for (let k = 0; k < opponents; k++) for (let j = 0; j < holeCount; j++) opp[k][j] = deck[p++];
    }
    const hs = evaluate(hero, full);
    cats[categoryOf(hs)]++;
    let lost = false, tied = 0;
    for (let k = 0; k < opponents; k++) {
      os[k] = evaluate(opp[k], full);
      if (os[k] > hs) lost = true; else if (os[k] === hs) tied++;
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
}

function partialShuffle(deck, p, k) {
  const n = deck.length;
  for (let i = 0; i < k; i++) {
    const j = p + i + Math.floor(Math.random() * (n - p - i));
    const x = deck[p + i]; deck[p + i] = deck[j]; deck[j] = x;
  }
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
  hasPostflop: true,
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
  hasPostflop: true,
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
