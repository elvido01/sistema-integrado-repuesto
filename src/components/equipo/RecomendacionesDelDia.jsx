import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Sparkles, RefreshCw } from 'lucide-react';

// Qué promocionar hoy.
//
// El dueño lo dijo así: "de los productos que Hermes diariamente me recomienda
// promocionar, yo poder elegir uno o dos y que se lo envíe al Comercial-
// Creativo". El cerebro que elige llevaba meses hecho —mira margen, rotación
// de 30 y 60 días, existencia y capital dormido— y no estaba enchufado a
// nada. Esto es el enchufe.
//
// Cada pieza llega con su PORQUÉ escrito. Una lista de códigos y márgenes
// obliga a hacer la cuenta mental cada mañana; "tienes RD$5,566 dormidos ahí"
// se decide de un vistazo.
//
// No hay tarjeta de autorización: la autorización es el clic. La tarjeta
// ámbar existe para cuando Hermes propone por su cuenta.

const MAX = 2;

export function RecomendacionesDelDia({ onEncargado }) {
  const { toast } = useToast();
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [elegidos, setElegidos] = useState([]);
  const [enfoque, setEnfoque] = useState('');
  const [formato, setFormato] = useState('historia');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    supabase.rpc('equipo_candidatos_promocion', { p_limite: 5 })
      .then(({ data, error }) => {
        setCargando(false);
        if (error) return;
        setLista(Array.isArray(data) ? data : []);
        setElegidos([]);
      });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const alternar = (id) => setElegidos((s) => {
    if (s.includes(id)) return s.filter((x) => x !== id);
    if (s.length >= MAX) return s;   // dos como mucho: es una promoción, no un catálogo
    return [...s, id];
  });

  const encargar = async () => {
    if (!elegidos.length || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase.rpc('equipo_encargar_promocion', {
      p_producto_ids: elegidos,
      p_enfoque: enfoque.trim() || null,
      p_formato: formato,
    });
    setEnviando(false);
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo encargar', description: error.message });
      return;
    }
    toast({
      title: 'Encargado al Comercial-Creativo',
      description: 'Cuando termine, aparece en "Esperando tu aprobación".',
    });
    setEnfoque('');
    cargar();
    if (onEncargado) onEncargado(data?.trabajo_id);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Sparkles className="h-4 w-4 text-violet-500" />
          Qué promocionar hoy
        </span>
        <button type="button" onClick={cargar} disabled={cargando}
          title="Volver a mirar el catálogo"
          className="text-slate-400 hover:text-slate-700 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        Elige una o dos y se las mando al Comercial-Creativo. No se publica
        nada: vuelve a ti para que lo apruebes.
      </p>

      {cargando && <p className="py-3 text-center text-[11px] text-slate-400">Mirando el catálogo…</p>}

      {!cargando && lista.length === 0 && (
        <p className="py-3 text-center text-[11px] text-slate-400">
          Nada que recomendar ahora mismo. Lo que ya promocionaste estos
          últimos catorce días no vuelve a salir.
        </p>
      )}

      <div className="space-y-2">
        {lista.map((p) => {
          const puesto = elegidos.includes(p.id);
          const lleno = elegidos.length >= MAX && !puesto;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => alternar(p.id)}
              disabled={lleno}
              className={`flex w-full items-start gap-2 rounded border p-2 text-left transition ${
                puesto ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300'
              } ${lleno ? 'opacity-40' : ''}`}
            >
              <img src={p.imagen_url} alt={p.descripcion}
                className="h-14 w-14 shrink-0 rounded border border-slate-200 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-slate-800">{p.descripcion}</p>
                <p className="text-[10px] text-slate-500">
                  RD${Number(p.precio || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  {' · '}{p.codigo}
                </p>
                {/* El porqué. Es lo único que hace que esto sea una
                    recomendación y no un listado. */}
                <p className="mt-0.5 text-[10px] leading-snug text-violet-700">{p.razon}</p>
              </div>
              <span className={`mt-1 h-4 w-4 shrink-0 rounded border ${
                puesto ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                {puesto && <span className="block text-center text-[10px] leading-4 text-white">✓</span>}
              </span>
            </button>
          );
        })}
      </div>

      {elegidos.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <div className="flex gap-1">
            {[['historia', 'Historia 9:16'], ['feed', 'Feed cuadrado']].map(([v, txt]) => (
              <button key={v} type="button" onClick={() => setFormato(v)}
                className={`flex-1 rounded px-2 py-1 text-[10px] font-bold ${
                  formato === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {txt}
              </button>
            ))}
          </div>
          <Input value={enfoque} onChange={(e) => setEnfoque(e.target.value)}
            placeholder="Enfoque, opcional. Ej.: para el que le está fallando el arranque."
            className="h-8 text-xs" />
          <Button type="button" size="sm" className="w-full" disabled={enviando} onClick={encargar}>
            {enviando ? 'Encargando…'
              : `Encargar ${elegidos.length === 1 ? 'esta pieza' : 'estas dos'} al Comercial-Creativo`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default RecomendacionesDelDia;
