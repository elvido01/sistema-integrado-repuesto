// ============================================================
// GeneratedContentPreview.jsx — Panel derecho: propuesta generada
// ============================================================
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Sparkles, RefreshCw, Check, X, Image as ImageIcon, Loader2, Youtube,
    Instagram, Facebook, MessageCircle, Film, Megaphone, Clipboard, CalendarPlus,
} from 'lucide-react';

const ESTADO_BADGE = {
    borrador: 'bg-slate-100 text-slate-600',
    aprobado: 'bg-blue-100 text-blue-700',
    publicado: 'bg-emerald-100 text-emerald-700',
    descartado: 'bg-red-100 text-red-700',
};

function GuionView({ titulo, escenas }) {
    if (!escenas || escenas.length === 0) return null;
    return (
        <div className="mb-3">
            <p className="text-xs font-bold text-violet-700 mb-1">{titulo}</p>
            <div className="space-y-1">
                {escenas.map((e, i) => (
                    <div key={i} className="text-xs bg-slate-50 rounded p-2 border border-slate-100">
                        <span className="font-bold text-slate-700">Escena {e.escena || i + 1}:</span> {e.texto}
                        {e.visual && <div className="text-slate-400 mt-0.5">🎬 {e.visual}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
}

function Block({ icon: Icon, label, text }) {
    if (!text) return null;
    const copy = () => navigator.clipboard?.writeText(text);
    return (
        <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-slate-600 flex items-center gap-1"><Icon className="h-3.5 w-3.5" /> {label}</p>
                <button onClick={copy} className="text-slate-400 hover:text-violet-600" title="Copiar"><Clipboard className="h-3.5 w-3.5" /></button>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-slate-100 rounded p-2">{text}</p>
        </div>
    );
}

export default function GeneratedContentPreview({
    content, onRegenerate, onAccept, onDiscard, onPublish, onGenerateImage, onSchedule, busy,
}) {
    const [tab, setTab] = useState('redes');
    const [feedback, setFeedback] = useState('');

    if (!content) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8">
                <Sparkles className="h-10 w-10 mb-3 text-violet-300" />
                <p className="font-medium">Aquí verás la propuesta generada</p>
                <p className="text-sm">Selecciona un producto sugerido y el agente creará el guion, copys y miniatura.</p>
            </div>
        );
    }

    const imagenes = content.imagenes || [];

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ESTADO_BADGE[content.estado] || ESTADO_BADGE.borrador}`}>{content.estado}</span>
                    {content.incompleto && <span className="ml-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-700">incompleto</span>}
                    {content.flags?.modo_encargo && <span className="ml-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-700">encargo</span>}
                    <h3 className="font-bold text-slate-800 mt-1 leading-tight">{content.titulo_youtube || 'Propuesta'}</h3>
                    <p className="text-xs text-slate-400">Canal recomendado: {content.canal_recomendado || '—'} · costo ${Number(content.cost_usd || 0).toFixed(4)}</p>
                </div>
            </div>

            {/* Sub-tabs de contenido */}
            <div className="flex gap-1 border-b border-slate-200 mb-3 text-xs">
                {[['redes', 'Redes'], ['guiones', 'Guiones'], ['imagenes', 'Imágenes']].map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-3 py-1.5 font-medium ${tab === k ? 'text-violet-700 border-b-2 border-violet-600' : 'text-slate-500'}`}>{l}</button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
                {tab === 'redes' && (
                    <>
                        <Block icon={Youtube} label="Título YouTube" text={content.titulo_youtube} />
                        <Block icon={Megaphone} label="Descripción SEO" text={content.descripcion_seo} />
                        <Block icon={MessageCircle} label="WhatsApp Business" text={content.texto_whatsapp} />
                        <Block icon={Instagram} label="Copy Instagram" text={content.copy_instagram} />
                        <Block icon={Facebook} label="Copy Facebook" text={content.copy_facebook} />
                        <Block icon={Sparkles} label="Llamada a la acción (CTA)" text={content.cta} />
                    </>
                )}
                {tab === 'guiones' && (
                    <>
                        <GuionView titulo="Reel 8 segundos (escenas Veo 3)" escenas={content.guion_8s} />
                        <GuionView titulo="Reel 15 segundos" escenas={content.guion_15s} />
                        <GuionView titulo="Reel 30 segundos" escenas={content.guion_30s} />
                    </>
                )}
                {tab === 'imagenes' && (
                    <>
                        <Block icon={ImageIcon} label="Idea de miniatura" text={content.idea_miniatura} />
                        <Block icon={Film} label="Sugerencia visual" text={content.sugerencia_visual} />
                        {imagenes.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                {imagenes.map((img, i) => (
                                    <a key={i} href={img.url} target="_blank" rel="noreferrer" className="block">
                                        <img src={img.url} alt="miniatura" className="rounded-lg border border-slate-200 w-full" />
                                        <span className="text-[10px] text-slate-400">{img.tipo} · ${Number(img.cost_usd || 0).toFixed(3)}</span>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 mt-2">Aún no hay imágenes generadas.</p>
                        )}
                        <Button size="sm" variant="outline" className="w-full mt-3"
                            onClick={onGenerateImage} disabled={busy.image}>
                            {busy.image ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generando imagen...</> : <><ImageIcon className="h-4 w-4 mr-1" /> Generar miniatura (IA · ~$0.04)</>}
                        </Button>
                    </>
                )}
            </div>

            {/* Acciones */}
            <div className="border-t border-slate-200 pt-3 mt-2 space-y-2">
                <textarea
                    value={feedback} onChange={(e) => setFeedback(e.target.value)}
                    placeholder="¿Quieres otra versión? Escribe qué cambiar (opcional)..."
                    className="w-full text-xs border border-slate-200 rounded p-2 resize-none h-12"
                />
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => onRegenerate(feedback)} disabled={busy.regen}>
                        {busy.regen ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Otra versión
                    </Button>
                    {content.estado === 'borrador' && (
                        <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={onAccept} disabled={busy.state}>
                            <Check className="h-4 w-4 mr-1" /> Aceptar
                        </Button>
                    )}
                    {content.estado === 'aprobado' && (
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onPublish} disabled={busy.state}>
                            <Check className="h-4 w-4 mr-1" /> Marcar publicado
                        </Button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="flex-1 text-slate-500" onClick={onSchedule} disabled={busy.state}>
                        <CalendarPlus className="h-4 w-4 mr-1" /> Programar
                    </Button>
                    <Button size="sm" variant="ghost" className="flex-1 text-red-500 hover:text-red-600" onClick={onDiscard} disabled={busy.state}>
                        <X className="h-4 w-4 mr-1" /> Descartar
                    </Button>
                </div>
            </div>
        </div>
    );
}
