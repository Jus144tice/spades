import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext.jsx';

// Test component that exposes auth context
function AuthConsumer() {
  const { user, loading, login, loginAsGuest, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'null'}</div>
      <button onClick={loginAsGuest}>Guest</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches /auth/me on mount and sets user', async () => {
    const userData = { id: 1, displayName: 'Alice', csrfToken: 'tok123' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve(userData),
    }));

    render(<AuthProvider><AuthConsumer /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toContain('"id":1');
  });

  it('sets loading=false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

    render(<AuthProvider><AuthConsumer /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('sets loading=false when no user (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'Not authenticated', csrfToken: 'tok' }),
    }));

    render(<AuthProvider><AuthConsumer /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('loginAsGuest sets guest user with default preferences', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ csrfToken: 'tok' }),
    }));

    render(<AuthProvider><AuthConsumer /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    act(() => { screen.getByText('Guest').click(); });

    const user = JSON.parse(screen.getByTestId('user').textContent);
    expect(user.id).toBeNull();
    expect(user.isGuest).toBe(true);
    expect(user.hasCompletedSetup).toBe(true);
    expect(user.preferences).toBeDefined();
  });

  it('logout for guest clears user without API call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ csrfToken: 'tok' }),
    }));

    render(<AuthProvider><AuthConsumer /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Login as guest
    act(() => { screen.getByText('Guest').click(); });
    expect(screen.getByTestId('user').textContent).not.toBe('null');

    // Logout
    act(() => { screen.getByText('Logout').click(); });
    expect(screen.getByTestId('user').textContent).toBe('null');

    // fetch should only have been called once (the /auth/me on mount), not for logout
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
