import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Bot, CalendarClock, Loader2, Sparkles } from 'lucide-react';

// PUBLICACIÓN DIARIA CON HERMES
//
// (05/10/2026) El dueño: cada día 3 piezas, una de RD$100–500, una de
// 501–1,000 y una de más de 1,000; nada de menos de RD$100 en automático y
// sin el 5% (ese solo a mano). Los primeros 30 días Hermes prepara y el
// dueño aprueba en el Paso 2, para retroalimentarlo; después se puede
// encender el 100% automático (sql/publicacion_automatica_hermes.sql).
// Las elige la base y las encarga el worker del Creativo en la PC, a la hora
// puesta aquí.

const DIAS_APRENDIZAJE = 30;
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const dinero = (n) => `RD$${Math.round(Number(n) || 0).toLocaleString('es-DO')}`;

const ESTADO = {
  pending: 'en cola', processing: 'el Creativo la está haciendo', waiting_approval: 'lista para aprobar',
  completed: 'hecha', cancelled: 'descartada', expired: 'vencida',
};

export function PublicacionDiaria({ trabajos, onRevisar }) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [hoy, setHoy] = useState([]);
  const [prods, setProds] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('equipo_auto_publicacion').select('*').maybeSingle(),
      supabase.from('equipo_auto_elegidas').select('*').eq('fecha', hoyRD()).order('created_at'),
    ]);
    setCfg(c || null);
    setHoy(e || []);
    const ids = (e || []).map((x) => x.producto_id).filter(Boolean);
    if (ids.length) {
      const { data: ps } = await supabase.from('productos').select('id, codigo, descripcion, precio').in('id', ids);
      setProds(Object.fromEntries((ps || []).map((p) => [p.id, p])));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  // Cuando el worker las encarga, la lista de trabajos de la página cambia.
  useEffect(() => { cargar(); }, [trabajos?.length, cargar]);

  const configurar = async (cambios) => {
    setGuardando(true);
    const { data, error } = await supabase.rpc('equipo_auto_configurar', {
      p_activo: cambios.activo ?? cfg?.activo ?? false,
      p_modo: cambios.modo ?? null,
      p_hora: cambios.hora ?? null,
      p_horarios: cambios.horarios ?? null,
    });
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); return; }
    setCfg(data);
  };

  const elegirAhora = async () => {
    setEligiendo(true);
    const { data, error } = await supabase.rpc('equipo_auto_elegir_ahora');
    setEligiendo(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudieron elegir', description: error.message }); return; }
    const n = (data?.elegidas || []).filter((x) => x.pieza).length;
    toast({ title: n ? `Hermes eligió ${n} pieza${n > 1 ? 's' : ''}` : 'Las de hoy ya estaban elegidas',
      description: n ? 'El Creativo las prepara; te llegan al Paso 2 para aprobarlas.' : undefined });
    window.dispatchEvent(new CustomEvent('equipo-ia:candidatas-cambian'));
    cargar();
  };

  const activo = !!cfg?.activo;
  const desde = cfg?.activado_at ? new Date(cfg.activado_at) : null;
  const dias = desde ? Math.floor((Date.now() - desde.getTime()) / 86400000) : 0;
  const faltan = Math.max(0, DIAS_APRENDIZAJE - dias);
  const trabajoDe = (id) => (trabajos || []).find((w) => w.id === id);
  const horarios = (cfg?.horarios || ['09:30', '12:30', '15:30']).map((h) => String(h).slice(0, 5));
  const hora12 = (h) => {
    const [H, M] = String(h || '').slice(0, 5).split(':').map(Number);
    if (Number.isNaN(H)) return '';
    return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'am' : 'pm'}`;
  };
  const cambiarHorario = (i, valor) => {
    if (!valor) return;
    const nuevos = horarios.map((h, k) => (k === i ? valor : h));
    if (nuevos.some((h) => h < '08:00' || h > '17:00')) {
      toast({ variant: 'destructive', title: 'Entre las 8:00 am y las 5:00 pm' });
      return;
    }
    if (new Set(nuevos).size !== 3) {
      toast({ variant: 'destructive', title: 'Las 3 horas tienen que ser distintas' });
      return;
    }
    configurar({ horarios: nuevos });
  };

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Bot className="h-4 w-4 text-violet-600" /> Publicación diaria con Hermes
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Cada día 3 piezas: una de RD$100–500, una de 501–1,000 y una de más de 1,000. Nada de menos de RD$100 y sin el 5% (ese solo a mano).
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-700">
          <input type="checkbox" checked={activo} disabled={guardando} onChange={(e) => configurar({ activo: e.target.checked })} />
          {activo ? 'Encendida' : 'Apagada'}
        </label>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Elige a las
          <input type="time" value={String(cfg?.hora_local || '07:30').slice(0, 5)} disabled={guardando}
            onChange={(e) => e.target.value && configurar({ hora: e.target.value })}
            className="h-6 rounded border px-1 text-[11px]" />
          <span className="text-slate-400">(con la PC encendida)</span>
        </span>
        <span className="flex items-center gap-1" title="Una pieza en cada hora; las horas rotan entre los rangos cada día.">
          Salen a las
          {horarios.map((h, i) => (
            <input key={i} type="time" min="08:00" max="17:00" value={h} disabled={guardando}
              onChange={(e) => cambiarHorario(i, e.target.value)}
              className="h-6 rounded border px-1 text-[11px]" />
          ))}
        </span>
        <label className={`flex items-center gap-1.5 ${faltan > 0 ? 'text-slate-400' : 'cursor-pointer text-slate-700'}`}
          title={faltan > 0 ? 'Los primeros 30 días tú apruebas: así Hermes aprende de lo que corriges.' : 'Publica sin pasar por tu aprobación.'}>
          <input type="checkbox" checked={cfg?.modo === 'automatico'} disabled={guardando || faltan > 0}
            onChange={(e) => configurar({ modo: e.target.checked ? 'automatico' : 'aprobar' })} />
          100% automático
          {faltan > 0 && (
            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
              {activo ? `aprendiendo: día ${Math.min(dias + 1, DIAS_APRENDIZAJE)} de ${DIAS_APRENDIZAJE}` : `se habilita tras ${DIAS_APRENDIZAJE} días encendida`}
            </span>
          )}
        </label>
        <button type="button" onClick={elegirAhora} disabled={eligiendo}
          className="ml-auto flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50">
          {eligiendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Elegir las de hoy ahora
        </button>
      </div>

      {hoy.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {hoy.map((e) => {
            const p = prods[e.producto_id];
            const w = e.trabajo_id ? trabajoDe(e.trabajo_id) : null;
            return (
              <div key={e.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px]">
                <p className="flex items-center justify-between text-[10px] font-bold uppercase text-violet-700">
                  <span>{e.rango}</span>
                  {e.hora_publicar && <span className="normal-case text-slate-500">sale a las {hora12(e.hora_publicar)}</span>}
                </p>
                {p ? (
                  <>
                    <p className="truncate font-bold text-slate-800" title={p.descripcion}>{p.descripcion}</p>
                    <p className="text-slate-500">{dinero(p.precio)} · {p.codigo}</p>
                    {e.nota && <p className="mt-0.5 line-clamp-2 text-[10px] text-violet-700">{e.nota}</p>}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{w ? ESTADO[w.estado] || w.estado : 'encargada'}</span>
                      {e.trabajo_id && onRevisar && (
                        <button type="button" onClick={() => onRevisar(e.trabajo_id)}
                          className="ml-auto rounded bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-violet-700">
                          Revisar en el Paso 2
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-amber-700">{e.nota || 'Sin candidata hoy.'} Sube fotos de piezas de este rango en "Fotos del día".</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          {activo ? `Hoy todavía no ha elegido: lo hace a las ${String(cfg?.hora_local || '07:30').slice(0, 5)} o pulsa "Elegir las de hoy ahora".`
            : 'Enciéndela y cada mañana Hermes te deja 3 promociones listas para aprobar.'}
        </p>
      )}
    </div>
  );
}

export default PublicacionDiaria;
