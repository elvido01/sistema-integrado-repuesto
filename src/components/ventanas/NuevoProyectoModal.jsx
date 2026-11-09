// Nuevo proyecto de ventanas (09/11/2026): nombre, cliente (del catálogo o
// solo el nombre), dirección, teléfono y la cita para medir. Al crearlo se
// abre para empezar a medir.
import React, { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const campo = 'h-10 w-full rounded-md border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const etiqueta = 'text-[11px] font-bold text-gray-600 uppercase';
// 8093905965 → 809-390-5965
const fmtTel = (v) => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

export default function NuevoProyectoModal({ tenantId, siguiente, onClose, onCreado, onError }) {
  const [f, setF] = useState({ nombre: `Proyecto ${siguiente}`, cliente_nombre: '', direccion: '', telefono: '', fecha_cita: '', hora_cita: '', notas: '' });
  const [cliente, setCliente] = useState(null);       // del catálogo
  const [buscar, setBuscar] = useState('');
  const [resultados, setResultados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const q = buscar.trim().replace(/[%,()]/g, ' ');
    if (cliente || q.length < 2) { setResultados([]); return undefined; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, telefono, direccion')
        .eq('tenant_id', tenantId).or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,rnc.ilike.%${q}%`).order('nombre').limit(8);
      setResultados(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [buscar, cliente, tenantId]);

  const escoger = (c) => {
    setCliente(c); setResultados([]); setBuscar('');
    setF((p) => ({ ...p, direccion: p.direccion || c.direccion || '', telefono: p.telefono || fmtTel(c.telefono) || '' }));
  };

  const crear = async () => {
    if (!f.nombre.trim()) return onError('Falta el nombre', 'Escribe el nombre del proyecto.');
    setGuardando(true);
    const fila = {
      tenant_id: tenantId,
      nombre: f.nombre.trim(),
      cliente_id: cliente?.id || null,
      cliente_nombre: cliente ? null : (buscar.trim() || null),
      direccion: f.direccion.trim() || null,
      telefono: f.telefono.trim() || null,
      fecha_cita: f.fecha_cita || null,
      hora_cita: f.hora_cita || null,
      notas: f.notas.trim() || null,
    };
    const { data, error } = await supabase.from('vent_proyectos').insert(fila).select('id').single();
    setGuardando(false);
    if (error) return onError('No se pudo crear el proyecto', error.message);
    onCreado(data);
    return undefined;
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block"><span className={etiqueta}>Nombre del proyecto</span>
            <input className={`${campo} mt-1`} value={f.nombre} onChange={(e) => s('nombre', e.target.value)} />
          </label>
          <div className="relative">
            <span className={etiqueta}>Cliente</span>
            {cliente ? (
              <div className="mt-1 flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
                <span><b>{cliente.nombre}</b>{cliente.telefono ? ` · ${cliente.telefono}` : ''}</span>
                <button type="button" onClick={() => setCliente(null)} title="Quitar"><X className="w-4 h-4 text-gray-500" /></button>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                  <input className={`${campo} pl-8`} placeholder="Busca un cliente o escribe el nombre (vacío = cliente por defecto)"
                    value={buscar} onChange={(e) => setBuscar(e.target.value)} />
                </div>
                {resultados.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg divide-y max-h-56 overflow-auto">
                    {resultados.map((c) => (
                      <button key={c.id} type="button" onClick={() => escoger(c)} className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                        <b>{c.nombre}</b>{c.telefono ? <span className="text-gray-500"> · {c.telefono}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <label className="block"><span className={etiqueta}>Dirección</span>
            <input className={`${campo} mt-1`} value={f.direccion} onChange={(e) => s('direccion', e.target.value)} />
          </label>
          <label className="block"><span className={etiqueta}>Teléfono</span>
            <input className={`${campo} mt-1`} type="tel" inputMode="tel" placeholder="809-000-0000" value={f.telefono} onChange={(e) => s('telefono', fmtTel(e.target.value))} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={etiqueta}>Cita (medir / instalar)</span>
              <input className={`${campo} mt-1`} type="date" value={f.fecha_cita} onChange={(e) => s('fecha_cita', e.target.value)} />
            </label>
            <label className="block"><span className={etiqueta}>Hora</span>
              <input className={`${campo} mt-1`} type="time" value={f.hora_cita} onChange={(e) => s('hora_cita', e.target.value)} />
            </label>
          </div>
          <label className="block"><span className={etiqueta}>Notas</span>
            <textarea className={`${campo} mt-1 h-16 py-2`} value={f.notas} onChange={(e) => s('notas', e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={crear} disabled={guardando}>{guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Crear proyecto y medir</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
