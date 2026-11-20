// =====================================================================
// Aprende MotoFlow (19/11/2026) — Fase 4 del onboarding
// ---------------------------------------------------------------------
// El centro de aprendizaje, para TODOS los planes (FREE incluido) y todos
// los usuarios: la capacitación básica no es de pago (decisión del dueño).
//   * Guías paso a paso: pendientes, a medias (continuar), completadas
//     (repetir). Se abren sobre la pantalla real (GuiaContext.abrirGuia).
//   * Primeros pasos de la empresa (si le aplican).
//   * Preguntas frecuentes por módulo: sistema_ayuda (la misma base que usa
//     Jarvis para "¿cómo hago…?"; una entrada nueva sale aquí sin publicar).
//   * Tu plan y el enlace a lo que trae cada plan.
// No duplica nada: reutiliza las guías, primeros_pasos() y sistema_ayuda.
// =====================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { GraduationCap, Search, PlayCircle, RotateCcw, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { useGuias } from '@/contexts/GuiaContext';
import { canAccess } from '@/lib/permissionsHelper';
import { accesoFuncion } from '@/lib/planes';
import { queHacerConGuia } from '@/guias/reglas';
import PrimerosPasos from '@/components/dashboard/PrimerosPasos';

const NOMBRE_PLAN = { FREE: 'Gratis', BASICO: 'Básico', PRO: 'Profesional', ENTERPRISE: 'Enterprise', TRIAL: 'Prueba', SERVICIOS: 'Servicios' };

// Nombre bonito de cada módulo de las preguntas frecuentes.
const NOMBRE_MODULO = {
  ventas: 'Ventas', compras: 'Compras', cotizaciones: 'Cotizaciones', 'recibo-ingreso': 'Cobros',
  'orden-compra': 'Orden de compra', devoluciones: 'Devoluciones', mercancias: 'Mercancías',
  'entrada-mercancia': 'Inventario', 'inventario-fisico': 'Inventario', 'cierre-caja': 'Cierre de caja',
  clientes: 'Clientes', suplidores: 'Suplidores', usuarios: 'Usuarios', prestamos: 'Préstamos',
};

const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function estadoDeGuia(guia, progreso) {
  const p = progreso?.[guia.id];
  const que = queHacerConGuia(guia, p);
  if (que === 'continuar') return { txt: `A medias (paso ${Math.min((p?.paso || 0) + 1, guia.pasos.length)} de ${guia.pasos.length})`, cls: 'bg-amber-100 text-amber-800', accion: 'Continuar', continuar: true, Icono: PlayCircle };
  if (p?.estado === 'completada' && !que) return { txt: 'Completada', cls: 'bg-emerald-100 text-emerald-800', accion: 'Repetir', Icono: RotateCcw };
  if (p?.estado === 'omitida' && !que) return { txt: 'Omitida', cls: 'bg-gray-100 text-gray-600', accion: 'Empezar', Icono: PlayCircle };
  return { txt: 'Pendiente', cls: 'bg-blue-100 text-blue-800', accion: 'Empezar', Icono: PlayCircle };
}

export default function AprendeMotoFlowPage() {
  const { profile, permissions, isSuperAdmin } = useAuth();
  const { openPanel } = usePanels();
  const { planActual, especialVigente, limites } = useSuscripcion();
  const guias = useGuias();
  const [buscar, setBuscar] = useState('');
  const [ayudas, setAyudas] = useState([]);
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    supabase.from('sistema_ayuda').select('id, modulo, titulo, contenido, sinonimos')
      .eq('activo', true).order('modulo').order('titulo')
      .then(({ data, error }) => { if (!error) setAyudas(data || []); });
  }, []);

  const puedeAbrir = (panel) => panel && canAccess(profile, permissions, panel)
    && accesoFuncion(panel, { planActual, especial: especialVigente, superAdmin: isSuperAdmin }).estado === 'libre';

  const q = normal(buscar.trim());
  const listaGuias = (guias?.disponibles || []).filter((g) => !q || normal(`${g.nombre} ${g.descripcion} ${g.modulo}`).includes(q));
  const listaAyudas = useMemo(() => ayudas.filter((a) => !q
    || normal(`${a.titulo} ${a.contenido} ${a.sinonimos} ${NOMBRE_MODULO[a.modulo] || a.modulo}`).includes(q)), [ayudas, q]);
  const porModulo = useMemo(() => {
    const m = new Map();
    for (const a of listaAyudas) {
      const k = NOMBRE_MODULO[a.modulo] || a.modulo || 'General';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return [...m.entries()];
  }, [listaAyudas]);

  const plan = String(planActual || '').toUpperCase();

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <Helmet><title>Aprende MotoFlow</title></Helmet>

      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-700"><GraduationCap className="h-6 w-6" /></div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Aprende MotoFlow</h1>
          <p className="text-sm text-gray-500">Guías paso a paso sobre tu pantalla real y respuestas a lo más preguntado.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="¿Qué quieres aprender? (ej. vender, cobrar, inventario)"
          className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
      </div>

      {!q && <PrimerosPasos panel="aprende" sinOcultar />}

      <section>
        <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-gray-500">Guías paso a paso</h2>
        {listaGuias.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
            {q ? 'No hay guías con esa palabra.' : 'Todavía no hay guías para los módulos que tienes.'}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {listaGuias.map((g) => {
              const e = estadoDeGuia(g, guias?.progreso);
              return (
                <div key={g.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-black text-gray-900">{g.nombre}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${e.cls}`}>{e.txt}</span>
                  </div>
                  <p className="mt-1 flex-1 text-xs text-gray-600">{g.descripcion} · {g.pasos.length} pasos</p>
                  <button type="button" onClick={() => guias.abrirGuia(g.id, { continuar: !!e.continuar })}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700">
                    <e.Icono className="h-4 w-4" /> {e.accion}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-gray-500">Preguntas frecuentes</h2>
        {porModulo.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
            {q ? 'No encontré nada con esa palabra. Prueba con otra o pregúntale a tu administrador.' : 'Cargando…'}
          </p>
        ) : (
          <div className="space-y-4">
            {porModulo.map(([modulo, lista]) => (
              <div key={modulo}>
                <div className="mb-1 text-xs font-bold text-gray-700">{modulo}</div>
                <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {lista.map((a) => {
                    const ab = abierta === a.id;
                    return (
                      <div key={a.id}>
                        <button type="button" onClick={() => setAbierta(ab ? null : a.id)}
                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-gray-50">
                          {ab ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                          {a.titulo}
                        </button>
                        {ab && (
                          <div className="px-10 pb-4 text-sm text-gray-600">
                            <p className="whitespace-pre-line">{a.contenido}</p>
                            {puedeAbrir(a.modulo) && (
                              <button type="button" onClick={() => openPanel(a.modulo)}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">
                                Ir a {NOMBRE_MODULO[a.modulo] || a.modulo} <ExternalLink className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-violet-600" />
          <div className="flex-1">
            <div className="text-sm font-black text-gray-900">Tu plan: {NOMBRE_PLAN[plan] || planActual || '—'}</div>
            <div className="text-xs text-gray-500">
              {limites?.productos ? `${limites.productos >= 99999 ? 'Artículos ilimitados' : `Hasta ${Number(limites.productos).toLocaleString('es-DO')} artículos`}` : ''}
              {limites?.facturas ? ` · ${Number(limites.facturas).toLocaleString('es-DO')} ventas al mes` : limites?.productos ? ' · ventas ilimitadas' : ''}
              {limites?.usuarios ? ` · ${limites.usuarios >= 99999 ? 'usuarios ilimitados' : `${limites.usuarios} usuario${limites.usuarios === 1 ? '' : 's'}`}` : ''}
            </div>
          </div>
          <button type="button" onClick={() => openPanel('planes')}
            className="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">Ver lo que trae cada plan</button>
        </div>
        {plan === 'FREE' && (
          <p className="mt-2 text-xs text-gray-500">
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
            La capacitación es gratis en todos los planes. Facturación electrónica, ventas a crédito y cotizaciones vienen desde el plan Básico.
          </p>
        )}
      </section>
    </div>
  );
}
