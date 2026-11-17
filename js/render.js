// Small HTML helpers for result panels.
import { cardLabel, SUIT_NAMES } from './cards.js';

export const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
export const money = (x) => (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(2);
export const signedMoney = (x) => (x >= 0 ? '+' : '') + money(x);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Big recommendation banner. tone: good | ok | bad | neutral */
export function banner(action, tone, reason) {
  return `<div class="banner ${tone}"><div class="banner-label">Recommended</div>
    <div class="banner-action">${esc(action)}</div>
    <div class="banner-reason">${reason}</div></div>`;
}

export function statGrid(items) {
  return `<div class="stats">${items.map(([label, value, sub]) =>
    `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${esc(label)}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`).join('')}</div>`;
}

/** Horizontal bars. rows: [label, fraction(0..1), displayText, highlight?] */
export function bars(title, rows) {
  return `<div class="bars"><h3>${esc(title)}</h3>${rows.map(([label, f, text, hl]) =>
    `<div class="bar-row${hl ? ' hl' : ''}"><span class="bar-label">${label}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(0, Math.min(1, f)) * 100}%"></span></span>
      <span class="bar-text">${text}</span></div>`).join('')}</div>`;
}

export function table(title, headers, rows) {
  return `<div class="tbl"><h3>${esc(title)}</h3><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr class="${r.hl ? 'hl' : ''}">${r.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function miniCards(cards) {
  if (!cards.length) return '<span class="muted">(draw all 5)</span>';
  return cards.map((c) => `<span class="mini ${SUIT_NAMES[c & 3]}">${cardLabel(c)}</span>`).join('');
}

export function note(text) {
  return `<p class="note">${text}</p>`;
}

export function trialsNote(n, extra = '') {
  return note(`Based on ${n.toLocaleString()} simulated outcomes.${extra ? ' ' + extra : ''}`);
}
