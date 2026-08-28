// ¿El OCR está aprendiendo o no?
//
// (2026-08-28) El dueño dijo "siento que no aprende". Para saberlo hubo que
// reconstruir a mano la comparación entre lo que la IA extrajo y lo que él
// guardó. Salieron cosas que nadie sabía, y todo estaba escrito desde hacía
// meses en extracted_json.
//
// Una medición que hay que reconstruir cada vez no se hace nunca. Esto la
// deja a un clic.
//
// >>> POR QUE EL PAQUETE VA EN SU PROPIA COLUMNA <<<
// Abrir una caja de 100 tornillos no es un error de la IA: ella leyó la
// factura bien. Contarlo como fallo hace ver mal a un suplidor que está
// bien, y además ya se corrige solo. Se enseña aparte para que se vea
// cuánto trabajo se quitó de encima.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, TrendingUp, Package, AlertTriangle } from 'lucide-react';

const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const num = (n) => Number(n || 0).toLocaleString('es-DO');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (ym) => {
  const [a, m] = String(ym || '').split('-');
  return `${MESES[Number(m) - 1] || m} ${String(a).slice(2)}`;
};

export default function PrecisionOcrModal({ open, onClose }) {
  const { toast } = useToast();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc('get_precision_ocr', { p_dias: 365 });
      if (error) throw error;
      setDatos(data);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo medir', description: e.message });
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => { if (open) cargar(); }, [open, cargar]);

  const t = datos?.total || {};
  const lineas = Number(t.lineas) || 0;
  const aMano = (Number(t.costo) || 0) + (Number(t.cantidad) || 0) + (Number(t.no_emparejo) || 0);
  const meses = datos?.por_mes || [];
  const mejorMes = Math.max(100, ...meses.map((m) => Number(m.pct_ok) || 0));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-morla-blue">
            <TrendingUp className="w-5 h-5" /> Precisión del OCR de facturas
          </DialogTitle>
        </DialogHeader>

        {cargando && (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-morla-blue" /></div>
        )}

        {!cargando && datos && (
          <div className="space-y-5">
            <p className="text-xs text-slate-500 -mt-2">
              Se compara, línea por línea, lo que la IA leyó de la foto contra lo que quedó
              guardado. Último año.
            </p>

            {/* El resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border rounded-lg overflow-hidden">
              <div className="bg-white p-3">
                <div className="text-2xl font-black text-emerald-600 tabular-nums">
                  {lineas ? pct(100 * (Number(t.ok) || 0) / lineas) : '—'}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Salió bien de una</div>
                <div className="text-xs text-slate-500">{num(t.ok)} de {num(lineas)} líneas</div>
              </div>
              <div className="bg-white p-3">
                <div className="text-2xl font-black text-blue-600 tabular-nums">{num(t.paquete)}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Paquetes abiertos</div>
                <div className="text-xs text-slate-500">no son fallos: ya se hace solo</div>
              </div>
              <div className="bg-white p-3">
                <div className="text-2xl font-black text-amber-600 tabular-nums">{num(aMano)}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Corregido a mano</div>
                <div className="text-xs text-slate-500">
                  {num(t.costo)} costo · {num(t.cantidad)} cantidad · {num(t.no_emparejo)} sin emparejar
                </div>
              </div>
              <div className="bg-white p-3">
                <div className="text-2xl font-black text-slate-700 tabular-nums">
                  {num(Number(datos.paquetes_aprendidos || 0) + Number(datos.codigos_aprendidos || 0))}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Cosas que ya sabe</div>
                <div className="text-xs text-slate-500">
                  {num(datos.paquetes_aprendidos)} paquetes · {num(datos.codigos_aprendidos)} códigos de suplidor
                </div>
              </div>
            </div>

            {/* La tendencia: es LA respuesta a "¿está aprendiendo?" */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">
                Mes a mes — si esta línea sube, está mejorando
              </h3>
              <div className="flex items-end gap-1.5 h-32 border-b border-l pl-2 pb-1">
                {meses.map((m) => (
                  <div key={m.mes} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${num(m.lineas)} líneas · ${num(m.a_mano)} a mano`}>
                    <span className="text-[10px] font-bold text-slate-600 tabular-nums">{pct(m.pct_ok)}</span>
                    <div
                      className="w-full bg-morla-blue/80 rounded-t"
                      style={{ height: `${Math.max(2, (Number(m.pct_ok) / mejorMes) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 pl-2 mt-1">
                {meses.map((m) => (
                  <div key={m.mes} className="flex-1 text-center text-[10px] text-slate-500">{nombreMes(m.mes)}</div>
                ))}
              </div>
            </div>

            {/* Quién da más trabajo */}
            {(datos.suplidores || []).length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">
                  Por suplidor — dónde se va el tiempo
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-[10px] uppercase text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-bold">Suplidor</th>
                        <th className="text-right px-3 py-1.5 font-bold">Líneas</th>
                        <th className="text-right px-3 py-1.5 font-bold">Bien de una</th>
                        <th className="text-right px-3 py-1.5 font-bold">Paquete</th>
                        <th className="text-right px-3 py-1.5 font-bold">A mano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.suplidores.map((s) => (
                        <tr key={s.suplidor} className="border-t">
                          <td className="px-3 py-1.5 truncate max-w-[220px]">{s.suplidor}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{num(s.lineas)}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${Number(s.pct_ok) >= 90 ? 'text-emerald-600' : Number(s.pct_ok) >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                            {pct(s.pct_ok)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-blue-600">{num(s.paquete)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-bold">{num(s.a_mano)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lo que no vio. Pesa más que un precio mal leído. */}
            {Number(datos.lineas_perdidas) > 0 && (
              <div className="flex gap-2 items-start border rounded-lg p-3 bg-amber-50 border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700">
                  <b>{num(datos.lineas_perdidas)} líneas</b> están en compras guardadas y no salieron
                  de la foto. Solo cuentan las que tampoco aparecen en el texto crudo y cuyo código no
                  conocemos todavía: si el suplidor la llama de otra forma y ya lo aprendimos, no falta.
                </p>
              </div>
            )}

            <div className="flex gap-2 items-start border rounded-lg p-3 bg-slate-50">
              <Package className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600">
                Los <b>paquetes</b> no cuentan como fallo: la IA leyó bien la factura y lo que cambia
                es abrir la caja a unidades. Eso ya se hace solo, y el importe de la línea no cambia.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
