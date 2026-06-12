import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Link2, X, Loader2, CheckCircle2, RefreshCw, Sparkles, Star } from 'lucide-react';

export default function EquivalentesPanel({
  agrupandoMode,
  seleccionados,
  productos,
  onCancelar,
  onGrupoCreado,
  sugerenciasOpen,
  onCloseSugerencias,
}) {
  const { toast } = useToast();
  const [crearModalOpen, setCrearModalOpen] = useState(false);
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [descGrupo, setDescGrupo] = useState('');
  const [creando, setCreando] = useState(false);

  // Sugerencias IA
  const [minSimilitud, setMinSimilitud] = useState(0.4);
  const [sugerencias, setSugerencias] = useState([]);
  const [loadingSug, setLoadingSug] = useState(false);

  const productosSeleccionados = React.useMemo(() => {
    if (!productos || !seleccionados) return [];
    return productos.filter(p => seleccionados.has(p.id));
  }, [productos, seleccionados]);

  const handleCrearGrupo = async () => {
    if (!nombreGrupo.trim()) {
      toast({ variant: 'destructive', title: 'Falta nombre del grupo' });
      return;
    }
    if (productosSeleccionados.length < 2) {
      toast({ variant: 'destructive', title: 'Mínimo 2 productos' });
      return;
    }
    setCreando(true);
    try {
      const ids = productosSeleccionados.map(p => p.id);
      // Por defecto: el primero queda como preferido (prioridad 1), el resto como sustitutos (2)
      const prioridades = productosSeleccionados.map((_, i) => i === 0 ? 1 : 2);
      const { error } = await supabase.rpc('crear_grupo_con_productos', {
        p_nombre: nombreGrupo.trim(),
        p_descripcion: descGrupo || null,
        p_producto_ids: ids,
        p_prioridades: prioridades,
      });
      if (error) throw error;
      toast({
        title: '✅ Grupo creado',
        description: `${productosSeleccionados.length} productos agrupados como "${nombreGrupo}"`,
      });
      setCrearModalOpen(false);
      setNombreGrupo('');
      setDescGrupo('');
      onGrupoCreado?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setCreando(false);
    }
  };

  const cargarSugerencias = async () => {
    setLoadingSug(true);
    try {
      const { data, error } = await supabase.rpc('sugerir_grupos_por_similitud', {
        p_min_similarity: minSimilitud,
        p_limit: 100,
      });
      if (error) throw error;
      setSugerencias(data || []);
      toast({ title: '✨ Análisis completo', description: `${data?.length || 0} pares similares encontrados.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoadingSug(false);
    }
  };

  const aceptarSugerencia = async (sug) => {
    const nombre = (sug.descripcion_a.length < sug.descripcion_b.length ? sug.descripcion_a : sug.descripcion_b).slice(0, 40);
    try {
      const { error } = await supabase.rpc('crear_grupo_con_productos', {
        p_nombre: nombre,
        p_descripcion: `Similitud automática: ${(sug.similitud * 100).toFixed(0)}%`,
        p_producto_ids: [sug.producto_a_id, sug.producto_b_id],
        p_prioridades: [1, 2],
      });
      if (error) throw error;
      toast({ title: '✅ Grupo creado', description: nombre });
      setSugerencias(prev => prev.filter(s =>
        !(s.producto_a_id === sug.producto_a_id && s.producto_b_id === sug.producto_b_id)
      ));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  return (
    <>
      {/* ════════════════════════════════════════════════════ */}
      {/* Barra flotante: "X seleccionados — Formar grupo"     */}
      {/* ════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {agrupandoMode && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-white border-2 border-purple-400 rounded-full shadow-2xl px-3 py-2 flex items-center gap-2"
          >
            <Link2 className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <span className="text-sm font-bold text-purple-700">
              {seleccionados.size === 0
                ? 'Seleccioná productos equivalentes desde la lista'
                : `${seleccionados.size} producto${seleccionados.size !== 1 ? 's' : ''} seleccionado${seleccionados.size !== 1 ? 's' : ''}`}
            </span>
            {seleccionados.size >= 2 && (
              <Button
                onClick={() => setCrearModalOpen(true)}
                className="h-8 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold ml-2"
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Formar grupo
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelar}
              className="h-8 px-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════ */}
      {/* Modal: crear grupo (con productos seleccionados)     */}
      {/* ════════════════════════════════════════════════════ */}
      <Dialog open={crearModalOpen} onOpenChange={(open) => { if (!open) setCrearModalOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-purple-700 flex items-center gap-2">
              <Link2 className="w-5 h-5" /> Formar grupo de equivalentes
            </DialogTitle>
            <DialogDescription className="text-xs">
              {productosSeleccionados.length} productos quedarán como equivalentes. El primero será el preferido ⭐.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-[11px] uppercase font-bold">Nombre del grupo *</Label>
              <Input
                value={nombreGrupo}
                onChange={(e) => setNombreGrupo(e.target.value)}
                placeholder="Ej: Batería tamaño 5"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase font-bold">Descripción (opcional)</Label>
              <Textarea
                value={descGrupo}
                onChange={(e) => setDescGrupo(e.target.value)}
                placeholder="Notas internas para tu equipo..."
                rows={2}
              />
            </div>

            <div>
              <Label className="text-[11px] uppercase font-bold mb-1 block">
                Productos en el grupo ({productosSeleccionados.length})
              </Label>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-slate-200 rounded p-2 bg-slate-50">
                {productosSeleccionados.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 bg-white rounded px-2 py-1 text-xs border border-slate-100">
                    {i === 0 ? (
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500 flex-shrink-0" title="Preferido" />
                    ) : (
                      <span className="w-3 h-3 inline-block text-center text-[9px] text-slate-400 font-bold flex-shrink-0">{i + 1}</span>
                    )}
                    <span className="font-mono font-bold text-slate-700">{p.codigo}</span>
                    <span className="flex-1 truncate text-slate-600">{p.descripcion}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 italic mt-1">
                💡 El primer producto se marca como ⭐ Preferido. Si querés cambiarlo, andá después a la card del grupo.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCrearModalOpen(false)} disabled={creando}>
              Cancelar
            </Button>
            <Button
              onClick={handleCrearGrupo}
              disabled={creando || !nombreGrupo.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {creando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Crear grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════ */}
      {/* Modal: Sugerencias IA por similitud trigram          */}
      {/* ════════════════════════════════════════════════════ */}
      <Dialog open={sugerenciasOpen} onOpenChange={(open) => { if (!open) onCloseSugerencias(); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> Sugerencias automáticas de productos equivalentes
            </DialogTitle>
            <DialogDescription className="text-xs">
              Detección por similitud de texto (trigramas). Sin costo. Detecta pares con descripciones parecidas que aún no están agrupados.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-emerald-700" />
            <div className="flex-1">
              <p className="text-xs text-emerald-900 font-bold">Cómo funciona</p>
              <p className="text-[10px] text-emerald-700">
                A mayor similitud = más probable que sean lo mismo. 40% es buen balance entre cobertura y precisión.
              </p>
            </div>
            <Label className="text-[11px] uppercase font-bold text-emerald-700">Min. similitud</Label>
            <select
              value={minSimilitud}
              onChange={(e) => setMinSimilitud(parseFloat(e.target.value))}
              className="text-xs border border-emerald-300 rounded px-2 py-1 bg-white"
            >
              <option value={0.3}>30% (más resultados)</option>
              <option value={0.4}>40% (recomendado)</option>
              <option value={0.5}>50% (más preciso)</option>
              <option value={0.6}>60% (alta precisión)</option>
            </select>
            <Button
              onClick={cargarSugerencias}
              disabled={loadingSug}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loadingSug ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Analizar catálogo
            </Button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto border border-slate-200 rounded">
            {loadingSug ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
            ) : sugerencias.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Hacé click en <b>Analizar catálogo</b> para que el sistema busque pares similares.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-100 sticky top-0">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase">Producto A</TableHead>
                    <TableHead className="text-[10px] uppercase">Producto B</TableHead>
                    <TableHead className="text-center text-[10px] uppercase">Similitud</TableHead>
                    <TableHead className="text-right text-[10px] uppercase">Vtas 30d</TableHead>
                    <TableHead className="text-center text-[10px] uppercase">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sugerencias.map(s => (
                    <TableRow key={`${s.producto_a_id}-${s.producto_b_id}`}>
                      <TableCell className="text-xs">
                        <p className="font-mono font-bold text-purple-700">{s.codigo_a}</p>
                        <p className="text-[10px] text-slate-500 truncate max-w-[280px]">{s.descripcion_a}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p className="font-mono font-bold text-purple-700">{s.codigo_b}</p>
                        <p className="text-[10px] text-slate-500 truncate max-w-[280px]">{s.descripcion_b}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          s.similitud >= 0.6 ? 'bg-emerald-100 text-emerald-700' :
                          s.similitud >= 0.45 ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {(s.similitud * 100).toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{s.ventas_combinadas_30d}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          onClick={() => aceptarSugerencia(s)}
                          className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Agrupar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onCloseSugerencias}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
