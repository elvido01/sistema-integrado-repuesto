import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { 
  X, Building2, Users, Package, ShoppingCart, CreditCard, Calendar, 
  Loader2, FileText, TrendingUp, UserCog, Clock, DollarSign 
} from 'lucide-react';

const AdminEmpresaDetalle = ({ tenantId, onClose }) => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDetalle = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Intentar RPC primero
      const { data: result, error } = await supabase.rpc('admin_get_empresa_detalle', {
        p_tenant_id: tenantId
      });
      if (!error) {
        setData(result);
      } else {
        // Fallback: queries directas
        console.warn('RPC admin_get_empresa_detalle no disponible, usando fallback');
        
        const { data: empresa } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', tenantId)
          .single();

        const { data: usuarios } = await supabase
          .from('usuarios_empresas')
          .select('*, profiles:user_id(email, full_name, role)')
          .eq('tenant_id', tenantId);

        let suscripciones = [];
        const { data: subsData, error: subsErr } = await supabase
          .from('suscripciones')
          .select('*, planes(nombre, precio)')
          .eq('tenant_id', tenantId)
          .order('fecha_fin', { ascending: false });
        if (!subsErr) suscripciones = (subsData || []).map(s => ({
          plan: s.planes?.nombre || '—',
          precio: s.planes?.precio || 0,
          estado: s.estado,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
        }));

        setData({
          empresa: empresa || {},
          usuarios: (usuarios || []).map(u => ({
            user_id: u.user_id,
            rol: u.rol,
            email: u.profiles?.email,
            full_name: u.profiles?.full_name,
            role: u.profiles?.role,
            created_at: u.created_at,
          })),
          suscripciones,
          stats: {
            total_productos: 0,
            total_clientes: 0,
            total_facturas: 0,
            ventas_mes: 0,
            ventas_total: 0,
          },
        });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
    setLoading(false);
  }, [tenantId, toast]);

  useEffect(() => {
    fetchDetalle();
  }, [fetchDetalle]);

  if (!tenantId) return null;

  const formatCurrency = (val) => 
    new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

  const formatDate = (d) => 
    d ? new Date(d).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const statusBadge = (estado) => {
    const map = {
      activo:     'bg-emerald-100 text-emerald-700 border-emerald-200',
      trial:      'bg-amber-100 text-amber-700 border-amber-200',
      vencido:    'bg-red-100 text-red-700 border-red-200',
      cancelado:  'bg-gray-100 text-gray-600 border-gray-200',
      suspendido: 'bg-orange-100 text-orange-700 border-orange-200',
    };
    return map[estado] || map.vencido;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
            </div>
          ) : data ? (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-[#1a0a3a] to-[#3a1a5c] text-white px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  {data.empresa?.logo_url ? (
                    <img src={data.empresa.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white/10 border border-white/20 p-0.5" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-white/70" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-wider">{data.empresa?.nombre}</h2>
                    <p className="text-xs text-purple-200">{data.empresa?.email || 'Sin email'} · RNC: {data.empresa?.rnc || '—'}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-white/70" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatMini icon={Package} label="Productos" value={data.stats?.total_productos || 0} color="blue" />
                  <StatMini icon={Users} label="Clientes" value={data.stats?.total_clientes || 0} color="indigo" />
                  <StatMini icon={FileText} label="Facturas" value={data.stats?.total_facturas || 0} color="purple" />
                  <StatMini icon={TrendingUp} label="Ventas Mes" value={formatCurrency(data.stats?.ventas_mes)} color="emerald" />
                </div>

                {/* Ventas Total */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Ventas Totales Históricas</p>
                    <p className="text-2xl font-black text-purple-900">{formatCurrency(data.stats?.ventas_total)}</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-purple-200" />
                </div>

                {/* Suscripciones */}
                <div>
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> Historial de Suscripciones
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {(data.suscripciones || []).length > 0 ? (
                      data.suscripciones.map((s, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 text-xs">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusBadge(s.estado)}`}>
                              {s.estado}
                            </span>
                            <span className="font-bold text-gray-700">{s.plan}</span>
                          </div>
                          <div className="flex items-center gap-4 text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(s.fecha_inicio)} → {formatDate(s.fecha_fin)}
                            </span>
                            <span className="font-bold text-gray-700">{formatCurrency(s.precio)}/mes</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 italic p-3">Sin suscripciones registradas</p>
                    )}
                  </div>
                </div>

                {/* Usuarios */}
                <div>
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <UserCog className="w-3.5 h-3.5" /> Usuarios ({(data.usuarios || []).length})
                  </h3>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {(data.usuarios || []).map((u, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-[10px]">
                            {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-gray-700">{u.full_name || 'Sin nombre'}</p>
                            <p className="text-[10px] text-gray-400">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                            {u.rol}
                          </span>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {u.role}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Info empresa */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Información de la Empresa
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-gray-400 font-medium">Teléfono</p>
                      <p className="font-bold text-gray-700">{data.empresa?.telefono || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium">Dirección</p>
                      <p className="font-bold text-gray-700">{data.empresa?.direccion || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium">Fecha Registro</p>
                      <p className="font-bold text-gray-700">{formatDate(data.empresa?.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium">Estado</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                        data.empresa?.activo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'
                      }`}>
                        {data.empresa?.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-gray-400">No se encontraron datos</div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Mini stat card
const StatMini = ({ icon: Icon, label, value, color = 'blue' }) => {
  const colors = {
    blue:    'bg-blue-50 text-blue-600 border-blue-100',
    indigo:  'bg-indigo-50 text-indigo-600 border-indigo-100',
    purple:  'bg-purple-50 text-purple-600 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  };
  return (
    <div className={`rounded-xl p-3 border ${colors[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-60" />
        <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
};

export default AdminEmpresaDetalle;
