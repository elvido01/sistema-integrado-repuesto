// ============================================================
// EfectividadPublicaciones — ¿qué publicación vende?
// ============================================================
// (10/10/2026) El dueño subió el presupuesto de IA a US$20/mes y quiere
// dedicar el esfuerzo a lo que vende. Por cada promoción: lo que costó, el
// alcance (Metricool) y las ventas de ESA pieza 7 días antes vs 7 días
// después de publicarla (rpc efectividad_publicaciones). No depende de que
// el cliente diga un código: funciona con o sin descuento.
// Solo con config_empresa.feat_medicion_publicaciones (hoy: Repuestos Morla).
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { BarChart3, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const rd = (n) => `RD$${Math.round(Number(n) || 0).toLocaleString('es-DO')}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-DO');

// Lectura de una fila: cómo le fue a la pieza después de publicarla.
function efecto(r) {
  const dias = Number(r.dias_despues) || 0;
  if (dias < 3) return { txt: 'Muy pronto', cls: 'bg-slate-100 text-slate-500' };
  const a = Number(r.uds_dia_antes) || 0;
  const d = Number(r.uds_dia_despues) || 0;
  if (a === 0 && d === 0) return { txt: 'Sin ventas', cls: 'bg-slate-100 text-slate-600' };
  if (d > a * 1.2) return { txt: 'Subió', cls: 'bg-emerald-100 text-emerald-700' };
  if (d < a * 0.8) return { txt: 'Bajó', cls: 'bg-red-100 text-red-700' };
  return { txt: 'Igual', cls: 'bg-amber-50 text-amber-700' };
}

export function EfectividadPublicaciones() {
  const { empresa } = useAuth();
  const activo = !!empresa?.feat_medicion_publicaciones;
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    supabase.rpc('efectividad_publicaciones', { p_dias: 60 }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError(e.message); else setFilas(data || []);
    });
    return () => { vivo = false; };
  }, [activo]);

  const resumen = useMemo(() => {
    if (!filas?.length) return null;
    const medibles = filas.filter((r) => Number(r.dias_despues) >= 3);
    const porGrupo = (clave) => {
      const g = {};
      for (const r of medibles) {
        const k = clave(r);
        g[k] ||= { n: 0, subio: 0, extra: 0, alcance: 0, costo: 0 };
        g[k].n += 1;
        if (efecto(r).txt === 'Subió') g[k].subio += 1;
        g[k].extra += (Number(r.ventas_despues) || 0) - (Number(r.ventas_antes) || 0);
        g[k].alcance += Number(r.alcance) || 0;
        g[k].costo += Number(r.costo_ia_usd) || 0;
      }
      return g;
    };
    return {
      costo: filas.reduce((s, r) => s + (Number(r.costo_ia_usd) || 0), 0),
      alcanceProm: Math.round(filas.reduce((s, r) => s + (Number(r.alcance) || 0), 0) / filas.length),
      medibles: medibles.length,
      subieron: medibles.filter((r) => efecto(r).txt === 'Subió').length,
      porDescuento: porGrupo((r) => (r.con_descuento ? 'Con descuento' : 'Sin descuento')),
      porFormato: porGrupo((r) => (r.formato === 'reel' ? 'Reel' : 'Imagen')),
    };
  }, [filas]);

  if (!activo) return null;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className="mb-2 flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <BarChart3 className="h-4 w-4 text-violet-600" />
          ¿Qué publicación vende?
        </span>
        <span className="flex-1 text-[11px] text-slate-500">
          Ventas de la pieza 7 días antes vs 7 días después de publicarla, con lo que costó y su alcance.
          Últimos 60 días.
        </span>
        {abierto ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {abierto && (
        <>
          {error && <p className="text-xs text-red-700">No se pudo cargar: {error}</p>}
          {!filas && !error && (
            <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Calculando…</p>
          )}
          {filas && !filas.length && <p className="text-xs text-slate-500">Aún no hay promociones publicadas en estos 60 días.</p>}

          {resumen && (
            <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-slate-500">Promociones</p>
                <p className="text-base font-bold text-slate-800">{filas.length}</p>
                <p className="text-slate-500">IA estimada: US${resumen.costo.toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-slate-500">Alcance promedio</p>
                <p className="text-base font-bold text-slate-800">{num(resumen.alcanceProm)}</p>
                <p className="text-slate-500">personas por promoción</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-slate-500">Subieron las ventas</p>
                <p className="text-base font-bold text-slate-800">{resumen.subieron} de {resumen.medibles}</p>
                <p className="text-slate-500">con 3+ días para medir</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="mb-0.5 text-slate-500">Por tipo (subieron / medidas)</p>
                {[...Object.entries(resumen.porDescuento), ...Object.entries(resumen.porFormato)].map(([k, g]) => (
                  <p key={k} className="text-slate-700"><b>{k}:</b> {g.subio}/{g.n} · {g.extra >= 0 ? '+' : ''}{rd(g.extra)}</p>
                ))}
              </div>
            </div>
          )}

          {!!filas?.length && (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-white text-left text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">Fecha</th>
                    <th className="py-1 pr-2">Pieza</th>
                    <th className="py-1 pr-2">Tipo</th>
                    <th className="py-1 pr-2 text-right">Alcance</th>
                    <th className="py-1 pr-2 text-right">Vistas</th>
                    <th className="py-1 pr-2 text-right">Interacc.</th>
                    <th className="py-1 pr-2 text-right">Uds/día antes → después</th>
                    <th className="py-1 pr-2 text-right">Vendido antes → después</th>
                    <th className="py-1">Efecto</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r) => {
                    const e = efecto(r);
                    return (
                      <tr key={r.bundle_id} className="border-t border-slate-100">
                        <td className="py-1 pr-2 whitespace-nowrap">{new Date(r.publicado_at).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit' })}</td>
                        <td className="py-1 pr-2" title={r.codigo}>{r.descripcion}</td>
                        <td className="py-1 pr-2 whitespace-nowrap">
                          {r.formato === 'reel' ? 'Reel' : 'Imagen'}
                          <span className={`ml-1 rounded px-1 ${r.con_descuento ? 'bg-amber-50 text-amber-700' : 'text-slate-400'}`}>
                            {r.con_descuento ? `5%${r.codigo_promo ? ` #${r.codigo_promo}` : ''}` : 'sin desc.'}
                          </span>
                        </td>
                        <td className="py-1 pr-2 text-right">{num(r.alcance)}</td>
                        <td className="py-1 pr-2 text-right">{num(r.vistas)}</td>
                        <td className="py-1 pr-2 text-right">{num(r.interacciones)}</td>
                        <td className="py-1 pr-2 text-right whitespace-nowrap">{Number(r.uds_dia_antes).toFixed(2)} → {Number(r.uds_dia_despues).toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right whitespace-nowrap">{rd(r.ventas_antes)} → {rd(r.ventas_despues)}</td>
                        <td className="py-1"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.cls}`}>{e.txt}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[10px] text-slate-400">
            "Subió" = más de 20% de unidades por día después de publicar. Con pocas ventas por pieza, una sola venta mueve
            mucho el número: hay que mirar varias semanas antes de sacar conclusiones.
          </p>
        </>
      )}
    </div>
  );
}
