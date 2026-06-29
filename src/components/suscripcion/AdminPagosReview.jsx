import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, Building2, Check, X, Eye, Loader2,
  Clock, AlertTriangle, FileImage, ExternalLink,
  RefreshCw, Landmark, Hash, User, Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const AdminPagosReview = ({ onChanged }) => {
  const { toast } = useToast();
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [viewImage, setViewImage] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState({});
  const [showRejectForm, setShowRejectForm] = useState(null);

  const fetchPagos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_pagos_pendientes');
      if (error) throw error;
      setPagos(data || []);
    } catch (err) {
      console.error('Error fetching pagos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPagos(); }, [fetchPagos]);

  const handleAprobar = async (pagoId) => {
    if (!confirm('¿Confirma aprobar este pago y activar el plan?')) return;
    setProcessing(pagoId);
    try {
      const { error } = await supabase.rpc('admin_aprobar_pago', {
        p_pago_id: pagoId,
        p_notas: 'Comprobante verificado',
      });
      if (error) throw error;
      toast({ title: 'Pago Aprobado', description: 'El plan ha sido activado para la empresa.' });
      await fetchPagos();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setProcessing(null);
    }
  };

  const handleRechazar = async (pagoId) => {
    const motivo = motivoRechazo[pagoId]?.trim() || 'Comprobante no válido';
    setProcessing(pagoId);
    try {
      const { error } = await supabase.rpc('admin_rechazar_pago', {
        p_pago_id: pagoId,
        p_motivo: motivo,
      });
      if (error) throw error;
      toast({ title: 'Pago Rechazado', description: 'La empresa ha sido notificada.' });
      setShowRejectForm(null);
      await fetchPagos();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('es-DO', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
        <p className="text-sm text-gray-400 mt-2">Cargando pagos pendientes...</p>
      </div>
    );
  }

  if (pagos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-purple-500" />
            Pagos Pendientes de Revisión
          </h3>
          <Button variant="ghost" size="sm" onClick={fetchPagos} className="h-7 text-xs gap-1">
            <RefreshCw className="w-3 h-3" /> Actualizar
          </Button>
        </div>
        <div className="text-center py-6 text-gray-400 text-sm italic">
          No hay pagos pendientes de revisión
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 flex items-center justify-between">
        <h3 className="text-white font-black text-sm uppercase tracking-wider flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Pagos Pendientes ({pagos.length})
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchPagos} className="h-7 text-white hover:bg-white/20 text-xs gap-1">
          <RefreshCw className="w-3 h-3" /> Actualizar
        </Button>
      </div>

      {/* Pagos list */}
      <div className="divide-y divide-gray-100">
        {pagos.map((pago) => (
          <motion.div
            key={pago.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 hover:bg-gray-50/50 transition-colors"
          >
            {/* Top row */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                {pago.logo_url ? (
                  <img src={pago.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain border bg-white p-0.5" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center border border-purple-100">
                    <Building2 className="w-5 h-5 text-purple-400" />
                  </div>
                )}
                <div>
                  <p className="font-black text-sm text-gray-800">{pago.empresa_nombre}</p>
                  <p className="text-[10px] text-gray-400">{pago.empresa_email}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-black text-gray-900">RD${pago.monto?.toLocaleString()}</p>
                <div className="flex items-center justify-end gap-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-700">
                    {pago.plan_nombre}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    pago.ciclo === 'anual' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {pago.ciclo === 'anual' ? 'Anual' : 'Mensual'}
                  </span>
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <DetailItem icon={Hash} label="Referencia" value={pago.referencia || '—'} />
              <DetailItem icon={Landmark} label="Banco Origen" value={pago.banco_origen || '—'} />
              <DetailItem icon={User} label="Titular" value={pago.titular_cuenta || '—'} />
              <DetailItem icon={Clock} label="Fecha" value={formatDate(pago.created_at)} />
            </div>

            {/* Comprobante */}
            {pago.comprobante_url && (
              <div className="mb-4">
                <button
                  onClick={() => setViewImage(pago.comprobante_url)}
                  className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-2 text-xs font-bold text-blue-700 transition-colors"
                >
                  <FileImage className="w-4 h-4" />
                  Ver Comprobante
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Reject form */}
            <AnimatePresence>
              {showRejectForm === pago.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4"
                >
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-bold text-red-700">Motivo del rechazo:</p>
                    <Input
                      placeholder="Ej: Comprobante borroso, monto incorrecto, etc."
                      value={motivoRechazo[pago.id] || ''}
                      onChange={e => setMotivoRechazo(prev => ({ ...prev, [pago.id]: e.target.value }))}
                      className="h-8 text-xs border-red-200"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRechazar(pago.id)}
                        disabled={processing === pago.id}
                        className="h-7 text-xs font-bold gap-1"
                      >
                        {processing === pago.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                        Confirmar Rechazo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowRejectForm(null)}
                        className="h-7 text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => handleAprobar(pago.id)}
                disabled={processing === pago.id}
                className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs gap-1.5 px-4"
              >
                {processing === pago.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Aprobar Pago
              </Button>
              <Button
                onClick={() => setShowRejectForm(pago.id)}
                disabled={processing === pago.id}
                variant="outline"
                className="h-8 border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs gap-1.5 px-4"
              >
                <X className="w-3.5 h-3.5" />
                Rechazar
              </Button>
              {pago.comprobante_url && (
                <a
                  href={pago.comprobante_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto"
                >
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-gray-500">
                    <Eye className="w-3.5 h-3.5" />
                    Abrir en nueva pestaña
                  </Button>
                </a>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Image viewer modal */}
      <AnimatePresence>
        {viewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setViewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative max-w-3xl max-h-[85vh] w-full"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setViewImage(null)}
                className="absolute -top-10 right-0 text-white/80 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={viewImage}
                alt="Comprobante de pago"
                className="w-full h-full object-contain rounded-xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailItem = ({ icon: Icon, label, value }) => (
  <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
    <div className="flex items-center gap-1.5 mb-0.5">
      <Icon className="w-3 h-3 text-gray-400" />
      <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
    </div>
    <p className="text-xs font-bold text-gray-700 truncate">{value}</p>
  </div>
);

export default AdminPagosReview;
