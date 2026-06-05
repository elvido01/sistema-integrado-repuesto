// ============================================================
// CanvaEditor.jsx - Motoflow Studio wrapper
// ============================================================
// Editor visual propio para Diseno Pro. No usa Polotno, por lo
// tanto no muestra avisos de licencia ni watermark.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, Save, Send, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { updateDesign, saveRendered, saveThumbnail } from '@/services/designProService';
import { injectAiCopy } from '@/data/design-templates';
import MotoflowStudioEditor from './MotoflowStudioEditor';

function buildBlankDocument(width, height) {
    return {
        width,
        height,
        fonts: [],
        pages: [{
            id: 'p1',
            children: [],
            background: '#ffffff',
            width: 'auto',
            height: 'auto',
            duration: 5000,
        }],
    };
}

function dataUrlFromBlob(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export default function CanvaEditor({ design, onBack, onSaved, onRequestPublish }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const editorRef = useRef(null);
    const [content, setContent] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [removingBg, setRemovingBg] = useState(false);
    const [name, setName] = useState(design?.name || '');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const width = Number(design?.width) || 1080;
                const height = Number(design?.height) || 1080;
                let docToLoad = (design?.content && design.content.pages?.length)
                    ? design.content
                    : buildBlankDocument(width, height);

                const meta = design?.metadata || {};
                if (meta?.ai_copy && !meta?.ai_copy_applied) {
                    const producto = meta.producto || {};
                    docToLoad = injectAiCopy(docToLoad, {
                        titulo: meta.ai_copy.titulo,
                        subtitulo: meta.ai_copy.subtitulo,
                        cta: meta.ai_copy.cta,
                        precio: producto.precio != null
                            ? `RD$ ${Number(producto.precio).toLocaleString('es-DO')}`
                            : undefined,
                        producto_foto: producto.imagen_url || undefined,
                    });
                    updateDesign(design.id, {
                        content: docToLoad,
                        metadata: { ...meta, ai_copy_applied: true },
                    }).catch((err) => console.warn('[MotoflowStudio] no se pudo marcar ai_copy_applied:', err?.message));
                }

                if (!cancelled) {
                    setName(design?.name || '');
                    setContent(docToLoad);
                    setLoadError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setLoadError(e?.message || String(e));
                    toast({ variant: 'destructive', title: 'Error al iniciar editor', description: e?.message || String(e) });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [design?.id]);

    const handleSave = async () => {
        if (!editorRef.current) return;
        setSaving(true);
        try {
            const nextContent = editorRef.current.toJSON();
            const thumbBlob = await editorRef.current.toBlob({ mimeType: 'image/png', pixelRatio: 0.3 });
            await updateDesign(design.id, { content: nextContent, name });
            await saveThumbnail(tenantId, design.id, thumbBlob);
            toast({ title: 'Guardado', description: 'Tu diseno quedo actualizado.' });
            onSaved?.();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    const handleExport = async () => {
        if (!editorRef.current) return;
        setExporting(true);
        try {
            const nextContent = editorRef.current.toJSON();
            const finalBlob = await editorRef.current.toBlob({ mimeType: 'image/png', pixelRatio: 2 });

            const safeName = (name || 'diseno').replace(/[^a-z0-9_-]/gi, '_') || 'diseno';
            const blobUrl = URL.createObjectURL(finalBlob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${safeName}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);

            await updateDesign(design.id, { content: nextContent, name });
            await saveRendered(tenantId, design.id, finalBlob, { markReady: true });

            toast({ title: 'Descargado', description: 'PNG guardado en tu carpeta de descargas.' });
            onSaved?.();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setExporting(false);
        }
    };

    const handleRemoveBg = async () => {
        if (!editorRef.current) return;
        const selected = editorRef.current.getSelectedElement();
        if (!selected || selected.type !== 'image' || !selected.src) {
            toast({ variant: 'destructive', title: 'Sin imagen seleccionada', description: 'Selecciona primero una imagen del canvas.' });
            return;
        }
        setRemovingBg(true);
        try {
            const { removeBackground } = await import('@imgly/background-removal');
            const resultBlob = await removeBackground(selected.src);
            const dataUrl = await dataUrlFromBlob(resultBlob);
            editorRef.current.setSelectedElement({ src: dataUrl });
            toast({ title: 'Fondo eliminado', description: 'Listo. Puedes seguir editando.' });
        } catch (e) {
            console.error('[removeBg]', e);
            toast({ variant: 'destructive', title: 'Error al quitar fondo', description: e?.message || 'Reintenta con una imagen mas pequena.' });
        } finally {
            setRemovingBg(false);
        }
    };

    const handlePublish = async () => {
        if (!editorRef.current || !onRequestPublish) return;
        setPublishing(true);
        try {
            const nextContent = editorRef.current.toJSON();
            const finalBlob = await editorRef.current.toBlob({ mimeType: 'image/png', pixelRatio: 2 });
            await updateDesign(design.id, { content: nextContent, name });
            const url = await saveRendered(tenantId, design.id, finalBlob, { markReady: true });
            onRequestPublish({ ...design, name, rendered_url: url });
            onSaved?.();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setPublishing(false);
        }
    };

    const ready = !!content && !loadError;

    return (
        <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
                <Button size="icon" variant="ghost" onClick={onBack} title="Volver">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0 px-2"
                    placeholder="Nombre del diseno"
                />
                <div className="text-xs text-slate-400">{design.width}x{design.height}</div>
                <Button variant="outline" size="sm" onClick={handleRemoveBg} disabled={removingBg || !ready} title="Quita el fondo de la imagen seleccionada">
                    {removingBg ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
                    Quitar fondo
                </Button>
                <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || !ready}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar
                </Button>
                <Button size="sm" onClick={handleExport} disabled={exporting || publishing || !ready}
                    className="bg-violet-600 text-white hover:bg-violet-700">
                    {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                    Exportar PNG
                </Button>
                {onRequestPublish && (
                    <Button size="sm" onClick={handlePublish} disabled={publishing || exporting || !ready}
                        className="bg-emerald-600 text-white hover:bg-emerald-700">
                        {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                        Publicar
                    </Button>
                )}
            </div>

            <div className="flex-1 min-h-0">
                {loadError ? (
                    <div className="h-full flex items-center justify-center p-8 text-center">
                        <div>
                            <p className="text-sm font-bold text-red-600">No se pudo cargar el editor</p>
                            <p className="text-xs text-slate-500 mt-2 font-mono">{loadError}</p>
                        </div>
                    </div>
                ) : !content ? (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando editor...
                    </div>
                ) : (
                    <MotoflowStudioEditor
                        ref={editorRef}
                        content={content}
                        width={Number(design?.width) || 1080}
                        height={Number(design?.height) || 1080}
                    />
                )}
            </div>
        </div>
    );
}
