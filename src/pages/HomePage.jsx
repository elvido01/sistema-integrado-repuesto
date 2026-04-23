import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { AlertTriangle, TrendingUp, Users, Package, Loader2 } from 'lucide-react';
import Logo from '@/components/common/Logo';
import SummaryCard from '@/components/common/SummaryCard';

// Componentes SaaS
import HybridFinancialOverviewCard from '@/components/dashboard/HybridFinancialOverviewCard';
import CommitmentsCard from '@/components/dashboard/CommitmentsCard';
import SupplierCommitmentsCard from '@/components/dashboard/SupplierCommitmentsCard';
import CommitmentFormModal from '@/components/dashboard/CommitmentFormModal';
import SuscripcionStatusCard from '@/components/dashboard/SuscripcionStatusCard';

import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { isSameWeek, addDays, isBefore, startOfToday, differenceInMonths, differenceInYears, addWeeks, addMonths, addYears } from 'date-fns';

const HomePage = () => {
  const { toast } = useToast();
  const { profile, empresa, tenantId } = useAuth();
  const { openPanel } = usePanels();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';

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
    compromisos: [],
    suplidorCompromisos: [],
    ventasMetricas: null,
    crecimientoData: null,
    finanzasSemanales: null
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nombreEmpresa, setNombreEmpresa] = useState('');

  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState(null);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 0. Configuración de la Empresa (para meta dinámica + nombre)
      const { data: configEmpresa } = await supabase
        .from('config_empresa')
        .select('nombre, meta_ventas, incremento_meta_pct, intervalo_meta, fecha_inicio_meta')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (configEmpresa?.nombre) setNombreEmpresa(configEmpresa.nombre);

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

      // 1. Stats generales
      const { data: statsData, error: statsErr } = await supabase.rpc('get_stats_dashboard');
      if (statsErr) throw statsErr;
      if (statsData) setStats(statsData);

      // 2. Calidad de ventas, proyecciones y compromisos
      const [salesRes, comRes, metricsRes, growthRes, weeklyRes] = await Promise.all([
        supabase.rpc('get_sales_quality'),
        supabase.rpc('get_commitments_week'),
        supabase.rpc('get_sales_metrics'),
        supabase.rpc('get_monthly_growth'),
        supabase.rpc('get_weekly_financials')
      ]);

      // 3. Compromisos de suplidores (Cuentas por Pagar)
      // Buscamos todas las facturas de compras con saldo pendiente
      const { data: suplidorRawData, error: suplidorErr } = await supabase
        .from('compras')
        .select('id, numero, referencia, fecha, dias_credito, monto_pendiente, total_compra, monto_pagado, proveedores(nombre)')
        .ilike('forma_pago', 'CREDITO')
        .eq('estado', 'PENDIENTE')
        .order('fecha', { ascending: true });

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

      if (suplidorErr) throw suplidorErr;

      // 4. Intento de obtener balance de caja (o cálculo de hoy)
      const inicioCierreHoy = new Date();
      inicioCierreHoy.setHours(0,0,0,0);

      // 4. Cálculo de Balance Acumulado (Caja Actual)
      // El sistema empieza en cero y suma ventas día tras día.
      // Solo suma: Ventas Contado y Recibos de Ingreso.
      // Solo resta: Compromisos a pagar, Compromisos a Suplidores y Compras al Contado.
      const [vContado, rIngreso, cPagados, pSuplidores, cContado] = await Promise.all([
        supabase.from('facturas').select('total').ilike('forma_pago', 'contado').neq('estado', 'ANULADA'),
        supabase.from('recibos_ingreso').select('monto_pagado').eq('anulado', false),
        supabase.from('compromisos').select('monto').eq('activo', false),
        supabase.from('pagos_suplidores').select('monto_pagado, formas_pago').eq('anulado', false),
        supabase.from('compras').select('total_compra').ilike('forma_pago', 'contado').neq('estado', 'ANULADA')
      ]);

      const tVentasContado = (vContado.data || []).reduce((acc, v) => acc + Number(v.total), 0);
      const tRecibosIngreso = (rIngreso.data || []).reduce((acc, r) => acc + Number(r.monto_pagado), 0);
      const tCompromisosPagados = (cPagados.data || []).reduce((acc, c) => acc + Number(c.monto), 0);
      const tPagosSuplidores = (pSuplidores.data || []).reduce((acc, p) => {
        const efectivo = (p.formas_pago || []).filter(fp => fp.forma === 'Efectivo')
          .reduce((s, fp) => s + (parseFloat(fp.monto) || 0), 0);
        return acc + efectivo;
      }, 0);
      const tComprasContado = (cContado.data || []).reduce((acc, c) => acc + Number(c.total_compra), 0);

      const realCaja = tVentasContado + tRecibosIngreso - tCompromisosPagados - tPagosSuplidores - tComprasContado;

      if (!salesRes?.error && !comRes?.error) {

        setFinanzas(prev => ({
          ...prev,
          ventasContado: salesRes.data?.ventasContado || 0,
          ventasCredito: salesRes.data?.ventasCredito || 0,
          ventasSemana: salesRes.data?.ventasSemana || 0,
          meta: currentMeta,
          compromisos: comRes.data || [],
          suplidorCompromisos: (suplidorData || []).map(s => ({
            ...s,
            suplidor_nombre: s.proveedores?.nombre
          })),
          caja: realCaja,
          ventasMetricas: metricsRes?.data || null,
          crecimientoData: growthRes?.data || null,
          finanzasSemanales: weeklyRes?.data || null
        }));
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

  const handleAddCommitment = () => {
    setSelectedCommitment(null);
    setIsCommitmentModalOpen(true);
  };

  const handleEditCommitment = (c) => {
    setSelectedCommitment(c);
    setIsCommitmentModalOpen(true);
  };

  const handlePayCommitment = async (c) => {
    const recurrenteMsg = c.recurrente
      ? `\n\nSe creará automáticamente el próximo compromiso (${c.frecuencia || 'mensual'}).`
      : '';
    if (!confirm(`¿Estás seguro de que deseas pagar "${c.nombre}" por RD$${c.monto?.toLocaleString('es-DO')}? Este monto será descontado de la caja actual automáticamente.${recurrenteMsg}`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('compromisos')
        .update({ activo: false, fecha_pago: new Date().toISOString() })
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
          ? "Compromiso descontado y siguiente período creado."
          : "El compromiso ha sido descontado correctamente de la caja.",
      });

      fetchDashboardData(true);
    } catch (error) {
      toast({
        title: "Error de Pago",
        description: "Hubo un error al intentar descontar de caja.",
        variant: "destructive",
      });
    }
  };

  // ----------------------------------------------------
  // TOTAL FALTANTE Y CÁLCULOS (Usando solo datos de la semana)
  // ----------------------------------------------------
  const totalCompromisosPagarSemana = finanzas.finanzasSemanales?.total_compromisos_semana || 0;
  const totalPagosSuplidoresSemana = finanzas.finanzasSemanales?.total_pagos_suplidores_semana || 0;
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
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  <CommitmentsCard 
                    compromisos={finanzas.compromisos} 
                    caja={finanzas.caja} 
                    onAdd={handleAddCommitment}
                    onEdit={handleEditCommitment}
                    onPay={handlePayCommitment}
                    customTotal={totalCompromisosPagarSemana}
                  />
                  
                  {/* Compromisos Suplidores (Nuevo) */}
                  <SupplierCommitmentsCard 
                    commitments={finanzas.suplidorCompromisos}
                    caja={finanzas.caja}
                    customTotal={totalPagosSuplidoresSemana}
                  />

                  {/* Metas + Proyección Híbrida */}
                  <HybridFinancialOverviewCard 
                    meta={finanzas.meta} 
                    ventasSemana={finanzas.ventasSemana} 
                    salesMetrics={finanzas.ventasMetricas}
                    growthData={finanzas.crecimientoData}
                    cajaRestante={finanzas.caja - totalDeudaSemanal}
                    totalCompromisosSemana={totalDeudaSemanal}
                    totalCompromisosMensual={finanzas.compromisos.reduce((sum, c) => sum + (c.monto || 0), 0)}
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
        />
      )}
    </>
  );
};

export default HomePage;