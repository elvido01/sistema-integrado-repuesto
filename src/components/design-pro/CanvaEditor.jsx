// ============================================================
// CanvaEditor.jsx — Editor visual estilo Canva (Polotno)
// ============================================================
// Carga lazy del editor real (PolotnoEditorImpl) para que el
// bundle principal de la app no incluya Polotno. Inyecta los
// textos generados con IA y la foto del producto antes de
// cargar el documento.
//
// Nota sobre license: Polotno sin API key muestra un watermark
// rojo "LICENSE KEY IS MISSING" en el canvas. Para quitarlo hay
// que comprar plan en polotno.com y poner la key en VITE_POLOTNO_KEY.
// El editor funciona perfectamente sin la key (con el watermark).
// ============================================================
import React, { useEffect, useRef, useState, Suspense } from 'react';
import { ArrowLeft, Save, Download, Loader2, Send, Palette, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { updateDesign, saveRendered, saveThumbnail } from '@/services/designProService';
import { injectAiCopy } from '@/data/design-templates';
import BrandKitPanel from './BrandKitPanel';

// Lazy-load Polotno + Blueprint CSS (solo se descarga al abrir editor)
const PolotnoEditorImpl = React.lazy(() => import('./PolotnoEditorImpl'));

const POLOTNO_KEY = import.meta.env.VITE_POLOTNO_KEY || 'nFA5H9elEytDyPyvKZza';

export default function CanvaEditor({ design, onBack, onSaved, onRequestPublish }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const storeRef = useRef(null);
    const [storeReady, setStoreReady] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [name, setName] = useState(design?.name || '');
    const [showBrandKit, setShowBrandKit] = useState(false);
    const [removingBg, setRemovingBg] = useState(false);

    // Inicializa el store de Polotno una sola vez por disen~o.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { createStore } = await import('./PolotnoEditorImpl');
                if (cancelled) return;

                const W = Number(design?.width) || 1080;
                const H = Number(design?.height) || 1080;

                const store = createStore({
                    key: POLOTNO_KEY,
                    showCredit: false,
                });
                // Tamaño del lienzo (importante para que el canvas se renderice).
                store.setSize(W, H);

                // Documento base con la estructura completa que Polotno espera.
                const blank = {
                    width: W,
                    height: H,
                    fonts: [],
                    pages: [{
                        id: 'p1',
                        children: [],
                        background: 'white',
                        width: 'auto',
                        height: 'auto',
                        duration: 5000,
                    }],
                };

                let docToLoad = (design?.content && design.content.pages?.length)
                    ? design.content
                    : blank;

                const meta = design?.metadata || {};
                if (meta?.ai_copy && !meta?.ai_copy_applied) {
                    const producto = meta.producto || {};
                    const injectValues = {
                        titulo: meta.ai_copy.titulo,
                        subtitulo: meta.ai_copy.subtitulo,
                        cta: meta.ai_copy.cta,
                        precio: producto.precio != null
                            ? `RD$ ${Number(producto.precio).toLocaleString('es-DO')}`
                            : undefined,
                        producto_foto: producto.imagen_url || undefined,
                    };
                    docToLoad = injectAiCopy(docToLoad, injectValues);
                    updateDesign(design.id, {
                        content: docToLoad,
                        metadata: { ...meta, ai_copy_applied: true },
                    }).catch((err) => console.warn('[CanvaEditor] no se pudo marcar ai_copy_applied:', err?.message));
                }

                try {
                    store.loadJSON(docToLoad);
                } catch (loadErr) {
                    console.warn('[CanvaEditor] loadJSON fallo, creando documento en blanco:', loadErr?.message);
                }

                // Garantia: si despues de cargar no hay pages, creamos una.
                if (!store.pages || store.pages.length === 0) {
                    store.addPage();
                }

                storeRef.current = store;
                setStoreReady(true);
            } catch (e) {
                if (cancelled) return;
                setLoadError(e?.message || String(e));
                toast({ variant: 'destructive', title: 'Error al iniciar editor', description: e?.message || String(e) });
            }
        })();
        return () => { cancelled = true; };
    }, [design?.id]);

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

    // Quita el fondo de la imagen seleccionada usando @imgly/background-removal
    // Es 100% gratis, corre en el navegador (sin enviar imagenes a servidor externo).
    const handleRemoveBg = async () => {
        if (!storeRef.current) return;
        const selected = storeRef.current.selectedElements || [];
        const imageEl = selected.find(e => e.type === 'image');
        if (!imageEl) {
            toast({ variant: 'destructive', title: 'Sin imagen seleccionada', description: 'Toca primero una imagen del canvas.' });
            return;
        }
        setRemovingBg(true);
        try {
            const { removeBackground } = await import('@imgly/background-removal');
            // src puede ser URL https o data URL
            const resultBlob = await removeBackground(imageEl.src);
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(resultBlob);
            });
            imageEl.set({ src: dataUrl });
            toast({ title: 'Fondo eliminado', description: 'Listo. Puedes seguir editando.' });
        } catch (e) {
            console.error('[removeBg]', e);
            toast({ variant: 'destructive', title: 'Error al quitar fondo', description: e?.message || 'Reintenta con una imagen mas pequen~a.' });
        } finally {
            setRemovingBg(false);
        }
    };

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
                <Button variant="outline" size="sm" onClick={() => setShowBrandKit(true)} disabled={!storeReady} title="Kit de marca">
                    <Palette className="h-4 w-4 mr-1" /> Kit
                </Button>
                <Button variant="outline" size="sm" onClick={handleRemoveBg} disabled={removingBg || !storeReady} title="Quita el fondo de la imagen seleccionada (gratis, en este navegador)">
                    {removingBg ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
                    Quitar fondo
                </Button>
                <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || !storeReady}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar
                </Button>
                <Button size="sm" onClick={handleExport} disabled={exporting || publishing || !storeReady}
                    className="bg-violet-600 text-white hover:bg-violet-700">
                    {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                    Exportar PNG
                </Button>
                {onRequestPublish && (
                    <Button size="sm" onClick={handlePublish} disabled={publishing || exporting || !storeReady}
                        className="bg-emerald-600 text-white hover:bg-emerald-700">
                        {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                        Publicar
                    </Button>
                )}
            </div>

            {/* Editor de Polotno */}
            <div className="flex-1 min-h-0">
                {loadError ? (
                    <div className="h-full flex items-center justify-center p-8 text-center">
                        <div>
                            <p className="text-sm font-bold text-red-600">No se pudo cargar el editor</p>
                            <p className="text-xs text-slate-500 mt-2 font-mono">{loadError}</p>
                        </div>
                    </div>
                ) : !storeReady ? (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando editor...
                    </div>
                ) : (
                    <Suspense fallback={
                        <div className="h-full flex items-center justify-center text-slate-400">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando editor...
                        </div>
                    }>
                        <PolotnoEditorImpl store={storeRef.current} />
                    </Suspense>
                )}
            </div>

            <BrandKitPanel
                open={showBrandKit}
                onClose={() => setShowBrandKit(false)}
                store={storeRef.current}
            />
        </div>
    );
}
