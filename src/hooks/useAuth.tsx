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
  const readyRef = useRef(false);

  // Store Google OAuth tokens when user signs in
  const storeOAuthTokens = async (s: Session) => {
    if (!s?.provider_token) return;
    try {
      const { error } = await supabase
        .from('user_oauth_tokens' as any)
        .upsert({
          user_id: s.user.id,
          provider: 'google',
          access_token: s.provider_token,
          refresh_token: s.provider_refresh_token || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (error) console.error('[Auth] Failed to store OAuth tokens:', error);
      else console.log('[Auth] OAuth tokens stored successfully');
    } catch (err) {
      console.error('[Auth] Error storing OAuth tokens:', err);
    }
  };

  useEffect(() => {
    // 1. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        console.log('[Auth] stateChange:', _event, !!newSession);
        setSession(newSession);
        if (!readyRef.current) {
          readyRef.current = true;
          setLoading(false);
        }
        // Store OAuth tokens on sign-in (provider_token is only available at sign-in time)
        if (_event === 'SIGNED_IN' && newSession?.provider_token) {
          storeOAuthTokens(newSession);
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

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      return;
    }
    const checkAdmin = async () => {
      const { data } = await (supabase as any)
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [session?.user?.id]);

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
