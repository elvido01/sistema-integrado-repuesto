import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ExternalLink, Loader2, Megaphone, Plus, Sparkles, X } from 'lucide-react';

// LO QUE ANUNCIA TU SUPLIDOR — la demanda que crea Pedro Racing, aprovechada.
//
// (04/10/2026) Pedro Racing publica reels de piezas que Morla le compra. Un
// repost no lleva precio ni WhatsApp, pero dice que esa pieza la va a buscar
// la gente ESTA semana. Aquí se pega el enlace; el Creativo (en la PC) dice
// qué pieza es, el dueño confirma cuál de su catálogo, y:
//   · si no la tiene o le queda poca → "Pedir" (Suplidor Virtual, al mismo
//     vendedor que ya la vende: el suplidor de la pieza);
//   · si la tiene → sale PRIMERO en "Qué promocionar hoy" 14 días, y se
//     puede encargar la promoción en el acto.
// Ver sql/videos_del_suplidor.sql y scripts/estudioVideoSuplidor.mjs.

const dinero = (n) => `RD$${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

const limpiarEnlace = (t) => {
  try { const u = new URL(String(t).trim()); u.search = ''; u.hash = ''; return u.toString(); }
  catch { return String(t).trim(); }
};

// Lo que conviene hacer con la pieza, según su existencia y su venta.
function situacion(p) {
  const ex = Number(p.existencia) || 0;
  const v30 = Number(p.vendidos_30d) || 0;
  if (ex <= 0) return { tono: 'rojo', texto: 'No te queda ninguna', pedir: Math.max(2, v30) };
  if (ex < 5 || ex < v30 / 2) return { tono: 'ambar', texto: `Te quedan ${ex}: se te acaba pronto`, pedir: Math.max(2, v30 - ex) };
  return { tono: 'verde', texto: `Tienes ${ex} en el estante`, pedir: null };
}

export function AnunciosDelSuplidor({ onEncargado }) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [videos, setVideos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [enlace, setEnlace] = useState('');
  const [ocupado, setOcupado] = useState(null);   // id del video en el que se trabaja
  const [codigoManual, setCodigoManual] = useState({});

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('equipo_videos_suplidor_lista');
    setCargando(false);
    if (!error) setVideos(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const enCola = videos.some((v) => v.estado === 'pendiente' || v.estado === 'estudiando');
  useEffect(() => {
    if (!enCola) return undefined;
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, [enCola, cargar]);

  const anadir = async () => {
    const url = limpiarEnlace(enlace);
    if (!/^https:\/\/(www\.)?(instagram\.com|tiktok\.com|vm\.tiktok\.com|facebook\.com|fb\.watch|youtube\.com|youtu\.be)\//i.test(url)) {
      toast({ variant: 'destructive', title: 'Ese enlace no sirve', description: 'Pega el enlace del reel (Instagram, TikTok, Facebook o YouTube).' });
      return;
    }
    setOcupado('nuevo');
    const { error } = await supabase.from('equipo_videos_suplidor').insert({ tenant_id: tenantId, url }).select('id');
    setOcupado(null);
    if (error) {
      toast({ variant: 'destructive', title: 'No se añadió',
        description: /duplicate|unique/i.test(error.message) ? 'Ese video ya está en la lista.' : error.message });
      return;
    }
    setEnlace('');
    toast({ title: 'Video añadido', description: 'El Creativo mira qué pieza es en uno o dos minutos (la PC encendida).' });
    cargar();
  };

  const elegir = async (v, codigo, sinCatalogo = false) => {
    setOcupado(v.id);
    const { error } = await supabase.rpc('equipo_video_sup_elegir', {
      p_id: v.id, p_codigo: codigo || null, p_sin_catalogo: sinCatalogo });
    setOcupado(null);
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); return; }
    cargar();
  };

  const pedir = async (v, cantidad) => {
    setOcupado(v.id);
    const { data, error } = await supabase.rpc('equipo_video_sup_pedir', { p_id: v.id, p_cantidad: cantidad });
    setOcupado(null);
    if (error || !data?.ok) {
      toast({ variant: 'destructive', title: 'No se pudo pedir', description: error?.message || 'Inténtalo otra vez.' });
      return;
    }
    toast({ title: data.ya_estaba ? 'Ya estaba en Suplidor Virtual' : 'Enviada a Suplidor Virtual',
      description: 'Va con el suplidor que ya te vende esa pieza.' });
    cargar();
  };

  const encargar = async (v) => {
    setOcupado(v.id);
    const { data, error } = await supabase.rpc('equipo_encargar_promocion', {
      p_producto_ids: [v.producto.id],
      p_enfoque: `La está anunciando ${v.cuenta || 'el suplidor'} en Instagram: la gente la está buscando esta semana.`,
      p_formato: 'historia',
    });
    setOcupado(null);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo encargar', description: error.message }); return; }
    toast({ title: data?.duplicado ? 'Ya estaba encargada hoy' : 'Promoción encargada',
      description: 'Las imágenes y el reel salen en el Paso 2, arriba, en unos cinco minutos.' });
    if (onEncargado) onEncargado(data?.trabajo_id);
  };

  const quitar = async (v) => {
    if (!window.confirm('¿Quitar este video de la lista?')) return;
    const { data, error } = await supabase.from('equipo_videos_suplidor').delete().eq('id', v.id).select('id');
    if (error || !data?.length) { toast({ variant: 'destructive', title: 'No se pudo quitar', description: error?.message }); return; }
    cargar();
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Megaphone className="h-4 w-4 text-fuchsia-600" />
          Lo que anuncia tu suplidor
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Pega el reel de Pedro Racing (o de otro suplidor). Te digo qué pieza es: si no la tienes, la pides;
          si la tienes, sale primero en tus promociones mientras su anuncio está fresco.
        </p>
      </div>

      <div className="mb-2 flex gap-2">
        <input value={enlace} onChange={(e) => setEnlace(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && anadir()}
          placeholder="https://www.instagram.com/reel/…"
          className="h-8 flex-1 rounded-md border px-2 text-xs" />
        <Button type="button" size="sm" className="h-8" onClick={anadir} disabled={ocupado === 'nuevo' || !enlace.trim()}>
          {ocupado === 'nuevo' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          Añadir
        </Button>
      </div>

      {!cargando && videos.length === 0 && (
        <p className="py-2 text-center text-[11px] text-slate-400">Todavía no hay videos del suplidor.</p>
      )}

      <div className="space-y-2">
        {videos.map((v) => {
          const p = v.producto;
          const sit = p ? situacion(p) : null;
          const pedidaYa = v.pedido || p?.en_suplidor_virtual || !!p?.en_orden;
          const trabajando = ocupado === v.id;
          return (
            <div key={v.id} className="flex gap-2 rounded-lg border border-slate-100 p-2">
              <a href={v.url} target="_blank" rel="noreferrer" title="Ver el video"
                className="relative h-24 w-14 shrink-0 overflow-hidden rounded bg-slate-900">
                {v.miniatura && <img src={v.miniatura} alt="" className="h-full w-full object-cover" />}
                <ExternalLink className="absolute bottom-0.5 right-0.5 h-3 w-3 text-white" />
              </a>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[11px] font-bold text-slate-800">
                    {v.estado === 'listo' ? (v.pieza || 'Pieza sin identificar')
                      : v.estado === 'error' ? `No se pudo mirar: ${v.error || ''}`
                        : <span className="flex items-center gap-1 font-normal text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> El Creativo está mirando qué pieza es…</span>}
                  </p>
                  {v.cuenta && <span className="text-[10px] text-slate-400">@{v.cuenta}</span>}
                  <button type="button" onClick={() => quitar(v)} title="Quitar" className="text-slate-300 hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Con la pieza ya elegida: qué conviene hacer. */}
                {p && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-slate-600">{p.codigo} · {p.descripcion} · {dinero(p.precio)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      sit.tono === 'rojo' ? 'bg-red-50 text-red-700' : sit.tono === 'ambar' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                      {sit.texto}
                    </span>
                    {sit.pedir && !pedidaYa && (
                      <Button size="sm" className="h-6 bg-red-600 px-2 text-[10px] hover:bg-red-700" disabled={trabajando}
                        onClick={() => pedir(v, sit.pedir)}>
                        {trabajando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Pedir {sit.pedir}
                      </Button>
                    )}
                    {pedidaYa && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                        <CheckCircle2 className="h-3 w-3" /> {p.en_orden ? `En ${p.en_orden}` : 'Pedida en Suplidor Virtual'}
                      </span>
                    )}
                    {sit.tono !== 'rojo' && (p.foto ? (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={trabajando} onClick={() => encargar(v)}>
                        <Sparkles className="mr-1 h-3 w-3 text-violet-600" /> Encargar promoción ahora
                      </Button>
                    ) : (
                      <span className="text-[10px] text-amber-700">Ponle foto (Fotos del día) para poder promocionarla</span>
                    ))}
                    {v.fresco && sit.tono !== 'rojo' && p.foto && (
                      <span className="text-[10px] text-fuchsia-700">Sale primero en "Qué promocionar hoy" hasta 14 días</span>
                    )}
                  </div>
                )}

                {/* No la tiene en el catálogo. */}
                {!p && v.sin_catalogo && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">No la tienes en el catálogo</span>
                    {v.pedido ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500"><CheckCircle2 className="h-3 w-3" /> Pedida en Suplidor Virtual</span>
                    ) : (
                      <Button size="sm" className="h-6 bg-red-600 px-2 text-[10px] hover:bg-red-700" disabled={trabajando} onClick={() => pedir(v, 2)}>
                        Pedirla al suplidor
                      </Button>
                    )}
                    <button type="button" className="text-[10px] text-slate-500 hover:underline" onClick={() => elegir(v, null, false)}>
                      me equivoqué
                    </button>
                  </div>
                )}

                {/* Falta decir cuál es del catálogo. */}
                {!p && !v.sin_catalogo && v.estado === 'listo' && (
                  <div className="mt-1">
                    <p className="mb-1 text-[10px] text-slate-500">¿Cuál de tu catálogo es?</p>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(v.candidatos) ? v.candidatos : []).slice(0, 5).map((c) => (
                        <button key={c.codigo} type="button" disabled={trabajando} onClick={() => elegir(v, c.codigo)}
                          title={`${c.descripcion} · ${dinero(c.precio)} · ${Number(c.existencia)} en estante`}
                          className="max-w-[260px] truncate rounded border border-slate-200 px-1.5 py-0.5 text-left text-[10px] hover:border-violet-400 hover:bg-violet-50">
                          <b>{c.codigo}</b> · {c.descripcion} · {Number(c.existencia)} u.
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <input value={codigoManual[v.id] || ''} placeholder="u otro código"
                        onChange={(e) => setCodigoManual((m) => ({ ...m, [v.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && codigoManual[v.id] && elegir(v, codigoManual[v.id])}
                        className="h-6 w-28 rounded border px-1.5 text-[10px]" />
                      <button type="button" disabled={trabajando || !codigoManual[v.id]} onClick={() => elegir(v, codigoManual[v.id])}
                        className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-slate-50 disabled:opacity-40">Es esta</button>
                      <button type="button" disabled={trabajando} onClick={() => elegir(v, null, true)}
                        className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50">No la tengo</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
