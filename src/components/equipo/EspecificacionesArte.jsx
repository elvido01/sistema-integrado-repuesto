import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

// Cómo deben verse las promociones de esta empresa.
//
// Estaba escrito en el código, y eso significaba que cambiar "el precio más
// grande" o "sin marcos" pasaba por un despliegue. Ahora vive en
// `equipo_criterios` y viaja en TODOS los encargos de arte: el dueño lo
// cambia aquí y la siguiente pieza ya sale distinta.
//
// No es una lista de deseos: es lo que el Comercial-Creativo lee antes de
// decidir el título, los colores y la composición.
export function EspecificacionesArte() {
  const { toast } = useToast();
  const [reglas, setReglas] = useState([]);
  const [nueva, setNueva] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    supabase.rpc('equipo_criterios_ver', { p_tipo: 'arte' }).then(({ data, error }) => {
      if (error) return;
      setReglas(Array.isArray(data) ? data : []);
    });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (clave, texto, activo = true) => {
    setGuardando(true);
    const { error } = await supabase.rpc('equipo_criterio_guardar', {
      p_tipo: 'arte', p_clave: clave, p_texto: texto, p_orden: null, p_activo: activo,
    });
    setGuardando(false);
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: error.message });
      return false;
    }
    cargar();
    return true;
  };

  const agregar = async () => {
    const t = nueva.trim();
    if (!t) return;
    // La clave se deriva del texto: el dueño escribe una regla, no un
    // identificador. Pedirle un nombre técnico sería pedirle que piense
    // como la base de datos.
    const clave = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').slice(0, 40) || `regla_${Date.now()}`;
    if (await guardar(clave, t)) setNueva('');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-bold text-slate-800">Cómo deben verse las promociones</span>
        <span className="text-[11px] text-slate-400">
          {reglas.length} regla{reglas.length === 1 ? '' : 's'} · {abierto ? 'ocultar' : 'ver'}
        </span>
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        El Comercial-Creativo las lee antes de montar cada pieza. Cámbialas y la
        siguiente promoción sale distinta, sin tocar nada más.
      </p>

      {abierto && (
        <div className="mt-3 space-y-2">
          {reglas.map((r) => (
            <div key={r.clave} className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2">
              <p className="flex-1 text-[11px] leading-snug text-slate-700">{r.texto}</p>
              <button type="button" disabled={guardando}
                onClick={() => guardar(r.clave, r.texto, false)}
                title="Quitar esta regla"
                className="shrink-0 text-[10px] font-semibold text-red-500 hover:underline disabled:opacity-40">
                quitar
              </button>
            </div>
          ))}

          {reglas.length === 0 && (
            <p className="py-2 text-center text-[11px] text-slate-400">
              Sin reglas. El creativo decidirá por su cuenta.
            </p>
          )}

          <Textarea
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Ej.: el precio siempre en naranja y más grande que el título"
            rows={2}
            className="text-xs"
          />
          <Button type="button" size="sm" onClick={agregar}
            disabled={guardando || !nueva.trim()} className="w-full">
            Añadir regla
          </Button>
        </div>
      )}
    </div>
  );
}

export default EspecificacionesArte;
