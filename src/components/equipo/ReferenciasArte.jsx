import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ImagePlus, Trash2 } from 'lucide-react';

// La referencia del dueño.
//
// "El arte de Comercial-Creativo no es apto para publicar. ¿Cómo le muestro
//  la imagen del tanque para que la tome como referencia?" — Aquí.
//
// Dos usos, y la diferencia importa:
//   ESTILO → es el listón. El creativo la mira antes de decidir.
//   FONDO  → se usa DE FONDO. La pieza se monta encima de ella.
//
// El segundo es el que más cambia el resultado de golpe: un fondo bueno deja
// de ser algo que hay que dibujar y pasa a ser algo que el dueño ya tiene.

const MAX = 8 * 1024 * 1024;

// El RPC quiere base64 pelado; FileReader devuelve un data: URL con cabecera.
const aBase64 = (file) => new Promise((ok, mal) => {
  const fr = new FileReader();
  fr.onerror = () => mal(new Error('no se pudo leer el archivo'));
  fr.onload = () => ok(String(fr.result).split(',')[1] || '');
  fr.readAsDataURL(file);
});

function Miniatura({ imagenId }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let vivo = true;
    supabase.rpc('hermes_imagen_ver', { p_imagen_id: imagenId }).then(({ data, error }) => {
      if (!vivo || error || !data?.ok) return;
      setSrc(`data:${data.mime_type};base64,${data.b64}`);
    });
    return () => { vivo = false; };
  }, [imagenId]);
  if (!src) return <div className="h-16 w-16 shrink-0 rounded bg-slate-100" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="shrink-0">
      <img src={src} alt="Referencia" className="h-16 w-16 rounded border border-slate-200 object-cover" />
    </a>
  );
}

export function ReferenciasArte() {
  const { toast } = useToast();
  const [refs, setRefs] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [uso, setUso] = useState('estilo');
  const [nota, setNota] = useState('');
  const archivo = useRef(null);

  const cargar = useCallback(() => {
    supabase.rpc('equipo_referencias_ver').then(({ data, error }) => {
      if (error) return;
      setRefs(Array.isArray(data) ? data : []);
    });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX) {
      toast({ variant: 'destructive', title: 'Pesa demasiado',
        description: `${(f.size / 1048576).toFixed(1)} MB. El máximo son 8 MB.` });
      return;
    }
    setSubiendo(true);
    try {
      const b64 = await aBase64(f);
      const { error } = await supabase.rpc('equipo_referencia_guardar', {
        p_imagen_b64: b64,
        p_mime_type: f.type || 'image/png',
        p_nombre: f.name,
        p_uso: uso,
        p_nota: nota.trim() || null,
      });
      if (error) throw error;
      setNota('');
      cargar();
      toast({ title: 'Referencia guardada',
        description: uso === 'fondo'
          ? 'La próxima pieza se monta sobre ella.'
          : 'El Comercial-Creativo la mirará antes de decidir.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: err.message });
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async (id) => {
    const { error } = await supabase.rpc('equipo_referencia_quitar', { p_id: id });
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo quitar', description: error.message });
      return;
    }
    cargar();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-bold text-slate-800">Tus referencias de diseño</span>
        <span className="text-[11px] text-slate-400">
          {refs.length} imagen{refs.length === 1 ? '' : 'es'} · {abierto ? 'ocultar' : 'ver'}
        </span>
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        Sube una promoción que sí te guste. El Comercial-Creativo la usa de
        punto de partida en vez de inventarse el estilo.
      </p>

      {abierto && (
        <div className="mt-3 space-y-3">
          {refs.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2">
              <Miniatura imagenId={r.imagen_id} />
              <div className="min-w-0 flex-1">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                  r.uso === 'fondo' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}`}>
                  {r.uso === 'fondo' ? 'se usa de fondo' : 'estilo a imitar'}
                </span>
                <p className="mt-1 truncate text-[11px] text-slate-600">{r.nota || r.nombre}</p>
              </div>
              <button type="button" onClick={() => quitar(r.id)}
                title="Quitar esta referencia"
                className="shrink-0 text-slate-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {refs.length === 0 && (
            <p className="py-2 text-center text-[11px] text-slate-400">
              Ninguna todavía. El creativo decide el estilo por su cuenta.
            </p>
          )}

          <div className="rounded border border-dashed border-slate-300 p-2">
            {/* El uso se elige ANTES de subir: es lo que decide si la imagen
                se mira o se dibuja, y preguntarlo después obliga a volver. */}
            <div className="mb-2 flex gap-1">
              {[['estilo', 'Que la imite'], ['fondo', 'Que la use de fondo']].map(([v, txt]) => (
                <button key={v} type="button" onClick={() => setUso(v)}
                  className={`flex-1 rounded px-2 py-1 text-[10px] font-bold ${
                    uso === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {txt}
                </button>
              ))}
            </div>
            <Input value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Qué mirar de ella. Ej.: fíjate en los bullets y el sello."
              className="mb-2 h-8 text-xs" />
            <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp"
              onChange={subir} className="hidden" />
            <Button type="button" size="sm" className="w-full" disabled={subiendo}
              onClick={() => archivo.current?.click()}>
              <ImagePlus className="mr-1 h-3.5 w-3.5" />
              {subiendo ? 'Guardando…' : 'Subir imagen'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReferenciasArte;
