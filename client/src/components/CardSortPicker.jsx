import React from 'react';

const PRESETS = [
  { key: 'hearts',     label: 'Hearts',          value: 'C,D,S,H:asc',  desc: 'Clubs, Diamonds, Spades, Hearts — low to high' },
  { key: 'spadesFirst', label: 'Spades First',    value: 'S,H,D,C:desc', desc: 'Spades first — high to low' },
  { key: 'bridge',     label: 'Bridge',           value: 'S,H,D,C:asc',  desc: 'Bridge suit order — low to high' },
  { key: 'highFirst',  label: 'High Cards First', value: 'C,D,S,H:desc', desc: 'Same as Hearts — high to low' },
];

const SUIT_SYMBOLS = { C: '\u2663', D: '\u2666', S: '\u2660', H: '\u2665' };
const SUIT_COLORS = { C: '#4a7c59', D: '#4fc3f7', S: '#e8eaed', H: '#ef5350' };
const RANK_VALUE = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function parseSortString(sortStr) {
  const parts = (sortStr || 'C,D,S,H:asc').split(':');
  const suits = parts[0].split(',');
  const dir = parts[1] || 'asc';
  const primary = parts[2] || 'suit';
  return { suits, dir, primary };
}

function buildSortString(suits, dir, primary) {
  const suffix = primary === 'rank' ? ':rank' : '';
  return `${suits.join(',')}:${dir}${suffix}`;
}

function generatePreview(suits, dir, primary) {
  // Generate a sample hand: varied ranks across suits
  const sampleRanks = ['3', '7', 'J', 'A', '5', 'Q', '9', '2'];
  const cards = [];
  suits.forEach((suit, i) => {
    cards.push({ suit, rank: sampleRanks[i] });
    if (i < 2) cards.push({ suit, rank: sampleRanks[i + 4] });
  });

  const suitOrder = {};
  suits.forEach((s, i) => { suitOrder[s] = i; });
  const mul = dir === 'desc' ? -1 : 1;

  if (primary === 'rank') {
    cards.sort((a, b) => {
      const rankDiff = mul * (RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
      if (rankDiff !== 0) return rankDiff;
      return suitOrder[a.suit] - suitOrder[b.suit];
    });
  } else {
    cards.sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      return mul * (RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
    });
  }
  return cards;
}

function moveSuit(suits, index, direction) {
  const newSuits = [...suits];
  const target = index + direction;
  if (target < 0 || target >= 4) return newSuits;
  [newSuits[index], newSuits[target]] = [newSuits[target], newSuits[index]];
  return newSuits;
}

export default function CardSortPicker({ value, onChange }) {
  const { suits, dir, primary } = parseSortString(value);
  const isPreset = PRESETS.some(p => p.value === value);
  const preview = generatePreview(suits, dir, primary);

  const update = (newSuits, newDir, newPrimary) => {
    onChange(buildSortString(newSuits || suits, newDir || dir, newPrimary !== undefined ? newPrimary : primary));
  };

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

      <div className="sort-custom-section">
        <div className="sort-option-row">
          <span className="sort-option-label">Suit order</span>
          <div className="suit-order-controls">
            {suits.map((suit, i) => (
              <div key={suit} className="suit-order-item">
                <button
                  className="suit-arrow"
                  onClick={() => update(moveSuit(suits, i, -1))}
                  disabled={i === 0}
                  aria-label={`Move ${suit} left`}
                >{'\u25C0'}</button>
                <span className="suit-order-icon" style={{ color: SUIT_COLORS[suit] }}>
                  {SUIT_SYMBOLS[suit]}
                </span>
                <button
                  className="suit-arrow"
                  onClick={() => update(moveSuit(suits, i, 1))}
                  disabled={i === 3}
                  aria-label={`Move ${suit} right`}
                >{'\u25B6'}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="sort-option-row">
          <span className="sort-option-label">Card order</span>
          <div className="sort-toggle-group">
            <button
              className={`sort-toggle-btn ${dir === 'asc' ? 'selected' : ''}`}
              onClick={() => update(null, 'asc')}
            >Low {'\u2192'} High</button>
            <button
              className={`sort-toggle-btn ${dir === 'desc' ? 'selected' : ''}`}
              onClick={() => update(null, 'desc')}
            >High {'\u2192'} Low</button>
          </div>
        </div>

        <div className="sort-option-row">
          <span className="sort-option-label">Group by</span>
          <div className="sort-toggle-group">
            <button
              className={`sort-toggle-btn ${primary === 'suit' ? 'selected' : ''}`}
              onClick={() => update(null, null, 'suit')}
            >Suit</button>
            <button
              className={`sort-toggle-btn ${primary === 'rank' ? 'selected' : ''}`}
              onClick={() => update(null, null, 'rank')}
            >Rank</button>
          </div>
        </div>
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
