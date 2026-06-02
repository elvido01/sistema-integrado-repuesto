import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import AdminEmpresaDetalle from './AdminEmpresaDetalle';
import AdminPagosReview from '@/components/suscripcion/AdminPagosReview';
import AdminCuentasBancarias from '@/components/suscripcion/AdminCuentasBancarias';
import {
  Shield, Loader2, Building2, Calendar, Zap, RefreshCw, Users, Activity,
  DollarSign, TrendingUp, Eye, Power, PowerOff, Clock, ArrowUpRight,
  Package, CreditCard, Search, ChevronDown, ChevronUp, Plus, Link, Copy, Check,
  BellRing, AlertTriangle
} from 'lucide-react';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getDiasRestantes = (fechaFin) => {
  if (!fechaFin) return 0;
  const fin = new Date(fechaFin);
  if (Number.isNaN(fin.getTime())) return 0;
  return Math.max(0, Math.ceil((fin - new Date()) / MS_PER_DAY));
};

const normalizeSuscripcion = (sub) => {
  if (!sub) return null;
  const diasRestantes = getDiasRestantes(sub.fecha_fin);
  const estadoGuardado = sub.estado || 'sin_suscripcion';
  const estadoReal = diasRestantes > 0 && estadoGuardado === 'vencido'
    ? 'activo'
    : diasRestantes <= 0 && ['activo', 'trial'].includes(estadoGuardado)
      ? 'vencido'
      : estadoGuardado;

  return {
    ...sub,
    estado: estadoReal,
    dias_restantes: diasRestantes,
  };
};

const normalizeTenant = (tenant) => ({
  ...tenant,
  suscripcion: normalizeSuscripcion(tenant?.suscripcion),
});

const AdminDashboard = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [pagosPendientesCount, setPagosPendientesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [sortField, setSortField] = useState('nombre');
  const [sortDir, setSortDir] = useState('asc');

  // Modal state
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [extendDays, setExtendDays] = useState({});
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyRegistroLink = () => {
    const url = `${window.location.origin}/registro`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      toast({ title: '✅ Link copiado', description: url });
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  // ── FETCH: intenta RPCs, si fallan usa queries directas ──
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Intentar cargar planes (tabla directa)
      const planesRes = await supabase.from('planes').select('*').eq('activo', true).order('precio', { ascending: true });
      if (!planesRes.error) setPlanes(planesRes.data || []);

      const pagosRes = await supabase.rpc('admin_get_pagos_pendientes');
      setPagosPendientesCount(!pagosRes.error && Array.isArray(pagosRes.data) ? pagosRes.data.length : 0);

      // 2. Intentar RPCs primero
      const statsRes = await supabase.rpc('admin_get_dashboard_stats');
      const tenantsRes = await supabase.rpc('admin_get_tenants_detalle');

      console.log('[AdminDash] statsRes:', JSON.stringify(statsRes));
      console.log('[AdminDash] tenantsRes:', JSON.stringify(tenantsRes));

      if (!statsRes.error && !tenantsRes.error && statsRes.data && tenantsRes.data) {
        console.log('[AdminDash] Usando RPCs. Stats:', statsRes.data, 'Tenants:', tenantsRes.data);
        const normalizedTenants = (Array.isArray(tenantsRes.data) ? tenantsRes.data : []).map(normalizeTenant);
        const trialCount = normalizedTenants.filter(t => t.suscripcion?.estado === 'trial').length;
        const vencidoCount = normalizedTenants.filter(t => !t.suscripcion || t.suscripcion?.estado === 'vencido').length;

        setStats({
          ...statsRes.data,
          empresas_trial: trialCount,
          empresas_vencidas: vencidoCount,
        });
        setTenants(normalizedTenants);
      } else {
        // 3. Fallback: queries directas a tablas
        console.warn('[AdminDash] RPCs fallaron, usando queries directas. statsErr:', statsRes.error, 'tenantsErr:', tenantsRes.error);
        
        const { data: tenantsData } = await supabase
          .from('tenants')
          .select('*')
          .order('created_at', { ascending: true });

        const allTenants = tenantsData || [];

        // Intentar cargar suscripciones si la tabla existe
        let suscripcionesData = [];
        const { data: subsData, error: subsError } = await supabase
          .from('suscripciones')
          .select('*, planes(nombre, precio)')
          .order('fecha_fin', { ascending: false });
        
        if (!subsError) suscripcionesData = subsData || [];

        // Cargar usuarios reales desde profiles
        const startOfMonth = new Date();
        startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, tenant_id');

        const { data: ventasData } = await supabase
          .from('facturas')
          .select('total, tenant_id')
          .gte('fecha', startOfMonth.toISOString())
          .neq('estado', 'ANULADA');

        const profiles = profilesData || [];
        const ventas   = ventasData   || [];
        console.log('[AdminDash] Fallback data - profiles:', profiles.length, profiles, 'ventas:', ventas.length, ventas);

        // Mapear tenants con su suscripción más reciente
        const tenantsConSub = allTenants.map(t => {
          const sub = suscripcionesData.find(s => s.tenant_id === t.id);
          const normalizedSub = normalizeSuscripcion(sub);

          const tenantUsers  = profiles.filter(p => p.tenant_id === t.id).length;
          const tenantVentas = ventas
            .filter(v => v.tenant_id === t.id)
            .reduce((sum, v) => sum + Number(v.total || 0), 0);

          return {
            ...t,
            suscripcion: sub ? {
              id: sub.id,
              estado: normalizedSub.estado,
              plan_nombre: sub.planes?.nombre || t.plan || '—',
              plan_precio: sub.planes?.precio || 0,
              fecha_inicio: sub.fecha_inicio,
              fecha_fin: sub.fecha_fin,
              dias_restantes: normalizedSub.dias_restantes,
            } : null,
            total_usuarios: tenantUsers,
            total_ventas_mes: tenantVentas,
          };
        });

        setTenants(tenantsConSub);

        // Calcular stats manuales
        const trialCount = tenantsConSub.filter(t => t.suscripcion?.estado === 'trial').length;
        const activoCount = tenantsConSub.filter(t => t.suscripcion?.estado === 'activo').length;
        const vencidoCount = tenantsConSub.filter(t => !t.suscripcion || t.suscripcion?.estado === 'vencido').length;

        setStats({
          total_empresas: allTenants.length,
          empresas_activas: allTenants.filter(t => t.activo).length,
          empresas_trial: trialCount,
          empresas_vencidas: vencidoCount,
          empresas_pro: tenantsConSub.filter(t => t.suscripcion?.plan_nombre === 'PRO').length,
          empresas_basico: tenantsConSub.filter(t => t.suscripcion?.plan_nombre === 'BASICO').length,
          empresas_enterprise: tenantsConSub.filter(t => t.suscripcion?.plan_nombre === 'ENTERPRISE').length,
          mrr: tenantsConSub
            .filter(t => t.suscripcion?.estado === 'activo')
            .reduce((sum, t) => sum + (t.suscripcion?.plan_precio || 0), 0),
          total_usuarios: profiles.length,
          total_productos: 0,
          total_ventas_mes: ventas.reduce((sum, v) => sum + Number(v.total || 0), 0),
        });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Error al cargar datos: ' + err.message });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── ACTIONS: con fallback directo si RPCs no existen ──

  const handleActivar = async (tenantId) => {
    setUpdatingId(tenantId);
    try {
      // Intentar RPC
      const { error } = await supabase.rpc('admin_activar_empresa', { p_tenant_id: tenantId });
      if (error) {
        // Fallback directo
        const { error: directErr } = await supabase
          .from('tenants')
          .update({ activo: true, updated_at: new Date().toISOString() })
          .eq('id', tenantId);
        if (directErr) throw directErr;
      }
      toast({ title: '✅ Empresa Activada' });
      await fetchAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setUpdatingId(null);
  };

  const handleSuspender = async (tenantId) => {
    if (!confirm('¿Seguro que desea suspender esta empresa? Se bloqueará su acceso.')) return;
    setUpdatingId(tenantId);
    try {
      const { error } = await supabase.rpc('admin_suspender_empresa', { p_tenant_id: tenantId });
      if (error) {
        // Fallback directo
        const { error: directErr } = await supabase
          .from('tenants')
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq('id', tenantId);
        if (directErr) throw directErr;
      }
      toast({ title: '⛔ Empresa Suspendida' });
      await fetchAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setUpdatingId(null);
  };

  const handleCambiarPlan = async (tenantId, planNombre) => {
    setUpdatingId(tenantId);
    try {
      const { error } = await supabase.rpc('admin_cambiar_plan', { 
        p_tenant_id: tenantId, p_plan_nombre: planNombre 
      });
      if (error) {
        // Fallback: actualizar solo el campo plan del tenant
        const { error: directErr } = await supabase
          .from('tenants')
          .update({ plan: planNombre.toLowerCase(), updated_at: new Date().toISOString() })
          .eq('id', tenantId);
        if (directErr) throw directErr;
      }
      toast({ title: '✅ Plan Cambiado', description: `Plan actualizado a "${planNombre}"` });
      await fetchAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setUpdatingId(null);
  };

  const handleExtender = async (tenantId) => {
    const dias = parseInt(extendDays[tenantId]) || 0;
    if (dias <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingrese un número válido de días' });
      return;
    }
    setUpdatingId(tenantId);
    try {
      const { error } = await supabase.rpc('admin_extender_suscripcion', { 
        p_tenant_id: tenantId, p_dias: dias 
      });
      if (error) {
        // Fallback: extender trial_end_date directamente
        const tenant = tenants.find(t => t.id === tenantId);
        const currentEnd = tenant?.suscripcion?.fecha_fin || tenant?.trial_end_date || new Date().toISOString();
        const newEnd = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + dias);
        const { error: directErr } = await supabase
          .from('tenants')
          .update({ trial_end_date: newEnd.toISOString().split('T')[0], activo: true, updated_at: new Date().toISOString() })
          .eq('id', tenantId);
        if (directErr) throw directErr;
      }
      toast({ title: '✅ Suscripción Extendida', description: `+${dias} días` });
      setExtendDays(prev => ({ ...prev, [tenantId]: '' }));
      await fetchAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setUpdatingId(null);
  };

  // ── FILTER & SORT ──

  const filteredTenants = tenants
    .filter(t => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = (t.nombre || '').toLowerCase().includes(q)
          || (t.email || '').toLowerCase().includes(q)
          || (t.rnc || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (filterEstado !== 'todos') {
        const estado = t.suscripcion?.estado || 'sin_suscripcion';
        if (filterEstado === 'vencido' && estado !== 'vencido' && estado !== 'sin_suscripcion') return false;
        if (filterEstado !== 'vencido' && estado !== filterEstado) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let va, vb;
      if (sortField === 'nombre') { va = a.nombre; vb = b.nombre; }
      else if (sortField === 'plan') { va = a.suscripcion?.plan_nombre || ''; vb = b.suscripcion?.plan_nombre || ''; }
      else if (sortField === 'dias') { va = a.suscripcion?.dias_restantes || 0; vb = b.suscripcion?.dias_restantes || 0; }
      else if (sortField === 'ventas') { va = a.total_ventas_mes || 0; vb = b.total_ventas_mes || 0; }
      else { va = a.nombre; vb = b.nombre; }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const formatCurrency = (v) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(v || 0);

  const empresasPorVencer = tenants
    .filter(t => {
      const estado = t.suscripcion?.estado;
      const dias = Number(t.suscripcion?.dias_restantes || 0);
      return ['activo', 'trial'].includes(estado) && dias > 0 && dias <= 3;
    })
    .sort((a, b) => (a.suscripcion?.dias_restantes || 0) - (b.suscripcion?.dias_restantes || 0));

  const empresasVencidas = tenants
    .filter(t => {
      const estado = t.suscripcion?.estado || 'sin_suscripcion';
      return estado === 'vencido' || estado === 'sin_suscripcion';
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const statusBadge = (estado) => {
    const map = {
      activo:     { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Activo' },
      trial:      { bg: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: 'Trial' },
      vencido:    { bg: 'bg-red-100 text-red-700', dot: 'bg-red-500', label: 'Vencido' },
      cancelado:  { bg: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', label: 'Cancelado' },
      suspendido: { bg: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', label: 'Suspendido' },
      sin_suscripcion: { bg: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400', label: 'Sin Plan' },
    };
    return map[estado] || map.sin_suscripcion;
  };

  return (
    <>
      <Helmet><title>Admin Dashboard - SuperAdmin</title></Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 md:p-6 bg-gray-100 min-h-full"
      >
        <div className="max-w-[1400px] mx-auto space-y-5">

          {/* ── HEADER ── */}
          <div className="bg-gradient-to-r from-[#1a0a3a] to-[#3a1a5c] text-white rounded-xl px-6 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-yellow-400/20 rounded-xl">
                <Shield className="w-7 h-7 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider text-white">Admin Dashboard</h1>
                <p className="text-xs text-white/80">Control centralizado SaaS · Multi-Tenant</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs bg-white/10 px-3 py-1.5 rounded-full">
                <Building2 className="w-3 h-3" />
                <span className="font-bold">{tenants.length} Empresa{tenants.length !== 1 ? 's' : ''}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 gap-1.5"
                onClick={handleCopyRegistroLink}
                title="Copiar link de registro para nuevas empresas"
              >
                {linkCopied ? <Check className="w-4 h-4 text-green-400" /> : <Link className="w-4 h-4" />}
                <span className="text-xs hidden sm:inline">{linkCopied ? 'Copiado' : 'Link Registro'}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10"
                onClick={fetchAll}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* ── STATS CARDS ── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
                <MetricCard icon={Building2} label="Total Empresas" value={stats?.total_empresas || 0} color="purple" />
                <MetricCard icon={Zap} label="Activas" value={stats?.empresas_activas || 0} color="emerald" />
                <MetricCard icon={Clock} label="En Trial" value={stats?.empresas_trial || 0} color="amber" />
                <MetricCard icon={PowerOff} label="Vencidas" value={stats?.empresas_vencidas || 0} color="red" />
                <MetricCard 
                  icon={DollarSign} 
                  label="MRR" 
                  value={formatCurrency(stats?.mrr)} 
                  color="blue"
                  large
                />
                <MetricCard icon={TrendingUp} label="Ventas Mes (Global)" value={formatCurrency(stats?.total_ventas_mes)} color="indigo" />
              </div>

              <AdminAlertBell
                pagosPendientes={pagosPendientesCount}
                empresasPorVencer={empresasPorVencer}
                empresasVencidas={empresasVencidas}
                onRefresh={fetchAll}
                onShowVencidas={() => setFilterEstado('vencido')}
              />

              {/* Plan breakdown */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                <PlanBadge plan="TRIAL" count={stats?.empresas_trial || 0} color="amber" />
                <PlanBadge plan="BASICO" count={stats?.empresas_basico || 0} color="blue" />
                <PlanBadge plan="PRO" count={stats?.empresas_pro || 0} color="emerald" />
                <PlanBadge plan="ENTERPRISE" count={stats?.empresas_enterprise || 0} color="purple" />
                <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 shadow-sm">
                  <Users className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Usuarios Totales</p>
                    <p className="text-lg font-black text-gray-800">{stats?.total_usuarios || 0}</p>
                  </div>
                </div>
              </div>

              {/* ── PAGOS PENDIENTES ── */}
              <AdminPagosReview onChanged={fetchAll} />

              {/* ── CUENTAS BANCARIAS ── */}
              <AdminCuentasBancarias />

              {/* ── FILTERS ── */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row gap-3 shadow-sm">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar empresa, email o RNC..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9 text-sm"
                  />
                </div>
                <Select value={filterEstado} onValueChange={setFilterEstado}>
                  <SelectTrigger className="w-40 h-9 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los estados</SelectItem>
                    <SelectItem value="activo">🟢 Activo</SelectItem>
                    <SelectItem value="trial">🟡 Trial</SelectItem>
                    <SelectItem value="vencido">🔴 Vencido</SelectItem>
                    <SelectItem value="suspendido">🟠 Suspendido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ── TABLE ── */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-[#1a0a3a]/5">
                      <TableRow>
                        <TableHead className="text-[10px] font-black uppercase cursor-pointer select-none" onClick={() => toggleSort('nombre')}>
                          <span className="flex items-center gap-1">Empresa <SortIcon field="nombre" /></span>
                        </TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center">Estado</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center cursor-pointer select-none" onClick={() => toggleSort('plan')}>
                          <span className="flex items-center justify-center gap-1">Plan <SortIcon field="plan" /></span>
                        </TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center cursor-pointer select-none" onClick={() => toggleSort('dias')}>
                          <span className="flex items-center justify-center gap-1">Días Rest. <SortIcon field="dias" /></span>
                        </TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center">Usuarios</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center cursor-pointer select-none" onClick={() => toggleSort('ventas')}>
                          <span className="flex items-center justify-center gap-1">Ventas/Mes <SortIcon field="ventas" /></span>
                        </TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center">Extender</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTenants.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-10 text-gray-400 italic text-sm">
                            No se encontraron empresas
                          </TableCell>
                        </TableRow>
                      ) : filteredTenants.map(tenant => {
                        const sub = tenant.suscripcion;
                        const estado = sub?.estado || 'sin_suscripcion';
                        const dias = sub?.dias_restantes || 0;
                        const badge = statusBadge(estado);
                        const isUpdating = updatingId === tenant.id;

                        return (
                          <TableRow key={tenant.id} className="h-14 hover:bg-purple-50/20 transition-colors border-b">
                            {/* Empresa */}
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                {tenant.logo_url ? (
                                  <img src={tenant.logo_url} alt="" className="w-9 h-9 rounded-lg object-contain border border-gray-200 bg-white p-0.5" />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center border border-purple-100">
                                    <Building2 className="w-4 h-4 text-purple-400" />
                                  </div>
                                )}
                                <div>
                                  <p className="font-black text-[13px] text-gray-800">{tenant.nombre}</p>
                                  <p className="text-[10px] text-gray-400">{tenant.email || 'Sin email'}</p>
                                </div>
                              </div>
                            </TableCell>

                            {/* Estado */}
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${badge.bg}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </TableCell>

                            {/* Plan */}
                            <TableCell className="text-center">
                              <Select
                                value={sub?.plan_nombre || ''}
                                onValueChange={(val) => handleCambiarPlan(tenant.id, val)}
                                disabled={isUpdating}
                              >
                                <SelectTrigger className="h-7 w-32 mx-auto text-[10px] font-bold border-gray-300">
                                  <SelectValue placeholder="Sin plan" />
                                </SelectTrigger>
                                <SelectContent>
                                  {planes.map(p => (
                                    <SelectItem key={p.id} value={p.nombre}>
                                      {p.nombre === 'TRIAL' ? '🟡' : p.nombre === 'BASICO' ? '🔵' : p.nombre === 'PRO' ? '🟢' : '🟣'} {p.nombre}
                                      <span className="text-[9px] text-gray-400 ml-1">{formatCurrency(p.precio)}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>

                            {/* Días restantes */}
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-black ${
                                dias <= 0 ? 'bg-red-100 text-red-700' : dias <= 3 ? 'bg-amber-100 text-amber-700' : dias <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                              }`}>
                                <Calendar className="w-3 h-3" />
                                {dias}d
                              </span>
                            </TableCell>

                            {/* Usuarios */}
                            <TableCell className="text-center">
                              <span className="text-sm font-bold text-gray-700">{tenant.total_usuarios || 0}</span>
                            </TableCell>

                            {/* Ventas/Mes */}
                            <TableCell className="text-center">
                              <span className="text-xs font-bold text-gray-700">{formatCurrency(tenant.total_ventas_mes)}</span>
                            </TableCell>

                            {/* Extender */}
                            <TableCell className="text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="días"
                                  value={extendDays[tenant.id] || ''}
                                  onChange={(e) => setExtendDays(prev => ({ ...prev, [tenant.id]: e.target.value }))}
                                  className="h-7 w-16 text-[10px] text-center"
                                  disabled={isUpdating}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[10px] font-bold text-blue-600 border-blue-200 hover:bg-blue-50"
                                  onClick={() => handleExtender(tenant.id)}
                                  disabled={isUpdating || !extendDays[tenant.id]}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>

                            {/* Acciones */}
                            <TableCell className="text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-purple-600 hover:bg-purple-50"
                                  onClick={() => setSelectedTenantId(tenant.id)}
                                  title="Ver detalle"
                                  disabled={isUpdating}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                {tenant.activo ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                                    onClick={() => handleSuspender(tenant.id)}
                                    title="Suspender"
                                    disabled={isUpdating}
                                  >
                                    <PowerOff className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => handleActivar(tenant.id)}
                                    title="Activar"
                                    disabled={isUpdating}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase font-bold">
                    <Activity className="w-3 h-3" />
                    Admin Dashboard SaaS · v2.0
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {filteredTenants.length} de {tenants.length} empresas
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Modal de detalle */}
      {selectedTenantId && (
        <AdminEmpresaDetalle 
          tenantId={selectedTenantId} 
          onClose={() => setSelectedTenantId(null)} 
        />
      )}
    </>
  );
};

// ── METRIC CARD ──
const MetricCard = ({ icon: Icon, label, value, color = 'blue', large = false }) => {
  const colors = {
    purple:  { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500', border: 'border-emerald-100' },
    amber:   { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500', border: 'border-amber-100' },
    red:     { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500', border: 'border-red-100' },
    blue:    { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-100' },
    indigo:  { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-100' },
  };
  const c = colors[color] || colors.blue;

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
      className={`${c.bg} border ${c.border} rounded-xl p-3.5 shadow-sm transition-all`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-4 h-4 ${c.icon}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wide ${c.icon} opacity-70`}>{label}</span>
      </div>
      <p className={`${large ? 'text-xl' : 'text-lg'} font-black ${c.text}`}>{value}</p>
    </motion.div>
  );
};

const AdminAlertBell = ({ pagosPendientes, empresasPorVencer, empresasVencidas, onRefresh, onShowVencidas }) => {
  const totalAlertas = pagosPendientes + empresasPorVencer.length + empresasVencidas.length;
  const hasAlertas = totalAlertas > 0;
  const proximas = empresasPorVencer.slice(0, 4);
  const vencidas = empresasVencidas.slice(0, 4);

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${hasAlertas ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <div className={`px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${hasAlertas ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' : 'bg-gray-50 text-gray-700'}`}>
        <div className="flex items-center gap-3">
          <div className={`relative h-10 w-10 rounded-lg flex items-center justify-center ${hasAlertas ? 'bg-white/20' : 'bg-white border border-gray-200'}`}>
            <BellRing className={`h-5 w-5 ${hasAlertas ? 'text-white' : 'text-gray-500'}`} />
            {hasAlertas && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                {totalAlertas}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-wider">Campana de Administracion</p>
            <p className={`text-xs ${hasAlertas ? 'text-white/85' : 'text-gray-500'}`}>
              {hasAlertas ? 'Hay movimientos que requieren seguimiento.' : 'Sin pagos pendientes ni membresias urgentes.'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className={`h-8 text-xs font-bold ${hasAlertas ? 'text-white hover:bg-white/20' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-amber-100">
        <AlertSummary
          icon={CreditCard}
          title="Pagos por revisar"
          value={pagosPendientes}
          tone={pagosPendientes > 0 ? 'amber' : 'gray'}
          detail={pagosPendientes > 0 ? 'Comprobantes enviados por clientes.' : 'No hay pagos nuevos.'}
        />
        <AlertSummary
          icon={Clock}
          title="Por vencer"
          value={empresasPorVencer.length}
          tone={empresasPorVencer.length > 0 ? 'orange' : 'gray'}
          detail={
            proximas.length > 0
              ? proximas.map(t => `${t.nombre}: ${t.suscripcion?.dias_restantes || 0}d`).join(' | ')
              : 'Ninguna membresia vence en 3 dias.'
          }
        />
        <AlertSummary
          icon={AlertTriangle}
          title="Vencidas"
          value={empresasVencidas.length}
          tone={empresasVencidas.length > 0 ? 'red' : 'gray'}
          detail={
            vencidas.length > 0
              ? vencidas.map(t => t.nombre).join(' | ')
              : 'No hay empresas vencidas.'
          }
          onClick={empresasVencidas.length > 0 ? onShowVencidas : undefined}
        />
      </div>
    </div>
  );
};

const AlertSummary = ({ icon: Icon, title, value, detail, tone = 'gray', onClick }) => {
  const tones = {
    amber: 'text-amber-700 bg-amber-100',
    orange: 'text-orange-700 bg-orange-100',
    red: 'text-red-700 bg-red-100',
    gray: 'text-gray-500 bg-gray-100',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left p-4 bg-white ${onClick ? 'hover:bg-red-50 transition-colors cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tones[tone] || tones.gray}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">{title}</p>
            <span className="text-xl font-black text-gray-900">{value}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500 truncate">{detail}</p>
        </div>
      </div>
    </button>
  );
};

// ── PLAN BADGE ──
const PlanBadge = ({ plan, count, color }) => {
  const colors = {
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    purple:  'bg-purple-50 border-purple-200 text-purple-700',
  };
  const emojis = { TRIAL: '🟡', BASICO: '🔵', PRO: '🟢', ENTERPRISE: '🟣' };

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider">{emojis[plan]} {plan}</span>
        <span className="text-lg font-black">{count}</span>
      </div>
    </div>
  );
};

export default AdminDashboard;
