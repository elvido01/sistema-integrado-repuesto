import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const SuscripcionContext = createContext(undefined);

export const SuscripcionProvider = ({ children }) => {
  const { user, tenantId, isSuperAdmin } = useAuth();

  const [suscripcion, setSuscripcion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planes, setPlanes] = useState([]);

  const fetchSuscripcion = useCallback(async () => {
    if (!user || !tenantId) {
      setSuscripcion(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('check_suscripcion_activa', {
        p_tenant_id: tenantId
      });

      if (error) {
        // Si la función no existe aún, no bloquear el sistema
        console.warn('[Suscripcion] RPC no disponible, permitiendo acceso:', error.message);
        setSuscripcion({
          activa: true,
          estado: 'sin_verificar',
          dias_restantes: 999,
          plan: 'pendiente',
          mensaje: 'Sistema de suscripciones no configurado — acceso permitido'
        });
        return;
      }
      setSuscripcion(data);
    } catch (err) {
      console.error('[Suscripcion] Error fetching:', err);
      // En caso de error de red u otro, no bloquear
      setSuscripcion({
        activa: true,
        estado: 'sin_verificar',
        dias_restantes: 999,
        plan: 'pendiente',
        mensaje: 'No se pudo verificar suscripción — acceso permitido'
      });
    } finally {
      setLoading(false);
    }
  }, [user, tenantId]);

  const fetchPlanes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('planes')
        .select('*')
        .eq('activo', true)
        .order('precio', { ascending: true });

      if (error) throw error;
      setPlanes(data || []);
    } catch (err) {
      console.error('[Suscripcion] Error fetching planes:', err);
    }
  }, []);

  // Fetch on mount & when user/tenant changes
  useEffect(() => {
    fetchSuscripcion();
    fetchPlanes();
  }, [fetchSuscripcion, fetchPlanes]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchSuscripcion, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, fetchSuscripcion]);

  // Derived state
  const isActiva = suscripcion?.activa === true;
  const isVencida = suscripcion?.estado === 'vencido' || suscripcion?.estado === 'cancelado';
  const isTrial = suscripcion?.estado === 'trial';
  const diasRestantes = suscripcion?.dias_restantes || 0;
  const porVencer = isActiva && diasRestantes <= 3 && diasRestantes > 0;
  const planActual = suscripcion?.plan || null;
  const limites = suscripcion?.limites || {};
  const features = suscripcion?.features || {};

  /**
   * Validates if an action is allowed based on subscription status.
   * Returns { allowed: boolean, reason: string }
   */
  const validarAccion = useCallback((accion = 'general') => {
    // SuperAdmins bypass all restrictions
    if (isSuperAdmin) {
      return { allowed: true, reason: null };
    }

    // No subscription data yet (still loading)
    if (loading) {
      return { allowed: true, reason: null };
    }

    // Subscription expired or not found
    if (isVencida) {
      return {
        allowed: false,
        reason: `Sistema bloqueado: ${suscripcion?.mensaje || 'Su suscripción ha vencido. Renueve su plan para continuar usando el sistema.'}`
      };
    }

    // Feature-specific checks
    if (accion === 'cotizaciones_magna' && !features.cotizaciones_magna) {
      return { allowed: false, reason: 'Esta función requiere el plan PRO o superior.' };
    }
    if (accion === 'carta_ruta' && !features.carta_ruta) {
      return { allowed: false, reason: 'Las cartas de ruta requieren el plan PRO o superior.' };
    }
    if (accion === 'cobranzas' && !features.cobranzas) {
      return { allowed: false, reason: 'El módulo de cobranzas requiere el plan PRO o superior.' };
    }
    if (accion === 'reportes_avanzados' && !features.reportes_avanzados) {
      return { allowed: false, reason: 'Los reportes avanzados requieren el plan PRO o superior.' };
    }
    if (accion === 'ocr_facturas' && !features.ocr_facturas) {
      return { allowed: false, reason: 'El OCR de facturas requiere el plan PRO o superior.' };
    }

    return { allowed: true, reason: null };
  }, [isSuperAdmin, loading, isVencida, features, suscripcion]);

  /**
   * Renovar suscripción (llamar RPC)
   */
  const renovarPlan = useCallback(async (planNombre, metodoPago = null, referenciaPago = null, montoPagado = 0) => {
    if (!tenantId) throw new Error('No hay tenant activo');

    const { data, error } = await supabase.rpc('renovar_suscripcion', {
      p_tenant_id: tenantId,
      p_plan_nombre: planNombre,
      p_metodo_pago: metodoPago,
      p_referencia_pago: referenciaPago,
      p_monto_pagado: montoPagado
    });

    if (error) throw error;

    // Re-fetch subscription status
    await fetchSuscripcion();
    return data;
  }, [tenantId, fetchSuscripcion]);

  const value = useMemo(() => ({
    // Estado
    suscripcion,
    loading,
    planes,
    
    // Flags derivados
    isActiva,
    isVencida,
    isTrial,
    diasRestantes,
    porVencer,
    planActual,
    limites,
    features,
    
    // Acciones
    validarAccion,
    renovarPlan,
    refetch: fetchSuscripcion
  }), [
    suscripcion, loading, planes,
    isActiva, isVencida, isTrial, diasRestantes, porVencer, planActual, limites, features,
    validarAccion, renovarPlan, fetchSuscripcion
  ]);

  return (
    <SuscripcionContext.Provider value={value}>
      {children}
    </SuscripcionContext.Provider>
  );
};

export const useSuscripcion = () => {
  const context = useContext(SuscripcionContext);
  if (context === undefined) {
    throw new Error('useSuscripcion must be used within a SuscripcionProvider');
  }
  return context;
};
