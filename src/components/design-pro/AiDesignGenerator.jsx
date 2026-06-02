// ============================================================
// AiDesignGenerator.jsx — Modal "Crear con IA"
// ============================================================
// Flujo:
//   1. Usuario elige producto (busca por nombre/codigo en catalogo)
//   2. Elige tipo (oferta / nuevo / promo / etc) y tono
//   3. Click "Generar 3 variantes" -> llama generate-design-copy
//   4. Ve 3 cards con copy distinto
//   5. Click "Usar esta" -> crea design_document con el copy guardado
//      en metadata.ai_copy y abre el editor.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, Wand2, Search, Check, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getTemplates, getTemplate, createDesignFromTemplate, updateDesign } from '@/services/designProService';

const TIPOS = [
    { key: 'oferta',     label: 'Oferta',     description: 'Producto en descuento' },
    { key: 'nuevo',      label: 'Nuevo',      description: 'Recien llegado a tienda' },
    { key: 'promo',      label: 'Promo',      description: 'Combo, 2x1, paquete' },
    { key: 'reposicion', label: 'Repuesto',   description: 'Volvio del stock agotado' },
    { key: 'comunicado', label: 'Comunicado', description: 'Anuncio informativo' },
];

const TONOS = [
    { key: 'urgente',     label: 'Urgente',     hint: '¡Solo hoy!' },
    { key: 'profesional', label: 'Profesional', hint: 'Formal y claro' },
    { key: 'casual',      label: 'Casual',      hint: 'Como un amigo' },
    { key: 'elegante',    label: 'Elegante',    hint: 'Sobrio y aspiracional' },
];

export default function AiDesignGenerator({ open, onClose, onCreated }) {
    const { tenantId, user } = useAuth();
    const { toast } = useToast();

    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [producto, setProducto] = useState(null);

    const [tipo, setTipo] = useState('oferta');
    const [tono, setTono] = useState('urgente');

    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState(null);

    const [generating, setGenerating] = useState(false);
    const [variantes, setVariantes] = useState([]);
    const [meta, setMeta] = useState(null);

    const [creating, setCreating] = useState(false);

    // Cargar plantillas al abrir
    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const data = await getTemplates();
                setTemplates(data);
            } catch (e) {
                toast({ variant: 'destructive', title: 'Error', description: e.message });
            }
        })();
    }, [open, toast]);

    // Cuando cambia tipo, sugerir plantilla del mismo category
    useEffect(() => {
        const match = templates.find(t => t.category === tipo);
        if (match) setTemplateId(match.id);
    }, [tipo, templates]);

    // Buscar productos al tipear (debounced)
    useEffect(() => {
        if (!open) return;
        const handle = setTimeout(async () => {
            const term = productSearch.trim();
            if (term.length < 2) { setProductResults([]); return; }
            setSearching(true);
            try {
                const { data } = await supabase
                    .from('productos')
                    .select('id, codigo, nombre, descripcion, precio, costo, imagen_url')
                    .eq('tenant_id', tenantId)
                    .eq('activo', true)
                    .or(`nombre.ilike.%${term}%,codigo.ilike.%${term}%`)
                    .limit(8);
                setProductResults(data || []);
            } catch (_) {
                setProductResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(handle);
    }, [productSearch, open, tenantId]);

    const reset = () => {
        setProductSearch('');
        setProductResults([]);
        setProducto(null);
        setTipo('oferta');
        setTono('urgente');
        setTemplateId(null);
        setVariantes([]);
        setMeta(null);
    };

    const handleGenerate = useCallback(async () => {
        if (!producto) {
            toast({ variant: 'destructive', title: 'Selecciona un producto', description: 'Busca y elige un producto de tu catalogo.' });
            return;
        }
        setGenerating(true);
        setVariantes([]);
        try {
            const { data, error } = await supabase.functions.invoke('generate-design-copy', {
                body: {
                    producto: {
                        nombre: producto.nombre,
                        precio: producto.precio,
                        descripcion: producto.descripcion,
                        codigo: producto.codigo,
                    },
                    tipo,
                    tono,
                },
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || 'Respuesta invalida');
            setVariantes(data.variantes || []);
            setMeta(data.meta || null);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error generando', description: e.message });
        } finally {
            setGenerating(false);
        }
    }, [producto, tipo, tono, toast]);

    const handleUseVariant = async (variante) => {
        if (!templateId) {
            toast({ variant: 'destructive', title: 'Sin plantilla', description: 'Elige una plantilla para esta variante.' });
            return;
        }
        setCreating(true);
        try {
            const tpl = await getTemplate(templateId);
            const doc = await createDesignFromTemplate({
                tenantId,
                userId: user?.id,
                template: tpl,
                productoId: producto.id,
                name: `${tpl.name} — ${producto.nombre}`,
            });
            // Guardamos el copy generado en metadata para que el editor lo
            // pueda inyectar despues en los placeholders de la plantilla.
            await updateDesign(doc.id, {
                generated_by_ai: true,
                ai_prompt: `tipo=${tipo} tono=${tono} producto=${producto.nombre}`,
                metadata: {
                    source: 'ai_generator',
                    producto: {
                        id: producto.id,
                        nombre: producto.nombre,
                        precio: producto.precio,
                        codigo: producto.codigo,
                        imagen_url: producto.imagen_url,
                    },
                    ai_copy: variante,
                    ai_meta: meta,
                },
            });
            toast({ title: '✨ Disen~o creado', description: 'Abre el editor para ajustarlo.' });
            onCreated?.({ ...doc, generated_by_ai: true });
            reset();
            onClose();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error creando disen~o', description: e.message });
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-violet-600" />
                        Crear disen~o con IA
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Selector de producto */}
                    <section>
                        <Label className="text-xs font-bold text-slate-600">1. Producto del catalogo *</Label>
                        {producto ? (
                            <div className="mt-1 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md p-2">
                                <div className="h-10 w-10 rounded bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                    {producto.imagen_url
                                        ? <img src={producto.imagen_url} alt={producto.nombre} className="w-full h-full object-cover" />
                                        : <span className="text-[10px] text-slate-400">sin foto</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate">{producto.nombre}</p>
                                    <p className="text-[11px] text-slate-500">{producto.codigo} · RD$ {Number(producto.precio || 0).toLocaleString('es-DO')}</p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => setProducto(null)}>Cambiar</Button>
                            </div>
                        ) : (
                            <div className="mt-1 relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="Buscar por nombre o codigo..."
                                    className="pl-8"
                                />
                                {productSearch.length >= 2 && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                        {searching && (
                                            <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                                            </div>
                                        )}
                                        {!searching && productResults.length === 0 && (
                                            <div className="p-3 text-center text-xs text-slate-400">Sin resultados</div>
                                        )}
                                        {productResults.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => { setProducto(p); setProductSearch(''); setProductResults([]); }}
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
                    </section>

                    {/* Tipo */}
                    <section>
                        <Label className="text-xs font-bold text-slate-600">2. Tipo de pieza</Label>
                        <div className="grid grid-cols-5 gap-2 mt-1">
                            {TIPOS.map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setTipo(t.key)}
                                    className={`p-2 border rounded text-xs text-center transition ${tipo === t.key ? 'border-violet-500 bg-violet-50 font-bold text-violet-700' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
                                >
                                    <div className="font-semibold">{t.label}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{t.description}</div>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Tono */}
                    <section>
                        <Label className="text-xs font-bold text-slate-600">3. Tono</Label>
                        <div className="grid grid-cols-4 gap-2 mt-1">
                            {TONOS.map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setTono(t.key)}
                                    className={`p-2 border rounded text-xs text-center transition ${tono === t.key ? 'border-violet-500 bg-violet-50 font-bold text-violet-700' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
                                >
                                    <div className="font-semibold">{t.label}</div>
                                    <div className="text-[10px] italic text-slate-400 mt-0.5">{t.hint}</div>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Plantilla sugerida */}
                    <section>
                        <Label className="text-xs font-bold text-slate-600">4. Plantilla base</Label>
                        <select
                            value={templateId || ''}
                            onChange={(e) => setTemplateId(e.target.value || null)}
                            className="mt-1 w-full text-sm border border-slate-200 rounded p-2"
                        >
                            <option value="">Selecciona...</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.width}×{t.height})</option>
                            ))}
                        </select>
                    </section>

                    {/* Boton generar */}
                    <Button
                        onClick={handleGenerate}
                        disabled={!producto || generating}
                        className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700"
                    >
                        {generating
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando 3 variantes...</>
                            : <><Wand2 className="h-4 w-4 mr-2" /> {variantes.length ? 'Generar otras 3 variantes' : 'Generar 3 variantes'}</>}
                    </Button>

                    {/* Variantes */}
                    {variantes.length > 0 && (
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600">Elige una variante:</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {variantes.map((v, i) => (
                                    <div key={i} className="border border-slate-200 rounded p-3 bg-white space-y-2">
                                        <p className="text-base font-black leading-tight text-slate-900">{v.titulo}</p>
                                        <p className="text-xs text-slate-700">{v.subtitulo}</p>
                                        <div className="inline-block text-[10px] font-bold uppercase bg-slate-900 text-white px-2 py-0.5 rounded">
                                            {v.cta}
                                        </div>
                                        {v.hashtags && (
                                            <p className="text-[10px] text-violet-600 break-words">{v.hashtags}</p>
                                        )}
                                        <Button
                                            size="sm"
                                            className="w-full mt-1 bg-emerald-600 text-white hover:bg-emerald-700"
                                            onClick={() => handleUseVariant(v)}
                                            disabled={creating}
                                        >
                                            {creating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                            Usar esta
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            {meta && (
                                <p className="text-[10px] text-slate-400 text-right">
                                    Generado en {meta.duration_ms}ms · costo: $ {meta.cost_usd?.toFixed(5)}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
