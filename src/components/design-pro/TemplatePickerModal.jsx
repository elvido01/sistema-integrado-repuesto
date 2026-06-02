// ============================================================
// TemplatePickerModal.jsx — Modal intermedio al elegir plantilla
// ============================================================
// Cuando el usuario clickea una plantilla en la galeria, le
// preguntamos opcionalmente que producto del catalogo quiere
// usar para que la foto + precio se inyecten automaticamente.
//
// Puede saltarse la seleccion y crear la plantilla en blanco.
// ============================================================
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, ShoppingBag, ArrowRight, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export default function TemplatePickerModal({ open, template, onClose, onConfirm }) {
    const { tenantId } = useAuth();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [producto, setProducto] = useState(null);

    useEffect(() => {
        if (!open) {
            setSearch('');
            setResults([]);
            setProducto(null);
        }
    }, [open]);

    // Buscar productos (debounced)
    useEffect(() => {
        if (!open) return;
        const handle = setTimeout(async () => {
            const term = search.trim();
            if (term.length < 2) { setResults([]); return; }
            setSearching(true);
            try {
                const { data } = await supabase
                    .from('productos')
                    .select('id, codigo, nombre, descripcion, precio, costo, imagen_url')
                    .eq('tenant_id', tenantId)
                    .eq('activo', true)
                    .or(`nombre.ilike.%${term}%,codigo.ilike.%${term}%`)
                    .limit(8);
                setResults(data || []);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(handle);
    }, [search, open, tenantId]);

    const handleCreate = () => {
        onConfirm({ template, producto });
    };

    if (!template) return null;

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-violet-600" />
                        Crear desde "{template.name}"
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <p className="text-xs text-slate-500">
                        Opcional: elige un producto del catalogo y se insertara su foto y precio automaticamente en la plantilla.
                    </p>

                    {producto ? (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md p-2">
                            <div className="h-10 w-10 rounded bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                {producto.imagen_url
                                    ? <img src={producto.imagen_url} alt={producto.nombre} className="w-full h-full object-cover" />
                                    : <span className="text-[10px] text-slate-400">sin foto</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{producto.nombre}</p>
                                <p className="text-[11px] text-slate-500">{producto.codigo} · RD$ {Number(producto.precio || 0).toLocaleString('es-DO')}</p>
                            </div>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setProducto(null)}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ) : (
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar producto por nombre o codigo..."
                                className="pl-8"
                                autoFocus
                            />
                            {search.length >= 2 && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {searching && (
                                        <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                            <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                                        </div>
                                    )}
                                    {!searching && results.length === 0 && (
                                        <div className="p-3 text-center text-xs text-slate-400">Sin resultados</div>
                                    )}
                                    {results.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => { setProducto(p); setSearch(''); setResults([]); }}
                                            className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 text-left"
                                        >
                                            <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                                {p.imagen_url ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover" /> : null}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold truncate">{p.nombre}</p>
                                                <p className="text-[10px] text-slate-500">{p.codigo} · RD$ {Number(p.precio || 0).toLocaleString('es-DO')}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        onClick={handleCreate}
                        className="bg-violet-600 text-white hover:bg-violet-700"
                    >
                        {producto ? 'Crear con producto' : 'Crear sin producto'}
                        <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
