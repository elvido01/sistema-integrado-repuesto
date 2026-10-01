import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Check, Loader2, RefreshCw } from 'lucide-react';

// FOTOS DEL DÍA — cinco piezas sin imagen para fotografiar cada día.
//
// El Paso 1 (Qué promocionar hoy) solo recomienda piezas CON foto: al 01/10
// eran 72 de 3,867 en Repuestos Morla. Cada foto que se sube aquí es una
// pieza más que el equipo puede promocionar. Salen primero las que la gente
// compra y luego las que tienen más dinero parado (ver sql/fotos_del_dia.sql).
//
// La foto se achica en el navegador antes de subirla (las del teléfono pasan
// de 5 MB) y queda en productos.imagen_url, la misma que usa el formulario de
// producto: se ve en el catálogo, en el buscador y en las promociones.

const META = 5;
const LADO_MAX = 1200;

const achicar = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';   // los PNG transparentes no quedan negros en JPG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo leer la imagen.'))), 'image/jpeg', 0.85);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ese archivo no es una imagen.')); };
  img.src = url;
});

export function FotosDelDia({ onFotoSubida }) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [todas, setTodas] = useState([]);
  const [hoy, setHoy] = useState(0);
  const [faltan, setFaltan] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [saltadas, setSaltadas] = useState(() => new Set());
  const [hechas, setHechas] = useState({});        // { producto_id: url }
  const [subiendo, setSubiendo] = useState(null);  // producto_id
  const input = useRef(null);
  const destino = useRef(null);                    // la pieza a la que va el archivo elegido

  const cargar = useCallback(() => {
    setCargando(true);
    supabase.rpc('equipo_fotos_pendientes', { p_limite: 60 }).then(({ data, error }) => {
      setCargando(false);
      if (error) return;
      setTodas(Array.isArray(data?.piezas) ? data.piezas : []);
      setHoy(Number(data?.hoy) || 0);
      setFaltan(Number(data?.faltan) || 0);
      setSaltadas(new Set());
      setHechas({});
    });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const lista = todas.filter((p) => !saltadas.has(p.id)).slice(0, META);

  // "Otras": esta tanda se aparta (las hechas y las que no se pueden
  // fotografiar ahora) y entran las siguientes.
  const otras = () => {
    const quedan = todas.filter((p) => !saltadas.has(p.id)).length;
    if (quedan <= META) { cargar(); return; }
    setSaltadas((s) => new Set([...s, ...lista.map((p) => p.id)]));
  };

  const elegir = (p) => {
    destino.current = p;
    input.current?.click();
  };

  const subir = async (e) => {
    const file = e.target.files?.[0];
    const p = destino.current;
    e.target.value = '';
    if (!file || !p) return;
    setSubiendo(p.id);
    try {
      const blob = await achicar(file);
      const codigo = String(p.codigo || 'pieza').replace(/[^a-zA-Z0-9]/g, '_');
      const ruta = `fotos/${tenantId}/${codigo}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('product-images')
        .upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('product-images').getPublicUrl(ruta);
      const { error } = await supabase.rpc('equipo_foto_guardar', { p_producto_id: p.id, p_url: pub.publicUrl });
      if (error) {
        await supabase.storage.from('product-images').remove([ruta]);
        throw error;
      }
      setHechas((h) => ({ ...h, [p.id]: pub.publicUrl }));
      setHoy((n) => n + 1);
      setFaltan((n) => Math.max(0, n - 1));
      if (onFotoSubida) onFotoSubida(p);
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se subió la foto', description: err.message || 'Inténtalo otra vez.' });
    } finally {
      setSubiendo(null);
    }
  };

  const listoHoy = hoy >= META;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={subir} />

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Camera className="h-4 w-4 text-sky-600" />
          Fotos del día
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Cinco piezas que se venden y no tienen foto. Cada foto la pone en el catálogo y la
          deja lista para promocionarla en el Paso 1.
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          listoHoy ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}
          title={`${faltan.toLocaleString('es-DO')} piezas con existencia siguen sin foto`}>
          {listoHoy ? `¡Listo por hoy! ${hoy} subidas` : `Hoy: ${hoy} de ${META}`}
        </span>
        <button type="button" onClick={otras} disabled={cargando || !!subiendo}
          title="Apartar estas y ver las siguientes"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
          Otras
        </button>
      </div>

      {cargando && <p className="py-2 text-center text-[11px] text-slate-400">Buscando piezas sin foto…</p>}

      {!cargando && lista.length === 0 && (
        <p className="py-2 text-center text-[11px] text-slate-400">
          Todas las piezas con existencia ya tienen foto.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {lista.map((p) => {
          const url = hechas[p.id];
          const enCurso = subiendo === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => !url && !subiendo && elegir(p)}
              disabled={!!subiendo && !enCurso}
              title={url ? 'Foto puesta' : `${p.razon} Toca para subir la foto.`}
              className={`flex items-start gap-2 rounded border p-2 text-left transition ${
                url ? 'cursor-default border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40'}`}
            >
              {url ? (
                <img src={url} alt={p.descripcion}
                  className="h-11 w-11 shrink-0 rounded border border-emerald-200 object-contain" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                  {enCurso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold leading-tight text-slate-800">{p.descripcion}</p>
                <p className="text-[10px] text-slate-500">
                  RD${Number(p.precio || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  {' · '}{p.codigo}
                </p>
                {url ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                    <Check className="h-3 w-3" /> Foto puesta
                  </p>
                ) : (
                  <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-sky-700">
                    {enCurso ? 'Subiendo…' : p.razon}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
