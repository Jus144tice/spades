import React from 'react';

const PRESETS = [
  { key: 'hearts',     label: 'Hearts',          value: 'C,D,S,H:asc',  desc: 'Clubs, Diamonds, Spades, Hearts — low to high' },
  { key: 'spadesFirst', label: 'Spades First',    value: 'S,H,D,C:desc', desc: 'Spades first — high to low' },
  { key: 'bridge',     label: 'Bridge',           value: 'S,H,D,C:asc',  desc: 'Bridge suit order — low to high' },
  { key: 'highFirst',  label: 'High Cards First', value: 'C,D,S,H:desc', desc: 'Same as Hearts — high to low' },
];

const SUIT_SYMBOLS = { C: '\u2663', D: '\u2666', S: '\u2660', H: '\u2665' };
const SUIT_COLORS = { C: '#4a7c59', D: '#4fc3f7', S: '#e8eaed', H: '#ef5350' };
const SAMPLE_RANKS = ['3', '7', 'J', 'A', '5'];

function parseSortForPreview(sortStr) {
  const [suitPart, dir] = sortStr.split(':');
  const suits = suitPart.split(',');
  // Generate a sample hand: one card of each suit + an extra
  const cards = [];
  suits.forEach((suit, i) => {
    cards.push({ suit, rank: SAMPLE_RANKS[i] });
  });
  cards.push({ suit: suits[0], rank: SAMPLE_RANKS[4] });

  // Sort them the same way the server would
  const suitOrder = {};
  suits.forEach((s, i) => { suitOrder[s] = i; });
  const RANK_VALUE = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  const mul = dir === 'desc' ? -1 : 1;
  cards.sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
    return mul * (RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
  });
  return cards;
}

export default function CardSortPicker({ value, onChange }) {
  const preview = parseSortForPreview(value || 'C,D,S,H:asc');

  return (
    <div className="pref-section">
      <h3 className="pref-section-title">Card Sort Order</h3>
      <div className="preset-buttons">
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`preset-btn ${value === p.value ? 'selected' : ''}`}
            onClick={() => onChange(p.value)}
            title={p.desc}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="card-preview">
        {preview.map((card, i) => (
          <div key={i} className="preview-card" style={{ color: SUIT_COLORS[card.suit] }}>
            <span className="preview-rank">{card.rank}</span>
            <span className="preview-suit">{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
