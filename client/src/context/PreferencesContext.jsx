import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth, getCsrfToken } from './AuthContext.jsx';

export const PreferencesContext = createContext(null);

const GUEST_PREFS_KEY = 'spades_guest_preferences';

function loadGuestPrefs() {
  try {
    const stored = localStorage.getItem(GUEST_PREFS_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function saveGuestPrefs(prefs) {
  try { localStorage.setItem(GUEST_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

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

    if (user.isGuest) {
      // Load guest preferences from localStorage, fall back to defaults from loginAsGuest
      const guestPrefs = loadGuestPrefs() || user.preferences || null;
      if (guestPrefs) {
        setPreferences(guestPrefs);
        applyTableColor(guestPrefs.tableColor);
        setSetupDone(true);
      }
    } else if (user.preferences) {
      // Use preferences from the /auth/me response
      setPreferences(user.preferences);
      applyTableColor(user.preferences.tableColor);
    }
    setSetupDone(prev => user.isGuest ? true : (user.hasCompletedSetup ?? false));
    setLoading(false);
  }, [user]);

  const updatePreferences = useCallback(async (newPrefs) => {
    // Guests (or no user): update local state + localStorage
    if (!user || user.isGuest) {
      const merged = { ...(preferences || {}), ...newPrefs };
      setPreferences(merged);
      setSetupDone(true);
      applyTableColor(merged.tableColor);
      saveGuestPrefs(merged);
      return merged;
    }
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
      body: JSON.stringify(newPrefs),
    });
    if (!res.ok) {
      const status = res.status;
      const msg = status === 401 ? 'Session expired — please refresh'
        : status === 403 ? 'Security token expired — please refresh'
        : 'Server error';
      throw new Error(msg);
    }
    const data = await res.json();
    setPreferences(data.preferences);
    setSetupDone(true);
    applyTableColor(data.preferences.tableColor);
    return data.preferences;
  }, [user, preferences]);

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
