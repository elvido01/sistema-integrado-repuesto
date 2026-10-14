// ============================================================
// AdminEmpresasVacias — borrar empresas vacías e inactivas
// ============================================================
// (14/10/2026) Solo lista las que la base considera borrables: creadas hace
// más de 90 días, sin suscripción en 90 días y SIN NINGÚN dato (ni usuarios).
// La base vuelve a comprobarlo al borrar (sql/eliminar_empresas_vacias.sql).
// Se muestra el id: hay empresas con el mismo nombre.
// ============================================================
import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Trash2 } from 'lucide-react';

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-DO') : '—');

export default function AdminEmpresasVacias({ onEliminada }) {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [lista, setLista] = useState([]);
  const [confirmando, setConfirmando] = useState(null); // tenant_id
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);

  const abrir = async () => {
    setAbierto(true); setConfirmando(null); setTexto(''); setCargando(true);
    const { data, error } = await supabase.rpc('admin_empresas_vacias');
    setCargando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo revisar', description: error.message }); return; }
    setLista(data || []);
  };

  const eliminar = async (e) => {
    setBorrando(true);
    const { error } = await supabase.rpc('admin_eliminar_empresa_vacia', { p_tenant: e.tenant_id, p_confirmacion: texto });
    setBorrando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se eliminó', description: error.message }); return; }
    toast({ title: 'Empresa eliminada', description: e.nombre });
    setLista((l) => l.filter((x) => x.tenant_id !== e.tenant_id));
    setConfirmando(null); setTexto('');
    onEliminada?.();
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 gap-1.5" onClick={abrir}
        title="Empresas vacías con más de 90 días sin uso">
        <Trash2 className="w-4 h-4" />
        <span className="text-xs hidden sm:inline">Empresas vacías</span>
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => { if (!borrando) setAbierto(v); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" /> Empresas vacías e inactivas</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-gray-600">
            Solo salen las creadas hace más de 90 días, sin suscripción en 90 días y <b>sin ningún dato</b>: ni usuarios,
            ni clientes, ni productos, ni facturas. Una empresa con datos nunca sale aquí.
          </p>

          {cargando ? (
            <p className="text-sm text-gray-500 flex items-center gap-2 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Revisando todas las empresas…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">No hay empresas vacías para eliminar.</p>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {lista.map((e) => (
                <div key={e.tenant_id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{e.nombre}</p>
                      <p className="text-[11px] text-gray-500">RNC {e.rnc || '—'} · creada {fecha(e.creada)}</p>
                      <p className="text-[10px] text-gray-400 font-mono break-all">id {e.tenant_id}</p>
                    </div>
                    {confirmando !== e.tenant_id && (
                      <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 shrink-0"
                        onClick={() => { setConfirmando(e.tenant_id); setTexto(''); }}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
                      </Button>
                    )}
                  </div>
                  {confirmando === e.tenant_id && (
                    <div className="mt-3 rounded bg-red-50 border border-red-200 p-3 space-y-2">
                      <p className="text-[12px] text-red-800">Esto no se puede deshacer. Escribe <b>ELIMINAR</b> para confirmar.</p>
                      <div className="flex gap-2">
                        <Input value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="ELIMINAR" className="h-9" autoFocus />
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-9"
                          disabled={texto !== 'ELIMINAR' || borrando} onClick={() => eliminar(e)}>
                          {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Eliminar'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-9" disabled={borrando} onClick={() => setConfirmando(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
