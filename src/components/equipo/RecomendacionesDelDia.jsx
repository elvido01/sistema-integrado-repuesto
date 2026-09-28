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
    // Un ok que no hizo nada es peor que un error: el error se ve. La base
    // es idempotente por pieza, enfoque y día, así que volver a mandar lo
    // mismo devuelve el trabajo de antes SIN encargar nada — y hasta hoy
    // esto cantaba "Encargado" igual. El dueño se quedaba mirando un panel
    // vacío convencido de que venía en camino.
    if (data?.duplicado) {
      toast({
        title: 'Eso ya se encargó hoy',
        description: 'Mira "Esperando tu aprobación": el borrador es el mismo. '
          + 'Si quieres otro distinto, cámbiale el enfoque.',
      });
    } else {
      toast({
        title: data?.revivido ? 'Reenviado al Comercial-Creativo' : 'Encargado al Comercial-Creativo',
        description: 'Cuando termine, aparece en "Esperando tu aprobación".',
      });
    }
    setEnfoque('');
    cargar();
    if (onEncargado) onEncargado(data?.trabajo_id);
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {/* El título, el para qué y el refresco, todo en un renglón: la barra
          está arriba del todo y cada línea que ocupe empuja lo demás. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Sparkles className="h-4 w-4 text-violet-500" />
          Qué promocionar hoy
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Elige una o dos y se las mando al Comercial-Creativo. No se publica nada:
          vuelve a ti para que lo apruebes.
        </p>
        <button type="button" onClick={cargar} disabled={cargando}
          title="Volver a mirar el catálogo"
          className="text-slate-400 hover:text-slate-700 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {cargando && <p className="py-2 text-center text-[11px] text-slate-400">Mirando el catálogo…</p>}

      {!cargando && lista.length === 0 && (
        <p className="py-2 text-center text-[11px] text-slate-400">
          Nada que recomendar ahora mismo. Lo que ya promocionaste estos
          últimos catorce días no vuelve a salir.
        </p>
      )}

      {/* Las cinco en fila. En pantalla chica bajan a tres, a dos y a una:
          mejor eso que una barra que se salga por el lado. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {lista.map((p) => {
          const puesto = elegidos.includes(p.id);
          const lleno = elegidos.length >= MAX && !puesto;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => alternar(p.id)}
              disabled={lleno}
              title={p.razon}
              className={`flex items-start gap-2 rounded border p-2 text-left transition ${
                puesto ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300'
              } ${lleno ? 'opacity-40' : ''}`}
            >
              <img src={p.imagen_url} alt={p.descripcion}
                className="h-11 w-11 shrink-0 rounded border border-slate-200 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold leading-tight text-slate-800">{p.descripcion}</p>
                <p className="text-[10px] text-slate-500">
                  RD${Number(p.precio || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  {' · '}{p.codigo}
                </p>
                {/* El porqué. Es lo único que hace que esto sea una
                    recomendación y no un listado. Recortado a tres renglones
                    para que las cinco tarjetas midan igual; el completo sale
                    al pasar el mouse por encima. */}
                <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-violet-700">{p.razon}</p>
              </div>
              <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                puesto ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                {puesto && <span className="block text-center text-[10px] leading-4 text-white">✓</span>}
              </span>
            </button>
          );
        })}
      </div>

      {elegidos.length > 0 && (
        // Formato, enfoque y botón en una sola fila debajo de las tarjetas.
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
          <div className="flex gap-1">
            {[['historia', 'Historia 9:16'], ['feed', 'Feed cuadrado']].map(([v, txt]) => (
              <button key={v} type="button" onClick={() => setFormato(v)}
                className={`rounded px-2.5 py-1 text-[10px] font-bold ${
                  formato === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {txt}
              </button>
            ))}
          </div>
          <Input value={enfoque} onChange={(e) => setEnfoque(e.target.value)}
            placeholder="Enfoque, opcional. Ej.: para el que le está fallando el arranque."
            className="h-8 min-w-[220px] flex-1 text-xs" />
          <Button type="button" size="sm" disabled={enviando} onClick={encargar}>
            {enviando ? 'Encargando…'
              : `Encargar ${elegidos.length === 1 ? 'esta pieza' : 'estas dos'} al Comercial-Creativo`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default RecomendacionesDelDia;
