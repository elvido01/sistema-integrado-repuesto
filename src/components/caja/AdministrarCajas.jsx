// =====================================================================
// Cajas de la empresa (20/11/2026) — Modo de Caja "Varias cajas"
// ---------------------------------------------------------------------
// En Configuración del Sistema: el administrador crea "Caja 1", "Caja 2"…,
// les cambia el nombre o las desactiva. guardar_caja() (sql/varias_cajas.sql)
// valida que sea administrador y que no se desactive una caja abierta.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export default function AdministrarCajas() {
  const { toast } = useToast();
  const [cajas, setCajas] = useState([]);
  const [nueva, setNueva] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('cajas').select('id, nombre, activa, orden').order('orden').order('nombre');
    setCajas(data || []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (id, nombre, activa) => {
    setGuardando(id || 'nueva');
    const { error } = await supabase.rpc('guardar_caja', { p_id: id, p_nombre: nombre, p_activa: activa });
    setGuardando(null);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo guardar la caja', description: error.message }); return false; }
    await cargar();
    return true;
  };

  return (
    <div className="space-y-2 rounded-md border border-indigo-100 bg-indigo-50/30 p-3">
      <div className="text-[11px] font-bold uppercase text-indigo-700">Cajas de la empresa</div>
      {cargando ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : (
        <>
          {cajas.length === 0 && <p className="text-[11px] text-amber-700">Crea al menos una caja: sin cajas nadie puede abrir ni vender.</p>}
          {cajas.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input defaultValue={c.nombre} className="h-8 text-sm" maxLength={40}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nombre) guardar(c.id, v, c.activa); }} />
              <button type="button" disabled={guardando === c.id} onClick={() => guardar(c.id, c.nombre, !c.activa)}
                className={`h-8 shrink-0 rounded px-2 text-[11px] font-bold ${c.activa ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                {c.activa ? 'Activa' : 'Desactivada'}
              </button>
            </div>
          ))}
          <form className="flex items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (nueva.trim() && await guardar(null, nueva.trim(), true)) setNueva(''); }}>
            <Input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder={`Caja ${cajas.length + 1}`} className="h-8 text-sm" maxLength={40} />
            <Button type="submit" size="sm" disabled={!nueva.trim() || guardando === 'nueva'} className="h-8 shrink-0 gap-1">
              <Plus className="h-3.5 w-3.5" /> Agregar
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
