import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Sparkles, RefreshCw } from 'lucide-react';
import { EncargoArte } from '@/components/equipo/EncargoArte';

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
const POR_TANDA = 5;

export function RecomendacionesDelDia({ onEncargado, onUsar, trabajos }) {
  const { toast } = useToast();
  // >>> LA LISTA ENTERA, DE CINCO EN CINCO <<<
  // Antes se pedían 5 y el botón de refrescar volvía a pedir las mismas 5:
  // el dueño le daba y no cambiaba nada. Ahora se pide la lista completa
  // —ya viene ordenada por rondas: la mejor de cada tipo, después la segunda
  // de cada tipo...— y el botón pasa a la tanda siguiente. Al llegar al final
  // vuelve a pedirla, por si algo cambió mientras tanto.
  const [todas, setTodas] = useState([]);
  const [tanda, setTanda] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [elegidos, setElegidos] = useState([]);
  const [enfoque, setEnfoque] = useState('');
  const [formato, setFormato] = useState('historia');
  const [enviando, setEnviando] = useState(false);
  // El encargo en curso: se sigue aquí mismo hasta que la pieza llega. Ya no
  // va a "Esperando tu aprobación" ni por el canal de Hermes.
  const [encargo, setEncargo] = useState(null);
  // Los que el dueño ya cerró o ya usó: no se le vuelven a poner delante
  // cada vez que el panel se refresca, ni al volver a abrir la página. Se
  // guardan en este navegador; si no se puede, se recuerdan hasta recargar.
  const [ignorados, setIgnorados] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('equipo_encargos_cerrados') || '[]')); }
    catch { return new Set(); }
  });
  const ignorar = (id) => setIgnorados((s) => {
    const n = new Set(s).add(id);
    try { localStorage.setItem('equipo_encargos_cerrados', JSON.stringify([...n].slice(-50))); } catch { /* sin almacenamiento */ }
    return n;
  });

  // >>> SI LA PÁGINA SE RECARGÓ A MITAD DE UN ENCARGO, SE RETOMA <<<
  // La tarjeta del encargo vive en la memoria de la pantalla. Sin esto, un F5
  // mientras el creativo trabaja la hacía desaparecer, y la pieza quedaba
  // solo en "Esperando tu aprobación" — donde aprobarla NO llena el
  // formulario de publicar.
  //
  // Y lo mismo con una pieza YA ACEPTADA en las últimas 12 horas: el
  // formulario de publicar vive en la memoria de la pantalla y se vacía al
  // recargar. La pieza ya no sale en la barra (lo encargado se esconde 14
  // días), así que sin esto no había forma de recuperarla.
  useEffect(() => {
    if (encargo || !Array.isArray(trabajos)) return;
    const ahora = Date.now();
    const delPanel = (w) => w.origin_platform === 'panel' && w.tipo === 'promocion' && !ignorados.has(w.id);
    const vivo = trabajos.find((w) => delPanel(w)
      && ['pending', 'processing', 'waiting_approval'].includes(w.estado)
      && ahora - new Date(w.creado_en).getTime() < 24 * 3600 * 1000);
    const aceptada = !vivo && trabajos.find((w) => delPanel(w)
      && w.estado === 'completed'
      && w.resultado?.estado === 'arte' && w.resultado?.arte_imagen_id
      && w.terminado_en && ahora - new Date(w.terminado_en).getTime() < 12 * 3600 * 1000);
    const retomar = vivo || aceptada;
    // Sin las piezas: la tarjeta las busca por el código que va en el pedido.
    if (retomar) setEncargo({ trabajoId: retomar.id, productos: [] });
  }, [trabajos, encargo, ignorados]);

  const cargar = useCallback(() => {
    setCargando(true);
    supabase.rpc('equipo_candidatos_promocion', { p_limite: 40 })
      .then(({ data, error }) => {
        setCargando(false);
        if (error) return;
        setTodas(Array.isArray(data) ? data : []);
        setTanda(0);
        setElegidos([]);
      });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const totalTandas = Math.max(1, Math.ceil(todas.length / POR_TANDA));
  const lista = todas.slice(tanda * POR_TANDA, (tanda + 1) * POR_TANDA);

  // Lo elegido se conserva al pasar de tanda: así se puede escoger una de la
  // primera y otra de la tercera. Abajo se dice cuáles, porque la elegida
  // puede no estar a la vista.
  const otras = () => {
    if (tanda + 1 < totalTandas) setTanda((t) => t + 1);
    else cargar();
  };
  const nombresElegidos = todas.filter((p) => elegidos.includes(p.id)).map((p) => p.descripcion);

  const alternar = (id) => setElegidos((s) => {
    if (s.includes(id)) return s.filter((x) => x !== id);
    if (s.length >= MAX) return s;   // dos como mucho: es una promoción, no un catálogo
    return [...s, id];
  });

  const encargar = async () => {
    if (!elegidos.length || enviando) return;
    // Las piezas elegidas, ANTES de recargar la lista: el formulario de
    // publicar las necesita (código, precio, existencia del sistema) y
    // cargar() vacía la selección.
    const piezasElegidas = todas.filter((p) => elegidos.includes(p.id))
      .sort((a, b) => Number(b.precio || 0) - Number(a.precio || 0));
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
        description: 'Te enseño aquí mismo cómo va. Si quieres otro distinto, cámbiale el enfoque.',
      });
    } else {
      toast({
        title: data?.revivido ? 'Reenviado al Comercial-Creativo' : 'Encargado al Comercial-Creativo',
        description: 'Te enseño la pieza aquí mismo en cuanto esté.',
      });
    }
    // Duplicado o no, hay un trabajo: se sigue igual.
    if (data?.trabajo_id) {
      setEncargo({ trabajoId: data.trabajo_id, productos: piezasElegidas });
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
        {todas.length > POR_TANDA && (
          <span className="text-[10px] text-slate-400">
            {tanda + 1} de {totalTandas}
          </span>
        )}
        <button type="button" onClick={otras} disabled={cargando}
          title={tanda + 1 < totalTandas ? 'Ver otras cinco' : 'Volver a las primeras'}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
          {tanda + 1 < totalTandas ? 'Otras' : 'Primeras'}
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
          <span className="max-w-full truncate text-[10px] font-semibold text-violet-700"
            title={nombresElegidos.join(' · ')}>
            Elegidas: {nombresElegidos.join(' · ')}
          </span>
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

      {/* La pieza del encargo, aquí mismo: sin pasar por el canal de Hermes.
          Al usarla, llena el formulario de "Publicar una promoción". */}
      {encargo && (
        <EncargoArte
          key={encargo.trabajoId}
          trabajoId={encargo.trabajoId}
          productos={encargo.productos}
          onUsar={(prefill) => {
            if (onUsar) onUsar(prefill);
            ignorar(encargo.trabajoId);
            setEncargo(null);
          }}
          onCerrar={() => {
            ignorar(encargo.trabajoId);
            setEncargo(null);
          }}
        />
      )}
    </div>
  );
}

export default RecomendacionesDelDia;
