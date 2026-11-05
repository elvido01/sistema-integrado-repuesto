import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { USERNAME_EMAIL_DOMAIN } from '@/lib/loginIdentity';

// Estado fiscal de una empresa: { activo, modo }. Una sola consulta para el
// inicio de sesión y el refresco. Lanza si la consulta falla.
async function leerFiscal(tid) {
  const { data, error } = await supabase
    .from('integraciones_fiscales')
    .select('activo, modo')
    .eq('tenant_id', tid)
    .eq('activo', true)
    .maybeSingle();
  if (error) throw error;
  return { activo: !!data, modo: data?.modo || null };
}

const CANAL_FISCAL = 'motoflow-fiscal';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  // true mientras el usuario viene de un enlace de recuperación y aún no ha
  // puesto su contraseña nueva.
  const [recuperando, setRecuperando] = useState(false);
  const [empresa, setEmpresa] = useState(null);
  const [fiscalActivo, setFiscalActivo] = useState(false);
  // 'pruebas' o 'produccion'. No es lo mismo: en pruebas, la emisión no puede
  // hacer esperar al cliente del mostrador.
  const [fiscalModo, setFiscalModo] = useState(null);
  const [activeTenantId, setActiveTenantId] = useState(null); // empresa activa (multi-empresa)

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

      // 2b. Tenant ACTIVO: puede diferir del profile.tenant_id cuando el
      // usuario pertenece a varias empresas (usuarios_empresas) y cambió
      // de empresa con el selector — get_user_tenant() manda en el RLS,
      // así que el branding/tenant del front debe seguirlo.
      let activeTid = profileData?.tenant_id || null;
      try {
        const { data: t } = await supabase.rpc('get_user_tenant');
        if (t) activeTid = t;
      } catch { /* fallback al tenant del perfil */ }
      setActiveTenantId(activeTid);

      // 3. Fetch Empresa (config_empresa) for PDF/print branding
      if (activeTid) {
        let { data: empresaData, error: empresaError } = await supabase
          .from('config_empresa')
          .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, slogan, formato_factura, formato_precio_etiqueta, precio2_descuento_pct, precio3_descuento_pct, feat_suplidores_locales, incluir_existencias_cero_default, feat_cliente_dealer, feat_financiera, formato_comprobante_pago, formato_cierre_caja, formato_compra, financiamiento_tipo, financiera_tenant_id, margen_minimo_pct, tipo_negocio, solo_consulta, empresa_vieja_tenant_id, cuenta_bancaria_default_id, firma_url, feat_origen_venta, modulos_deshabilitados, modulos, feat_medicion_publicaciones')
          .eq('tenant_id', activeTid)
          .maybeSingle();
        if (empresaError && String(empresaError.message || '').match(/(feat_suplidores_locales|incluir_existencias_cero_default|feat_cliente_dealer|feat_financiera|formato_comprobante_pago|formato_cierre_caja|formato_compra|financiamiento_tipo|financiera_tenant_id|margen_minimo_pct|tipo_negocio|solo_consulta|empresa_vieja_tenant_id|cuenta_bancaria_default_id|firma_url|feat_origen_venta|modulos_deshabilitados)/)) {
          const fallback = await supabase
            .from('config_empresa')
            .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, formato_factura, formato_precio_etiqueta, precio2_descuento_pct, precio3_descuento_pct')
            .eq('tenant_id', activeTid)
            .maybeSingle();
          empresaData = fallback.data
            ? { ...fallback.data, feat_suplidores_locales: false, incluir_existencias_cero_default: true, feat_cliente_dealer: false, feat_financiera: false, formato_comprobante_pago: 'pdf', formato_cierre_caja: 'pos_80mm', formato_compra: 'pos_4inch', financiamiento_tipo: 'propio', financiera_tenant_id: null, margen_minimo_pct: 0, tipo_negocio: 'repuestos', solo_consulta: false, empresa_vieja_tenant_id: null, cuenta_bancaria_default_id: null, firma_url: null, feat_origen_venta: false, modulos_deshabilitados: [] }
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
      if (activeTid) {
        try {
          const fis = await leerFiscal(activeTid);
          setFiscalActivo(fis.activo);
          setFiscalModo(fis.modo);
        } catch {
          setFiscalActivo(false);
          setFiscalModo(null);
        }
      } else {
        setFiscalActivo(false);
        setFiscalModo(null);
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

  // scope 'local': cierra la sesión de ESTE equipo. El de fábrica es 'global',
  // que revoca la sesión del usuario en TODOS sus equipos a la vez — salir en
  // la caja no debe botar al mismo usuario del celular ni de la otra PC.
  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
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
        // Volvió del correo de recuperación: hay sesión, pero NO se le abre el
        // sistema todavía. Primero pone su contraseña nueva; si no, entraría
        // por un enlace de correo sin haber elegido clave.
        if (event === "PASSWORD_RECOVERY") {
          setRecuperando(true);
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

  const signIn = useCallback(async (email, password, tenantPreferido = null) => {
    // Limpieza LOCAL antes de entrar (ver signOut). Con el 'global' de fábrica,
    // entrar en una PC le revocaba al MISMO usuario la sesión de las demás:
    // seguían trabajando hasta que el token vencía (1 h) y de ahí en adelante
    // todo lo que necesitara sesión fallaba sin explicación.
    await supabase.auth.signOut({ scope: 'local' }).catch(console.error);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const msg = /invalid login credentials/i.test(error.message || '')
        ? 'Correo o contraseña incorrectos.'
        : (error.message || 'Ocurrió un error al iniciar sesión.');
      toast({
        variant: "destructive",
        title: "No se pudo iniciar sesión",
        description: msg,
      });
    } else {
      // Multi-empresa: si eligió empresa en el login, fijarla como activa
      // ANTES de cargar el perfil para que get_user_tenant() ya la respete
      if (tenantPreferido) {
        try {
          await supabase.rpc('cambiar_empresa_activa', { p_tenant: tenantPreferido });
        } catch (e) {
          console.error('[Auth] No se pudo fijar la empresa elegida:', e);
        }
      }
      handleSession(data.session);
    }

    return { error };
  }, [toast, handleSession]);

  const tenantId = activeTenantId || profile?.tenant_id || null;

  // (05/11/2026) El modo fiscal (pruebas / producción) se refresca solo: cada
  // minuto, al volver a la ventana y después de guardar la configuración DGII.
  // Antes se leía UNA vez al entrar: Morla pasó a producción con la caja
  // abierta y 3 tickets salieron sin e-NCF ni QR (la caja seguía "en pruebas"
  // y no esperó a la DGII). Si la consulta falla, se queda el valor que había.
  // { avisar: true } = se acaba de cambiar la configuración: las otras pestañas
  // de este navegador se enteran al instante (BroadcastChannel).
  const pedidoFiscalRef = useRef(0);
  const ultimoFiscalRef = useRef(0);
  const refrescarFiscal = useCallback(async ({ avisar = false } = {}) => {
    if (!tenantId) return;
    if (avisar) {
      try { const c = new BroadcastChannel(CANAL_FISCAL); c.postMessage({ tenantId }); c.close(); } catch { /* navegador sin canal */ }
    }
    const mio = ++pedidoFiscalRef.current;
    ultimoFiscalRef.current = Date.now();
    let fis;
    try { fis = await leerFiscal(tenantId); } catch { return; }   // falla: se queda lo que había
    if (mio !== pedidoFiscalRef.current) return;                   // llegó una respuesta más nueva
    if (!fis.activo) {
      // Sin fila puede ser "apagada" o que la empresa activa cambió en otra
      // pestaña (RLS la esconde). En ese caso no se apaga nada aquí.
      const { data: activa, error } = await supabase.rpc('get_user_tenant');
      if (error || (activa && activa !== tenantId)) return;
      if (mio !== pedidoFiscalRef.current) return;
    }
    setFiscalActivo(fis.activo);
    setFiscalModo(fis.modo);
  }, [tenantId]);

  useEffect(() => {
    if (!user || !tenantId) return undefined;
    // Al volver a la ventana dispara focus y visibilitychange: una sola consulta.
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimoFiscalRef.current < 3000) return;
      refrescarFiscal();
    };
    const t = setInterval(() => { if (document.visibilityState === 'visible') refrescarFiscal(); }, 60_000);
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    let canal = null;
    try {
      canal = new BroadcastChannel(CANAL_FISCAL);
      canal.onmessage = (e) => { if (e?.data?.tenantId === tenantId) refrescarFiscal(); };
    } catch { /* navegador sin canal */ }
    return () => {
      pedidoFiscalRef.current++;   // respuestas en vuelo ya no cuentan
      clearInterval(t);
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      canal?.close();
    };
  }, [user, tenantId, refrescarFiscal]);
  const isSuperAdmin = profile?.is_superadmin === true;

  // ── Recuperación de contraseña por correo ──────────────────────────────
  // OJO: solo sirve con correos REALES. Los colaboradores que entran con
  // usuario tienen un correo sintético (@usuario.motoflow.app) al que no
  // llega nada; a esos hay que decirles que se la cambie su administrador,
  // no mandarlos a revisar un buzón que no existe.
  const enviarRecuperacion = useCallback(async (correo) => {
    const email = String(correo || '').trim().toLowerCase();
    if (!email.includes('@') || email.endsWith(`@${USERNAME_EMAIL_DOMAIN}`)) {
      return { error: { message: 'sin_correo' } };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: error.message });
    }
    return { error };
  }, [toast]);

  const cambiarPassword = useCallback(async (nueva) => {
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo cambiar', description: error.message });
      return { error };
    }
    setRecuperando(false);
    toast({ title: 'Contraseña actualizada', description: 'Ya puedes usar el sistema.' });
    return { error: null };
  }, [toast]);

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
    fiscalModo,
    refrescarFiscal,
    signUp,
    signIn,
    signOut,
    recuperando,
    enviarRecuperacion,
    cambiarPassword,
    refreshPermissions: () => user && fetchProfileAndPermissions(user.id)
  }), [user, session, profile, permissions, loading, tenantId, isSuperAdmin, empresa, fiscalActivo, fiscalModo, refrescarFiscal, signUp, signIn, signOut, recuperando, enviarRecuperacion, cambiarPassword, fetchProfileAndPermissions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
