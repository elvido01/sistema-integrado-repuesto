import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import AiAlertCard from './AiAlertCard';

export default function AiAlertsList({ defaultFilter = {}, height = 'auto' }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState(defaultFilter.status || 'pending');
    const [filtroSeverity, setFiltroSeverity] = useState(defaultFilter.severity || 'all');
    const [filtroArea, setFiltroArea] = useState(defaultFilter.area || 'all');

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            let q = supabase
                .from('ai_alerts')
                .select('id, alert_type, area, severity, title, description, recommendation, status, created_at, metadata')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(300);

            if (filtroStatus !== 'all') q = q.eq('status', filtroStatus);
            if (filtroSeverity !== 'all') q = q.eq('severity', filtroSeverity);
            if (filtroArea !== 'all') q = q.eq('area', filtroArea);

            const { data, error } = await q;
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error cargando alertas', description: err.message });
        } finally {
            setLoading(false);
        }
    }, [tenantId, filtroStatus, filtroSeverity, filtroArea, toast]);

    useEffect(() => { cargar(); }, [cargar]);

    const cambiarStatus = async (id, nuevo) => {
        setUpdating(true);
        try {
            const patch = { status: nuevo };
            if (nuevo === 'resolved') {
                patch.resolved_at = new Date().toISOString();
            }
            const { error } = await supabase.from('ai_alerts').update(patch).eq('id', id);
            if (error) throw error;
            toast({ title: 'Alerta actualizada', description: `Estado: ${nuevo}` });
            setItems((prev) => prev.filter((a) => a.id !== id)); // saca del listado actual
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setUpdating(false);
        }
    };

    const counts = useMemo(() => {
        const c = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const a of items) c[a.severity] = (c[a.severity] || 0) + 1;
        return c;
    }, [items]);

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            {/* Header */}
            <div className="p-3 border-b border-slate-200 flex items-end gap-3 flex-wrap">
                <div className="flex items-center gap-2 mr-auto">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <h3 className="text-base font-bold text-slate-800">Alertas Inteligentes</h3>
                    <span className="text-xs text-slate-500">({items.length})</span>
                </div>

                <div>
                    <Label className="text-[10px] uppercase font-bold text-slate-500">Estado</Label>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pending">Pendientes</SelectItem>
                            <SelectItem value="reviewed">Revisadas</SelectItem>
                            <SelectItem value="resolved">Resueltas</SelectItem>
                            <SelectItem value="ignored">Ignoradas</SelectItem>
                            <SelectItem value="all">Todas</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label className="text-[10px] uppercase font-bold text-slate-500">Severidad</Label>
                    <Select value={filtroSeverity} onValueChange={setFiltroSeverity}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            <SelectItem value="critical">Crítica</SelectItem>
                            <SelectItem value="high">Alta</SelectItem>
                            <SelectItem value="medium">Media</SelectItem>
                            <SelectItem value="low">Baja</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label className="text-[10px] uppercase font-bold text-slate-500">Área</Label>
                    <Select value={filtroArea} onValueChange={setFiltroArea}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            <SelectItem value="inventario">Inventario</SelectItem>
                            <SelectItem value="credito">Crédito</SelectItem>
                            <SelectItem value="operaciones">Operaciones</SelectItem>
                            <SelectItem value="finanzas">Finanzas</SelectItem>
                            <SelectItem value="compras">Compras</SelectItem>
                            <SelectItem value="ventas">Ventas</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button variant="outline" size="sm" className="h-8" onClick={cargar} disabled={loading}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Refrescar
                </Button>
            </div>

            {/* Counts banner */}
            {!loading && items.length > 0 && (
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex gap-3 text-[11px]">
                    {counts.critical > 0 && <span className="font-bold text-red-700">🔴 {counts.critical} crítica{counts.critical !== 1 ? 's' : ''}</span>}
                    {counts.high > 0 && <span className="font-bold text-orange-700">🟠 {counts.high} alta{counts.high !== 1 ? 's' : ''}</span>}
                    {counts.medium > 0 && <span className="font-semibold text-amber-700">🟡 {counts.medium} media{counts.medium !== 1 ? 's' : ''}</span>}
                    {counts.low > 0 && <span className="text-slate-600">⚪ {counts.low} baja{counts.low !== 1 ? 's' : ''}</span>}
                </div>
            )}

            {/* List */}
            <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: height }}>
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-sm">
                        Sin alertas con esos filtros.
                    </div>
                ) : (
                    items.map((a) => (
                        <AiAlertCard
                            key={a.id}
                            alert={a}
                            onChangeStatus={cambiarStatus}
                            updating={updating}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
