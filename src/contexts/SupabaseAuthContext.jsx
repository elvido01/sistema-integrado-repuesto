import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndPermissions = useCallback(async (userId) => {
    try {
      console.log("[AuthDebug] Fetching profile for:", userId);
      // 1. Fetch Profile (role)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error("[AuthDebug] Profile fetch error:", profileError);
        throw profileError;
      }

      console.log("[AuthDebug] Profile data:", profileData);

      // 2. Fetch Module Permissions
      const { data: permsData, error: permsError } = await supabase
        .from('user_module_permissions')
        .select('*')
        .eq('user_id', userId);

      if (permsError) {
        console.error("[AuthDebug] Perms fetch error:", permsError);
        throw permsError;
      }

      console.log("[AuthDebug] Perms data:", permsData);

      setProfile(profileData);
      setPermissions(permsData || []);

    } catch (error) {
      console.error("[AuthDebug] Error fetching profile/permissions:", error);
      setProfile(null);
      setPermissions([]);
    }
  }, []);

  const handleSession = useCallback(async (session) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);

    if (currentUser) {
      await fetchProfileAndPermissions(currentUser.id);
    } else {
      setProfile(null);
      setPermissions([]);
    }

    setLoading(false);
  }, [fetchProfileAndPermissions]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    handleSession(null);
  }, [handleSession]);

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        handleSession(session);
      } catch (error) {
        console.error("Error getting session:", error);
        handleSession(null);
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT") {
          handleSession(null);
          return;
        }
        if (event === "TOKEN_REFRESHED" && !session) {
          console.warn("Invalid session detected. Forcing sign out.");
          await signOut();
          return;
        }
        handleSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, [handleSession, signOut]);

  const signUp = useCallback(async (email, password, options, confirmEmail = false) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options,
        email_confirm: confirmEmail,
      }
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign up Failed",
        description: error.message || "Something went wrong",
      });
    }

    return { error };
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    await supabase.auth.signOut().catch(console.error);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign in Failed",
        description: error.message || "Something went wrong",
      });
    } else {
      handleSession(data.session);
    }

    return { error };
  }, [toast, handleSession]);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    permissions,
    loading,
    signUp,
    signIn,
    signOut,
    refreshPermissions: () => user && fetchProfileAndPermissions(user.id)
  }), [user, session, profile, permissions, loading, signUp, signIn, signOut, fetchProfileAndPermissions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};