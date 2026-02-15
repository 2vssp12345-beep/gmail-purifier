import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    // 1. Subscribe to auth changes FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        console.log('[Auth] onAuthStateChange:', _event, 'session:', !!newSession, 'token:', !!newSession?.access_token);
        setSession(newSession);
        // Always mark loading done when auth state fires
        setLoading(false);
        initializedRef.current = true;
      }
    );

    // 2. Explicitly restore session on mount
    supabase.auth.getSession().then(({ data: { session: existingSession }, error }) => {
      console.log('[Auth] getSession result:', 'session:', !!existingSession, 'token:', !!existingSession?.access_token, 'error:', error);
      // Only use getSession result if onAuthStateChange hasn't fired yet
      if (!initializedRef.current) {
        setSession(existingSession);
        setLoading(false);
        initializedRef.current = true;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 3. Admin check in separate effect — never throws, never clears session
  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      return;
    }
    supabase.rpc('has_role', {
      _user_id: session.user.id,
      _role: 'admin',
    }).then(({ data, error }) => {
      if (error) {
        console.warn('[Auth] Admin check failed (non-fatal):', error.message);
      }
      setIsAdmin(!!data);
    });
  }, [session?.user?.id]);

  const signInWithGoogle = async () => {
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
