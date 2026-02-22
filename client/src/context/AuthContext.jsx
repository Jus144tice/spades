import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext(null);

// Module-level CSRF token storage
let csrfToken = '';
export function getCsrfToken() { return csrfToken; }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/auth/me')
      .then(res => res.json().catch(() => null))
      .then(data => {
        if (data?.csrfToken) csrfToken = data.csrfToken;
        if (data?.id) {
          setUser(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const login = () => {
    window.location.href = '/auth/google';
  };

  const logout = async () => {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
    });
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
