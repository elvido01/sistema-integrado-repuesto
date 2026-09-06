// ============================================================
// SugerenciasEquivalentes.jsx
// ============================================================
// Los grupos que el sistema propone solo, para confirmar o editar.
//
// Vive aparte porque se mira desde DOS sitios y tiene que ser el mismo:
// la pestaña "Sugeridos por el sistema" de Productos Equivalentes, y el menú
// AGRUPANDO del Maestro de Artículos — que es donde el dueño está cuando se
// le ocurre agrupar algo.
//
// El motor está en la base (recalcular_sugerencias_equivalentes): saca la
// clave de cada pieza quitándole marca, color y relleno, normaliza las medidas
// y junta lo que cae igual. Aquí no se adivina nada, solo se enseña con su
// señal y su confianza para que la persona decida.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Link2, Loader2, RefreshCw, Sparkles, CheckCircle2, X } from 'lucide-react';

const formatRD = (n) => `RD$ ${(Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

// De dónde salió cada propuesta. Se enseña SIEMPRE: "misma referencia" es la
// señal más floja y el dueño tiene derecho a saber cuál está mirando antes de
// confirmar.
const SENAL_TXT = {
  ambas: 'DESCRIPCIÓN + REFERENCIA',
  descripcion: 'MISMA DESCRIPCIÓN',
  referencia: 'MISMA REFERENCIA',
};

const SENAL_ESTILO = {
  ambas: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  descripcion: 'bg-blue-100 text-blue-700 border-blue-300',
  referencia: 'bg-amber-100 text-amber-800 border-amber-300',
};

export default function SugerenciasEquivalentes({ onCambio, columnas = 2 }) {
  const { toast } = useToast();
  const [sugerencias, setSugerencias] = useState([]);
  const [loading, setLoading] = useState(false);
  // Qué piezas de cada propuesta siguen marcadas: { sugerencia_id: [producto_id] }
  const [seleccion, setSeleccion] = useState({});
  const [procesando, setProcesando] = useState(false);

  // Lo que el motor dejó pendiente. No se calcula al vuelo: eso es lo que
  // hacía el sugeridor viejo y terminaba en timeout.
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_sugerencias_equivalentes', { p_limite: 300 });
      if (error) throw error;
      const filas = data || [];
      setSugerencias(filas);
      // Todo entra marcado: lo normal es confirmar, no armar el grupo de cero.
      const marcas = {};
      filas.forEach((s) => { marcas[s.id] = (s.miembros || []).map((m) => m.producto_id); });
      setSeleccion(marcas);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const recalcular = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('recalcular_sugerencias_equivalentes', {});
      if (error) throw error;
      toast({
        title: 'Catálogo revisado',
        description: `${data?.grupos ?? 0} grupos propuestos sobre ${data?.productos ?? 0} piezas.`,
      });
      await cargar();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      setLoading(false);
    }
  };

  const alternarMiembro = (sugId, prodId) => {
    setSeleccion((prev) => {
      const actual = prev[sugId] || [];
      return {
        ...prev,
        [sugId]: actual.includes(prodId) ? actual.filter((x) => x !== prodId) : [...actual, prodId],
      };
    });
  };

  const quitarDeLaLista = (sugId) => {
    setSugerencias((prev) => prev.filter((s) => s.id !== sugId));
    setSeleccion((prev) => { const c = { ...prev }; delete c[sugId]; return c; });
  };

  const confirmar = async (sug) => {
    const ids = seleccion[sug.id] || [];
    if (ids.length < 2) return;
    setProcesando(true);
    try {
      const { data, error } = await supabase.rpc('confirmar_sugerencia_equivalentes', {
        p_sugerencia_id: sug.id,
        p_producto_ids: ids,
        p_nombre: sug.nombre,
      });
      if (error) throw error;
      const fuera = (sug.miembros || []).length - ids.length;
      // Se dice lo que de verdad pasó, incluido lo que NO se pudo mover.
      const partes = [`${data?.agregados ?? ids.length} piezas`];
      if (fuera > 0) partes.push(`${fuera} descartada${fuera !== 1 ? 's' : ''} (no vuelven a proponerse)`);
      if (Number(data?.ya_en_otro) > 0) {
        partes.push(`${data.ya_en_otro} ya estaban en otro grupo y se quedaron ahí`);
      }
      toast({ title: data?.nuevo ? '✅ Grupo creado' : '✅ Piezas sumadas al grupo', description: partes.join(' · ') });
      quitarDeLaLista(sug.id);
      onCambio?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo confirmar', description: err.message });
    } finally {
      setProcesando(false);
    }
  };

  const rechazar = async (sug) => {
    setProcesando(true);
    try {
      const { error } = await supabase.rpc('rechazar_sugerencia_equivalentes', { p_sugerencia_id: sug.id });
      if (error) throw error;
      toast({ title: 'Anotado', description: 'Esas piezas no se vuelven a proponer juntas.' });
      quitarDeLaLista(sug.id);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setProcesando(false);
    }
  };

  // Las que coinciden por descripción Y por referencia son las seguras: se
  // confirman de un golpe, tal como vienen, para no revisar 400 tarjetas.
  const confirmarLasDobles = async () => {
    const lista = sugerencias.filter((s) => s.senal === 'ambas');
    if (!lista.length) return;
    setProcesando(true);
    let hechas = 0;
    let fallos = 0;
    for (const s of lista) {
      const ids = seleccion[s.id] || [];
      if (ids.length < 2) continue;
      try {
        const { error } = await supabase.rpc('confirmar_sugerencia_equivalentes', {
          p_sugerencia_id: s.id, p_producto_ids: ids, p_nombre: s.nombre,
        });
        if (error) throw error;
        hechas += 1;
      } catch (_) {
        fallos += 1;
      }
    }
    setProcesando(false);
    toast({
      title: `${hechas} grupos confirmados`,
      description: fallos > 0 ? `${fallos} no se pudieron: quedan en la lista.` : 'Los de doble señal quedaron listos.',
      variant: fallos > 0 ? 'destructive' : undefined,
    });
    await cargar();
    onCambio?.();
  };

  const totalPiezas = sugerencias.reduce((t, s) => t + (s.miembros || []).length, 0);
  const dobles = sugerencias.filter((s) => s.senal === 'ambas').length;

  return (
    <div className="space-y-3">
      {/* De dónde salen y qué hacer con ellas */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Sparkles className="w-5 h-5 text-purple-700 shrink-0" />
          <div className="flex-1 min-w-[240px]">
            <p className="text-xs text-purple-900 font-bold">
              {sugerencias.length > 0
                ? `${sugerencias.length} grupos propuestos · ${totalPiezas} piezas`
                : 'Grupos propuestos a partir de tu propio catálogo'}
            </p>
            <p className="text-[10px] text-purple-700">
              Salen de la descripción sin la marca ni el color, y de la referencia. Nada se agrupa
              solo: destildá lo que no vaya y confirmá.
            </p>
          </div>
          {dobles > 0 && (
            <Button
              onClick={confirmarLasDobles}
              disabled={procesando}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              title="Las que coinciden por descripción Y por referencia a la vez"
            >
              {procesando
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Confirmar las {dobles} de doble señal
            </Button>
          )}
          <Button onClick={recalcular} disabled={loading || procesando}
                  className="bg-purple-600 hover:bg-purple-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Recalcular
          </Button>
        </div>
      </div>

      {loading && (
        <div className="p-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-purple-600" /></div>
      )}

      {!loading && sugerencias.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          <Link2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p>No hay nada propuesto ahora mismo.</p>
          <p className="text-[11px] mt-1">
            Se recalcula solo cada madrugada. Si acabás de cargar mercancía, tocá <b>Recalcular</b>.
          </p>
        </div>
      )}

      <div className={`grid grid-cols-1 ${columnas > 1 ? 'xl:grid-cols-2' : ''} gap-3`}>
        {sugerencias.map((s) => {
          const marcados = seleccion[s.id] || [];
          const miembros = s.miembros || [];
          return (
            <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
              <div className="mb-2 min-w-0">
                <h3 className="font-bold text-sm text-slate-800 truncate">{s.nombre}</h3>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${SENAL_ESTILO[s.senal] || SENAL_ESTILO.referencia}`}>
                    {SENAL_TXT[s.senal] || s.senal} · {s.confianza}%
                  </span>
                  <span className="text-[10px] text-slate-500">{miembros.length} piezas</span>
                  {Number(s.vendidas_180d) > 0 && (
                    <span className="text-[10px] text-emerald-700 font-bold">
                      {Number(s.vendidas_180d)} vendidas 180d
                    </span>
                  )}
                  {s.grupo_id && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300">
                      SUMAR A: {s.grupo_nombre}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-0.5 mb-2">
                {miembros.map((m) => {
                  const dentro = marcados.includes(m.producto_id);
                  return (
                    <label
                      key={m.producto_id}
                      className={`flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer text-[11px] ${
                        dentro ? 'bg-slate-50' : 'bg-white opacity-50 line-through'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={dentro}
                        onChange={() => alternarMiembro(s.id, m.producto_id)}
                        className="accent-purple-600"
                      />
                      <span className="font-mono font-bold text-slate-600 w-20 shrink-0 truncate">{m.codigo}</span>
                      <span className="flex-1 truncate text-slate-700">{m.descripcion}</span>
                      {m.marca && <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">{m.marca}</span>}
                      <span className="font-mono text-slate-600 shrink-0">{formatRD(m.precio)}</span>
                      {m.ya_en_grupo && (
                        <span className="text-[9px] text-blue-600 font-bold shrink-0" title="Ya pertenece a un grupo">EN GRUPO</span>
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]"
                  disabled={procesando || marcados.length < 2}
                  onClick={() => confirmar(s)}
                  title={marcados.length < 2 ? 'Un grupo necesita al menos 2 piezas' : 'Crear el grupo con lo marcado'}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {s.grupo_id ? 'Sumar al grupo' : 'Confirmar grupo'} ({marcados.length})
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-[10px] border-slate-300 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                  disabled={procesando}
                  onClick={() => rechazar(s)}
                  title="No son la misma pieza. No se vuelve a proponer."
                >
                  <X className="w-3 h-3 mr-1" /> No son iguales
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
