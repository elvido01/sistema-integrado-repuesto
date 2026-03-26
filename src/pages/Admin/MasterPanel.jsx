import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Shield, Loader2, Building2, Calendar, Zap, RefreshCw, Users, Activity } from 'lucide-react';

const MasterPanel = () => {
  const { toast } = useToast();
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchTenants = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTenants(data || []);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los tenants: ' + err.message });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const calcTrialDays = (endDate) => {
    if (!endDate) return 0;
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const handleToggleFeature = async (tenantId, feature, value) => {
    setUpdatingId(tenantId);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ [feature]: value, updated_at: new Date().toISOString() })
        .eq('id', tenantId);
      if (error) throw error;
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, [feature]: value } : t));
      toast({ title: '✅ Actualizado', description: `${feature} ${value ? 'activado' : 'desactivado'}.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setUpdatingId(null);
  };

  const handleChangePlan = async (tenantId, newPlan) => {
    setUpdatingId(tenantId);
    try {
      const updateData = { plan: newPlan, updated_at: new Date().toISOString() };
      // If switching to trial, set trial dates
      if (newPlan === 'trial') {
        updateData.trial_start_date = new Date().toISOString().split('T')[0];
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);
        updateData.trial_end_date = trialEnd.toISOString().split('T')[0];
      } else {
        updateData.trial_end_date = '2099-12-31';
      }

      const { error } = await supabase.from('tenants').update(updateData).eq('id', tenantId);
      if (error) throw error;

      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, ...updateData } : t));
      toast({ title: '✅ Plan cambiado', description: `Empresa cambiada a plan "${newPlan}".` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setUpdatingId(null);
  };

  const handleToggleActive = async (tenantId, value) => {
    setUpdatingId(tenantId);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ activo: value, updated_at: new Date().toISOString() })
        .eq('id', tenantId);
      if (error) throw error;
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, activo: value } : t));
      toast({ title: value ? '✅ Activado' : '⛔ Desactivado', description: `Empresa ${value ? 'activada' : 'desactivada'}.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setUpdatingId(null);
  };

  return (
    <>
      <Helmet><title>Master Panel - SuperAdmin</title></Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full"
      >
        <div className="bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1a0a3a] to-[#3a1a5c] text-white px-6 py-4 flex items-center gap-3">
            <Shield className="w-7 h-7 text-yellow-400" />
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider">Master Panel</h1>
              <p className="text-xs text-purple-200 italic">Control centralizado de empresas (tenants)</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs bg-white/10 px-3 py-1.5 rounded-full">
                <Users className="w-3 h-3" />
                <span className="font-bold">{tenants.length} Empresa{tenants.length !== 1 ? 's' : ''}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10"
                onClick={fetchTenants}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200">
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">Total Empresas</div>
              <div className="text-2xl font-black text-[#1a0a3a]">{tenants.length}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">Plan Pro</div>
              <div className="text-2xl font-black text-green-600">{tenants.filter(t => t.plan === 'pro').length}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">En Trial</div>
              <div className="text-2xl font-black text-orange-600">{tenants.filter(t => t.plan === 'trial').length}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">Activas</div>
              <div className="text-2xl font-black text-blue-600">{tenants.filter(t => t.activo).length}</div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[#1a0a3a]/5">
                  <TableRow>
                    <TableHead className="text-[11px] font-black uppercase">Empresa</TableHead>
                    <TableHead className="text-[11px] font-black uppercase">RNC</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-center">Plan</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-center">Trial Días</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-center">Activa</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-center">Carta Ruta</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-center">Cobranzas</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-center">Cot. Magna</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map(tenant => {
                    const trialDays = calcTrialDays(tenant.trial_end_date);
                    const isUpdating = updatingId === tenant.id;

                    return (
                      <TableRow key={tenant.id} className="h-12 hover:bg-purple-50/30 transition-colors border-b">
                        {/* Name + Logo */}
                        <TableCell className="font-bold text-sm">
                          <div className="flex items-center gap-2">
                            {tenant.logo_url ? (
                              <img src={tenant.logo_url} alt="" className="w-8 h-8 rounded object-contain border border-gray-200 bg-white" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div>
                              <div className="font-black text-[13px] text-gray-800">{tenant.nombre}</div>
                              <div className="text-[10px] text-gray-400">{tenant.email || 'Sin email'}</div>
                            </div>
                          </div>
                        </TableCell>

                        {/* RNC */}
                        <TableCell className="text-xs font-mono font-bold text-gray-600">{tenant.rnc || '---'}</TableCell>

                        {/* Plan */}
                        <TableCell className="text-center">
                          <Select
                            value={tenant.plan}
                            onValueChange={(val) => handleChangePlan(tenant.id, val)}
                            disabled={isUpdating}
                          >
                            <SelectTrigger className="h-7 w-28 mx-auto text-[10px] font-bold border-gray-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="trial">🟡 Trial</SelectItem>
                              <SelectItem value="pro">🟢 Pro</SelectItem>
                              <SelectItem value="enterprise">🔵 Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Trial Days */}
                        <TableCell className="text-center">
                          {tenant.plan === 'trial' ? (
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-black ${
                              trialDays <= 3 ? 'bg-red-100 text-red-700' : trialDays <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                            }`}>
                              <Calendar className="w-3 h-3" />
                              {trialDays} días
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">N/A</span>
                          )}
                        </TableCell>

                        {/* Active Toggle */}
                        <TableCell className="text-center">
                          <Switch
                            checked={tenant.activo}
                            onCheckedChange={(val) => handleToggleActive(tenant.id, val)}
                            disabled={isUpdating}
                            className="data-[state=checked]:bg-green-500"
                          />
                        </TableCell>

                        {/* Feature: Carta Ruta */}
                        <TableCell className="text-center">
                          <Switch
                            checked={tenant.feat_carta_ruta}
                            onCheckedChange={(val) => handleToggleFeature(tenant.id, 'feat_carta_ruta', val)}
                            disabled={isUpdating}
                            className="data-[state=checked]:bg-blue-500"
                          />
                        </TableCell>

                        {/* Feature: Cobranzas */}
                        <TableCell className="text-center">
                          <Switch
                            checked={tenant.feat_cobranzas}
                            onCheckedChange={(val) => handleToggleFeature(tenant.id, 'feat_cobranzas', val)}
                            disabled={isUpdating}
                            className="data-[state=checked]:bg-blue-500"
                          />
                        </TableCell>

                        {/* Feature: Cotizaciones Magna */}
                        <TableCell className="text-center">
                          <Switch
                            checked={tenant.feat_cotizaciones_magna}
                            onCheckedChange={(val) => handleToggleFeature(tenant.id, 'feat_cotizaciones_magna', val)}
                            disabled={isUpdating}
                            className="data-[state=checked]:bg-blue-500"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase font-bold">
              <Activity className="w-3 h-3" />
              Sistema SaaS Multi-Tenant — Fase 1
            </div>
            <div className="text-[10px] text-gray-400">
              SuperAdmin: elvidocaminero@gmail.com
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default MasterPanel;
