import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { AlertTriangle, TrendingUp, Users, Package, Loader2 } from 'lucide-react';
import Logo from '@/components/common/Logo';
import SummaryCard from '@/components/common/SummaryCard';

// Componentes SaaS
import FlujoNetoCard from '@/components/dashboard/FlujoNetoCard';
import CommitmentsCard from '@/components/dashboard/CommitmentsCard';
import SupplierCommitmentsCard from '@/components/dashboard/SupplierCommitmentsCard';
import CommitmentFormModal from '@/components/dashboard/CommitmentFormModal';
import DailyExpensesCard from '@/components/dashboard/DailyExpensesCard';
import DailyExpenseModal from '@/components/dashboard/DailyExpenseModal';
import PayCommitmentModal from '@/components/dashboard/PayCommitmentModal';
import PaySupplierCommitmentModal from '@/components/dashboard/PaySupplierCommitmentModal';
import SuscripcionStatusCard from '@/components/dashboard/SuscripcionStatusCard';
import AprobacionesPendientesAlert from '@/components/dashboard/AprobacionesPendientesAlert';
import InsightsBanner from '@/components/dashboard/InsightsBanner';

import { generatePagoCompromisoPDF } from '@/components/common/pdf/pagoCompromisoPDF';
import { generatePagoSuplidorPDF } from '@/components/common/pdf/pagoSuplidorPDF';
import { printPagoCompromisoPOS, printPagoSuplidorPOS } from '@/lib/printPOS';

import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { isSameWeek, addDays, isBefore, startOfToday, differenceInMonths, differenceInYears, addWeeks, addMonths, addYears } from 'date-fns';

const parseLocalDate = (value) => {
  if (!value) return null;
  const dateStr = String(value).split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

const isDueThisWeekOrOverdue = (date, today = new Date()) => {
  if (!date) return false;
  return isBefore(date, startOfToday()) || isSameWeek(date, today, { weekStartsOn: 1 });
};

const getStartOfTodayISO = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
};

const HomePage = () => {
  const { toast } = useToast();
  const { profile, empresa, tenantId } = useAuth();
  const { openPanel } = usePanels();
  const isAdmin = ['admin', 'owner', 'manager', 'gerente'].includes(profile?.role);

  // UI Stats (Originales)
  const [stats, setStats] = useState({
    stockBajo: 0,
    ventasHoy: 0,
    clientesActivos: 0,
    productosTotal: 0
  });

  // Financial Stats
  const [finanzas, setFinanzas] = useState({
    meta: 150000, 
    ventasSemana: 0,
    ventasContado: 0,
    ventasCredito: 0,
    diasTranscurridos: Math.max(new Date().getDay(), 1), 
    diasRestantes: 7 - (new Date().getDay()),     
    caja: 0,
    cajaActualContadoHoy: 0,
    gastosDiariosHoy: [],
    compromisos: [],
    suplidorCompromisos: [],
    flujoNeto: null
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const realtimeRefreshRef = useRef(null);

  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);
  const [isDailyExpenseModalOpen, setIsDailyExpenseModalOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState(null);
  const [payCommitmentTarget, setPayCommitmentTarget] = useState(null);
  const [paySupplierTarget, setPaySupplierTarget] = useState(null);
  // Formato del comprobante de pago (config_empresa.formato_comprobante_pago).
  const [formatoComprobante, setFormatoComprobante] = useState('pdf');

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 0. Configuración de la Empresa (para meta dinámica + nombre)
      // select('*') para tolerar que formato_comprobante_pago aún no exista en la BD
      // (si no se ha corrido la migración SQL, simplemente cae al default 'pdf').
      const { data: configEmpresa } = await supabase
        .from('config_empresa')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (configEmpresa?.nombre) setNombreEmpresa(configEmpresa.nombre);
      if (configEmpresa?.formato_comprobante_pago) setFormatoComprobante(configEmpresa.formato_comprobante_pago);

      const calculateCurrentMeta = (config) => {
        if (!config || !config.meta_ventas) return 150000;
        if (config.intervalo_meta === 'Ninguno' || !config.incremento_meta_pct) return config.meta_ventas;

        const hoy = new Date();
        const fechaInicio = config.fecha_inicio_meta ? new Date(config.fecha_inicio_meta) : hoy;
        
        if (isBefore(hoy, fechaInicio)) return config.meta_ventas;

        let periodos = 0;
        switch (config.intervalo_meta) {
          case 'Mensual':
            periodos = Math.floor(differenceInMonths(hoy, fechaInicio));
            break;
          case 'Trimestral':
            periodos = Math.floor(differenceInMonths(hoy, fechaInicio) / 3);
            break;
          case 'Semestral':
            periodos = Math.floor(differenceInMonths(hoy, fechaInicio) / 6);
            break;
          case 'Anual':
            periodos = Math.floor(differenceInYears(hoy, fechaInicio));
            break;
          default:
            periodos = 0;
        }

        if (periodos <= 0) return config.meta_ventas;
        return config.meta_ventas * Math.pow(1 + (config.incremento_meta_pct / 100), periodos);
      };

      const currentMeta = calculateCurrentMeta(configEmpresa);

      // Fecha de hoy (local) para la lista de gastos del día.
      const todayDate = getStartOfTodayISO().split('T')[0];

      // ------------------------------------------------------------------
      // UNA sola tanda paralela y tolerante a fallos (allSettled).
      //  - Rápido: el excedente de caja se calcula en un RPC (la BD suma el
      //    historial de una vez), en vez de traer miles de filas al navegador.
      //  - Robusto: si una consulta falla o va lenta, NO tumba el resto ni
      //    muestra la alerta roja; conservamos los datos previos (merge).
      // ------------------------------------------------------------------
      const results = await Promise.allSettled([
        supabase.rpc('get_stats_dashboard'),          // 0
        supabase.rpc('get_sales_quality'),            // 1
        supabase.rpc('get_commitments_week'),         // 2
        supabase.rpc('get_flujo_neto_dashboard'),     // 3
        supabase.rpc('get_caja_excedente_dashboard'), // 4  (excedente + caja de hoy)
        supabase.from('compras').select('id, numero, referencia, fecha, dias_credito, monto_pendiente, total_compra, monto_pagado, suplidor_id, proveedores(nombre)').eq('tenant_id', tenantId).ilike('forma_pago', 'CREDITO').eq('estado', 'PENDIENTE').order('fecha', { ascending: true }),  // 5  (CxP suplidores)
        supabase.from('gastos_diarios').select('id, fecha, tipo_gasto, monto, descripcion').eq('tenant_id', tenantId).eq('fecha', todayDate).eq('anulado', false).order('created_at', { ascending: false })  // 6  (lista de gastos de hoy)
      ]);

      // Lectura segura de cada resultado (fallback si esa consulta falló).
      const val = (i, fb = { data: null }) => (results[i].status === 'fulfilled' ? results[i].value : fb);
      const statsRes = val(0);
      const salesRes = val(1);
      const comRes = val(2);
      const flujoRes = val(3);
      const cajaRes = val(4);
      const suplRes = val(5, { data: [] });
      const gDiariosHoy = val(6, { data: [] });

      if (!statsRes.error && statsRes.data) setStats(statsRes.data);

      // Compromisos de suplidores (Cuentas por Pagar) que vencen esta semana o ya vencieron.
      const suplidorErr = suplRes.error;
      const suplidorRawData = suplRes.data;
      let suplidorData = [];
      if (!suplidorErr && suplidorRawData) {
        const hoy = new Date();
        const hoyStart = startOfToday();
        suplidorData = suplidorRawData.map(c => {
          const pendiente = c.monto_pendiente !== null ? c.monto_pendiente : ((c.total_compra || 0) - (c.monto_pagado || 0));
          // Calcular fecha de vencimiento ajustando si es necesario a UTC para problemas de timezone,
          // pero como new Date() mapea la fecha local, addDays funciona bien.
          const fechaVencimiento = c.fecha ? addDays(new Date(c.fecha + 'T00:00:00'), c.dias_credito || 0) : new Date();
          const isOverdue = isBefore(fechaVencimiento, hoyStart);
          return {
            ...c,
            monto_pendiente: pendiente,
            fecha_vencimiento: fechaVencimiento.toISOString(),
            isOverdue
          };
        }).filter(c => {
          if (c.monto_pendiente <= 0) return false;
          // Mostrar si vence esta semana o es una cuenta pendiente vencida (rojo)
          const isThisWeek = isSameWeek(new Date(c.fecha_vencimiento), hoy, { weekStartsOn: 1 });
          return isThisWeek || c.isOverdue;
        });
      }

      // Excedente de caja (efectivo acumulado) y caja de hoy vienen del RPC.
      // Solo confiamos en ellos si el RPC llegó bien; si no, conservamos lo previo.
      const cajaOk = results[4].status === 'fulfilled' && !cajaRes.error && !!cajaRes.data;
      const excedenteCaja = Number(cajaRes.data?.excedente) || 0;
      const cajaActualContadoHoy = Number(cajaRes.data?.caja_hoy) || 0;

      // Merge resiliente: cada campo usa su dato nuevo o conserva el anterior.
      setFinanzas(prev => ({
        ...prev,
        ventasContado: salesRes.data?.ventasContado ?? prev.ventasContado,
        ventasCredito: salesRes.data?.ventasCredito ?? prev.ventasCredito,
        ventasSemana: salesRes.data?.ventasSemana ?? prev.ventasSemana,
        meta: currentMeta || prev.meta,
        compromisos: comRes.error ? prev.compromisos : (comRes.data || []),
        suplidorCompromisos: suplidorErr
          ? prev.suplidorCompromisos
          : (suplidorData || []).map(s => ({ ...s, suplidor_nombre: s.proveedores?.nombre })),
        caja: cajaOk ? excedenteCaja : prev.caja,
        cajaActualContadoHoy: cajaOk ? cajaActualContadoHoy : prev.cajaActualContadoHoy,
        gastosDiariosHoy: (gDiariosHoy.data ?? prev.gastosDiariosHoy) || [],
        flujoNeto: flujoRes?.data || prev.flujoNeto || null
      }));

      // Ancla rodante: si el corte quedó en un mes anterior, congelamos lo
      // acumulado hasta el 1ro de este mes (fire-and-forget). No cambia el
      // excedente; solo hace que la próxima carga sume únicamente el mes en
      // curso. Se auto-desactiva en cuanto queda rodada (debe_rodar = false).
      if (cajaRes.data?.debe_rodar) {
        supabase.rpc('rodar_ancla_caja').catch(() => {});
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      if (!isRefresh) {
          toast({
            variant: "destructive",
            title: "Alerta de Datos",
            description: "No se pudieron sincronizar todas las métricas financieras."
          });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, tenantId]);

  // Initial load
  useEffect(() => {
    if (!isAdmin || !tenantId) {
      setLoading(false);
      return;
    }
    fetchDashboardData();
  }, [isAdmin, tenantId, fetchDashboardData]);

  // Auto-refresh logic (5 minutes)
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [isAdmin, fetchDashboardData]);

  // Refresco inmediato de caja/dashboard cuando cambian movimientos financieros.
  useEffect(() => {
    if (!isAdmin || !tenantId) return;

    const scheduleRefresh = () => {
      if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
      realtimeRefreshRef.current = setTimeout(() => {
        fetchDashboardData(true);
      }, 500);
    };

    const tenantFilter = `tenant_id=eq.${tenantId}`;
    const channel = supabase
      .channel(`dashboard-finanzas-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas', filter: tenantFilter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recibos_ingreso', filter: tenantFilter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devoluciones', filter: tenantFilter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compromisos', filter: tenantFilter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_diarios', filter: tenantFilter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_suplidores', filter: tenantFilter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compras', filter: tenantFilter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cierres_caja', filter: tenantFilter }, scheduleRefresh)
      .subscribe();

    const onFocus = () => fetchDashboardData(true);
    window.addEventListener('focus', onFocus);

    return () => {
      if (realtimeRefreshRef.current) {
        clearTimeout(realtimeRefreshRef.current);
        realtimeRefreshRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, tenantId, fetchDashboardData]);

  const handleAddCommitment = () => {
    setSelectedCommitment(null);
    setIsCommitmentModalOpen(true);
  };

  const handleAddDailyExpense = () => {
    setIsDailyExpenseModalOpen(true);
  };

  const handleEditCommitment = (c) => {
    setSelectedCommitment(c);
    setIsCommitmentModalOpen(true);
  };

  // Click en "Pagar" -> abrir modal con forma de pago
  const handlePayCommitment = (c) => {
    setPayCommitmentTarget(c);
  };

  // Confirmacion desde el modal: aplica el pago con la forma seleccionada
  const handleConfirmPayCommitment = async ({ forma_pago, referencia_pago }) => {
    const c = payCommitmentTarget;
    if (!c) return;

    try {
      const { error } = await supabase
        .from('compromisos')
        .update({
          activo: false,
          fecha_pago: new Date().toISOString(),
          forma_pago,
          referencia_pago,
        })
        .eq('id', c.id);

      if (error) throw error;

      // Auto-renovación: crear el siguiente compromiso si es recurrente
      if (c.recurrente) {
        const baseDate = c.fecha ? new Date(c.fecha + 'T12:00:00') : new Date();
        let nextDate;
        switch (c.frecuencia) {
          case 'semanal':   nextDate = addWeeks(baseDate, 1); break;
          case 'quincenal': nextDate = addDays(baseDate, 15); break;
          case 'anual':     nextDate = addYears(baseDate, 1); break;
          case 'mensual':
          default:          nextDate = addMonths(baseDate, 1); break;
        }

        const { error: insErr } = await supabase.from('compromisos').insert({
          tenant_id: tenantId,
          nombre: c.nombre,
          monto: c.monto,
          fecha: nextDate.toISOString().split('T')[0],
          tipo: c.tipo,
          activo: true,
          recurrente: true,
          frecuencia: c.frecuencia || 'mensual',
        });

        if (insErr) {
          toast({
            title: "Pago registrado, falló renovación",
            description: `El pago se aplicó, pero no se pudo crear el siguiente compromiso: ${insErr.message}`,
            variant: "destructive",
          });
          fetchDashboardData(true);
          return;
        }
      }

      toast({
        title: c.recurrente ? "Pago y renovación exitosos" : "Pago Exitoso",
        description: c.recurrente
          ? `Compromiso pagado (${forma_pago}) y siguiente período creado.`
          : `Compromiso pagado (${forma_pago}).`,
      });

      // Comprobante de pago (PDF o ticket POS según configuración del sistema).
      try {
        const pago = {
          nombre: c.nombre,
          monto: c.monto,
          fecha_pago: new Date().toISOString(),
          forma_pago,
          referencia_pago,
          tipo: c.tipo,
          recurrente: c.recurrente,
          frecuencia: c.frecuencia,
        };
        if (formatoComprobante === 'pdf') {
          generatePagoCompromisoPDF(pago, empresa || {});
        } else {
          printPagoCompromisoPOS(pago, formatoComprobante === 'pos_80mm' ? '80mm' : '4inch');
        }
      } catch (pdfErr) {
        console.warn('No se pudo generar el comprobante de pago:', pdfErr);
      }

      setPayCommitmentTarget(null);
      fetchDashboardData(true);
    } catch (error) {
      toast({
        title: "Error de Pago",
        description: "Hubo un error al intentar descontar de caja.",
        variant: "destructive",
      });
    }
  };

  // Click en "Pagar" sobre una factura de suplidor pendiente
  const handlePaySupplierCommitment = (c) => {
    setPaySupplierTarget(c);
  };

  // Confirmacion del modal: registra el pago a suplidor con la forma elegida.
  // Usa la misma RPC que el panel de Pago a Suplidores (procesar_pago_suplidor)
  // pero con un solo abono = monto pendiente.
  const handleConfirmPaySupplier = async ({ forma_pago, referencia_pago, monto_abonado }) => {
    const c = paySupplierTarget;
    if (!c) return;

    try {
      const pagoData = {
        fecha: new Date().toISOString().split('T')[0],
        suplidor_id: c.suplidor_id,
        total_pagado: monto_abonado,
        concepto: `Pago factura ${c.numero || c.referencia || ''}`.trim(),
        formas_pago: [{
          id: 1,
          forma: forma_pago,
          monto: monto_abonado,
          referencia: referencia_pago || '',
        }],
      };
      const detallesData = [{
        compra_id: c.id,
        monto_abonado: monto_abonado,
      }];

      const { data, error } = await supabase.rpc('procesar_pago_suplidor', {
        p_pago_data: pagoData,
        p_detalles_data: detallesData,
      });
      if (error) throw error;

      toast({
        title: "Pago a suplidor registrado",
        description: `Pago ${data} aplicado a factura ${c.numero || c.referencia} (${forma_pago}).`,
      });

      // Comprobante de pago a suplidor (PDF o ticket POS según configuración).
      try {
        const nombreSuplidor = c.suplidor_nombre || c.proveedores?.nombre;
        const pagoComprobante = { numero: data, fecha: pagoData.fecha, total_pagado: monto_abonado };
        const detallesComprobante = [{
          fecha_emision: c.fecha,
          referencia: c.numero || c.referencia,
          monto_pendiente: c.monto_pendiente,
          monto_abonado: monto_abonado,
        }];
        const formasComprobante = [{ forma: forma_pago, referencia: referencia_pago, monto: monto_abonado }];

        if (formatoComprobante === 'pdf') {
          generatePagoSuplidorPDF(pagoComprobante, nombreSuplidor, detallesComprobante, formasComprobante, empresa || {});
        } else {
          printPagoSuplidorPOS(pagoComprobante, nombreSuplidor, detallesComprobante, formasComprobante, formatoComprobante === 'pos_80mm' ? '80mm' : '4inch');
        }
      } catch (pdfErr) {
        console.warn('No se pudo generar el comprobante de pago a suplidor:', pdfErr);
      }

      setPaySupplierTarget(null);
      fetchDashboardData(true);
    } catch (error) {
      toast({
        title: "Error de Pago",
        description: error.message || "No se pudo registrar el pago al suplidor.",
        variant: "destructive",
      });
    }
  };

  // ----------------------------------------------------
  // TOTAL FALTANTE Y CÁLCULOS (Usando solo datos de la semana)
  // ----------------------------------------------------
  const totalCompromisosPagarSemana = finanzas.compromisos.reduce((sum, c) => {
    const fecha = parseLocalDate(c.fecha);
    return isDueThisWeekOrOverdue(fecha) ? sum + (Number(c.monto) || 0) : sum;
  }, 0);
  const totalPagosSuplidoresSemana = finanzas.suplidorCompromisos.reduce((sum, c) => {
    const fecha = parseLocalDate(c.fecha_vencimiento);
    return isDueThisWeekOrOverdue(fecha) ? sum + (Number(c.monto_pendiente) || 0) : sum;
  }, 0);
  const totalDeudaSemanal = totalCompromisosPagarSemana + totalPagosSuplidoresSemana;
  const faltanteAcumulado = Math.max(totalDeudaSemanal - finanzas.caja, 0);

  const promedioDiario = finanzas.diasTranscurridos > 0 ? finanzas.ventasSemana / finanzas.diasTranscurridos : 0;
  const proyeccionTotal = finanzas.ventasSemana + (promedioDiario * finanzas.diasRestantes);

  return (
    <>
      <Helmet>
        <title>Inicio — {empresa?.nombre || nombreEmpresa || 'Sistema'}</title>
        <meta name="description" content="Dashboard principal financiero inteligente." />
      </Helmet>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6 lg:space-y-8 pb-10"
      >
        <div className="flex flex-col items-center justify-center pt-8 pb-4 lg:pt-10 lg:pb-6 relative">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-4"
          >
            <Logo size="lg" />
          </motion.div>
          
          {nombreEmpresa && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-1"
            >
              Hola, {nombreEmpresa} 👋
            </motion.p>
          )}

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-center"
          >
            <h2 className="text-sm font-bold text-slate-500 tracking-[0.2em] uppercase flex items-center gap-2">
              Asistente Financiero Inteligente
              {refreshing && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
            </h2>
          </motion.div>
        </div>

        {/* Banner insights diarios (agente IA) */}
        {isAdmin && <InsightsBanner />}

        {/* Panel Administrativo Financiero */}
        {isAdmin && (
          <>
            {loading ? (
              <div className="flex justify-center items-center py-10 h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-morla-blue" />
                    <span className="text-slate-500 font-bold uppercase tracking-widest text-xs animate-pulse">Sincronizando Inteligencia Financiera...</span>
                </div>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto space-y-6 px-4">
                
                {/* 0. ESTADO DE SUSCRIPCIÓN */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  <SuscripcionStatusCard
                    onRenovar={() => openPanel('planes')}
                  />
                </motion.div>

                {/* 1. ANÁLISIS PROFUNDO Y ESTRATÉGICO (Grid Principal de 3) */}
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
                >
                  <CommitmentsCard 
                    compromisos={finanzas.compromisos} 
                    caja={finanzas.cajaActualContadoHoy}
                    excedente={finanzas.caja}
                    onAdd={handleAddCommitment}
                    onEdit={handleEditCommitment}
                    onPay={handlePayCommitment}
                    customTotal={totalCompromisosPagarSemana}
                  />

                  <DailyExpensesCard
                    gastos={finanzas.gastosDiariosHoy}
                    caja={finanzas.cajaActualContadoHoy}
                    onAdd={handleAddDailyExpense}
                  />
                  
                  {/* Compromisos Suplidores (Nuevo) */}
                  <SupplierCommitmentsCard
                    commitments={finanzas.suplidorCompromisos}
                    caja={finanzas.caja}
                    customTotal={totalPagosSuplidoresSemana}
                    onPay={handlePaySupplierCommitment}
                  />

                  {/* Flujo neto acumulado del mes (+ Metas y proyecciones) */}
                  <FlujoNetoCard
                    data={finanzas.flujoNeto}
                    loading={loading}
                    onRetry={() => fetchDashboardData(true)}
                  />
                </motion.div>

                {/* 3. SECCIÓN TÁCTICA (Summary Cards) */}
                <motion.div
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 pt-6 border-t border-gray-200"
                >
                  <SummaryCard
                    title="Ventas del Día"
                    value={`${stats.ventasHoy.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`}
                    icon={TrendingUp}
                    color="accent"
                    description="ingresos de hoy"
                  />
                  <SummaryCard
                    title="Inventario Crítico"
                    value={stats.stockBajo}
                    icon={AlertTriangle}
                    color="destructive"
                    description="productos por agotar"
                  />
                  <SummaryCard
                    title="Clientes Activos"
                    value={stats.clientesActivos}
                    icon={Users}
                    color="primary"
                    description="en cartera de crédito"
                  />
                  <SummaryCard
                    title="Catálogo Total"
                    value={stats.productosTotal}
                    icon={Package}
                    color="purple"
                    description="referencias únicas"
                  />
                </motion.div>

              </div>
            )}
          </>
        )}
      </motion.div>

      {isAdmin && (
        <CommitmentFormModal
          isOpen={isCommitmentModalOpen}
          onClose={(success) => {
            setIsCommitmentModalOpen(false);
            if (success) fetchDashboardData();
          }}
          compromiso={selectedCommitment}
          tenantId={tenantId}
        />
      )}

      {isAdmin && (
        <DailyExpenseModal
          isOpen={isDailyExpenseModalOpen}
          onClose={(success) => {
            setIsDailyExpenseModalOpen(false);
            if (success) fetchDashboardData(true);
          }}
        />
      )}

      <PayCommitmentModal
        isOpen={!!payCommitmentTarget}
        onClose={() => setPayCommitmentTarget(null)}
        compromiso={payCommitmentTarget}
        onConfirm={handleConfirmPayCommitment}
      />

      <PaySupplierCommitmentModal
        isOpen={!!paySupplierTarget}
        onClose={() => setPaySupplierTarget(null)}
        commitment={paySupplierTarget}
        onConfirm={handleConfirmPaySupplier}
      />
    </>
  );
};

export default HomePage;
