import React, { useState, useEffect } from 'react';
import { usePreferences } from '../context/PreferencesContext.jsx';
import CardSortPicker from './CardSortPicker.jsx';
import TableColorPicker from './TableColorPicker.jsx';

export default function SettingsModal({ onClose }) {
  const { preferences, updatePreferences } = usePreferences();
  const [cardSort, setCardSort] = useState(preferences?.cardSort || 'C,D,S,H:asc');
  const [tableColor, setTableColor] = useState(preferences?.tableColor || '#0f1923');
  const [saving, setSaving] = useState(false);

  // Store original color to revert on cancel
  const [originalColor] = useState(preferences?.tableColor || '#0f1923');

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePreferences({ cardSort, tableColor });
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Revert the live preview
    document.documentElement.style.setProperty('--bg-dark', originalColor);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>

        <CardSortPicker value={cardSort} onChange={setCardSort} />
        <TableColorPicker value={tableColor} onChange={setTableColor} />

        <div className="settings-actions">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
