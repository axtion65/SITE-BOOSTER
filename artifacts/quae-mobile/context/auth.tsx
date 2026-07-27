import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthTokenGetter } from '@workspace/api-client-react';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'creator' | 'agency';
  credits: number;
  isAdmin: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'quae_token';

// Mutable ref for the token — updated immediately on auth changes
let _currentToken: string | null = null;

// Register the token getter with the API client once at module load
setAuthTokenGetter(() => _currentToken);

async function callAuthApi<T>(
  path: string,
  method: string,
  body?: object,
  token?: string | null,
): Promise<T> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const url = domain ? `https://${domain}/api${path}` : `/api${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = token !== undefined ? token : _currentToken;
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async (t: string) => {
    try {
      _currentToken = t;
      const me = await callAuthApi<AuthUser>('/auth/me', 'GET', undefined, t);
      setUser(me);
    } catch {
      _currentToken = null;
      await AsyncStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TOKEN_KEY);
        if (saved) {
          setToken(saved);
          await loadUser(saved);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: u, token: t } = await callAuthApi<{ user: AuthUser; token: string }>(
      '/auth/signin', 'POST', { email, password }, null,
    );
    _currentToken = t;
    await AsyncStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { user: u, token: t } = await callAuthApi<{ user: AuthUser; token: string }>(
      '/auth/signup', 'POST', { email, password, name }, null,
    );
    _currentToken = t;
    await AsyncStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    _currentToken = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!_currentToken) return;
    await loadUser(_currentToken);
  }, [loadUser]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
