import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const SuscripcionContext = createContext(undefined);

const DAY_MS = 1000 * 60 * 60 * 24;

const getDiasRestantes = (fechaFin) => {
  if (!fechaFin) return 0;
  return Math.max(0, Math.ceil((new Date(fechaFin) - new Date()) / DAY_MS));
};

const getEstadoReal = (sub, pagoPendiente = false) => {
  if (pagoPendiente && (!sub || new Date(sub.fecha_fin) <= new Date())) return 'en_revision';
  if (!sub) return 'sin_suscripcion';
  if (sub.estado === 'cancelado' || sub.estado === 'suspendido') return sub.estado;
  return new Date(sub.fecha_fin) > new Date() ? sub.estado : 'vencido';
};

export const SuscripcionProvider = ({ children }) => {
  const { user, tenantId, isSuperAdmin } = useAuth();

  const [suscripcion, setSuscripcion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planes, setPlanes] = useState([]);

  const fetchSuscripcionDirecta = useCallback(async () => {
    let pagoPendiente = false;

    const { data: pagosData, error: pagosError } = await supabase
      .from('pagos_suscripcion')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('estado', 'pendiente')
      .limit(1);

    if (!pagosError) {
      pagoPendiente = (pagosData || []).length > 0;
    }

    const { data: subsData, error: subsError } = await supabase
      .from('suscripciones')
      .select(`
        *,
        planes (
          nombre,
          descripcion,
          precio,
          limite_usuarios,
          limite_productos,
          limite_facturas,
          limite_almacenes,
          feat_cotizaciones_magna,
          feat_carta_ruta,
          feat_cobranzas,
          feat_reportes_avanzados,
          feat_ocr_facturas,
          feat_api_access
        )
      `)
      .eq('tenant_id', tenantId)
      .order('fecha_fin', { ascending: false })
      .limit(1);

    if (subsError) throw subsError;

    const sub = subsData?.[0] || null;
    const plan = sub?.planes || {};
    const estado = getEstadoReal(sub, pagoPendiente);
    const activa = (sub && new Date(sub.fecha_fin) > new Date() && ['trial', 'activo'].includes(sub.estado)) || pagoPendiente;
    const diasRestantesLocal = sub ? getDiasRestantes(sub.fecha_fin) : 0;

    return {
      activa,
      suscripcion_id: sub?.id || null,
      estado,
      pago_pendiente: pagoPendiente,
      plan: plan.nombre || null,
      plan_id: sub?.plan_id || null,
      plan_descripcion: plan.descripcion || null,
      plan_precio: plan.precio || 0,
      fecha_inicio: sub?.fecha_inicio || null,
      fecha_fin: sub?.fecha_fin || null,
      dias_restantes: pagoPendiente && !sub ? 30 : diasRestantesLocal,
      auto_renovar: sub?.auto_renovar || false,
      limites: plan.nombre ? {
        usuarios: plan.limite_usuarios,
        productos: plan.limite_productos,
        facturas: plan.limite_facturas,
        almacenes: plan.limite_almacenes
      } : {},
      features: plan.nombre ? {
        cotizaciones_magna: plan.feat_cotizaciones_magna,
        carta_ruta: plan.feat_carta_ruta,
        cobranzas: plan.feat_cobranzas,
        reportes_avanzados: plan.feat_reportes_avanzados,
        ocr_facturas: plan.feat_ocr_facturas,
        api_access: plan.feat_api_access
      } : {},
      mensaje: pagoPendiente
        ? 'Su pago esta siendo verificado. Recibira confirmacion en las proximas 24 horas.'
        : estado === 'vencido'
          ? 'Su suscripcion ha vencido. Renueve para continuar.'
          : estado === 'sin_suscripcion'
            ? 'No tiene suscripcion activa. Por favor, contrate un plan.'
            : 'Suscripcion activa.'
    };
  }, [tenantId]);

  const fetchSuscripcion = useCallback(async () => {
    if (!user || !tenantId) {
      setSuscripcion(null);
      setLoading(false);
      return;
    }

    try {
      // (20/10/2026) Repuestos Morla, ENTERPRISE con 253 días, quedó
      // "SISTEMA BLOQUEADO" al entrar: la verificación falló una vez (red o
      // sesión recién abierta) y la consulta de respaldo, sin poder leer
      // nada, concluía "sin suscripción" y bloqueaba. Ahora se reintenta, y
      // un fallo al verificar NUNCA bloquea: solo bloquea una respuesta que
      // de verdad diga vencida o sin plan. Se vuelve a mirar en 1 minuto.
      let data = null;
      let error = null;
      for (let intento = 0; intento < 3; intento += 1) {
        if (intento > 0) {
          await new Promise((r) => setTimeout(r, 1500 * intento));
          await supabase.auth.getSession().catch(() => null);
        }
        ({ data, error } = await supabase.rpc('check_suscripcion_activa', { p_tenant_id: tenantId }));
        if (!error && data) break;
      }

      if (error || !data) {
        console.warn('[Suscripcion] no se pudo verificar:', error?.message || 'sin respuesta');
        const fallback = await fetchSuscripcionDirecta().catch(() => null);
        if (fallback?.suscripcion_id) {
          setSuscripcion(fallback);
        } else {
          setSuscripcion((prev) => (prev?.estado && prev.estado !== 'sin_verificar' ? prev : {
            activa: true,
            estado: 'sin_verificar',
            dias_restantes: 0,
            plan: null,
            mensaje: 'No se pudo verificar la suscripción en este momento.',
          }));
          setTimeout(() => { fetchSuscripcionRef.current?.(); }, 60000);
        }
        return;
      }

      setSuscripcion(data);
    } catch (err) {
      console.error('[Suscripcion] Error fetching:', err);
      setSuscripcion({
        activa: true,
        estado: 'sin_verificar',
        dias_restantes: 0,
        plan: 'pendiente',
        mensaje: 'No se pudo verificar la suscripcion. Revise la configuracion de planes.'
      });
    } finally {
      setLoading(false);
    }
  }, [user, tenantId, fetchSuscripcionDirecta]);

  const fetchSuscripcionRef = React.useRef(null);
  useEffect(() => { fetchSuscripcionRef.current = fetchSuscripcion; }, [fetchSuscripcion]);

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

  useEffect(() => {
    fetchSuscripcion();
    fetchPlanes();
  }, [fetchSuscripcion, fetchPlanes]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchSuscripcion, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, fetchSuscripcion]);

  const isActiva = suscripcion?.activa === true;
  const isVencida = ['vencido', 'cancelado', 'sin_suscripcion'].includes(suscripcion?.estado) && !suscripcion?.pago_pendiente;
  const isTrial = suscripcion?.estado === 'trial';
  const diasRestantes = suscripcion?.dias_restantes || 0;
  const porVencer = isActiva && diasRestantes <= 3 && diasRestantes > 0;
  const planActual = suscripcion?.plan || null;
  const limites = suscripcion?.limites || {};
  const features = suscripcion?.features || {};

  const validarAccion = useCallback((accion = 'general') => {
    if (isSuperAdmin) {
      return { allowed: true, reason: null };
    }

    if (loading) {
      return { allowed: true, reason: null };
    }

    if (suscripcion?.pago_pendiente) {
      return { allowed: true, reason: null };
    }

    if (isVencida) {
      return {
        allowed: false,
        reason: `Sistema bloqueado: ${suscripcion?.mensaje || 'Su suscripcion ha vencido. Renueve su plan para continuar usando el sistema.'}`
      };
    }

    if (accion === 'cotizaciones_magna' && !features.cotizaciones_magna) {
      return { allowed: false, reason: 'Esta funcion requiere el plan PRO o superior.' };
    }
    if (accion === 'carta_ruta' && !features.carta_ruta) {
      return { allowed: false, reason: 'Las cartas de ruta requieren el plan PRO o superior.' };
    }
    if (accion === 'cobranzas' && !features.cobranzas) {
      return { allowed: false, reason: 'El modulo de cobranzas requiere el plan PRO o superior.' };
    }
    if (accion === 'reportes_avanzados' && !features.reportes_avanzados) {
      return { allowed: false, reason: 'Los reportes avanzados requieren el plan PRO o superior.' };
    }
    if (accion === 'ocr_facturas' && !features.ocr_facturas) {
      return { allowed: false, reason: 'El OCR de facturas requiere el plan PRO o superior.' };
    }

    return { allowed: true, reason: null };
  }, [isSuperAdmin, loading, isVencida, features, suscripcion]);

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

    await fetchSuscripcion();
    return data;
  }, [tenantId, fetchSuscripcion]);

  const value = useMemo(() => ({
    suscripcion,
    loading,
    planes,
    isActiva,
    isVencida,
    isTrial,
    diasRestantes,
    porVencer,
    planActual,
    limites,
    features,
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
