// =====================================================================
// Métricas del onboarding (20/11/2026) — Fase 6, solo superadmin
// ---------------------------------------------------------------------
// Lee admin_metricas_onboarding (sql/metricas_onboarding.sql):
//   * El indicador del dueño: % de empresas nuevas (con 7 días cumplidos)
//     que hicieron su primera venta en 7 días sin escribir por WhatsApp.
//   * El embudo: registradas → entraron → artículo → cliente → venta.
//   * Cada empresa nueva: plan, primeros pasos, días a la primera venta.
//   * Las guías: ofrecidas, empezadas, terminadas, dejadas, rotas.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Activity, Loader2, MessageCircle, RefreshCw, Target } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

const NOMBRE_GUIA = { vendedor: 'Crear un vendedor', producto: 'Crear un artículo', venta: 'Primera venta', compra: 'Primera compra' };
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) : '—');
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Barra({ titulo, valor, total }) {
  const p = pct(valor, total);
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="font-bold text-gray-700">{titulo}</span><span className="text-gray-500">{valor} de {total} · {p}%</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-blue-600" style={{ width: `${p}%` }} /></div>
    </div>
  );
}

const Si = ({ v, nulo = '—' }) => (v == null ? <span className="text-gray-400">{nulo}</span>
  : v ? <span className="font-bold text-emerald-700">Sí</span> : <span className="text-gray-400">No</span>);

export default function MetricasOnboardingPage() {
  const [dias, setDias] = useState(90);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    const { data, error: e } = await supabase.rpc('admin_metricas_onboarding', { p_dias: dias });
    if (e) setError(e.message); else setDatos(data);
    setCargando(false);
  }, [dias]);
  useEffect(() => { cargar(); }, [cargar]);

  const r = datos?.resumen || {};
  const empresas = datos?.empresas || [];
  const guias = datos?.guias || [];

  return (
    <div className="min-h-full bg-gray-100 p-4 md:p-6">
      <Helmet><title>Métricas del onboarding</title></Helmet>
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><Activity className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Métricas del onboarding</h1>
              <p className="text-xs text-gray-500">Empresas registradas en los últimos {dias} días</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[30, 90, 180].map((d) => (
              <button key={d} type="button" onClick={() => setDias(d)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${dias === d ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{d} días</button>
            ))}
            <button type="button" onClick={cargar} className="rounded-lg border border-gray-300 bg-white p-2" title="Actualizar">
              <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {cargando && !datos && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

        {datos && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm md:col-span-1">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-blue-700"><Target className="h-4 w-4" /> Tu indicador</div>
                {r.whatsapp_medible === false && (
                  <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">El WhatsApp de MotoFlow (809-769-5965) aún no está conectado al CRM: no se puede saber quién escribió. Mientras tanto el número cuenta solo las ventas en 7 días.</p>
                )}
                <div className="mt-2 text-4xl font-black text-gray-900">{r.indicador_pct == null ? '—' : `${r.indicador_pct}%`}</div>
                <p className="mt-1 text-xs text-gray-600">
                  {r.whatsapp_medible === false ? 'Primera venta en 7 días' : 'Primera venta en 7 días sin escribir por WhatsApp'}: <b>{(r.whatsapp_medible === false ? r.venta_7d : r.venta_7d_sin_whatsapp) || 0}</b> de <b>{r.maduras || 0}</b> empresas con 7 días cumplidos.
                </p>
                <p className="mt-2 text-[11px] text-gray-400">
                  Vendieron en 7 días: {r.venta_7d || 0} · te escribieron: {r.escribieron_7d || 0} · sin teléfono para saberlo: {r.venta_7d_sin_telefono || 0}.
                  "Escribir" = mensaje al WhatsApp de MotoFlow (809-769-5965) desde el teléfono que la empresa registró.
                </p>
              </div>
              <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:col-span-2">
                <div className="text-xs font-black uppercase text-gray-500">Dónde se quedan</div>
                <Barra titulo="Alguien entró" valor={r.entraron || 0} total={r.registradas || 0} />
                <Barra titulo="Creó un artículo" valor={r.con_producto || 0} total={r.registradas || 0} />
                <Barra titulo="Creó un cliente" valor={r.con_cliente || 0} total={r.registradas || 0} />
                <Barra titulo="Hizo una venta" valor={r.con_venta || 0} total={r.registradas || 0} />
                <p className="text-[11px] text-gray-400">{r.registradas || 0} registradas · {r.pausadas || 0} en pausa por inactividad</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b px-5 py-3 text-xs font-black uppercase text-gray-500">Guías paso a paso (usuarios)</div>
              {guias.length === 0 ? <p className="p-5 text-sm text-gray-500">Todavía nadie ha usado las guías en este período.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr><th className="px-4 py-2 text-left">Guía</th><th className="px-3 py-2 text-right">Ofrecida</th><th className="px-3 py-2 text-right">Empezada</th><th className="px-3 py-2 text-right">Terminada</th><th className="px-3 py-2 text-right">Dejada</th><th className="px-3 py-2 text-right" title="Un paso no encontró su botón en pantalla">Rota</th></tr>
                    </thead>
                    <tbody>
                      {guias.map((g) => (
                        <tr key={g.guia} className="border-t">
                          <td className="px-4 py-2 font-bold text-gray-800">{NOMBRE_GUIA[g.guia] || g.guia}</td>
                          <td className="px-3 py-2 text-right">{g.ofrecida}</td>
                          <td className="px-3 py-2 text-right">{g.iniciada}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-700">{g.completada}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{g.omitida}</td>
                          <td className={`px-3 py-2 text-right ${g.rota > 0 ? 'font-bold text-red-600' : 'text-gray-400'}`}>{g.rota}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b px-5 py-3 text-xs font-black uppercase text-gray-500">Empresas nuevas</div>
              {empresas.length === 0 ? <p className="p-5 text-sm text-gray-500">No hay empresas registradas en este período.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Empresa</th><th className="px-3 py-2 text-left">Plan</th><th className="px-3 py-2 text-left">Alta</th>
                        <th className="px-3 py-2 text-center">Entró</th><th className="px-3 py-2 text-center">Pasos</th><th className="px-3 py-2 text-right">1ª venta</th>
                        <th className="px-3 py-2 text-center" title="Escribió al WhatsApp de MotoFlow en sus primeros 7 días"><MessageCircle className="inline h-3.5 w-3.5" /></th>
                        <th className="px-3 py-2 text-left">Último uso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empresas.map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="px-4 py-2">
                            <div className="font-bold text-gray-800">{e.nombre}</div>
                            <div className="text-[11px] text-gray-400">{e.tipo || '—'} · {e.usuarios} usuario{e.usuarios === 1 ? '' : 's'}{e.pausada ? ' · EN PAUSA' : ''}</div>
                          </td>
                          <td className="px-3 py-2 text-xs">{e.plan || '—'}</td>
                          <td className="px-3 py-2 text-xs">{fecha(e.creada)}</td>
                          <td className="px-3 py-2 text-center"><Si v={e.entro} /></td>
                          <td className="px-3 py-2 text-center text-xs">{e.pasos_total ? `${e.pasos_hechos}/${e.pasos_total}` : '—'}</td>
                          <td className={`px-3 py-2 text-right text-xs ${e.venta_7d ? 'font-bold text-emerald-700' : ''}`}>
                            {e.dias_a_venta == null ? <span className="text-gray-400">sin venta</span> : `${e.dias_a_venta} días`}
                          </td>
                          <td className="px-3 py-2 text-center text-xs"><Si v={e.whatsapp_7d} nulo="sin tel." /></td>
                          <td className="px-3 py-2 text-xs">{fecha(e.ultima_actividad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
