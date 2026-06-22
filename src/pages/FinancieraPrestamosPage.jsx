import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Receipt, DollarSign, RefreshCw } from 'lucide-react';
import NuevoPrestamoModal from '@/components/financiera/NuevoPrestamoModal';
import { usePanels } from '@/contexts/PanelContext';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

const ESTADO_BADGE = {
  activo: 'bg-emerald-100 text-emerald-700',
  saldado: 'bg-slate-200 text-slate-600',
  anulado: 'bg-red-100 text-red-700',
};

const FinancieraPrestamosPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [prestamos, setPrestamos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prestamos')
        .select('id, numero, tipo, monto_capital, plazo_cuotas, estado, fecha_inicio, cliente_id')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const ids = [...new Set((data || []).map((p) => p.cliente_id))];
      let mapaClientes = {};
      if (ids.length) {
        const { data: cls } = await supabase.from('clientes').select('id, nombre').in('id', ids);
        mapaClientes = Object.fromEntries((cls || []).map((c) => [c.id, c.nombre]));
      }
      setPrestamos((data || []).map((p) => ({ ...p, cliente_nombre: mapaClientes[p.cliente_id] || '—' })));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al cargar préstamos', description: e.message });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="p-4 md:p-6">
      <Helmet><title>Préstamos — Financiera</title></Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-600" /> Préstamos
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button variant="outline" onClick={() => openPanel('recibo-pago')}>
            <Receipt className="w-4 h-4 mr-1" /> Recibo de Pago
          </Button>
          <Button onClick={() => setNuevoOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo Préstamo
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-slate-500 text-xs">
            <tr>
              <th className="text-left p-3">Préstamo</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-right p-3">Monto</th>
              <th className="text-center p-3">Cuotas</th>
              <th className="text-left p-3">Inicio</th>
              <th className="text-center p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
            {!loading && prestamos.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">No hay préstamos. Crea el primero con "Nuevo Préstamo".</td></tr>
            )}
            {prestamos.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3 font-mono font-semibold">{p.numero}</td>
                <td className="p-3">{p.cliente_nombre}</td>
                <td className="p-3 capitalize">{p.tipo}</td>
                <td className="p-3 text-right">{fmt(p.monto_capital)}</td>
                <td className="p-3 text-center">{p.plazo_cuotas}</td>
                <td className="p-3">{p.fecha_inicio}</td>
                <td className="p-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${ESTADO_BADGE[p.estado] || 'bg-slate-100'}`}>{p.estado}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NuevoPrestamoModal
        isOpen={nuevoOpen}
        onClose={(created) => { setNuevoOpen(false); if (created) cargar(); }}
      />
    </div>
  );
};

export default FinancieraPrestamosPage;
