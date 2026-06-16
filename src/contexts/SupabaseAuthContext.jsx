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
  const [empresa, setEmpresa] = useState(null);
  const [fiscalActivo, setFiscalActivo] = useState(false);

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

      // 3. Fetch Empresa (config_empresa) for PDF/print branding
      if (profileData?.tenant_id) {
        let { data: empresaData, error: empresaError } = await supabase
          .from('config_empresa')
          .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, formato_factura, formato_precio_etiqueta, precio2_descuento_pct, precio3_descuento_pct, feat_suplidores_locales, incluir_existencias_cero_default')
          .eq('tenant_id', profileData.tenant_id)
          .maybeSingle();
        if (empresaError && String(empresaError.message || '').match(/(feat_suplidores_locales|incluir_existencias_cero_default)/)) {
          const fallback = await supabase
            .from('config_empresa')
            .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, formato_factura, formato_precio_etiqueta, precio2_descuento_pct, precio3_descuento_pct')
            .eq('tenant_id', profileData.tenant_id)
            .maybeSingle();
          empresaData = fallback.data
            ? { ...fallback.data, feat_suplidores_locales: false, incluir_existencias_cero_default: true }
            : null;
          empresaError = fallback.error;
        }
        if (empresaError) throw empresaError;
        if (empresaData) {
          // Normaliza direccion1/2 → direccion para compatibilidad con PDFs
          const direccion = [empresaData.direccion1, empresaData.direccion2]
            .filter(Boolean).join(', ');
          setEmpresa({ ...empresaData, direccion });
        } else {
          setEmpresa(null);
        }
      } else {
        setEmpresa(null);
      }

      // 4. Check if tenant has active fiscal integration
      if (profileData?.tenant_id) {
        const { data: integData } = await supabase
          .from('integraciones_fiscales')
          .select('activo')
          .eq('tenant_id', profileData.tenant_id)
          .eq('activo', true)
          .maybeSingle();
        setFiscalActivo(!!integData);
      } else {
        setFiscalActivo(false);
      }

      setProfile(profileData);
      setPermissions(permsData || []);

    } catch (error) {
      console.error("[AuthDebug] Error fetching profile/permissions:", error);
      setProfile(null);
      setPermissions([]);
      setEmpresa(null);
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

  const tenantId = profile?.tenant_id || null;
  const isSuperAdmin = profile?.is_superadmin === true;

  const value = useMemo(() => ({
    user,
    session,
    profile,
    permissions,
    loading,
    tenantId,
    isSuperAdmin,
    empresa,
    fiscalActivo,
    signUp,
    signIn,
    signOut,
    refreshPermissions: () => user && fetchProfileAndPermissions(user.id)
  }), [user, session, profile, permissions, loading, tenantId, isSuperAdmin, empresa, fiscalActivo, signUp, signIn, signOut, fetchProfileAndPermissions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
