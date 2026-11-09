// Colores de un producto y venta por pies (09/11/2026). SOLO empresas tipo
// 'aluminio' (lo decide ProductFormModal). Se guarda aparte del formulario:
// · Largo de la barra en pies (20) → al facturar se puede vender por pies.
// · Colores: cada color es un producto normal (su código, existencia y
//   precio) creado por vent_crear_variantes. SQL: sql/ventanas_variantes.sql
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Palette } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { COLORES_ALUMINIO } from '@/lib/ventanas';

export default function ColoresProducto({ productoId }) {
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [prod, setProd] = useState(null);
  const [base, setBase] = useState(null);           // si este producto es un color: su principal
  const [colores, setColores] = useState([]);
  const [marcados, setMarcados] = useState([]);
  const [largo, setLargo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: p } = await supabase.from('productos').select('id, codigo, descripcion, variante_de, largo_pies').eq('id', productoId).maybeSingle();
    setProd(p || null);
    setLargo(p?.largo_pies != null ? String(p.largo_pies) : '');
    if (p?.variante_de) {
      const { data: b } = await supabase.from('productos').select('id, codigo, descripcion').eq('id', p.variante_de).maybeSingle();
      setBase(b || null);
    } else setBase(null);
    const { data: v } = await supabase.rpc('vent_variantes', { p_producto: productoId });
    setColores(Array.isArray(v?.variantes) ? v.variantes : []);
    setMarcados([]);
    setCargando(false);
  }, [productoId]);
  useEffect(() => { if (productoId) cargar(); }, [productoId, cargar]);

  const error = (t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' });

  // El largo va al principal y a todos sus colores (se venden igual).
  const guardarLargo = async () => {
    const n = largo.trim() === '' ? null : Number(largo);
    if (n != null && !(n > 0 && n <= 100)) return error('Largo no válido', 'Pon el largo de la barra en pies (ej. 20), o déjalo vacío.');
    const principal = prod.variante_de || prod.id;
    setGuardando(true);
    const { data, error: e } = await supabase.from('productos').update({ largo_pies: n })
      .or(`id.eq.${principal},variante_de.eq.${principal}`).select('id');
    setGuardando(false);
    if (e || !data?.length) return error('No se guardó el largo', e?.message || 'Sin permiso');
    toast({ title: n ? `Se vende por unidad o por pies (barra de ${n}')` : 'Se vende solo por unidad' });
    cargar();
    return undefined;
  };

  const crearColores = async () => {
    if (!marcados.length) return error('Escoge los colores', 'Marca los colores que quieres crear.');
    setGuardando(true);
    const { data, error: e } = await supabase.rpc('vent_crear_variantes', { p_producto: prod.id, p_colores: marcados });
    setGuardando(false);
    if (e) return error('No se crearon los colores', e.message);
    toast({ title: `${data} color(es) creado(s)`, description: 'Cada color es un producto con su código y su existencia.' });
    cargar();
    return undefined;
  };

  if (cargando) return <div className="py-3 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;
  if (!prod) return null;
  const yaTiene = new Set(colores.map((c) => String(c.color || '').toLowerCase()));

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-blue-900"><Palette className="w-4 h-4" /> Colores y venta por pies</div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600">Largo de la barra (pies)
          <input className="block h-8 w-24 rounded-md border border-gray-300 px-2 text-sm bg-white mt-1" inputMode="decimal" placeholder="ej. 20"
            value={largo} onChange={(e) => setLargo(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <Button type="button" size="sm" variant="outline" onClick={guardarLargo} disabled={guardando}>Guardar largo</Button>
        <span className="text-[11px] text-gray-500">Con largo, al facturar se escoge Unidad o Pies (5 pies de 20 = 0.25 de barra). Vacío = solo por unidad.</span>
      </div>

      {base ? (
        <p className="text-xs text-gray-700">
          Este producto es el color <b>{colores.find((c) => c.id === prod.id)?.color || ''}</b> de <b>{base.codigo} · {base.descripcion}</b>.
          Para crear más colores abre el producto principal.
        </p>
      ) : (
        <>
          {colores.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {colores.map((c) => (
                <span key={c.id} className="text-xs px-2 py-1 rounded-full bg-white border border-gray-300">
                  <b>{c.color}</b> · {c.codigo} · <span className={Number(c.existencia) > 0 ? 'text-emerald-700' : 'text-red-600'}>
                    {Number(c.existencia) > 0 ? `${Number(c.existencia)} en stock` : 'sin stock'}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {COLORES_ALUMINIO.filter((c) => !yaTiene.has(c.toLowerCase())).map((c) => (
              <label key={c} className="flex items-center gap-1 text-sm bg-white border border-gray-300 rounded-md px-2 py-1 cursor-pointer">
                <input type="checkbox" checked={marcados.includes(c)} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, c] : m.filter((x) => x !== c)))} />
                {c}
              </label>
            ))}
            {COLORES_ALUMINIO.some((c) => !yaTiene.has(c.toLowerCase())) ? (
              <Button type="button" size="sm" onClick={crearColores} disabled={guardando || !marcados.length}>
                {guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Crear colores
              </Button>
            ) : <span className="text-xs text-gray-500">Ya tiene todos los colores.</span>}
          </div>
          <p className="text-[11px] text-gray-500">
            Cada color se crea como un producto con su código (ej. {prod.codigo}-BL), su existencia y el mismo precio, que puedes cambiar después.
            Al facturar este producto se escoge el color.
          </p>
        </>
      )}
    </div>
  );
}
