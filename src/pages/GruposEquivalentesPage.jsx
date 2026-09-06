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

const TABS = [
  { key: 'grupos', label: 'Mis Grupos' },
  { key: 'sugerencias', label: 'Sugeridos por el sistema' },
];

const formatRD = (n) => `RD$ ${(Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

// De donde salio cada propuesta. Se ensena SIEMPRE: "misma referencia" es la
// senal mas floja y el dueno tiene derecho a saber cual esta mirando antes de
// confirmar.
const SENAL_TXT = {
  ambas: 'DESCRIPCION + REFERENCIA',
  descripcion: 'MISMA DESCRIPCION',
  referencia: 'MISMA REFERENCIA',
};

const SENAL_ESTILO = {
  ambas: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  descripcion: 'bg-blue-100 text-blue-700 border-blue-300',
  referencia: 'bg-amber-100 text-amber-800 border-amber-300',
};

export default function GruposEquivalentesPage() {
  const { toast } = useToast();
  const { tenantId } = useAuth();

  const [tab, setTab] = useState('grupos');
  const [grupos, setGrupos] = useState([]);
  const [loadingGrupos, setLoadingGrupos] = useState(true);
  const [sugerencias, setSugerencias] = useState([]);
  const [loadingSug, setLoadingSug] = useState(false);
  // Que piezas de cada propuesta siguen marcadas: { sugerencia_id: [producto_id] }
  const [seleccion, setSeleccion] = useState({});
  const [procesando, setProcesando] = useState(false);

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

  // Las propuestas que el motor dejo pendientes. No las calcula al vuelo: eso
  // es lo que hacia el sugeridor viejo y terminaba en timeout.
  const cargarSugerencias = useCallback(async () => {
    setLoadingSug(true);
    try {
      const { data, error } = await supabase.rpc('get_sugerencias_equivalentes', { p_limite: 300 });
      if (error) throw error;
      const filas = data || [];
      setSugerencias(filas);
      // Todo entra marcado: lo normal es confirmar, no armar el grupo de cero.
      const marcas = {};
      filas.forEach((s) => { marcas[s.id] = (s.miembros || []).map((m) => m.producto_id); });
      setSeleccion(marcas);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoadingSug(false);
    }
  }, [toast]);

  useEffect(() => { if (tab === 'sugerencias') cargarSugerencias(); }, [tab, cargarSugerencias]);

  const recalcular = async () => {
    setLoadingSug(true);
    try {
      const { data, error } = await supabase.rpc('recalcular_sugerencias_equivalentes', {});
      if (error) throw error;
      toast({
        title: 'Catalogo revisado',
        description: `${data?.grupos ?? 0} grupos propuestos sobre ${data?.productos ?? 0} piezas.`,
      });
      await cargarSugerencias();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      setLoadingSug(false);
    }
  };

  const alternarMiembro = (sugId, prodId) => {
    setSeleccion((prev) => {
      const actual = prev[sugId] || [];
      return {
        ...prev,
        [sugId]: actual.includes(prodId) ? actual.filter((x) => x !== prodId) : [...actual, prodId],
      };
    });
  };

  const quitarDeLaLista = (sugId) => {
    setSugerencias((prev) => prev.filter((s) => s.id !== sugId));
    setSeleccion((prev) => { const c = { ...prev }; delete c[sugId]; return c; });
  };

  const confirmar = async (sug) => {
    const ids = seleccion[sug.id] || [];
    if (ids.length < 2) return;
    setProcesando(true);
    try {
      const { data, error } = await supabase.rpc('confirmar_sugerencia_equivalentes', {
        p_sugerencia_id: sug.id,
        p_producto_ids: ids,
        p_nombre: sug.nombre,
      });
      if (error) throw error;
      const fuera = (sug.miembros || []).length - ids.length;
      // Se dice lo que de verdad paso, incluido lo que NO se pudo mover.
      const partes = [`${data?.agregados ?? ids.length} piezas`];
      if (fuera > 0) partes.push(`${fuera} descartada${fuera !== 1 ? 's' : ''} (no vuelven a proponerse)`);
      if (Number(data?.ya_en_otro) > 0) {
        partes.push(`${data.ya_en_otro} ya estaban en otro grupo y se quedaron ahi`);
      }
      toast({ title: data?.nuevo ? 'Grupo creado' : 'Piezas sumadas al grupo', description: partes.join(' · ') });
      quitarDeLaLista(sug.id);
      fetchGrupos();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo confirmar', description: err.message });
    } finally {
      setProcesando(false);
    }
  };

  const rechazar = async (sug) => {
    setProcesando(true);
    try {
      const { error } = await supabase.rpc('rechazar_sugerencia_equivalentes', { p_sugerencia_id: sug.id });
      if (error) throw error;
      toast({ title: 'Anotado', description: 'Esas piezas no se vuelven a proponer juntas.' });
      quitarDeLaLista(sug.id);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setProcesando(false);
    }
  };

  // Las que coinciden por descripcion Y por referencia son las seguras: se
  // confirman de un golpe, tal como vienen, para no revisar 400 tarjetas.
  const confirmarLasDobles = async () => {
    const lista = sugerencias.filter((s) => s.senal === 'ambas');
    if (!lista.length) return;
    setProcesando(true);
    let hechas = 0;
    let fallos = 0;
    for (const s of lista) {
      const ids = seleccion[s.id] || [];
      if (ids.length < 2) continue;
      try {
        const { error } = await supabase.rpc('confirmar_sugerencia_equivalentes', {
          p_sugerencia_id: s.id, p_producto_ids: ids, p_nombre: s.nombre,
        });
        if (error) throw error;
        hechas += 1;
      } catch (_) {
        fallos += 1;
      }
    }
    setProcesando(false);
    toast({
      title: `${hechas} grupos confirmados`,
      description: fallos > 0 ? `${fallos} no se pudieron: quedan en la lista.` : 'Los de doble senal quedaron listos.',
      variant: fallos > 0 ? 'destructive' : undefined,
    });
    await cargarSugerencias();
    fetchGrupos();
  };

  const totalPiezas = sugerencias.reduce((t, s) => t + (s.miembros || []).length, 0);
  const dobles = sugerencias.filter((s) => s.senal === 'ambas').length;

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
        {tab === 'sugerencias' && (
          <div className="space-y-3">
            {/* De donde salen y que hacer con ellas */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Sparkles className="w-5 h-5 text-purple-700 shrink-0" />
                <div className="flex-1 min-w-[260px]">
                  <p className="text-xs text-purple-900 font-bold">
                    {sugerencias.length > 0
                      ? `${sugerencias.length} grupos propuestos · ${totalPiezas} piezas`
                      : 'Grupos propuestos a partir de tu propio catalogo'}
                  </p>
                  <p className="text-[10px] text-purple-700">
                    Salen de la descripcion sin la marca ni el color, y de la referencia. Nada se agrupa
                    solo: destilda lo que no vaya y confirma.
                  </p>
                </div>
                {dobles > 0 && (
                  <Button
                    onClick={confirmarLasDobles}
                    disabled={procesando}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    title="Las que coinciden por descripcion Y por referencia a la vez"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar las {dobles} de doble senal
                  </Button>
                )}
                <Button onClick={recalcular} disabled={loadingSug || procesando}
                        className="bg-purple-600 hover:bg-purple-700 text-white">
                  {loadingSug ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Recalcular
                </Button>
              </div>
            </div>

            {loadingSug && (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-purple-600" /></div>
            )}

            {!loadingSug && sugerencias.length === 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
                <Link2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p>No hay nada propuesto ahora mismo.</p>
                <p className="text-[11px] mt-1">
                  Se recalcula solo cada madrugada. Si acabas de cargar mercancia, toca <b>Recalcular</b>.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {sugerencias.map((s) => {
                const marcados = seleccion[s.id] || [];
                const miembros = s.miembros || [];
                return (
                  <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-800 truncate">{s.nombre}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${SENAL_ESTILO[s.senal] || SENAL_ESTILO.referencia}`}>
                            {SENAL_TXT[s.senal] || s.senal} · {s.confianza}%
                          </span>
                          <span className="text-[10px] text-slate-500">{miembros.length} piezas</span>
                          {Number(s.vendidas_180d) > 0 && (
                            <span className="text-[10px] text-emerald-700 font-bold">
                              {Number(s.vendidas_180d)} vendidas 180d
                            </span>
                          )}
                          {s.grupo_id && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300">
                              SUMAR A: {s.grupo_nombre}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-0.5 mb-2">
                      {miembros.map((m) => {
                        const dentro = marcados.includes(m.producto_id);
                        return (
                          <label
                            key={m.producto_id}
                            className={`flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer text-[11px] ${
                              dentro ? 'bg-slate-50' : 'bg-white opacity-50 line-through'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={dentro}
                              onChange={() => alternarMiembro(s.id, m.producto_id)}
                              className="accent-purple-600"
                            />
                            <span className="font-mono font-bold text-slate-600 w-20 shrink-0 truncate">{m.codigo}</span>
                            <span className="flex-1 truncate text-slate-700">{m.descripcion}</span>
                            {m.marca && <span className="text-[10px] text-slate-400 shrink-0">{m.marca}</span>}
                            <span className="font-mono text-slate-600 shrink-0">{formatRD(m.precio)}</span>
                            {m.ya_en_grupo && (
                              <span className="text-[9px] text-blue-600 font-bold shrink-0" title="Ya pertenece a un grupo">EN GRUPO</span>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]"
                        disabled={procesando || marcados.length < 2}
                        onClick={() => confirmar(s)}
                        title={marcados.length < 2 ? 'Un grupo necesita al menos 2 piezas' : 'Crear el grupo con lo marcado'}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {s.grupo_id ? 'Sumar al grupo' : 'Confirmar grupo'} ({marcados.length})
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-[10px] border-slate-300 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                        disabled={procesando}
                        onClick={() => rechazar(s)}
                        title="No son la misma pieza. No se vuelve a proponer."
                      >
                        <X className="w-3 h-3 mr-1" /> No son iguales
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
