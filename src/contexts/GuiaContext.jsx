// =====================================================================
// Motor de guías interactivas (Fase 3 del onboarding, 19/11/2026)
// ---------------------------------------------------------------------
// * Al entrar por primera vez a un módulo con guía, a un usuario nuevo (60
//   días) se le ofrece la guía. "Ahora no" la calla en esta sesión; "No,
//   gracias" la marca omitida y no vuelve sola. Siempre se puede abrir con
//   "¿Cómo se usa?" (abajo, junto al menú, sin taparlo).
// * La guía señala el elemento REAL (borde + sombra) y explica en una
//   ventanita con Atrás / Siguiente / Terminar / Salir. El resaltado no
//   recibe clics: la persona hace la operación ella misma. La guía nunca
//   graba nada.
// * Solo busca en el panel ACTIVO (los demás siguen montados, invisibles) o
//   en ventanas abiertas por fuera de los paneles (formularios).
// * El progreso es de la persona y vive en el servidor (guardar_guia /
//   mis_guias, sql/guias_progreso.sql): sigue entre sesiones y equipos.
// * Las ventanas de formulario (Radix) bloquean los clics por fuera; la
//   ventanita se pinta encima y corta el evento para no cerrarlas.
// =====================================================================
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { canAccess } from '@/lib/permissionsHelper';
import { accesoFuncion } from '@/lib/planes';
import { GUIAS, guiaPorId } from '@/guias/definiciones';
import { queHacerConGuia, guiaDisponible, posicionVentanita, pasoValido } from '@/guias/reglas';

const GuiaContext = createContext(null);
export const useGuias = () => useContext(GuiaContext);

const ESPERA_ELEMENTO_MS = 6000;

/** El primer elemento VISIBLE del selector, dentro del panel activo o fuera de todo panel. */
function buscarVisible(selector, panelActivo) {
  if (!selector) return null;
  let lista = [];
  try { lista = Array.from(document.querySelectorAll(selector)); } catch { return null; }
  return lista.find((el) => {
    const panel = el.closest('[data-panel]');
    if (panel && panel.getAttribute('data-panel') !== panelActivo) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }) || null;
}

/** Borde izquierdo del panel activo (a la derecha del menú), para no tapar el menú. */
function useBordePanel(panelActivo, activo) {
  const [left, setLeft] = useState(16);
  useEffect(() => {
    if (!activo) return undefined;
    const medir = () => {
      const el = document.querySelector(`[data-panel="${CSS.escape(panelActivo || '')}"]`);
      setLeft(el ? Math.round(el.getBoundingClientRect().left) + 16 : 16);
    };
    medir();
    window.addEventListener('resize', medir);
    const id = setInterval(medir, 1000);   // el menú se abre y se cierra
    return () => { window.removeEventListener('resize', medir); clearInterval(id); };
  }, [panelActivo, activo]);
  return left;
}

export function GuiaProvider({ children }) {
  const { user, profile, permissions, empresa, isSuperAdmin } = useAuth();
  const { activePanel } = usePanels();
  const { planActual, especialVigente } = useSuscripcion();
  const [progreso, setProgreso] = useState(null);          // { [guia_id]: { version, estado, paso } } | null = sin leer
  const [activa, setActiva] = useState(null);              // { guia, paso }
  const [oferta, setOferta] = useState(null);              // { guia, modo: 'ofrecer'|'continuar' }
  const calladas = useRef(new Set());                      // "Ahora no" en esta sesión
  const activaRef = useRef(null);
  useEffect(() => { activaRef.current = activa; }, [activa]);

  const puedeAbrir = useCallback((panel) => canAccess(profile, permissions, panel)
    && accesoFuncion(panel, { planActual, especial: especialVigente, superAdmin: isSuperAdmin }).estado === 'libre',
  [profile, permissions, planActual, especialVigente, isSuperAdmin]);

  const disponibles = useMemo(() => GUIAS.filter((g) => guiaDisponible(g, {
    tipoNegocio: empresa?.tipo_negocio, plataforma: 'web', puedeAbrir,
  })), [empresa?.tipo_negocio, puedeAbrir]);

  // Progreso de la persona. Si no se pudo leer, se queda en null: así no se
  // le vuelven a ofrecer guías que ya hizo o rechazó. La respuesta de otro
  // usuario (cambio rápido de sesión) se descarta.
  useEffect(() => {
    setProgreso(null);
    if (!user?.id) return undefined;
    let vivo = true;
    supabase.rpc('mis_guias').then(({ data, error }) => {
      if (!vivo) return;
      if (error) { console.warn('[Guías] no se pudo leer el progreso:', error.message); return; }
      setProgreso(data || {});
    });
    return () => { vivo = false; };
  }, [user?.id]);

  const guardar = useCallback((guia, estado, paso, evento) => {
    if (estado) setProgreso((p) => (p ? { ...p, [guia.id]: { version: guia.version, estado, paso } } : p));
    supabase.rpc('guardar_guia', {
      p_guia: guia.id, p_version: guia.version, p_estado: estado, p_paso: paso, p_evento: evento, p_plataforma: 'web',
    }).then(({ data, error }) => {
      if (error || data?.ok === false) console.warn('[Guías] no se guardó el progreso:', error?.message || data?.error);
    });
  }, []);

  // Ofrecer la guía del módulo al entrar (después de que la pantalla se dibuje).
  // Solo a usuarios nuevos (60 días): a quien lleva tiempo usando MotoFlow no
  // se le interrumpe; tiene el botón "¿Cómo se usa?" cuando lo necesite.
  const usuarioNuevo = !!user?.created_at && (Date.now() - Date.parse(user.created_at)) < 60 * 86400000;
  useEffect(() => {
    setOferta(null);
    if (!progreso || activa || !usuarioNuevo) return undefined;
    const guia = disponibles.find((g) => g.modulo === activePanel);
    if (!guia || calladas.current.has(guia.id)) return undefined;
    const modo = queHacerConGuia(guia, progreso[guia.id]);
    if (!modo) return undefined;
    const t = setTimeout(() => {
      setOferta({ guia, modo });
      guardar(guia, null, progreso[guia.id]?.paso || 0, 'ofrecida');
    }, 900);
    return () => clearTimeout(t);
  }, [activePanel, progreso, disponibles, activa, guardar, usuarioNuevo]);

  const iniciar = useCallback((id, { desdePaso = 0 } = {}) => {
    const guia = typeof id === 'string' ? guiaPorId(id) : id;
    if (!guia) return;
    const previo = progreso?.[guia.id];
    // El paso guardado puede no existir si la guía cambió: se acota.
    const paso = pasoValido(guia, desdePaso);
    setOferta(null);
    setActiva({ guia, paso });
    guardar(guia, 'iniciada', paso, previo && previo.estado !== 'iniciada' ? 'reiniciada' : 'iniciada');
  }, [progreso, guardar]);

  // desde: el paso en que se pidió el cambio (el clic sobre el elemento avanza
  // con retraso; si mientras tanto ya se pulsó Siguiente, no avanza dos veces).
  const irAPaso = useCallback((paso, desde) => {
    const a = activaRef.current;
    if (!a || (desde !== undefined && a.paso !== desde)) return;
    if (paso >= a.guia.pasos.length) {
      guardar(a.guia, 'completada', a.guia.pasos.length, 'completada');
      setActiva(null);
      return;
    }
    const p = Math.max(0, paso);
    guardar(a.guia, 'iniciada', p, 'paso');
    setActiva({ ...a, paso: p });
  }, [guardar]);

  const salir = useCallback(() => {
    const a = activaRef.current;
    if (a) guardar(a.guia, 'omitida', a.paso, 'omitida');
    setActiva(null);
  }, [guardar]);

  // Cambiar de módulo con una guía abierta la pausa (queda 'iniciada' para continuar).
  useEffect(() => {
    if (activa && activePanel !== activa.guia.modulo) setActiva(null);
  }, [activePanel, activa]);

  const valor = useMemo(() => ({ disponibles, progreso, iniciar, activa }), [disponibles, progreso, iniciar, activa]);
  const guiaDelModulo = disponibles.find((g) => g.modulo === activePanel);
  const izquierda = useBordePanel(activePanel, !activa && (!!oferta || !!guiaDelModulo));

  return (
    <GuiaContext.Provider value={valor}>
      {children}
      {activa && <PasoGuia activa={activa} panelActivo={activePanel} onIr={irAPaso} onSalir={salir} guardar={guardar} />}
      {!activa && oferta && (
        <OfertaGuia
          oferta={oferta}
          left={izquierda}
          onEmpezar={() => iniciar(oferta.guia, { desdePaso: oferta.modo === 'continuar' ? (progreso?.[oferta.guia.id]?.paso || 0) : 0 })}
          onLuego={() => { calladas.current.add(oferta.guia.id); setOferta(null); }}
          onNunca={() => { guardar(oferta.guia, 'omitida', 0, 'omitida'); setOferta(null); }}
        />
      )}
      {!activa && !oferta && guiaDelModulo && (
        <button type="button" onClick={() => iniciar(guiaDelModulo)} style={{ left: izquierda }}
          className="fixed bottom-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-md hover:bg-blue-50 print:hidden"
          title={guiaDelModulo.nombre}>
          <GraduationCap className="h-4 w-4" /> ¿Cómo se usa?
        </button>
      )}
    </GuiaContext.Provider>
  );
}

function OfertaGuia({ oferta, left, onEmpezar, onLuego, onNunca }) {
  const { guia, modo } = oferta;
  return createPortal(
    <div className="fixed bottom-4 z-[9990] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl print:hidden"
      style={{ left }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><GraduationCap className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-gray-900">{modo === 'continuar' ? '¿Seguimos con la guía?' : '¿Te enseño cómo se hace?'}</div>
          <div className="text-xs text-gray-600">{guia.nombre}: {guia.descripcion} Toma un minuto y lo haces tú mismo, paso a paso.</div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onEmpezar} className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700">
          {modo === 'continuar' ? 'Continuar' : 'Empezar'}
        </button>
        <button type="button" onClick={onLuego} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Ahora no</button>
      </div>
      <button type="button" onClick={onNunca} className="mt-2 text-[11px] text-gray-400 underline hover:text-gray-600">No, gracias, ya sé usarlo</button>
    </div>,
    document.body,
  );
}

const mismoRect = (a, b) => a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

function PasoGuia({ activa, panelActivo, onIr, onSalir, guardar }) {
  const { guia, paso } = activa;
  const p = guia.pasos[paso];
  const [rect, setRect] = useState(null);
  const [perdido, setPerdido] = useState(false);
  const avisado = useRef(false);
  const ventanita = useRef(null);
  const [tam, setTam] = useState({ ancho: 320, alto: 190 });

  // Seguir al elemento: aparece tarde (ventanas que se abren), se mueve con el
  // scroll y cambia de tamaño. Se mira cada 200 ms, pero solo se vuelve a
  // dibujar cuando de verdad se movió.
  useEffect(() => {
    if (!p) return undefined;
    setRect(null); setPerdido(false); avisado.current = false;
    const inicio = Date.now();
    let desplazado = false;
    let elActual = null;
    let alClic = null;
    const tick = () => {
      const el = buscarVisible(p.selector, panelActivo);
      if (el) {
        if (el !== elActual) {
          if (elActual && alClic) elActual.removeEventListener('click', alClic, true);
          elActual = el;
          if (p.avanzarAlClic) {
            alClic = () => setTimeout(() => onIr(paso + 1, paso), 350);
            el.addEventListener('click', alClic, true);
          }
        }
        if (!desplazado) {
          const r0 = el.getBoundingClientRect();
          if (r0.top < 60 || r0.bottom > window.innerHeight - 60) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          desplazado = true;
        }
        const r = el.getBoundingClientRect();
        const nuevo = { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
        setRect((prev) => (mismoRect(prev, nuevo) ? prev : nuevo));
        setPerdido(false);
      } else {
        setRect((prev) => (prev ? null : prev));
        if (Date.now() - inicio > ESPERA_ELEMENTO_MS) {
          setPerdido(true);
          if (!avisado.current) { avisado.current = true; guardar(guia, null, paso, 'elemento_no_encontrado'); }
        }
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => { clearInterval(id); if (elActual && alClic) elActual.removeEventListener('click', alClic, true); };
  }, [guia, paso, p, panelActivo, onIr, guardar]);

  useEffect(() => {
    if (ventanita.current) setTam({ ancho: ventanita.current.offsetWidth, alto: ventanita.current.offsetHeight });
  }, [paso, perdido]);

  if (!p) return null;   // paso fuera de la guía: no se dibuja nada (nunca rompe la pantalla)

  const pos = posicionVentanita(rect, { ...tam, vw: window.innerWidth, vh: window.innerHeight });
  const ultimo = paso === guia.pasos.length - 1;
  const pad = 6;

  return createPortal(
    <>
      {rect && (
        <div aria-hidden="true" className="pointer-events-none fixed z-[9998] rounded-lg border-2 border-blue-500 transition-all duration-150"
          style={{
            top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.35)',
          }} />
      )}
      <div ref={ventanita} role="dialog" aria-label={`Guía: ${guia.nombre}`}
        className="fixed z-[9999] w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl print:hidden"
        style={{ top: pos.top, left: pos.left, pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
            {guia.nombre} · paso {paso + 1} de {guia.pasos.length}{p.opcional ? ' · opcional' : ''}
          </div>
          <button type="button" onClick={onSalir} title="Salir de la guía" className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-1 text-sm font-black text-gray-900">{p.titulo}</div>
        <div className="mt-1 text-xs leading-relaxed text-gray-600">{p.texto}</div>
        {perdido && (
          <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            No veo ese lugar en tu pantalla ahora mismo (puede estar en otra pestaña o cerrado). Puedes seguir con el siguiente paso.
          </div>
        )}
        {p.avanzarAlClic && rect && !perdido && <div className="mt-2 text-[11px] font-bold text-blue-700">Púlsalo para seguir.</div>}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round(((paso + 1) / guia.pasos.length) * 100)}%` }} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" disabled={paso === 0} onClick={() => onIr(paso - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">Atrás</button>
          <button type="button" onClick={() => onIr(paso + 1)}
            className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
            {ultimo ? 'Terminar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
