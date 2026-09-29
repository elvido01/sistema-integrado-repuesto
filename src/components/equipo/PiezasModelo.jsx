import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ImagePlus, Trash2, Palette } from 'lucide-react';

// Las piezas modelo: el listón de estilo que GPT Image 2 mira en CADA arte
// del Comercial-Creativo (ver supabase/functions/creativo-escena). Toma tres
// al azar por pieza, así que con cuatro a ocho buenas basta; una mala aquí
// empeora todo lo que salga después.
//
// A diferencia de ReferenciasArte (una referencia para UN encargo), estas
// valen para todos. Viven en el bucket privado `equipo-estilo`, carpeta de la
// empresa activa; el RLS solo deja al dueño de Equipo IA verlas y cambiarlas.

const BUCKET = 'equipo-estilo';
const MAX = 5 * 1024 * 1024;
const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];

const nombreSeguro = (n) => String(n || 'pieza').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60);

export function PiezasModelo() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [piezas, setPiezas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const { data, error } = await supabase.storage.from(BUCKET).list(tenantId, {
      limit: 50, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      setCargando(false);
      toast({ variant: 'destructive', title: 'No se pudieron leer las piezas modelo', description: error.message });
      return;
    }
    const archivos = (data || []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
    const rutas = archivos.map((f) => `${tenantId}/${f.name}`);
    const { data: firmadas } = rutas.length
      ? await supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600)
      : { data: [] };
    setPiezas(archivos.map((f, i) => ({ nombre: f.name, ruta: rutas[i], url: firmadas?.[i]?.signedUrl || null })));
    setCargando(false);
  }, [tenantId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    const malas = lista.filter((f) => !TIPOS.includes(f.type) || f.size > MAX);
    if (malas.length) {
      toast({ variant: 'destructive', title: 'Algunas no se subieron',
        description: `${malas.map((f) => f.name).join(', ')}: solo PNG, JPG o WEBP de hasta 5 MB.` });
    }
    const buenas = lista.filter((f) => !malas.includes(f));
    if (!buenas.length) return;
    setOcupado(true);
    let subidas = 0;
    for (const f of buenas) {
      const ruta = `${tenantId}/${Date.now()}-${nombreSeguro(f.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(ruta, f, { contentType: f.type, upsert: false });
      if (error) toast({ variant: 'destructive', title: `No se subió ${f.name}`, description: error.message });
      else subidas += 1;
    }
    setOcupado(false);
    if (input.current) input.current.value = '';
    if (subidas) toast({ title: `${subidas} pieza(s) modelo añadida(s)`, description: 'Se usan desde el próximo arte.' });
    cargar();
  };

  const quitar = async (p) => {
    if (!window.confirm('¿Quitar esta pieza modelo? El creativo dejará de imitarla.')) return;
    setOcupado(true);
    // remove() sin error no garantiza que borró: se comprueba con lo que devuelve.
    const { data, error } = await supabase.storage.from(BUCKET).remove([p.ruta]);
    setOcupado(false);
    if (error || !data?.length) {
      toast({ variant: 'destructive', title: 'No se pudo quitar', description: error?.message || 'La base no dejó borrarla.' });
      return;
    }
    cargar();
  };

  return (
    <details className="mb-4 rounded-xl border bg-white shadow-sm">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-slate-800">
        <Palette className="h-4 w-4 text-purple-600" />
        Estilo de tus piezas
        <span className="font-normal text-slate-500">
          · {cargando ? 'cargando…' : `${piezas.length} pieza(s) modelo`} · el Comercial-Creativo imita su diseño y su letra
        </span>
      </summary>
      <div className="border-t px-4 py-3">
        <p className="mb-3 text-xs text-slate-500">
          En cada arte, la IA mira 3 de estas al azar y copia su estilo: fondo, luces, podio y tipo de letra.
          No copia sus productos ni sus textos. Pon aquí solo tus mejores piezas (4 a 8): una mala empeora todo lo que salga.
        </p>
        <div className="flex flex-wrap gap-3">
          {piezas.map((p) => (
            <div key={p.ruta} className="group relative h-40 w-28 overflow-hidden rounded-lg border bg-slate-100">
              {p.url && <img src={p.url} alt={p.nombre} className="h-full w-full object-cover" />}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => quitar(p)}
                title="Quitar esta pieza modelo"
                className="absolute right-1 top-1 rounded bg-white/90 p-1 text-red-600 shadow hover:bg-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={ocupado || !tenantId}
            onClick={() => input.current?.click()}
            className="flex h-40 w-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-slate-500 hover:border-purple-400 hover:text-purple-700 disabled:opacity-50"
          >
            <ImagePlus className="h-6 w-6" />
            {ocupado ? 'Subiendo…' : 'Añadir pieza'}
          </button>
          <input
            ref={input}
            type="file"
            accept={TIPOS.join(',')}
            multiple
            className="hidden"
            onChange={(e) => subir(e.target.files)}
          />
        </div>
        {!piezas.length && !cargando && (
          <p className="mt-3 text-xs text-amber-700">
            Sin piezas modelo, la IA sigue un estilo descrito en palabras. Sube tus mejores promociones para que las imite.
          </p>
        )}
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={cargar} disabled={cargando}>Recargar</Button>
        </div>
      </div>
    </details>
  );
}
