// Super Admin → Facturas de MotoFlow (24/11/2026): las últimas emitidas,
// reimprimir, anular y los datos del emisor. Se factura desde el botón
// de recibo de cada empresa en la tabla de abajo.
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Printer, Receipt, UserCog, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { fmtRD, imprimirFacturaMotoflow } from '@/lib/facturaMotoflow';
import { EmisorForm } from './FacturarMembresiaDialog';

export default function AdminFacturasMotoflow({ recargar }) {
  const { toast } = useToast();
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [emisor, setEmisor] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('mf_facturas_lista', { p_tenant_id: null, p_limite: 100 });
    setCargando(false);
    if (error) { toast({ variant: 'destructive', title: 'No cargaron las facturas', description: error.message }); return; }
    setFacturas(data || []);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar, recargar]);

  const abrirEmisor = async () => {
    const { data, error } = await supabase.rpc('mf_emisor');
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    setEmisor(data || {});
  };

  const anular = async (f) => {
    const motivo = window.prompt(`Motivo para anular ${f.numero_txt}:`);
    if (!motivo || !motivo.trim()) return;
    const { error } = await supabase.rpc('mf_factura_anular', { p_id: f.id, p_motivo: motivo.trim() });
    if (error) { toast({ variant: 'destructive', title: 'No se anuló', description: error.message }); return; }
    toast({ title: `${f.numero_txt} anulada`, description: 'La membresía no se tocó; si el pago fue un error corrígelo en la empresa.' });
    cargar();
  };

  const imprimir = (f) => {
    if (!imprimirFacturaMotoflow(f)) toast({ variant: 'destructive', title: 'El navegador bloqueó la ventana', description: 'Permita ventanas emergentes y vuelva a intentar.' });
  };

  // Mes en hora local (RD = UTC-4): comparar el texto UTC movía las de la noche al mes siguiente.
  const hoy = new Date();
  const esDelMes = (x) => { const d = new Date(x); return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth(); };
  const delMes = facturas.filter((f) => f.estado === 'emitida' && esDelMes(f.fecha));
  const totalMes = delMes.reduce((s, f) => s + Number(f.total || 0), 0);
  const descMes = delMes.reduce((s, f) => s + Number(f.descuento || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-2 font-bold text-gray-800">
          <Receipt className="w-5 h-5 text-blue-600" />Facturas MotoFlow
          <span className="text-xs font-normal text-gray-500">este mes: {delMes.length} · RD$ {fmtRD(totalMes)}{descMes > 0 ? ` · descuentos RD$ ${fmtRD(descMes)}` : ''}</span>
          {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <Button variant="outline" size="sm" onClick={abrirEmisor}><UserCog className="w-4 h-4 mr-1" />Mis datos de emisor</Button>
      </div>

      {abierto && (
        <div className="border-t border-gray-100 overflow-x-auto">
          {cargando ? <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            : facturas.length === 0 ? <p className="p-4 text-sm text-gray-500">Todavía no hay facturas. Usa el botón de recibo de una empresa para facturar.</p>
            : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase text-gray-500">
                  <th className="px-4 py-2">Número</th><th>Fecha</th><th>Cliente</th><th>Plan</th>
                  <th className="text-right">Descuento</th><th className="text-right">Total</th><th>NCF</th><th></th>
                </tr></thead>
                <tbody>
                  {facturas.map((f) => (
                    <tr key={f.id} className={`border-t border-gray-100 ${f.estado === 'anulada' ? 'text-gray-400 line-through' : ''}`}>
                      <td className="px-4 py-2 font-mono">{f.numero_txt}</td>
                      <td>{new Date(f.fecha).toLocaleDateString('es-DO')}</td>
                      <td className="max-w-[220px] truncate" title={f.cliente_nombre}>{f.cliente_nombre}</td>
                      <td>{f.plan_nombre} · {f.meses}m</td>
                      <td className="text-right tabular-nums" title={f.motivo_descuento || ''}>{Number(f.descuento) > 0 ? fmtRD(f.descuento) : '—'}</td>
                      <td className="text-right tabular-nums font-bold">{fmtRD(f.total)}</td>
                      <td className="font-mono text-xs">{f.ncf || '—'}</td>
                      <td className="whitespace-nowrap pr-3 text-right no-underline">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Imprimir" onClick={() => imprimir(f)}><Printer className="w-3.5 h-3.5" /></Button>
                        {f.estado === 'emitida' && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" title="Anular" onClick={() => anular(f)}><XCircle className="w-3.5 h-3.5" /></Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {emisor && (
        <Dialog open onOpenChange={(o) => { if (!o) setEmisor(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Mis datos de emisor</DialogTitle></DialogHeader>
            <EmisorForm inicial={emisor} onGuardado={() => setEmisor(null)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
