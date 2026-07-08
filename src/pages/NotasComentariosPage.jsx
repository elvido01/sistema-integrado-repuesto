import React, { useCallback, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';

const fdate = (d) => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
};
const fhora = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
};

const NotasComentariosPage = () => {
  const { toast } = useToast();
  const { tenantId, user, profile } = useAuth();
  const { closePanel, activePanel } = usePanels();

  const [cliente, setCliente] = useState(null);
  const [codigoInput, setCodigoInput] = useState('');
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [prestamos, setPrestamos] = useState([]);
  const [prestamoId, setPrestamoId] = useState('');
  const [notas, setNotas] = useState([]);
  const [nuevaNota, setNuevaNota] = useState('');
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const esAdmin = ['admin', 'owner', 'manager', 'gerente'].includes(profile?.role);

  const cargar = useCallback(async (clienteId, cedula) => {
    if (!clienteId) return;
    setLoading(true);
    try {
      // Las notas de la empresa aliada (Caminero <-> Naranjos) se cruzan por
      // cédula: el mismo cliente tiene otro id en el otro tenant
      let notasQuery = supabase.from('cliente_notas')
        .select('id, fecha, nota, usuario_nombre, created_at, tenant_id, prestamo:prestamo_id (numero)')
        .order('created_at', { ascending: false });
      const ced = (cedula || '').trim();
      notasQuery = ced
        ? notasQuery.or(`cliente_id.eq.${clienteId},cliente_cedula.eq.${ced}`)
        : notasQuery.eq('cliente_id', clienteId);
      const [{ data: nts, error: e1 }, { data: prs, error: e2 }] = await Promise.all([
        notasQuery,
        supabase.from('prestamos')
          .select('id, numero, estado')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setNotas(nts || []);
      setPrestamos(prs || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudieron cargar las notas', description: e.message });
      setNotas([]); setPrestamos([]);
    }
    setLoading(false);
  }, [toast]);

  const seleccionarCliente = (c) => {
    setCliente(c); setBuscarOpen(false);
    setCodigoInput(c.codigo || c.rnc || '');
    setPrestamoId(''); setNuevaNota('');
    cargar(c.id, c.rnc);
  };

  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) return;
    try {
      const { data: cls, error } = await supabase
        .from('clientes').select('id, nombre, codigo, rnc, direccion, telefono')
        .or(`codigo.eq.${q},rnc.eq.${q}`).eq('activo', true).limit(1);
      if (error) throw error;
      if (cls && cls.length) seleccionarCliente(cls[0]);
      else toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    }
  };

  const agregarNota = async () => {
    const texto = nuevaNota.trim();
    if (!cliente || !texto) return;
    setGuardando(true);
    try {
      const { error } = await supabase.from('cliente_notas').insert({
        tenant_id: tenantId,
        cliente_id: cliente.id,
        cliente_cedula: (cliente.rnc || '').trim() || null,
        prestamo_id: prestamoId || null,
        nota: texto,
        usuario_id: user?.id || null,
        usuario_nombre: profile?.nombre_completo || user?.email || null,
      });
      if (error) throw error;
      setNuevaNota('');
      await cargar(cliente.id, cliente.rnc);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar la nota', description: e.message });
    }
    setGuardando(false);
  };

  const eliminarNota = async (n) => {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    try {
      const { error } = await supabase.from('cliente_notas').delete().eq('id', n.id);
      if (error) throw error;
      setNotas((prev) => prev.filter((x) => x.id !== n.id));
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: e.message });
    }
  };

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Notas y Comentarios — Documentos</title></Helmet>
      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-1 font-extrabold tracking-wide text-base">
          NOTAS Y COMENTARIOS
        </div>

        <div className="p-2 space-y-2">
          {/* Cliente */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0">
            <div className="border rounded-md p-2 lg:col-span-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Cliente</span>
                <Input
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                  placeholder="Código o cédula" className="flex-1 h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
              </div>
              <div className="mt-2 text-sm font-bold text-blue-700 leading-tight truncate" title={cliente?.nombre || ''}>{cliente?.nombre || '—'}</div>
              <div className="text-xs text-slate-500 truncate" title={cliente?.direccion || ''}>{cliente?.direccion || '—'}</div>
            </div>
            <div className="border rounded-md p-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Préstamo (opcional)</span>
              <select
                value={prestamoId}
                onChange={(e) => setPrestamoId(e.target.value)}
                disabled={!cliente}
                className="mt-1 w-full h-8 text-sm border rounded-md px-2 bg-white disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">— Nota general del cliente —</option>
                {prestamos.map((p) => (
                  <option key={p.id} value={p.id}>{p.numero} ({p.estado})</option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-400">Si eliges un préstamo, la nota queda ligada a él.</div>
            </div>
          </div>

          {/* Nueva nota */}
          <div className="border rounded-md p-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Nueva nota / comentario</span>
            <Textarea
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              disabled={!cliente}
              placeholder={cliente ? 'Escribe la nota o comentario…' : 'Selecciona un cliente primero'}
              className="mt-1 min-h-[64px] text-sm"
            />
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" onClick={agregarNota} disabled={!cliente || !nuevaNota.trim() || guardando}>
                {guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Agregar Nota
              </Button>
            </div>
          </div>

          {/* Historial */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-y-auto h-[300px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1 w-24">Fecha</th>
                    <th className="text-left px-2 py-1 w-14">Hora</th>
                    <th className="text-left px-2 py-1 w-32">Usuario</th>
                    <th className="text-left px-2 py-1 w-28">Préstamo</th>
                    <th className="text-left px-2 py-1">Nota / Comentario</th>
                    {esAdmin && <th className="w-9"></th>}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                  {!loading && !cliente && <tr><td colSpan={6} className="p-10 text-center italic text-slate-400">--- SELECCIONE UN CLIENTE ---</td></tr>}
                  {!loading && cliente && notas.length === 0 && <tr><td colSpan={6} className="p-10 text-center italic text-slate-400">Este cliente no tiene notas registradas.</td></tr>}
                  {!loading && cliente && notas.map((n, i) => (
                    <tr key={n.id} className={`border-b last:border-0 align-top ${i % 2 === 1 ? 'bg-[#eef6ff]' : 'bg-white'}`}>
                      <td className="px-2 py-1 whitespace-nowrap">{fdate(n.fecha)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{fhora(n.created_at)}</td>
                      <td className="px-2 py-1 truncate max-w-[130px]" title={n.usuario_nombre || ''}>
                        {n.usuario_nombre || '—'}
                        {n.tenant_id !== tenantId && (
                          <span className="ml-1 inline-block px-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold align-middle" title="Nota registrada por la empresa aliada">ALIADA</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-bold text-blue-900 whitespace-nowrap">{n.prestamo?.numero || ''}</td>
                      <td className="px-2 py-1 whitespace-pre-wrap">{n.nota}</td>
                      {esAdmin && (
                        <td className="px-1 py-1 text-center">
                          {n.tenant_id === tenantId && (
                            <button type="button" onClick={() => eliminarNota(n)} title="Eliminar nota"
                                    className="text-slate-300 hover:text-red-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
            <div className="text-xs text-slate-600">{cliente ? `${notas.length} nota${notas.length === 1 ? '' : 's'}` : ''}</div>
            <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
          </div>
        </div>
      </div>

      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />
    </div>
  );
};

export default NotasComentariosPage;
