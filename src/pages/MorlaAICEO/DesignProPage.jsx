// ============================================================
// DesignProPage.jsx — Modulo "Disen~o Pro" (estilo Canva)
// ============================================================
// Pestan~a dentro de MOTOFLOW IA CEO. Solo plan ENTERPRISE.
// Vistas internas:
//   - galeria   : grid de plantillas pre-armadas + boton "Crear con IA"
//   - editor    : Polotno embebido para editar un disen~o concreto
//   - misDisenos: lista de disen~os guardados del tenant
//
// Cuando el usuario elige plantilla → crea un design_document y abre editor.
// ============================================================
import React, { useState, useCallback } from 'react';
import { LayoutGrid, FolderOpen, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import TemplatesGallery from '@/components/design-pro/TemplatesGallery';
import DesignsList from '@/components/design-pro/DesignsList';
import CanvaEditor from '@/components/design-pro/CanvaEditor';
import AiDesignGenerator from '@/components/design-pro/AiDesignGenerator';
import PublishDesignModal from '@/components/design-pro/PublishDesignModal';
import TemplatePickerModal from '@/components/design-pro/TemplatePickerModal';
import {
    getTemplate,
    createDesignFromTemplate,
    createBlankDesign,
    getDesign,
    updateDesign,
} from '@/services/designProService';

const VIEW_TABS = [
    { key: 'galeria',    label: 'Plantillas',  icon: LayoutGrid },
    { key: 'misDisenos', label: 'Mis disen~os', icon: FolderOpen },
];

export default function DesignProPage() {
    const { tenantId, user } = useAuth();
    const { toast } = useToast();
    const [view, setView] = useState('galeria');
    const [activeDesign, setActiveDesign] = useState(null);
    const [creating, setCreating] = useState(false);
    const [showAiGenerator, setShowAiGenerator] = useState(false);
    const [designToPublish, setDesignToPublish] = useState(null);
    const [designsRefreshKey, setDesignsRefreshKey] = useState(0);
    const [templateToPick, setTemplateToPick] = useState(null);

    // Al clickear una plantilla NO creamos directo: abrimos el picker
    // para que el usuario elija opcionalmente un producto del catalogo
    // y se inyecte su foto y precio en la plantilla.
    const handleSelectTemplate = useCallback((template) => {
        setTemplateToPick(template);
    }, []);

    // Confirma desde el TemplatePickerModal: crea el disen~o con producto opcional
    const handleConfirmTemplatePick = useCallback(async ({ template, producto }) => {
        if (!tenantId) return;
        setTemplateToPick(null);
        setCreating(true);
        try {
            const full = await getTemplate(template.id);
            const doc = await createDesignFromTemplate({
                tenantId,
                userId: user?.id,
                template: full,
                productoId: producto?.id || null,
                name: producto ? `${full.name} — ${producto.nombre}` : full.name,
            });
            // Si el usuario eligio producto, guardamos sus datos en metadata
            // para que el motor de inyeccion del editor inserte foto+precio.
            if (producto) {
                const updated = await updateDesign(doc.id, {
                    metadata: {
                        source: 'template_picker',
                        producto: {
                            id: producto.id,
                            nombre: producto.nombre,
                            precio: producto.precio,
                            codigo: producto.codigo,
                            imagen_url: producto.imagen_url,
                        },
                        // Sin ai_copy, el motor solo inyectara producto_foto + precio.
                        // Los textos quedan con los placeholders de la plantilla.
                        ai_copy: {},
                    },
                });
                setActiveDesign(updated);
            } else {
                setActiveDesign(doc);
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setCreating(false);
        }
    }, [tenantId, user?.id, toast]);

    const handleCreateBlank = useCallback(async () => {
        if (!tenantId) return;
        setCreating(true);
        try {
            const doc = await createBlankDesign({ tenantId, userId: user?.id });
            setActiveDesign(doc);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setCreating(false);
        }
    }, [tenantId, user?.id, toast]);

    const handleGenerateWithAI = useCallback(() => {
        setShowAiGenerator(true);
    }, []);

    const handleAiCreated = useCallback((doc) => {
        // El generador ya creo el design_document; abrimos el editor.
        setActiveDesign(doc);
    }, []);

    const handleEditDesign = useCallback(async (d) => {
        try {
            const full = await getDesign(d.id);
            setActiveDesign(full);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    }, [toast]);

    const handleBackToList = useCallback(() => {
        setActiveDesign(null);
    }, []);

    // ── Vista de editor (a pantalla completa de la tab) ──
    if (activeDesign) {
        return (
            <>
                <div className="h-[calc(100vh-220px)] min-h-[500px]">
                    <CanvaEditor
                        design={activeDesign}
                        onBack={handleBackToList}
                        onSaved={() => { /* opcional: refresh */ }}
                        onRequestPublish={(updated) => setDesignToPublish(updated)}
                    />
                </div>
                <PublishDesignModal
                    open={!!designToPublish}
                    design={designToPublish}
                    onClose={() => setDesignToPublish(null)}
                    onPublished={() => {/* el design queda como publicado */}}
                />
            </>
        );
    }

    // ── Vista de galeria / mis disen~os ──
    return (
        <div className="space-y-4">
            {/* Sub-tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                {VIEW_TABS.map(t => {
                    const Icon = t.icon;
                    const active = view === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setView(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition ${
                                active
                                    ? 'border-violet-600 text-violet-700 font-bold'
                                    : 'border-transparent text-slate-600 hover:text-slate-800'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {creating && (
                <div className="bg-violet-50 border border-violet-200 rounded p-2 text-xs text-violet-800 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creando disen~o...
                </div>
            )}

            {view === 'galeria' && (
                <TemplatesGallery
                    onSelectTemplate={handleSelectTemplate}
                    onCreateBlank={handleCreateBlank}
                    onGenerateWithAI={handleGenerateWithAI}
                />
            )}

            {view === 'misDisenos' && (
                <DesignsList
                    key={designsRefreshKey}
                    tenantId={tenantId}
                    onEdit={handleEditDesign}
                    onShare={(d) => setDesignToPublish(d)}
                    onDownload={(d) => { if (d.rendered_url) window.open(d.rendered_url, '_blank'); }}
                />
            )}

            <AiDesignGenerator
                open={showAiGenerator}
                onClose={() => setShowAiGenerator(false)}
                onCreated={handleAiCreated}
            />

            <TemplatePickerModal
                open={!!templateToPick}
                template={templateToPick}
                onClose={() => setTemplateToPick(null)}
                onConfirm={handleConfirmTemplatePick}
            />

            <PublishDesignModal
                open={!!designToPublish}
                design={designToPublish}
                onClose={() => setDesignToPublish(null)}
                onPublished={() => setDesignsRefreshKey(k => k + 1)}
            />
        </div>
    );
}
