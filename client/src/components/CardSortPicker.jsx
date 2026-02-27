import React from 'react';

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

function swapSuits(suits, index) {
  const newSuits = [...suits];
  [newSuits[index], newSuits[index + 1]] = [newSuits[index + 1], newSuits[index]];
  return newSuits;
}

export default function CardSortPicker({ value, onChange }) {
  const { suits, dir, primary } = parseSortString(value);
  const preview = generatePreview(suits, dir, primary);

  const update = (newSuits, newDir, newPrimary) => {
    onChange(buildSortString(newSuits || suits, newDir || dir, newPrimary !== undefined ? newPrimary : primary));
  };

  return (
    <div className="pref-section">
      <h3 className="pref-section-title">Card Sort Order</h3>

      <div className="sort-controls">
        <div className="sort-row">
          <span className="sort-label">Direction</span>
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

        <div className="sort-row">
          <span className="sort-label">Suit order</span>
          <div className="suit-reorder">
            {suits.map((suit, i) => (
              <React.Fragment key={suit}>
                <span className="suit-chip" style={{ color: SUIT_COLORS[suit] }}>
                  {SUIT_SYMBOLS[suit]}
                </span>
                {i < 3 && (
                  <button
                    className="suit-swap-btn"
                    onClick={() => update(swapSuits(suits, i))}
                    aria-label={`Swap ${suit} and ${suits[i + 1]}`}
                  >{'\u21C4'}</button>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="sort-row">
          <label className="sort-rank-toggle" onClick={() => update(null, null, primary === 'rank' ? 'suit' : 'rank')}>
            <span className={`sort-checkbox ${primary === 'rank' ? 'checked' : ''}`}>
              {primary === 'rank' ? '\u2713' : ''}
            </span>
            <span className="sort-rank-label">Sort by rank instead of suit</span>
          </label>
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
