// Card engine: deck helpers and hand evaluators.
// A card is an int 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.

export const RANKS = '23456789TJQKA';
export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const JOKER = 52;
export const cardLabel = (c) => (c === JOKER ? 'Joker' : RANK_LABELS[c >> 2] + SUIT_SYMBOLS[c & 3]);
export const cardClass = (c) => (c === JOKER ? 'joker' : SUIT_NAMES[c & 3]);

export const HAND_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

/** Full 52-card deck minus any excluded cards. */
export function makeDeck(exclude = []) {
  const ex = new Set(exclude);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!ex.has(c)) deck.push(c);
  return deck;
}

/** Shuffle the first k positions of arr in place (partial Fisher-Yates). */
export function shuffleFirst(arr, k) {
  const n = arr.length;
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (n - i));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

/** Highest card of a 5-long run in a 13-bit rank mask, or -1. Wheel (A-5) returns 3. */
export function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) {
    if (((mask >> (h - 4)) & 0x1f) === 0x1f) return h;
  }
  if ((mask & 0x100f) === 0x100f) return 3;
  return -1;
}

const pack = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) =>
  cat * 1048576 + a * 65536 + b * 4096 + c * 256 + d * 16 + e;

export const categoryOf = (score) => Math.floor(score / 1048576);
export const primaryRankOf = (score) => Math.floor(score / 65536) % 16;

const rc = new Int8Array(13);
const sc = new Int8Array(4);
const sm = new Int32Array(4);

/**
 * Score the best 5-card poker hand from 5..7 cards. Higher is better.
 * Score = category * 16^5 + kicker ranks, so plain numeric comparison works.
 */
export function evalCards(cards, n = cards.length) {
  rc.fill(0); sc.fill(0); sm.fill(0);
  let rmask = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i], r = c >> 2, s = c & 3;
    rc[r]++; sc[s]++; sm[s] |= 1 << r; rmask |= 1 << r;
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const h = straightHigh(sm[flushSuit]);
    if (h >= 0) return pack(8, h);
  }
  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = rc[r];
    if (k === 4) quad = r;
    else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
  }
  if (quad >= 0) {
    let kick = -1;
    for (let r = 12; r >= 0; r--) if (r !== quad && rc[r] > 0) { kick = r; break; }
    return pack(7, quad, Math.max(kick, 0));
  }
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return pack(6, t1, Math.max(t2, p1));
  if (flushSuit >= 0) {
    const k = topRanks(sm[flushSuit], 5);
    return pack(5, k[0], k[1], k[2], k[3], k[4]);
  }
  const sh = straightHigh(rmask);
  if (sh >= 0) return pack(4, sh);
  if (t1 >= 0) {
    const k = topRanks(rmask & ~(1 << t1), 2);
    return pack(3, t1, k[0], k[1]);
  }
  if (p2 >= 0) {
    const k = topRanks(rmask & ~(1 << p1) & ~(1 << p2), 1);
    return pack(2, p1, p2, k[0]);
  }
  if (p1 >= 0) {
    const k = topRanks(rmask & ~(1 << p1), 3);
    return pack(1, p1, k[0], k[1], k[2]);
  }
  const k = topRanks(rmask, 5);
  return pack(0, k[0], k[1], k[2], k[3], k[4]);
}

function topRanks(mask, count) {
  const out = [0, 0, 0, 0, 0];
  let i = 0;
  for (let r = 12; r >= 0 && i < count; r--) if (mask & (1 << r)) out[i++] = r;
  return out;
}

const buf5 = [0, 0, 0, 0, 0];

/** Omaha: best hand using exactly 2 of the 4 hole cards and 3 of the 5 board cards. */
export function evalOmaha(hole, board) {
  let best = -1;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) {
    buf5[0] = hole[a]; buf5[1] = hole[b];
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 4; y++) for (let z = y + 1; z < 5; z++) {
      buf5[2] = board[x]; buf5[3] = board[y]; buf5[4] = board[z];
      const s = evalCards(buf5, 5);
      if (s > best) best = s;
    }
  }
  return best;
}

export const THREE_CARD_NAMES = ['High Card', 'Pair', 'Flush', 'Straight', 'Three of a Kind', 'Straight Flush'];

/** Three Card Poker ranking (straight beats flush). Higher is better. */
export function eval3(a, b, c) {
  let r = [a >> 2, b >> 2, c >> 2].sort((x, y) => y - x);
  const flush = (a & 3) === (b & 3) && (b & 3) === (c & 3);
  let straight = false, high = r[0];
  if (r[0] - r[2] === 2 && r[0] !== r[1] && r[1] !== r[2]) straight = true;
  else if (r[0] === 12 && r[1] === 1 && r[2] === 0) { straight = true; high = 1; }
  if (straight && flush) return pack(5, high);
  if (r[0] === r[2]) return pack(4, r[0]);
  if (straight) return pack(3, high);
  if (flush) return pack(2, r[0], r[1], r[2]);
  if (r[0] === r[1]) return pack(1, r[0], r[2]);
  if (r[1] === r[2]) return pack(1, r[1], r[0]);
  return pack(0, r[0], r[1], r[2]);
}

// Jacks or Better, "9/6" full-pay table. Payout per coin bet.
export const JOB_PAYTABLE = [
  { name: 'Royal Flush', pay: 250, pay5: 800 },
  { name: 'Straight Flush', pay: 50 },
  { name: 'Four of a Kind', pay: 25 },
  { name: 'Full House', pay: 9 },
  { name: 'Flush', pay: 6 },
  { name: 'Straight', pay: 4 },
  { name: 'Three of a Kind', pay: 3 },
  { name: 'Two Pair', pay: 2 },
  { name: 'Jacks or Better', pay: 1 },
  { name: 'Nothing', pay: 0 },
];

/** Index into JOB_PAYTABLE for a 5-card hand. */
export function jobIndex(cards5) {
  const s = evalCards(cards5, 5);
  const cat = categoryOf(s);
  switch (cat) {
    case 8: return primaryRankOf(s) === 12 ? 0 : 1;
    case 7: return 2;
    case 6: return 3;
    case 5: return 4;
    case 4: return 5;
    case 3: return 6;
    case 2: return 7;
    case 1: return primaryRankOf(s) >= 9 ? 8 : 9;
    default: return 9;
  }
}

/** Iterate all k-combinations of arr, calling fn(comboArray). The combo array is reused. */
export function forEachCombo(arr, k, fn) {
  const n = arr.length;
  if (k === 0) { fn([]); return; }
  const idx = Array.from({ length: k }, (_, i) => i);
  const combo = idx.map((i) => arr[i]);
  while (true) {
    fn(combo);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    combo[i] = arr[idx[i]];
    for (let j = i + 1; j < k; j++) { idx[j] = idx[j - 1] + 1; combo[j] = arr[idx[j]]; }
  }
}

export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
