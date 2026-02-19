import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState(null);
  const [setupDone, setSetupDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPreferences(null);
      setSetupDone(false);
      setLoading(false);
      return;
    }

    // Use preferences from the /auth/me response
    if (user.preferences) {
      setPreferences(user.preferences);
      applyTableColor(user.preferences.tableColor);
    }
    setSetupDone(user.hasCompletedSetup ?? false);
    setLoading(false);
  }, [user]);

  const updatePreferences = useCallback(async (newPrefs) => {
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrefs),
      });
      if (!res.ok) throw new Error('Failed to save preferences');
      const data = await res.json();
      setPreferences(data.preferences);
      setSetupDone(true);
      applyTableColor(data.preferences.tableColor);
      return data.preferences;
    } catch (err) {
      console.error('Failed to update preferences:', err);
      throw err;
    }
  }, []);

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences, loading, hasCompletedSetup: setupDone }}>
      {children}
    </PreferencesContext.Provider>
  );
}

function applyTableColor(color) {
  if (color) {
    document.documentElement.style.setProperty('--bg-dark', color);
  }
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
