import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RefreshCw, Loader2, Gavel } from 'lucide-react';
import AiDecisionCard from './AiDecisionCard';

export default function AiDecisionsList({ onCountChange }) {
    const { tenantId, user } = useAuth();
    const { toast } = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState('pending');

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            let q = supabase
                .from('ai_decisions')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(200);
            if (filtroStatus !== 'all') q = q.eq('status', filtroStatus);

            const { data, error } = await q;
            if (error) throw error;
            setItems(data || []);
            if (filtroStatus === 'pending') onCountChange?.((data || []).length);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error cargando decisiones', description: err.message });
        } finally {
            setLoading(false);
        }
    }, [tenantId, filtroStatus, toast, onCountChange]);

    useEffect(() => { cargar(); }, [cargar]);

    const cambiarStatus = async (id, nuevo, notes) => {
        setUpdating(true);
        try {
            const patch = {
                status: nuevo,
                decision_notes: notes || null,
                updated_at: new Date().toISOString(),
            };
            if (['approved', 'rejected', 'postponed'].includes(nuevo)) {
                patch.approved_by = user?.id || null;
                patch.approved_at = new Date().toISOString();
            }
            const { error } = await supabase.from('ai_decisions').update(patch).eq('id', id);
            if (error) throw error;
            toast({ title: 'Decisión actualizada', description: `Estado: ${nuevo}` });
            cargar();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="p-3 border-b border-slate-200 flex items-end gap-3 flex-wrap">
                <div className="flex items-center gap-2 mr-auto">
                    <Gavel className="h-5 w-5 text-violet-500" />
                    <h3 className="text-base font-bold text-slate-800">Centro de Decisiones</h3>
                    <span className="text-xs text-slate-500">({items.length})</span>
                </div>

                <div>
                    <Label className="text-[10px] uppercase font-bold text-slate-500">Estado</Label>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pending">Pendientes</SelectItem>
                            <SelectItem value="approved">Aprobadas</SelectItem>
                            <SelectItem value="rejected">Rechazadas</SelectItem>
                            <SelectItem value="postponed">Pospuestas</SelectItem>
                            <SelectItem value="executed">Ejecutadas</SelectItem>
                            <SelectItem value="all">Todas</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button variant="outline" size="sm" className="h-8" onClick={cargar} disabled={loading}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Refrescar
                </Button>
            </div>

            <div className="p-3 space-y-2">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-sm">
                        {filtroStatus === 'pending'
                            ? 'No hay decisiones pendientes ahora. El agente IA propondrá nuevas conforme detecte oportunidades estratégicas.'
                            : 'Sin decisiones con ese filtro.'}
                    </div>
                ) : (
                    items.map((d) => (
                        <AiDecisionCard
                            key={d.id}
                            decision={d}
                            onChangeStatus={cambiarStatus}
                            updating={updating}
                        />
                    ))
                )}
            </div>

            <div className="px-3 pb-3 text-[10px] text-slate-400 italic">
                💡 El agente IA propone, tú decides. Las decisiones aprobadas no se ejecutan automáticamente — quedan registradas para que actúes según tu criterio.
            </div>
        </div>
    );
}
