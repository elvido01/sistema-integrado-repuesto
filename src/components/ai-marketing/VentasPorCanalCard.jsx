// ============================================================
// VentasPorCanalCard.jsx — De lo que facturé, ¿cuánto vino de cada canal?
// ------------------------------------------------------------
// (2026-08-19) El resto de esta pestaña mide IMPACTO ESTIMADO: compara las
// unidades vendidas antes y después de publicar y de ahí deduce. Es lo mejor
// que se podía hacer sin un hilo entre la conversación y la factura, pero es
// una deducción, y el propio módulo lo advierte al pie.
//
// Esta tarjeta es lo contrario: no deduce nada. Por eso puede decir pesos y
// no "score".
//
// (2026-08-20) El canal ya no lo marca nadie a mano. Se pidió un día con
// ocho botones en el pie de Facturación y se quitó: en el mostrador cada
// clic cuesta. Ahora sale de la cotización cuando la venta viene del Sales
// Hub, y lo demás es la tienda. Un dato que nadie teclea no miente; un
// desplegable con "Tienda" de primero, a los tres días, sí.
//
// "Sin anotar" se sigue enseñando, pero ya no mide una costumbre: son las
// facturas anteriores al 20/08/2026, cuando el campo no existía. Se muestran
// porque un reporte que esconde su propio hueco no sirve para decidir.
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Radio } from 'lucide-react';
import { nombreCanal, emojiCanal } from '@/lib/canalesOrigen';

const pesos = (n) => Number(n || 0).toLocaleString('es-DO', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const hoyISO = () => new Date().toLocaleDateString('en-CA'); // local, no UTC
const primeroDeMesISO = () => hoyISO().slice(0, 8) + '01';

export default function VentasPorCanalCard() {
  const [desde, setDesde] = useState(primeroDeMesISO);
  const [hasta, setHasta] = useState(hoyISO);
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_ventas_por_canal', {
        p_desde: desde, p_hasta: hasta,
      });
      if (err) throw err;
      setFilas(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'No se pudo cargar');
      setFilas([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  // El total que sirve de base para los porcentajes incluye lo no anotado:
  // dividir solo entre lo atribuido inflaría cada canal y haría creer que se
  // tiene la foto completa cuando falta un pedazo.
  const totalGeneral = filas.reduce((s, f) => s + Number(f.total || 0), 0);
  const atribuido = filas.filter(f => f.canal !== 'sin_anotar')
                         .reduce((s, f) => s + Number(f.total || 0), 0);
  const sinAnotar = totalGeneral - atribuido;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Radio className="h-5 w-5 text-violet-600" /> De dónde vino la venta
        </h3>
        <div className="flex items-center gap-1">
          <Input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                 className="h-8 w-[140px] text-xs" />
          <span className="text-xs text-slate-400">a</span>
          <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                 className="h-8 w-[140px] text-xs" />
          <Button size="sm" variant="outline" onClick={cargar} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {!loading && filas.length === 0 && !error && (
        <p className="text-sm text-slate-500 py-6 text-center">
          No hay facturas en ese rango.
        </p>
      )}

      {filas.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase text-slate-500 border-b border-slate-200">
                  <th className="text-left font-bold py-1.5">Canal</th>
                  <th className="text-right font-bold py-1.5">Facturas</th>
                  <th className="text-right font-bold py-1.5">Clientes</th>
                  <th className="text-right font-bold py-1.5">Ticket prom.</th>
                  <th className="text-right font-bold py-1.5">Total</th>
                  <th className="text-right font-bold py-1.5 w-[90px]">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const sinAnotar = f.canal === 'sin_anotar';
                  const pct = totalGeneral > 0 ? (Number(f.total || 0) / totalGeneral) * 100 : 0;
                  return (
                    <tr key={f.canal}
                        className={`border-b border-slate-100 ${sinAnotar ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                      <td className="py-1.5 font-semibold whitespace-nowrap">
                        <span className="mr-1">{emojiCanal(f.canal === 'sin_anotar' ? null : f.canal)}</span>
                        {nombreCanal(f.canal === 'sin_anotar' ? null : f.canal)}
                      </td>
                      <td className="text-right py-1.5">{f.facturas}</td>
                      <td className="text-right py-1.5">{f.clientes}</td>
                      <td className="text-right py-1.5">{pesos(f.ticket_promedio)}</td>
                      <td className="text-right py-1.5 font-bold">{pesos(f.total)}</td>
                      <td className="py-1.5 pl-2">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="h-1.5 w-10 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${sinAnotar ? 'bg-slate-300' : 'bg-violet-500'}`}
                                 style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums w-9 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Decir de dónde sale cada número es lo que lo hace usable: sin
              esto, "Tienda" con el 90% parecería un hallazgo cuando en
              realidad es el cajón donde cae todo lo que no vino cotizado. */}
          <p className="text-[11px] text-slate-500 mt-2">
            El canal sale de la cotización cuando la venta viene del Sales Hub.
            Todo lo demás cuenta como <b>Tienda</b>: nadie lo teclea al facturar.
            {sinAnotar > 0 && (
              <> Las <b>RD$ {pesos(sinAnotar)}</b> sin anotar son facturas anteriores
              al 20/08/2026, cuando el campo todavía no existía.</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
