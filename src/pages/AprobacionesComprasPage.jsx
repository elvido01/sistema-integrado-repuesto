import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, FileText, User } from 'lucide-react';

const TABS = [
  { key: 'pendiente',     label: 'Pendientes',     color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'aprobada',      label: 'Aprobadas',      color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { key: 'rechazada',     label: 'Rechazadas',     color: 'bg-red-100 text-red-800 border-red-300' },
  { key: 'reasignaciones', label: 'Reasignaciones', color: 'bg-blue-100 text-blue-800 border-blue-300' },
];

const formatRD = (n) => `RD$ ${(Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (s) => s ? new Date(s).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function AprobacionesComprasPage() {
  const { toast } = useToast();
  const { tenantId, user } = useAuth();
  const [tab, setTab] = useState('pendiente');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conteos, setConteos] = useState({ pendiente: 0, aprobada: 0, rechazada: 0 });

  const [accionModal, setAccionModal] = useState(null);    // { tipo: 'aprobar'|'rechazar', row }
  const [comentario, setComentario] = useState('');
  const [procesando, setProcesando] = useState(false);

  // Cargar conteos por estado (para badges en tabs)
  const fetchConteos = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [p, a, r] = await Promise.all([
        supabase.from('compras_aprobaciones').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estado', 'pendiente'),
        supabase.from('compras_aprobaciones').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estado', 'aprobada'),
        supabase.from('compras_aprobaciones').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estado', 'rechazada'),
      ]);
      setConteos({ pendiente: p.count || 0, aprobada: a.count || 0, rechazada: r.count || 0 });
    } catch (_) { /* silencioso */ }
  }, [tenantId]);

  useEffect(() => { fetchConteos(); }, [fetchConteos]);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      if (tab === 'reasignaciones') {
        // Cargamos la tabla y los nombres de suplidores en paralelo
        const { data: reasigData, error } = await supabase
          .from('presupuesto_reasignaciones')
          .select('id, mes, monto_movido, razon, algoritmo, created_at, desde_suplidor, hacia_suplidor')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;

        // Mapear ids -> nombres
        const ids = new Set();
        (reasigData || []).forEach(r => { if (r.desde_suplidor) ids.add(r.desde_suplidor); if (r.hacia_suplidor) ids.add(r.hacia_suplidor); });
        let nombreMap = new Map();
        if (ids.size > 0) {
          const { data: provs } = await supabase
            .from('proveedores')
            .select('id, nombre')
            .in('id', Array.from(ids));
          (provs || []).forEach(p => nombreMap.set(p.id, p.nombre));
        }
        setRows((reasigData || []).map(r => ({
          ...r,
          desde: { nombre: nombreMap.get(r.desde_suplidor) || '—' },
          hacia: { nombre: nombreMap.get(r.hacia_suplidor) || '—' },
        })));
      } else {
        const { data, error } = await supabase
          .from('compras_aprobaciones')
          .select(`
            id, orden_id, monto, presupuesto_dispo, motivo_gate, razon_solicitante,
            estado, comentario_supervisor, created_at, resuelta_at,
            solicitante_id, supervisor_id,
            orden:ordenes_compra(numero, fecha_orden, suplidor_id, total, suplidor:proveedores(nombre))
          `)
          .eq('tenant_id', tenantId)
          .eq('estado', tab)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setRows(data || []);
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, tab, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAccion = async () => {
    if (!accionModal) return;
    if (accionModal.tipo === 'rechazar' && (!comentario || comentario.trim().length < 3)) {
      toast({ variant: 'destructive', title: 'Falta razón', description: 'El comentario al rechazar debe tener al menos 3 caracteres.' });
      return;
    }
    setProcesando(true);
    try {
      const rpc = accionModal.tipo === 'aprobar' ? 'aprobar_orden_compra' : 'rechazar_orden_compra';
      const { error } = await supabase.rpc(rpc, {
        p_aprobacion_id: accionModal.row.id,
        p_comentario: comentario || null,
      });
      if (error) throw error;
      toast({
        title: accionModal.tipo === 'aprobar' ? '✅ Aprobada' : '🚫 Rechazada',
        description: `Orden ${accionModal.row.orden?.numero || ''} actualizada.`,
      });
      setAccionModal(null);
      setComentario('');
      fetchData();
      fetchConteos();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <>
      <Helmet><title>Aprobaciones de Compras</title></Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-50 min-h-full"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800">Cola de Aprobaciones</h1>
              <p className="text-[11px] text-slate-500">Órdenes de compra que requieren autorización de supervisor.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refrescar
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 border-b border-slate-200">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = conteos[t.key];
            const badgeCls = t.key === 'pendiente' && count > 0
              ? 'bg-amber-500 text-white animate-pulse'
              : 'bg-slate-200 text-slate-700';
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                  active ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label.toUpperCase()}
                {count !== undefined && count > 0 && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${badgeCls}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {tab === 'reasignaciones'
                ? 'Sin reasignaciones aún. El cron semanal mueve presupuesto entre suplidores subutilizados/sobreutilizados.'
                : <>No hay órdenes en estado <b>{tab}</b>.</>}
            </div>
          ) : tab === 'reasignaciones' ? (
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="text-[10px] uppercase">Fecha</TableHead>
                  <TableHead className="text-[10px] uppercase">Mes</TableHead>
                  <TableHead className="text-[10px] uppercase">Desde suplidor</TableHead>
                  <TableHead className="text-[10px] uppercase">Hacia suplidor</TableHead>
                  <TableHead className="text-right text-[10px] uppercase">Monto movido</TableHead>
                  <TableHead className="text-[10px] uppercase">Razón</TableHead>
                  <TableHead className="text-[10px] uppercase">Algoritmo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] text-slate-500">{formatDate(r.created_at)}</TableCell>
                    <TableCell className="text-xs font-mono">{r.mes?.slice(0, 7)}</TableCell>
                    <TableCell className="text-xs">
                      <span className="text-red-700">↓</span> {r.desde?.nombre || '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="text-emerald-700">↑</span> {r.hacia?.nombre || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-black text-blue-700">
                      {formatRD(r.monto_movido)}
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-600 italic">{r.razon}</TableCell>
                    <TableCell className="text-[9px] uppercase text-slate-400 font-mono">{r.algoritmo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="text-[10px] uppercase">Orden #</TableHead>
                  <TableHead className="text-[10px] uppercase">Suplidor</TableHead>
                  <TableHead className="text-right text-[10px] uppercase">Monto</TableHead>
                  <TableHead className="text-right text-[10px] uppercase">Disponible</TableHead>
                  <TableHead className="text-[10px] uppercase">Motivo</TableHead>
                  <TableHead className="text-[10px] uppercase">Razón</TableHead>
                  <TableHead className="text-[10px] uppercase">Solicitada</TableHead>
                  {tab !== 'pendiente' && <TableHead className="text-[10px] uppercase">Supervisor / Comentario</TableHead>}
                  {tab === 'pendiente' && <TableHead className="text-center text-[10px] uppercase">Acción</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const esPropio = r.solicitante_id && r.solicitante_id === user?.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-bold">{r.orden?.numero || '—'}</TableCell>
                      <TableCell className="text-xs">{r.orden?.suplidor?.nombre || '—'}</TableCell>
                      <TableCell className="text-right text-xs font-mono font-black">{formatRD(r.monto)}</TableCell>
                      <TableCell className="text-right text-xs font-mono text-slate-500">{formatRD(r.presupuesto_dispo)}</TableCell>
                      <TableCell className="text-[10px] uppercase">
                        <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-bold">
                          {r.motivo_gate?.replace('EXCEDE_', '')}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={r.razon_solicitante}>
                        {r.razon_solicitante || <em className="text-slate-400">—</em>}
                      </TableCell>
                      <TableCell className="text-[11px] text-slate-500">{formatDate(r.created_at)}</TableCell>
                      {tab !== 'pendiente' && (
                        <TableCell className="text-[11px]">
                          <p className="text-slate-500">{formatDate(r.resuelta_at)}</p>
                          {r.comentario_supervisor && (
                            <p className="text-slate-700 italic mt-0.5 max-w-[250px] truncate" title={r.comentario_supervisor}>
                              "{r.comentario_supervisor}"
                            </p>
                          )}
                        </TableCell>
                      )}
                      {tab === 'pendiente' && (
                        <TableCell className="text-center">
                          {esPropio ? (
                            <div className="flex items-center justify-center gap-1 text-[10px] text-amber-600">
                              <AlertTriangle className="w-3 h-3" /> Tu propia orden
                            </div>
                          ) : (
                            <div className="flex justify-center gap-1">
                              <Button
                                size="sm"
                                className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                                onClick={() => { setAccionModal({ tipo: 'aprobar', row: r }); setComentario(''); }}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Aprobar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 border-red-300 text-red-700 hover:bg-red-50 text-[10px] font-bold"
                                onClick={() => { setAccionModal({ tipo: 'rechazar', row: r }); setComentario(''); }}
                              >
                                <XCircle className="w-3 h-3 mr-1" /> Rechazar
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </motion.div>

      {/* Modal accion */}
      <Dialog open={!!accionModal} onOpenChange={(open) => { if (!open) { setAccionModal(null); setComentario(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={accionModal?.tipo === 'aprobar' ? 'text-emerald-700' : 'text-red-700'}>
              {accionModal?.tipo === 'aprobar' ? '✅ Aprobar orden' : '🚫 Rechazar orden'}
            </DialogTitle>
            <DialogDescription>
              Orden <b>{accionModal?.row?.orden?.numero}</b> por <b>{formatRD(accionModal?.row?.monto)}</b>.
              {accionModal?.tipo === 'rechazar' && ' Debés explicar al solicitante por qué rechazás.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-[11px] uppercase font-bold">
              Comentario {accionModal?.tipo === 'rechazar' ? '(obligatorio)' : '(opcional)'}
            </Label>
            <Textarea
              rows={3}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder={accionModal?.tipo === 'aprobar'
                ? 'Ej: aprobada por necesidad operativa'
                : 'Ej: el suplidor X tiene precio mejor — usar ese'}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAccionModal(null); setComentario(''); }} disabled={procesando}>
              Cancelar
            </Button>
            <Button
              onClick={handleAccion}
              disabled={procesando}
              className={accionModal?.tipo === 'aprobar' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {procesando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {accionModal?.tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
