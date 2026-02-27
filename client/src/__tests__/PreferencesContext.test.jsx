import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { PreferencesProvider, usePreferences } from '../context/PreferencesContext.jsx';
import { AuthProvider, useAuth } from '../context/AuthContext.jsx';

// Helper: renders PreferencesProvider inside AuthProvider and exposes context
function TestConsumer({ onContext }) {
  const prefs = usePreferences();
  const auth = useAuth();
  onContext?.(prefs, auth);
  return (
    <div>
      <div data-testid="prefs">{prefs.preferences ? JSON.stringify(prefs.preferences) : 'null'}</div>
      <div data-testid="loading">{String(prefs.loading)}</div>
      <div data-testid="setup">{String(prefs.hasCompletedSetup)}</div>
    </div>
  );
}

function renderWithAuth(ui, { authResponse } = {}) {
  // Mock /auth/me
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve(authResponse || { csrfToken: 'tok' }),
  }));

  return render(
    <AuthProvider>
      <PreferencesProvider>
        {ui}
      </PreferencesProvider>
    </AuthProvider>
  );
}

describe('PreferencesContext', () => {
  let localStorageData;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorageData = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => localStorageData[key] || null),
      setItem: vi.fn((key, val) => { localStorageData[key] = val; }),
      removeItem: vi.fn((key) => { delete localStorageData[key]; }),
    });
  });

  describe('guest save flow', () => {
    it('first-time guest gets default preferences from loginAsGuest', async () => {
      let capturedPrefs;
      let capturedAuth;

      renderWithAuth(
        <TestConsumer onContext={(p, a) => { capturedPrefs = p; capturedAuth = a; }} />
      );

      // Wait for auth loading to finish
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Login as guest
      act(() => { capturedAuth.loginAsGuest(); });

      await waitFor(() => {
        expect(screen.getByTestId('prefs').textContent).not.toBe('null');
      });

      const prefs = JSON.parse(screen.getByTestId('prefs').textContent);
      expect(prefs.cardSort).toBe('C,D,S,H:asc');
      expect(prefs.tableColor).toBe('#0f1923');
      expect(screen.getByTestId('setup').textContent).toBe('true');
    });

    it('guest save writes to localStorage and updates state', async () => {
      let capturedPrefs;
      let capturedAuth;

      renderWithAuth(
        <TestConsumer onContext={(p, a) => { capturedPrefs = p; capturedAuth = a; }} />
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Login as guest
      act(() => { capturedAuth.loginAsGuest(); });

      await waitFor(() => {
        expect(screen.getByTestId('prefs').textContent).not.toBe('null');
      });

      // Save new preferences
      const newPrefs = { cardSort: 'S,H,D,C:desc', tableColor: '#1a472a' };
      let saved;
      await act(async () => {
        saved = await capturedPrefs.updatePreferences(newPrefs);
      });

      expect(saved.cardSort).toBe('S,H,D,C:desc');
      expect(saved.tableColor).toBe('#1a472a');

      // Verify localStorage was written
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'spades_guest_preferences',
        expect.any(String)
      );
      const stored = JSON.parse(localStorageData['spades_guest_preferences']);
      expect(stored.cardSort).toBe('S,H,D,C:desc');
    });

    it('guest save loads existing localStorage prefs on init', async () => {
      // Pre-populate localStorage
      localStorageData['spades_guest_preferences'] = JSON.stringify({
        cardSort: 'H,S,C,D:desc',
        tableColor: '#2a2a2a',
      });

      let capturedAuth;
      renderWithAuth(
        <TestConsumer onContext={(p, a) => { capturedAuth = a; }} />
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      act(() => { capturedAuth.loginAsGuest(); });

      await waitFor(() => {
        const prefs = JSON.parse(screen.getByTestId('prefs').textContent);
        expect(prefs.cardSort).toBe('H,S,C,D:desc');
        expect(prefs.tableColor).toBe('#2a2a2a');
      });
    });

    it('save works even when user is null (fallback to localStorage)', async () => {
      let capturedPrefs;

      renderWithAuth(
        <TestConsumer onContext={(p) => { capturedPrefs = p; }} />
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // user is null (not logged in), save should still work via localStorage
      const newPrefs = { cardSort: 'C,D,S,H:asc', tableColor: '#0f1923' };
      let saved;
      await act(async () => {
        saved = await capturedPrefs.updatePreferences(newPrefs);
      });

      expect(saved.cardSort).toBe('C,D,S,H:asc');
      expect(localStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('authenticated save flow', () => {
    it('saves via API for authenticated users', async () => {
      const authUser = { id: 42, displayName: 'Alice', csrfToken: 'csrf123', preferences: { cardSort: 'C,D,S,H:asc', tableColor: '#0f1923' }, hasCompletedSetup: true };

      let capturedPrefs;
      renderWithAuth(
        <TestConsumer onContext={(p) => { capturedPrefs = p; }} />,
        { authResponse: authUser }
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      await waitFor(() => {
        expect(screen.getByTestId('prefs').textContent).not.toBe('null');
      });

      // Mock the PUT response
      const updatedPrefs = { cardSort: 'S,H,D,C:desc', tableColor: '#1a472a' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ preferences: updatedPrefs }),
      });

      let saved;
      await act(async () => {
        saved = await capturedPrefs.updatePreferences(updatedPrefs);
      });

      expect(saved.cardSort).toBe('S,H,D,C:desc');
      // Verify PUT was called
      const putCall = fetch.mock.calls.find(c => c[1]?.method === 'PUT');
      expect(putCall).toBeTruthy();
      expect(putCall[0]).toBe('/api/preferences');
    });

    it('throws descriptive error on 401', async () => {
      const authUser = { id: 42, displayName: 'Alice', csrfToken: 'csrf123', preferences: { cardSort: 'C,D,S,H:asc', tableColor: '#0f1923' }, hasCompletedSetup: true };

      let capturedPrefs;
      renderWithAuth(
        <TestConsumer onContext={(p) => { capturedPrefs = p; }} />,
        { authResponse: authUser }
      );

      await waitFor(() => {
        expect(screen.getByTestId('prefs').textContent).not.toBe('null');
      });

      fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      let error;
      await act(async () => {
        try {
          await capturedPrefs.updatePreferences({ cardSort: 'C,D,S,H:asc' });
        } catch (e) {
          error = e;
        }
      });

      expect(error).toBeDefined();
      expect(error.message).toContain('Session expired');
    });

    it('throws descriptive error on 403 (CSRF)', async () => {
      const authUser = { id: 42, displayName: 'Alice', csrfToken: 'csrf123', preferences: { cardSort: 'C,D,S,H:asc', tableColor: '#0f1923' }, hasCompletedSetup: true };

      let capturedPrefs;
      renderWithAuth(
        <TestConsumer onContext={(p) => { capturedPrefs = p; }} />,
        { authResponse: authUser }
      );

      await waitFor(() => {
        expect(screen.getByTestId('prefs').textContent).not.toBe('null');
      });

      fetch.mockResolvedValueOnce({ ok: false, status: 403 });

      let error;
      await act(async () => {
        try {
          await capturedPrefs.updatePreferences({ cardSort: 'C,D,S,H:asc' });
        } catch (e) {
          error = e;
        }
      });

      expect(error).toBeDefined();
      expect(error.message).toContain('Security token expired');
    });
  });
});
