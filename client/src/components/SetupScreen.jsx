import React, { useState } from 'react';
import { usePreferences } from '../context/PreferencesContext.jsx';
import CardSortPicker from './CardSortPicker.jsx';
import TableColorPicker from './TableColorPicker.jsx';

export default function SetupScreen() {
  const { updatePreferences } = usePreferences();
  const [cardSort, setCardSort] = useState('C,D,S,H:asc');
  const [tableColor, setTableColor] = useState('#0f1923');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePreferences({ cardSort, tableColor });
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="join-screen">
      <div className="join-card setup-card">
        <h1 className="join-title">Welcome to Spades</h1>
        <p className="join-subtitle">Set up your preferences before you play</p>

        <CardSortPicker value={cardSort} onChange={setCardSort} />
        <TableColorPicker value={tableColor} onChange={setTableColor} />

        <button
          className="btn btn-primary setup-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save & Play'}
        </button>
      </div>
    </div>
  );
}
