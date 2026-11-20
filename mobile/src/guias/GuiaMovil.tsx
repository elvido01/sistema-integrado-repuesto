// =====================================================================
// Motor de guías de la app (20/11/2026)
// ---------------------------------------------------------------------
// * Cada pantalla marca lo que se quiere señalar:
//     const g = useObjetivoGuia('pos-cobrar');
//     <View ref={g.ref} collapsable={false}>…</View>   (o ref en un TouchableOpacity)
//   collapsable={false} en un View: sin eso Android lo aplana y no se mide.
//   Solo cuenta mientras la pantalla está a la vista (las pestañas de atrás
//   siguen montadas y no deben iluminarse).
// * GuiaMovilProvider (raíz) mide el objetivo del paso activo cada medio
//   segundo (measureInWindow) y dibuja encima: cuatro bandas oscuras (el
//   objetivo sigue tocable), un borde y la tarjeta del paso. La tarjeta se
//   coloca con su altura real y por encima del teclado.
// * Si el objetivo no está a la vista, la tarjeta va abajo con `siNoEsta`.
// * `encima`: lo que debe tapar a la guía (la pantalla de bloqueo).
// * Progreso y eventos: guardar_guia / mis_guias, plataforma 'movil'.
// =====================================================================
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { GUIAS_APP, GuiaApp, versionMayor } from './definiciones';

type Rect = { x: number; y: number; w: number; h: number };
type RefVista = React.RefObject<View | null>;
type Progreso = Record<string, { version: string; estado: string; paso: number }>;
type Ctx = {
  empezar: (guiaId: string, desdePaso?: number) => void;
  activa: GuiaApp | null;
  progreso: Progreso;
  cargarProgreso: () => Promise<void>;
  ofrecer: (guiaId: string) => void;
  omitir: (guiaId: string) => void;
  debeOfrecer: (guiaId: string) => boolean;
};

const GuiaCtx = createContext<Ctx | null>(null);
// Aparte y estable: las pantallas marcadas no se repintan cuando cambia la guía.
const RegistroCtx = createContext<((id: string, ref: RefVista) => () => void) | null>(null);
export const useGuiaMovil = () => useContext(GuiaCtx);

export function useObjetivoGuia(id: string) {
  const registrar = useContext(RegistroCtx);
  const enfocada = useIsFocused();
  const ref = useRef<View>(null);
  useEffect(() => (registrar && enfocada ? registrar(id, ref) : undefined), [registrar, id, enfocada]);
  return { ref };
}

function guardar(guia: GuiaApp, estado: string | null, paso: number, evento: string) {
  // Sin red no se rompe nada: la guía sigue, solo no queda el registro.
  Promise.resolve(supabase.rpc('guardar_guia', {
    p_guia: guia.id, p_version: guia.version, p_estado: estado, p_paso: paso, p_evento: evento, p_plataforma: 'movil',
  })).catch(() => {});
}

export function GuiaMovilProvider({ children, encima }: { children: React.ReactNode; encima?: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { width: W, height: H } = useWindowDimensions();
  const objetivos = useRef(new Map<string, Set<RefVista>>());
  const [activa, setActiva] = useState<GuiaApp | null>(null);
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [progreso, setProgreso] = useState<Progreso>({});
  const [cargado, setCargado] = useState(false);
  const [altoTarjeta, setAltoTarjeta] = useState(170);
  const [teclado, setTeclado] = useState(0);
  const ofrecidas = useRef(new Set<string>());
  const pedido = useRef(0);

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setTeclado(e.endCoordinates?.height || 0));
    const b = Keyboard.addListener('keyboardDidHide', () => setTeclado(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  const cargarProgreso = useCallback(async () => {
    const n = ++pedido.current;
    if (!user?.id) { setProgreso({}); setCargado(false); return; }
    // mis_guias devuelve { guia_id: { version, estado, paso } }.
    const { data, error } = await supabase.rpc('mis_guias');
    if (n !== pedido.current) return;            // llegó la de otro usuario / otra más nueva
    if (error || !data || typeof data !== 'object') return;   // sin datos no se ofrece nada
    setProgreso(data as Progreso);
    setCargado(true);
  }, [user?.id]);

  // Otro usuario (o cerró sesión): la guía se apaga y todo vuelve a empezar.
  useEffect(() => {
    setActiva(null); setPaso(0); setRect(null); setCargado(false);
    ofrecidas.current = new Set();
    cargarProgreso();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const registrar = useCallback((id: string, ref: RefVista) => {
    const set = objetivos.current.get(id) || new Set<RefVista>();
    set.add(ref);
    objetivos.current.set(id, set);
    return () => { set.delete(ref); };
  }, []);

  // Medir el objetivo del paso activo (se mueve con el teclado y el scroll).
  useEffect(() => {
    if (!activa) { setRect(null); return undefined; }
    const objetivo = activa.pasos[paso]?.objetivo;
    let vivo = true;
    const medir = () => {
      const refs = objetivo ? Array.from(objetivos.current.get(objetivo) || []).filter((r) => r.current) : [];
      if (!refs.length) { setRect(null); return; }
      let encontrado = false;
      let pendientes = refs.length;
      for (const r of refs) {
        r.current!.measureInWindow((x, y, w, h) => {
          pendientes -= 1;
          if (!vivo || encontrado) return;
          if (w > 0 && h > 0) {
            encontrado = true;
            setRect((prev) => (prev && Math.abs(prev.x - x) < 1 && Math.abs(prev.y - y) < 1 && prev.w === w && prev.h === h ? prev : { x, y, w, h }));
          } else if (!pendientes) setRect(null);
        });
      }
    };
    medir();
    const t = setInterval(medir, 500);
    return () => { vivo = false; clearInterval(t); };
  }, [activa, paso]);

  const empezar = useCallback((guiaId: string, desdePaso = 0) => {
    const g = GUIAS_APP.find((x) => x.id === guiaId);
    if (!g) return;
    const n = Math.min(Math.max(0, desdePaso), g.pasos.length - 1);
    const ruta = g.pasos.slice(0, n + 1).reverse().find((p) => p.ruta)?.ruta;
    if (ruta) router.push(ruta as never);
    setActiva(g); setPaso(n);
    setProgreso((p) => ({ ...p, [g.id]: { version: g.version, estado: 'iniciada', paso: n } }));
    guardar(g, 'iniciada', n, n > 0 ? 'reiniciada' : 'iniciada');
  }, [router]);

  const terminar = useCallback((estado: 'completada' | 'omitida') => {
    if (!activa) return;
    const pasoFinal = estado === 'completada' ? activa.pasos.length : paso;
    guardar(activa, estado, pasoFinal, estado);
    setProgreso((p) => ({ ...p, [activa.id]: { version: activa.version, estado, paso: pasoFinal } }));
    setActiva(null); setPaso(0);
  }, [activa, paso]);

  const ir = useCallback((n: number) => {
    if (!activa) return;
    if (n >= activa.pasos.length) { terminar('completada'); return; }
    const m = Math.max(0, n);
    setPaso(m);
    setProgreso((p) => ({ ...p, [activa.id]: { version: activa.version, estado: 'iniciada', paso: m } }));
    guardar(activa, 'iniciada', m, 'paso');
  }, [activa, terminar]);

  const debeOfrecer = useCallback((guiaId: string) => {
    const g = GUIAS_APP.find((x) => x.id === guiaId);
    if (!g || activa || !cargado) return false;
    const p = progreso[guiaId];
    return !p || versionMayor(p.version) !== versionMayor(g.version);
  }, [progreso, activa, cargado]);

  const ofrecer = useCallback((guiaId: string) => {
    const g = GUIAS_APP.find((x) => x.id === guiaId);
    if (!g || ofrecidas.current.has(guiaId)) return;
    ofrecidas.current.add(guiaId);
    guardar(g, null, 0, 'ofrecida');   // ofrecer no la marca como empezada
  }, []);

  const omitir = useCallback((guiaId: string) => {
    const g = GUIAS_APP.find((x) => x.id === guiaId);
    if (!g) return;
    guardar(g, 'omitida', 0, 'omitida');
    setProgreso((p) => ({ ...p, [guiaId]: { version: g.version, estado: 'omitida', paso: 0 } }));
  }, []);

  const valor = useMemo(() => ({ empezar, activa, progreso, cargarProgreso, ofrecer, omitir, debeOfrecer }),
    [empezar, activa, progreso, cargarProgreso, ofrecer, omitir, debeOfrecer]);

  const p = activa?.pasos[paso];
  const margen = 6;
  const r = rect ? { x: rect.x - margen, y: rect.y - margen, w: rect.w + margen * 2, h: rect.h + margen * 2 } : null;
  // Dónde va la tarjeta: debajo del objetivo si cabe (sin tapar el teclado),
  // si no encima; abajo si no hay objetivo o el paso lo pide.
  const disponible = H - teclado;
  const abajo = { bottom: teclado ? teclado + 12 : 96 };
  let posTarjeta: { top?: number; bottom?: number } = abajo;
  if (r && p?.tarjeta !== 'abajo') {
    if (r.y + r.h + 10 + altoTarjeta <= disponible - 8) posTarjeta = { top: r.y + r.h + 10 };
    else if (r.y - 10 - altoTarjeta >= 32) posTarjeta = { top: r.y - 10 - altoTarjeta };
  }

  return (
    <RegistroCtx.Provider value={registrar}>
      <GuiaCtx.Provider value={valor}>
        {children}
        {activa && p && (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9000, elevation: 60 }}>
            {r && (
              <>
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: Math.max(0, r.y), backgroundColor: 'rgba(0,0,0,0.55)' }} />
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: r.y + r.h, width: W, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: r.y, width: Math.max(0, r.x), height: r.h, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                <View pointerEvents="none" style={{ position: 'absolute', left: r.x + r.w, top: r.y, right: 0, height: r.h, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                <View pointerEvents="none" style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 12, borderWidth: 3, borderColor: '#facc15' }} />
              </>
            )}
            <View onLayout={(e) => setAltoTarjeta(Math.round(e.nativeEvent.layout.height) || 170)}
              style={{ position: 'absolute', left: 16, right: 16, ...posTarjeta }}>
              <View className="rounded-2xl bg-white p-4" style={{ elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10 }}>
                <Text className="text-[11px] font-bold uppercase text-blue-700">{activa.nombre} · {paso + 1} de {activa.pasos.length}</Text>
                <Text className="mt-1 text-base font-black text-gray-900">{p.titulo}</Text>
                <Text className="mt-1 text-sm text-gray-700">{p.texto}</Text>
                {p.objetivo && !r && !!p.siNoEsta && (
                  <Text className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800">{p.siNoEsta}</Text>
                )}
                <View className="mt-3 flex-row items-center">
                  <TouchableOpacity onPress={() => terminar('omitida')} className="py-2 pr-3">
                    <Text className="text-xs text-gray-500">Salir</Text>
                  </TouchableOpacity>
                  <View className="flex-1" />
                  {paso > 0 && (
                    <TouchableOpacity onPress={() => ir(paso - 1)} className="mr-2 rounded-xl border border-gray-300 px-4 py-2">
                      <Text className="font-bold text-gray-700">Atrás</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => ir(paso + 1)} className="rounded-xl bg-blue-600 px-4 py-2">
                    <Text className="font-bold text-white">{paso + 1 >= activa.pasos.length ? 'Terminar' : 'Siguiente'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
        {/* Lo que tapa a la guía (la pantalla de bloqueo de suscripción). */}
        {encima ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9500, elevation: 70 }}>
            {encima}
          </View>
        ) : null}
      </GuiaCtx.Provider>
    </RegistroCtx.Provider>
  );
}
