import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { ADMIN_EMAIL } from '@/lib/constants';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const readyRef = useRef(false);

  useEffect(() => {
    // 1. Listen for auth state changes (synchronous, no async work)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        console.log('[Auth] stateChange:', _event, !!newSession);
        setSession(newSession);
        if (!readyRef.current) {
          readyRef.current = true;
          setLoading(false);
        }
      }
    );

    // 2. Explicitly hydrate session from localStorage
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[Auth] getSession:', !!s, 'token:', !!s?.access_token);
      if (!readyRef.current) {
        setSession(s);
        readyRef.current = true;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Admin check based on email match
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const signInWithGoogle = async () => {
    // Use lovable OAuth which handles top-level redirect
    await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isAdmin, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
