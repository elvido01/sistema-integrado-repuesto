// ============================================================
// TemplatesGallery.jsx — Galeria de plantillas del sistema
// ============================================================
import React, { useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getTemplates } from '@/services/designProService';

const CATEGORY_LABELS = {
    oferta: 'Oferta',
    nuevo: 'Nuevo',
    promo: 'Promo',
    reposicion: 'Reposicion',
    comunicado: 'Comunicado',
    comparativa: 'Comparativa',
    catalogo: 'Catalogo',
    story: 'Story',
    banner: 'Banner',
    agradecimiento: 'Gracias',
};

const CATEGORY_COLORS = {
    oferta:        'bg-red-100 text-red-800 border-red-200',
    nuevo:         'bg-emerald-100 text-emerald-800 border-emerald-200',
    promo:         'bg-amber-100 text-amber-800 border-amber-200',
    reposicion:    'bg-blue-100 text-blue-800 border-blue-200',
    comunicado:    'bg-slate-100 text-slate-700 border-slate-200',
    comparativa:   'bg-violet-100 text-violet-800 border-violet-200',
    catalogo:      'bg-indigo-100 text-indigo-800 border-indigo-200',
    story:         'bg-pink-100 text-pink-800 border-pink-200',
    banner:        'bg-cyan-100 text-cyan-800 border-cyan-200',
    agradecimiento:'bg-purple-100 text-purple-800 border-purple-200',
};

const FORMAT_HINT = {
    post_square:    '1080×1080 — Post IG',
    post_landscape: '1200×630 — Post FB',
    story_vertical: '1080×1920 — Story',
};

export default function TemplatesGallery({ onSelectTemplate, onCreateBlank, onGenerateWithAI }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('todas');

    useEffect(() => {
        (async () => {
            try {
                const data = await getTemplates();
                setTemplates(data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const visible = filter === 'todas' ? templates : templates.filter(t => t.category === filter);
    const categorias = ['todas', ...Array.from(new Set(templates.map(t => t.category)))];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando plantillas...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Acciones rapidas arriba */}
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    onClick={onGenerateWithAI}
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700"
                >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Crear con IA
                </Button>
                <Button variant="outline" onClick={onCreateBlank}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Disen~o en blanco
                </Button>
                <div className="ml-auto text-xs text-slate-500">
                    {templates.length} plantilla{templates.length !== 1 ? 's' : ''} disponibles
                </div>
            </div>

            {/* Filtros por categoria */}
            <div className="flex flex-wrap gap-1.5">
                {categorias.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setFilter(cat)}
                        className={`px-3 py-1 text-xs rounded-full border ${
                            filter === cat
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                        }`}
                    >
                        {cat === 'todas' ? 'Todas' : CATEGORY_LABELS[cat] || cat}
                    </button>
                ))}
            </div>

            {/* Grid de plantillas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {visible.map(t => (
                    <button
                        key={t.id}
                        onClick={() => onSelectTemplate(t)}
                        className="group text-left bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-violet-400 hover:shadow-md transition"
                    >
                        <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                            {t.preview_url ? (
                                <img src={t.preview_url} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                            ) : (
                                <div className="text-slate-300 text-center">
                                    <ImageIcon className="h-10 w-10 mx-auto mb-1" />
                                    <span className="text-[10px] uppercase">Sin preview</span>
                                </div>
                            )}
                        </div>
                        <div className="p-2">
                            <div className="flex items-center justify-between gap-1">
                                <span className="text-sm font-semibold text-slate-800 truncate">{t.name}</span>
                                <Badge className={`shrink-0 text-[9px] border ${CATEGORY_COLORS[t.category] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                    {CATEGORY_LABELS[t.category] || t.category}
                                </Badge>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{FORMAT_HINT[t.format] || t.format}</p>
                        </div>
                    </button>
                ))}
            </div>

            {visible.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                    No hay plantillas en esta categoria.
                </div>
            )}
        </div>
    );
}
