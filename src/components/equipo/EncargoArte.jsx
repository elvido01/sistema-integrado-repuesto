import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle2, RotateCcw, X, AlertTriangle } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════
//  EL ARTE DEL ENCARGO, AQUÍ MISMO
// ════════════════════════════════════════════════════════════════════════
//  El dueño lo pidió así: "no quiero que me mande la solicitud de
//  autorización por Hermes, sino que en la misma ventana de Equipo IA
//  presente la imagen. Cuando yo acepto la imagen, me llene el formulario de
//  publicar promoción".
//
//  Desde el panel el encargo ya sale pidiendo el ARTE FINAL y Hermes ya no
//  avisa por el canal (sql/equipo_promo_directo_al_panel.sql). Esto es lo que
//  lo enseña: sigue el trabajo hasta que la pieza está en la mesa y la pone
//  delante, con tres salidas:
//
//   · Usar esta imagen — sube las dos piezas a un sitio PÚBLICO (Meta las
//     descarga ella misma a la hora de publicar: una URL firmada que caduca
//     no sirve para algo que se programa), cierra el trabajo y llena el
//     formulario. Aceptar NO publica: eso ya era así.
//   · Pedir otra — vuelve al creativo con lo que el dueño diga.
//   · Descartar — cierra el trabajo sin usarlo.
// ════════════════════════════════════════════════════════════════════════

const CADA_MS = 3000;

/** La pieza del creativo: bytes en la base → Blob para subirla. */
function aBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'image/png' });
}

/** El copy llega como texto suelto o como {titulo, descripcion}. */
function textoDe(x) {
  if (!x) return '';
  if (typeof x === 'string') return x;
  return [x.titulo, x.descripcion].filter(Boolean).join('\n\n');
}

function esArte(c) {
  return c && typeof c === 'object' && c.estado === 'arte' && !!c.arte_imagen_id;
}

function Pieza({ imagenId, etiqueta, onCargada }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!imagenId) return undefined;
    let vivo = true;
    supabase.rpc('hermes_imagen_ver', { p_imagen_id: imagenId }).then(({ data, error }) => {
      if (!vivo || error || !data?.ok) return;
      setSrc(`data:${data.mime_type};base64,${data.b64}`);
      if (onCargada) onCargada(imagenId, data);
    });
    return () => { vivo = false; };
  }, [imagenId, onCargada]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {src
          ? <img src={src} alt={etiqueta} className="max-h-56 w-auto object-contain" />
          : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
      </div>
      <span className="text-[10px] font-semibold text-slate-500">{etiqueta}</span>
    </div>
  );
}

export function EncargoArte({ trabajoId, productos, onUsar, onCerrar }) {
  const { toast } = useToast();
  const [detalle, setDetalle] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [pidiendoOtra, setPidiendoOtra] = useState(false);
  const [comentario, setComentario] = useState('');
  // Los bytes de cada pieza, tal como llegaron: para subirlas no hay que
  // volver a pedirlas.
  const bytesPiezas = useRef({});

  const mirar = useCallback(async () => {
    const { data, error } = await supabase.rpc('equipo_trabajo_detalle', { p_trabajo_id: trabajoId });
    if (!error && data?.permitido) setDetalle(data);
  }, [trabajoId]);

  const trabajo = detalle?.trabajo;
  const aprobaciones = Array.isArray(detalle?.aprobaciones) ? detalle.aprobaciones : [];

  // Las piezas del encargo. Si vienen de la barra, ya están; si la página se
  // recargó y el encargo se retomó, se buscan por el código que va escrito en
  // el pedido ("… (código 784401) …"), con su existencia del sistema para el
  // formulario.
  const [piezas, setPiezas] = useState(productos || []);
  useEffect(() => {
    if ((productos && productos.length) || !trabajo?.peticion) return undefined;
    const codigos = [...String(trabajo.peticion).matchAll(/\(código ([^)]+)\)/g)].map((m) => m[1].trim());
    if (!codigos.length) return undefined;
    let vivo = true;
    (async () => {
      const { data } = await supabase.from('productos')
        .select('id, codigo, descripcion, precio').in('codigo', codigos);
      if (!vivo || !data?.length) return;
      const conStock = await Promise.all(data.map(async (p) => {
        const { data: s } = await supabase.rpc('get_stock_actual', { producto_uuid: p.id });
        return { ...p, existencia: Number(s || 0) };
      }));
      conStock.sort((a, b) => Number(b.precio || 0) - Number(a.precio || 0));
      if (vivo) setPiezas(conStock);
    })();
    return () => { vivo = false; };
  }, [trabajo?.peticion, productos]);
  const enMesa = [...aprobaciones].reverse().find((a) => a.estado === 'pending' && esArte(a.contenido));
  const terminado = ['cancelled', 'failed', 'completed'].includes(trabajo?.estado);
  // Una pieza que ya se aceptó y se vuelve a pedir el mismo día (por ejemplo
  // porque se recargó la página y se perdió el formulario): se enseña igual y
  // se puede volver a usar. No se vuelve a aprobar: ya lo está.
  const yaAceptada = !enMesa && trabajo?.estado === 'completed' && esArte(trabajo?.resultado)
    ? trabajo.resultado : null;
  const pieza = enMesa?.contenido || yaAceptada;

  // Se mira cada tres segundos mientras el creativo trabaja. En cuanto la
  // pieza está en la mesa, o el trabajo terminó, se deja de preguntar.
  useEffect(() => {
    mirar();
    if (enMesa || terminado) return undefined;
    const t = setInterval(mirar, CADA_MS);
    return () => clearInterval(t);
  }, [mirar, enMesa?.id, terminado]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarPieza = useCallback((id, data) => { bytesPiezas.current[id] = data; }, []);

  // ¿Va por la segunda vuelta? Pasa cuando la revisión de Hermes le devuelve
  // la pieza, o cuando el dueño pidió otra. Se dice, para que la espera tenga
  // explicación. (El texto de los reparos viaja dentro del encargo y el
  // detalle del trabajo no lo enseña; lo que sí se ve es cuántos encargos van.)
  const rehaciendo = (detalle?.mensajes || [])
    .filter((m) => m.to_agent === 'comercial_creativo').length > 1;

  const decidir = async (decision, texto) => {
    const { error } = await supabase.rpc('equipo_decidir', {
      p_aprobacion_id: enMesa.id, p_decision: decision, p_comentario: texto || null,
    });
    if (error) throw error;
  };

  const subir = async (imagenId, nombre) => {
    let data = bytesPiezas.current[imagenId];
    if (!data) {
      const r = await supabase.rpc('hermes_imagen_ver', { p_imagen_id: imagenId });
      if (r.error || !r.data?.ok) throw new Error('No se pudo leer la pieza del creativo.');
      data = r.data;
    }
    const ext = data.mime_type === 'image/jpeg' ? 'jpg' : data.mime_type === 'image/webp' ? 'webp' : 'png';
    const ruta = `promos/${Date.now()}-${Math.random().toString(36).slice(2)}-${nombre}.${ext}`;
    const { error } = await supabase.storage.from('ai-marketing').upload(ruta, aBlob(data.b64, data.mime_type), {
      contentType: data.mime_type,
    });
    if (error) throw error;
    return supabase.storage.from('ai-marketing').getPublicUrl(ruta).data.publicUrl;
  };

  const usar = async () => {
    if (!pieza || trabajando) return;
    setTrabajando(true);
    try {
      const c = pieza;
      // Primero subir, después aceptar: si la subida falla, el trabajo sigue
      // en la mesa y se puede volver a intentar. Al revés quedaría aceptado
      // y sin imágenes en el formulario.
      const [feed, historia] = await Promise.all([
        subir(c.arte_imagen_id, 'feed'),
        c.arte_historia_id ? subir(c.arte_historia_id, 'historia') : Promise.resolve(''),
      ]);
      // Solo se aprueba lo que está en la mesa. La que ya estaba aceptada se
      // usa tal cual.
      if (enMesa) await decidir('approved');

      const principal = piezas?.[0] || null;
      onUsar({
        producto: principal,
        titulo: principal?.descripcion || trabajo?.titulo || '',
        media: { imagen_feed: feed, ...(historia ? { imagen_historia: historia } : {}) },
        textos: {
          facebook: textoDe(c.copy?.facebook),
          instagram: textoDe(c.copy?.instagram),
        },
      });
      toast({ title: 'Listo para publicar', description: 'Llené el formulario de abajo con la pieza. Confirma la existencia y sigue.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo usar la pieza', description: e.message, duration: 10000 });
    } finally {
      setTrabajando(false);
    }
  };

  const otra = async () => {
    if (!enMesa || trabajando) return;
    setTrabajando(true);
    try {
      await decidir('changes_requested', comentario.trim());
      setComentario('');
      setPidiendoOtra(false);
      toast({ title: 'Se la devolví al creativo', description: 'Te enseño la nueva aquí mismo.' });
      await mirar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo pedir otra', description: e.message });
    } finally {
      setTrabajando(false);
    }
  };

  const descartar = async () => {
    if (!enMesa || trabajando) return;
    setTrabajando(true);
    try {
      await decidir('rejected');
      onCerrar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo descartar', description: e.message });
      setTrabajando(false);
    }
  };

  const nombre = piezas?.map((p) => p.descripcion).join(' + ') || trabajo?.titulo || 'la promoción';

  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-bold text-slate-800">Encargo: {nombre}</span>
        {!enMesa && (
          <button type="button" onClick={onCerrar} title="Dejar de mirar este encargo"
            className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Esperando ── */}
      {!enMesa && !terminado && (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
          {rehaciendo
            ? 'El Comercial-Creativo está rehaciendo la pieza…'
            : 'El Comercial-Creativo está montando la pieza. Suele tardar menos de un minuto…'}
        </div>
      )}

      {/* ── Terminó sin pieza ── */}
      {!pieza && terminado && (
        <div className="flex items-start gap-2 py-2 text-xs text-slate-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {trabajo?.estado === 'completed'
              ? 'Este encargo ya se cerró.'
              : `El encargo terminó sin pieza (${trabajo?.estado}).${trabajo?.error ? ` ${trabajo.error}` : ''}`}
          </span>
        </div>
      )}

      {/* ── La pieza: en la mesa, o ya aceptada antes ── */}
      {pieza && (
        <>
          {yaAceptada && (
            <p className="mb-2 text-[11px] font-semibold text-emerald-700">
              Esta pieza ya la aceptaste hoy. Puedes volver a usarla en el formulario.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Pieza imagenId={pieza.arte_imagen_id} etiqueta="Feed cuadrado" onCargada={guardarPieza} />
            {pieza.arte_historia_id && (
              <Pieza imagenId={pieza.arte_historia_id} etiqueta="Historia 9:16" onCargada={guardarPieza} />
            )}
          </div>

          {Array.isArray(pieza.advertencias) && pieza.advertencias.length > 0 && (
            <ul className="mt-2 list-disc rounded border border-amber-200 bg-amber-50 py-1.5 pl-6 pr-2 text-[11px] text-amber-900">
              {pieza.advertencias.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}

          {yaAceptada ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={trabajando} onClick={usar}
                className="bg-emerald-600 text-white hover:bg-emerald-700">
                {trabajando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                Volver a usarla
              </Button>
              <button type="button" onClick={onCerrar}
                className="text-[11px] font-semibold text-slate-500 hover:underline">cerrar</button>
            </div>
          ) : pidiendoOtra ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={comentario} onChange={(e) => setComentario(e.target.value)}
                placeholder="¿Qué le cambio? Ej.: el precio más grande, fondo más claro."
                className="h-8 min-w-[240px] flex-1 rounded border border-slate-300 px-2 text-xs" />
              <Button size="sm" disabled={trabajando} onClick={otra}>
                {trabajando ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} Pedírsela
              </Button>
              <button type="button" className="text-[11px] text-slate-500 hover:underline"
                onClick={() => setPidiendoOtra(false)}>cancelar</button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={trabajando} onClick={usar}
                className="bg-emerald-600 text-white hover:bg-emerald-700">
                {trabajando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                Usar esta imagen
              </Button>
              <Button size="sm" variant="outline" disabled={trabajando} onClick={() => setPidiendoOtra(true)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Pedir otra
              </Button>
              <button type="button" disabled={trabajando} onClick={descartar}
                className="text-[11px] font-semibold text-slate-500 hover:text-red-600 hover:underline disabled:opacity-40">
                Descartar
              </button>
              <span className="text-[10px] text-slate-400">
                Aceptarla no publica nada: llena el formulario de abajo.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default EncargoArte;
