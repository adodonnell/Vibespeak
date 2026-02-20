import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { serverClient, CurrentUser } from '../services/server-client';
import { apiClient } from '../services/api-client';

interface AuthContextType {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  guestLogin: (username: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Minimal toast helper (no external dep) ───────────────────────────────────
function showToast(msg: string, type: 'info' | 'warn' | 'error' = 'info') {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: type === 'error' ? '#F23F43' : type === 'warn' ? '#F0B232' : '#5865F2',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '8px',
    fontFamily: 'gg sans, system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    zIndex: '99999',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    transition: 'opacity 0.3s',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
  setTimeout(() => { document.body.removeChild(el); }, 2800);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount — calls /api/auth/me with stored JWT
  useEffect(() => {
    const hadToken = !!localStorage.getItem('disorder:token') || !!localStorage.getItem('auth_token');
    serverClient.restoreSession().then(restoredUser => {
      if (restoredUser) {
        setUser(restoredUser);
      } else if (hadToken) {
        // Token existed but is now invalid/expired
        showToast('Session expired. Please reconnect.', 'warn');
      }
    }).catch(() => {
      if (hadToken) showToast('Session expired. Please reconnect.', 'warn');
    }).finally(() => {
      setIsRestoring(false);
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const newUser = await serverClient.login(username, password);
      setUser(newUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const guestLogin = useCallback(async (username: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const newUser = await serverClient.guestLogin(username);
      setUser(newUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    apiClient.logout().catch(() => {});
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isRestoring,
        error,
        login,
        guestLogin,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export toast for use elsewhere in the app
export { showToast };
