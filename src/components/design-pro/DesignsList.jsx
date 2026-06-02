// ============================================================
// DesignsList.jsx — Galeria de disen~os guardados del tenant
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Image as ImageIcon, Copy, Trash2, Edit3, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { listDesigns, deleteDesign, duplicateDesign } from '@/services/designProService';

const STATUS_STYLES = {
    borrador:   'bg-slate-100 text-slate-700 border-slate-200',
    listo:      'bg-emerald-100 text-emerald-800 border-emerald-200',
    publicado:  'bg-violet-100 text-violet-800 border-violet-200',
    archivado:  'bg-slate-100 text-slate-400 border-slate-200',
};

const STATUS_LABELS = {
    borrador: 'Borrador',
    listo: 'Listo',
    publicado: 'Publicado',
    archivado: 'Archivado',
};

export default function DesignsList({ tenantId, onEdit, onShare, onDownload }) {
    const [designs, setDesigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('todos');
    const { toast } = useToast();

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listDesigns(tenantId, { status: statusFilter === 'todos' ? null : statusFilter });
            setDesigns(data);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setLoading(false);
        }
    }, [tenantId, statusFilter, toast]);

    useEffect(() => { if (tenantId) cargar(); }, [tenantId, cargar]);

    const handleDelete = async (d) => {
        if (!window.confirm(`Eliminar el disen~o "${d.name}"? No se puede deshacer.`)) return;
        try {
            await deleteDesign(d.id);
            toast({ title: 'Eliminado', description: d.name });
            cargar();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const handleDuplicate = async (d) => {
        try {
            const dup = await duplicateDesign(d.id);
            toast({ title: 'Duplicado', description: dup.name });
            cargar();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando...
        </div>;
    }

    if (!designs.length) {
        return (
            <div className="text-center py-16">
                <div className="mx-auto h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-3">
                    <ImageIcon className="h-8 w-8" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Aun no tienes disen~os.</p>
                <p className="text-xs text-slate-500 mt-1">Crea uno desde la galeria de plantillas o usa "Crear con IA".</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-1.5">
                {['todos','borrador','listo','publicado','archivado'].map(s => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1 text-xs rounded-full border ${
                            statusFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                        }`}
                    >
                        {s === 'todos' ? 'Todos' : STATUS_LABELS[s]}
                    </button>
                ))}
                <span className="ml-auto text-xs text-slate-400">{designs.length} disen~o(s)</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {designs.map(d => (
                    <div key={d.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition">
                        <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer"
                             onClick={() => onEdit?.(d)}>
                            {d.thumbnail_url || d.rendered_url ? (
                                <img src={d.thumbnail_url || d.rendered_url} alt={d.name} className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon className="h-10 w-10 text-slate-300" />
                            )}
                        </div>
                        <div className="p-2">
                            <div className="flex items-center justify-between gap-1">
                                <span className="text-sm font-semibold text-slate-800 truncate" title={d.name}>{d.name}</span>
                                <Badge className={`shrink-0 text-[9px] border ${STATUS_STYLES[d.status] || ''}`}>
                                    {STATUS_LABELS[d.status] || d.status}
                                </Badge>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                {format(new Date(d.updated_at), "d 'de' MMM, HH:mm", { locale: es })}
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-2">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => onEdit?.(d)}>
                                    <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar" onClick={() => handleDuplicate(d)}>
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                                {d.rendered_url && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Descargar" onClick={() => onDownload?.(d)}>
                                        <Download className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {d.rendered_url && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Publicar" onClick={() => onShare?.(d)}>
                                        <Share2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" title="Eliminar" onClick={() => handleDelete(d)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
