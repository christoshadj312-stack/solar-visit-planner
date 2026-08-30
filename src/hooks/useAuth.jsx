import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentSession, signIn, signOut } from "../services/authService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentSession()
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const nextSession = await signIn(email, password);
    setSession(nextSession);
  }

  async function logout() {
    await signOut();
    setSession(null);
  }

  const value = useMemo(
    () => ({ session, loading, login, logout, isAuthenticated: Boolean(session) }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
