import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscription: any;

    // Set up auth state listener for real Supabase auth
    const { data } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // If we have a real session, clear any demo session
        if (session) {
          localStorage.removeItem('demo_session');
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );
    subscription = data.subscription;

    // Check for existing Supabase session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Real session exists, use it and clear demo session
        localStorage.removeItem('demo_session');
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      } else {
        // No real session, check for demo session
        const demoSession = localStorage.getItem('demo_session');
        if (demoSession) {
          try {
            const parsedSession = JSON.parse(demoSession);
            setUser(parsedSession.user);
            setSession(parsedSession);
            setLoading(false);
          } catch (e) {
            console.error('Error parsing demo session:', e);
            localStorage.removeItem('demo_session');
            setLoading(false);
          }
        } else {
          // No session at all
          setLoading(false);
        }
      }
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName
        }
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    // Demo mode: ONLY allow specific demo emails
    if (email === 'demo@test.com' || email === 'test@demo.com') {
      // Create a mock user for demo purposes
      const mockUser = {
        id: '00000000-0000-0000-0000-000000000001', // Valid UUID for demo mode
        email: email,
        user_metadata: { full_name: 'Demo Teacher' },
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString()
      } as User;

      const mockSession = {
        user: mockUser,
        access_token: 'demo-token'
      } as Session;

      // Save demo session to localStorage for persistence
      localStorage.setItem('demo_session', JSON.stringify(mockSession));

      setUser(mockUser);
      setSession(mockSession);
      return { error: null };
    }

    // Regular authentication - CLEAR any demo session first
    localStorage.removeItem('demo_session');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    // Clear demo session if it exists
    localStorage.removeItem('demo_session');
    await supabase.auth.signOut();
    // Clear state
    setUser(null);
    setSession(null);
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};