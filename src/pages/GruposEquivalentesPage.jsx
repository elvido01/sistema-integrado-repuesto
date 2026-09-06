import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Link2, Plus, RefreshCw, Loader2, Trash2, Search, Sparkles,
  CheckCircle2, X, Star, ChevronRight, AlertTriangle
} from 'lucide-react';
import SugerenciasEquivalentes from '@/components/products/SugerenciasEquivalentes';

const TABS = [
  { key: 'grupos', label: 'Mis Grupos' },
  { key: 'sugerencias', label: 'Sugeridos por el sistema' },
];

const formatRD = (n) => `RD$ ${(Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;


export default function GruposEquivalentesPage() {
  const { toast } = useToast();
  const { tenantId } = useAuth();

  const [tab, setTab] = useState('grupos');
  const [grupos, setGrupos] = useState([]);
  const [loadingGrupos, setLoadingGrupos] = useState(true);

  // Modal nuevo grupo
  const [crearModalOpen, setCrearModalOpen] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState({ nombre: '', descripcion: '' });
  const [productosBuscados, setProductosBuscados] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState([]); // [{id, codigo, descripcion, prioridad}]
  const [creando, setCreando] = useState(false);

  // Cargar mis grupos
  const fetchGrupos = useCallback(async () => {
    if (!tenantId) return;
    setLoadingGrupos(true);
    try {
      const { data, error } = await supabase
        .from('producto_grupos')
        .select(`
          id, nombre, descripcion, created_at,
          producto_grupo_miembros(
            producto_id, prioridad,
            productos(codigo, descripcion, costo, precio)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGrupos(data || []);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoadingGrupos(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { fetchGrupos(); }, [fetchGrupos]);

  // Buscar productos en el modal de crear
  const buscarProductos = async (q) => {
    if (!q || q.length < 2) { setProductosBuscados([]); return; }
    try {
      const { data } = await supabase
        .from('productos')
        .select('id, codigo, descripcion, costo, precio')
        .eq('tenant_id', tenantId)
        .or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%`)
        .eq('activo', true)
        .limit(15);
      setProductosBuscados(data || []);
    } catch (_) {}
  };

  // Crear grupo
  const handleCrearGrupo = async () => {
    if (!nuevoGrupo.nombre.trim()) {
      toast({ variant: 'destructive', title: 'Falta nombre', description: 'El grupo necesita un nombre.' });
      return;
    }
    if (seleccionados.length < 2) {
      toast({ variant: 'destructive', title: 'Mín 2 productos', description: 'Un grupo necesita al menos 2 productos.' });
      return;
    }
    setCreando(true);
    try {
      const { error } = await supabase.rpc('crear_grupo_con_productos', {
        p_nombre: nuevoGrupo.nombre.trim(),
        p_descripcion: nuevoGrupo.descripcion || null,
        p_producto_ids: seleccionados.map(s => s.id),
        p_prioridades: seleccionados.map(s => s.prioridad || 1),
      });
      if (error) throw error;
      toast({ title: '✅ Grupo creado', description: `${seleccionados.length} productos agrupados.` });
      setCrearModalOpen(false);
      setNuevoGrupo({ nombre: '', descripcion: '' });
      setSeleccionados([]);
      setBusqueda('');
      fetchGrupos();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setCreando(false);
    }
  };

  // Borrar grupo
  const borrarGrupo = async (grupoId) => {
    if (!window.confirm('¿Eliminar este grupo? Los productos quedan sueltos pero no se borran.')) return;
    try {
      const { error } = await supabase.from('producto_grupos').delete().eq('id', grupoId);
      if (error) throw error;
      toast({ title: 'Grupo eliminado' });
      fetchGrupos();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const agregarSeleccion = (prod) => {
    if (seleccionados.some(s => s.id === prod.id)) return;
    setSeleccionados([...seleccionados, { ...prod, prioridad: seleccionados.length === 0 ? 1 : 2 }]);
    setBusqueda('');
    setProductosBuscados([]);
  };

  return (
    <>
      <Helmet><title>Grupos de Productos Equivalentes</title></Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-50 min-h-full space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Link2 className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800">Productos Equivalentes</h1>
              <p className="text-[11px] text-slate-500">
                Agrupá productos sustituibles para mejorar la rotación y evitar duplicar stock.
              </p>
            </div>
          </div>
          <Button onClick={() => setCrearModalOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Nuevo Grupo
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-colors ${
                  active ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t.label.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* === TAB: MIS GRUPOS === */}
        {tab === 'grupos' && (
          loadingGrupos ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
          ) : grupos.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
              <Link2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p>Aún no tenés grupos creados.</p>
              <p className="text-[11px] mt-1">Mirá la pestaña <b>Sugeridos por el sistema</b>: ya hay grupos propuestos con tu propio catálogo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {grupos.map(g => (
                <div key={g.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-800">{g.nombre}</h3>
                      {g.descripcion && <p className="text-[11px] text-slate-500 italic">{g.descripcion}</p>}
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => borrarGrupo(g.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {(g.producto_grupo_miembros || []).sort((a, b) => a.prioridad - b.prioridad).map(m => (
                      <div key={m.producto_id} className="flex items-center gap-2 text-[11px] bg-slate-50 rounded px-2 py-1">
                        {m.prioridad === 1
                          ? <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          : <ChevronRight className="w-3 h-3 text-slate-400" />}
                        <span className="font-mono font-bold text-slate-700">{m.productos?.codigo}</span>
                        <span className="flex-1 truncate text-slate-600">{m.productos?.descripcion}</span>
                        <span className="text-slate-400 font-mono">{formatRD(m.productos?.precio)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* === TAB: SUGERIDOS POR EL SISTEMA === */}
        {/* La misma pantalla que sale desde el menu AGRUPANDO del Maestro de
            Articulos: una sola, para que no haya dos formas de confirmar. */}
        {tab === 'sugerencias' && <SugerenciasEquivalentes onCambio={fetchGrupos} />}

      </motion.div>

      {/* Modal crear grupo manual */}
      <Dialog open={crearModalOpen} onOpenChange={(open) => { if (!open) { setCrearModalOpen(false); setSeleccionados([]); setBusqueda(''); setProductosBuscados([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-purple-700">Nuevo Grupo de Equivalentes</DialogTitle>
            <DialogDescription className="text-xs">
              Agrupá productos que el cliente considere intercambiables.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase font-bold">Nombre del grupo *</Label>
                <Input value={nuevoGrupo.nombre} onChange={(e) => setNuevoGrupo(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Batería tamaño 5" autoFocus />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase font-bold">Descripción (opcional)</Label>
                <Input value={nuevoGrupo.descripcion} onChange={(e) => setNuevoGrupo(p => ({ ...p, descripcion: e.target.value }))} placeholder="Notas internas" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase font-bold">Buscar productos para agregar</Label>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-2.5 text-slate-400" />
                <Input
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); buscarProductos(e.target.value); }}
                  placeholder="Código o descripción..."
                  className="pl-7"
                />
              </div>
              {productosBuscados.length > 0 && (
                <div className="border border-slate-200 rounded-md max-h-40 overflow-y-auto bg-white shadow-sm">
                  {productosBuscados.map(p => (
                    <button key={p.id} onClick={() => agregarSeleccion(p)} className="w-full text-left p-2 hover:bg-purple-50 border-b border-slate-100 last:border-0 text-xs">
                      <span className="font-mono font-bold text-purple-700">{p.codigo}</span>
                      <span className="text-slate-600 ml-2">{p.descripcion}</span>
                      <span className="text-slate-400 ml-2 float-right">{formatRD(p.precio)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {seleccionados.length > 0 && (
              <div>
                <Label className="text-[11px] uppercase font-bold mb-1 block">Productos en el grupo ({seleccionados.length})</Label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {seleccionados.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 bg-slate-50 rounded px-2 py-1.5 text-xs">
                      <select
                        value={s.prioridad}
                        onChange={(e) => {
                          const np = [...seleccionados];
                          np[i].prioridad = parseInt(e.target.value);
                          setSeleccionados(np);
                        }}
                        className="text-[10px] border rounded px-1"
                      >
                        <option value={1}>⭐ Preferido</option>
                        <option value={2}>2do</option>
                        <option value={3}>3ro</option>
                        <option value={4}>4to</option>
                      </select>
                      <span className="font-mono font-bold flex-shrink-0">{s.codigo}</span>
                      <span className="flex-1 truncate text-slate-600">{s.descripcion}</span>
                      <button onClick={() => setSeleccionados(seleccionados.filter(x => x.id !== s.id))} className="text-red-500 hover:text-red-700">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {seleccionados.length === 1 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" /> Un grupo necesita al menos 2 productos.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCrearModalOpen(false)} disabled={creando}>Cancelar</Button>
            <Button onClick={handleCrearGrupo} disabled={creando || seleccionados.length < 2 || !nuevoGrupo.nombre.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
              {creando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Crear grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
