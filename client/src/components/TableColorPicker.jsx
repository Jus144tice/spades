import React from 'react';

const TABLE_COLORS = [
  { label: 'Dark Blue',       value: '#0f1923' },
  { label: 'Green Felt',      value: '#1a472a' },
  { label: 'Dark Grey',       value: '#2a2a2a' },
  { label: 'Midnight Purple', value: '#1a1028' },
  { label: 'Deep Red Felt',   value: '#3a1a1a' },
];

export default function TableColorPicker({ value, onChange }) {
  return (
    <div className="pref-section">
      <h3 className="pref-section-title">Table Color</h3>
      <div className="color-swatches">
        {TABLE_COLORS.map(c => (
          <button
            key={c.value}
            className={`color-swatch ${value === c.value ? 'selected' : ''}`}
            style={{ background: c.value }}
            onClick={() => {
              onChange(c.value);
              document.documentElement.style.setProperty('--bg-dark', c.value);
            }}
            title={c.label}
          >
            {value === c.value && <span className="swatch-check">{'\u2713'}</span>}
          </button>
        ))}
      </div>
      <div className="color-label">{TABLE_COLORS.find(c => c.value === value)?.label || 'Custom'}</div>
    </div>
  );
}
