// ============================================================
// CanvaEditor.jsx — Editor visual estilo Canva (Polotno)
// ============================================================
// Componente que embebe el editor de Polotno y maneja:
//   - Cargar documento (de plantilla o disen~o guardado)
//   - Guardado automatico cada N segundos
//   - Boton "Exportar a PNG" (sube a Storage + actualiza disen~o)
//   - Insertar foto de producto del catalogo
//
// ⚠️ REQUIERE INSTALAR Polotno antes de usar:
//    npm install polotno
//
// La importacion de polotno esta dentro de un try/catch dynamic
// para que el build NO se rompa si aun no esta instalado.
// Cuando se instale, este componente "se enciende" solo.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Save, Download, Loader2, Sparkles, ShoppingBag, Wand2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { updateDesign, saveRendered, saveThumbnail } from '@/services/designProService';
import { injectAiCopy } from '@/data/design-templates';

export default function CanvaEditor({ design, onBack, onSaved, onRequestPublish }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [polotno, setPolotno] = useState({ status: 'loading', error: null, mod: null });
    const storeRef = useRef(null);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [name, setName] = useState(design?.name || '');

    // Lazy-import Polotno para que el build no se rompa si no esta instalado.
    // El comentario /* @vite-ignore */ evita que Vite intente resolver el
    // modulo en build time. El import solo ocurre en runtime, en el navegador.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const polotnoBase = 'polotno';
                const [storeMod, sidePanelMod, toolbarMod, workspaceMod, zoomMod, pagesMod] = await Promise.all([
                    import(/* @vite-ignore */ `${polotnoBase}/model/store`),
                    import(/* @vite-ignore */ `${polotnoBase}/side-panel`),
                    import(/* @vite-ignore */ `${polotnoBase}/toolbar/toolbar`),
                    import(/* @vite-ignore */ `${polotnoBase}/canvas/workspace`),
                    import(/* @vite-ignore */ `${polotnoBase}/toolbar/zoom-buttons`),
                    import(/* @vite-ignore */ `${polotnoBase}/pages-timeline`),
                ]);
                if (cancelled) return;
                const store = storeMod.createStore({ key: 'motoflow-design-pro', showCredit: false });

                // Inyectar copy IA + datos del producto si vienen en metadata.
                // Solo aplicamos al PRIMER load: si el usuario ya guardo cambios
                // (metadata.ai_copy_applied === true), respetamos su edicion.
                let docToLoad = design?.content || { width: design?.width || 1080, height: design?.height || 1080, pages: [{ children: [] }] };
                const meta = design?.metadata || {};
                if (meta?.ai_copy && !meta?.ai_copy_applied) {
                    const producto = meta.producto || {};
                    const injectValues = {
                        titulo: meta.ai_copy.titulo,
                        subtitulo: meta.ai_copy.subtitulo,
                        cta: meta.ai_copy.cta,
                        precio: producto.precio != null ? `RD$ ${Number(producto.precio).toLocaleString('es-DO')}` : undefined,
                        producto_foto: producto.imagen_url || undefined,
                    };
                    docToLoad = injectAiCopy(docToLoad, injectValues);
                    // Marcamos para no re-aplicar en futuros loads
                    updateDesign(design.id, {
                        content: docToLoad,
                        metadata: { ...meta, ai_copy_applied: true },
                    }).catch((err) => console.warn('[CanvaEditor] no se pudo marcar ai_copy_applied:', err?.message));
                }

                store.loadJSON(docToLoad);
                storeRef.current = store;
                setPolotno({
                    status: 'ready',
                    mod: {
                        SidePanel: sidePanelMod.SidePanel,
                        Toolbar: toolbarMod.Toolbar,
                        Workspace: workspaceMod.Workspace,
                        ZoomButtons: zoomMod.ZoomButtons,
                        PagesTimeline: pagesMod.PagesTimeline,
                        store,
                    },
                });
            } catch (e) {
                setPolotno({ status: 'missing', error: e?.message || String(e) });
            }
        })();
        return () => { cancelled = true; };
    }, [design]);

    const handleSave = async () => {
        if (!storeRef.current) return;
        setSaving(true);
        try {
            const content = storeRef.current.toJSON();
            const thumbBlob = await storeRef.current.toBlob({ mimeType: 'image/png', pixelRatio: 0.3 });
            await updateDesign(design.id, { content, name });
            await saveThumbnail(tenantId, design.id, thumbBlob);
            toast({ title: 'Guardado', description: 'Tu disen~o quedo actualizado.' });
            onSaved?.();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    const handleExport = async () => {
        if (!storeRef.current) return;
        setExporting(true);
        try {
            const content = storeRef.current.toJSON();
            const finalBlob = await storeRef.current.toBlob({ mimeType: 'image/png', pixelRatio: 2 });
            await updateDesign(design.id, { content, name });
            const url = await saveRendered(tenantId, design.id, finalBlob, { markReady: true });
            // Descarga directa
            const link = document.createElement('a');
            link.href = url;
            link.download = `${name.replace(/[^a-z0-9_-]/gi, '_')}.png`;
            link.click();
            toast({ title: 'Exportado', description: 'PNG generado y descargado.' });
            onSaved?.();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setExporting(false);
        }
    };

    // Exporta primero (sin descargar) y abre el modal de publicar con el design actualizado.
    const handlePublish = async () => {
        if (!storeRef.current || !onRequestPublish) return;
        setPublishing(true);
        try {
            const content = storeRef.current.toJSON();
            const finalBlob = await storeRef.current.toBlob({ mimeType: 'image/png', pixelRatio: 2 });
            await updateDesign(design.id, { content, name });
            const url = await saveRendered(tenantId, design.id, finalBlob, { markReady: true });
            onRequestPublish({ ...design, name, rendered_url: url });
            onSaved?.();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
                <Button size="icon" variant="ghost" onClick={onBack} title="Volver">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0 px-2"
                    placeholder="Nombre del disen~o"
                />
                <div className="text-xs text-slate-400">{design.width}×{design.height}</div>
                <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || polotno.status !== 'ready'}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar
                </Button>
                <Button size="sm" onClick={handleExport} disabled={exporting || publishing || polotno.status !== 'ready'}
                    className="bg-violet-600 text-white hover:bg-violet-700">
                    {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                    Exportar PNG
                </Button>
                {onRequestPublish && (
                    <Button size="sm" onClick={handlePublish} disabled={publishing || exporting || polotno.status !== 'ready'}
                        className="bg-emerald-600 text-white hover:bg-emerald-700">
                        {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                        Publicar
                    </Button>
                )}
            </div>

            {/* Canvas */}
            <div className="flex-1 min-h-0">
                {polotno.status === 'loading' && (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando editor...
                    </div>
                )}
                {polotno.status === 'missing' && (
                    <PolotnoMissingNotice error={polotno.error} />
                )}
                {polotno.status === 'ready' && (
                    <PolotnoCanvas mod={polotno.mod} />
                )}
            </div>
        </div>
    );
}

function PolotnoCanvas({ mod }) {
    const { SidePanel, Toolbar, Workspace, ZoomButtons, PagesTimeline, store } = mod;
    return (
        <div className="flex h-full">
            <div className="w-64 border-r border-slate-200 bg-slate-50">
                <SidePanel store={store} />
            </div>
            <div className="flex-1 flex flex-col">
                <Toolbar store={store} />
                <div className="flex-1 min-h-0">
                    <Workspace store={store} />
                </div>
                <div className="border-t border-slate-200 px-2 py-1 flex items-center gap-2">
                    <ZoomButtons store={store} />
                    <PagesTimeline store={store} />
                </div>
            </div>
        </div>
    );
}

function PolotnoMissingNotice({ error }) {
    return (
        <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                    <Sparkles className="h-6 w-6" />
                </div>
                <p className="text-sm font-bold text-slate-900">Falta instalar Polotno</p>
                <p className="text-xs text-slate-600 mt-2">
                    El editor visual usa Polotno (open-source). Aun no esta instalado en este proyecto.
                </p>
                <pre className="text-[11px] bg-slate-900 text-emerald-300 rounded p-3 mt-3 text-left overflow-x-auto">
npm install polotno
                </pre>
                <p className="text-[10px] text-slate-400 mt-2">
                    Despues reinicia el dev server. El editor se enciende solo cuando detecta el paquete.
                </p>
                {error && (
                    <p className="text-[10px] text-red-400 mt-3 font-mono break-all">{error}</p>
                )}
            </div>
        </div>
    );
}
