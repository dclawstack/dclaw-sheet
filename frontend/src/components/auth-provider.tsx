"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  ApiError,
  getMe,
  setAuthToken,
  type MeResponse,
} from "@/lib/api";

interface AuthContextValue {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  needsLogin: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMe();
      setMe(data);
      setNeedsLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        setNeedsLogin(true);
      } else {
        setError(e instanceof Error ? e.message : "Failed to load identity");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (token: string) => {
    setAuthToken(token);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(() => {
    setAuthToken(null);
    setMe(null);
    setNeedsLogin(true);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, error, needsLogin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
