// ============================================================
// MarketingCalendar.jsx — Calendario semanal de publicaciones
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from 'lucide-react';
import { getWeeklyContentCalendar } from '@/services/aiMarketingService';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CANAL_COLOR = {
    youtube: 'bg-red-100 text-red-700',
    reel: 'bg-violet-100 text-violet-700',
    tiktok: 'bg-slate-200 text-slate-700',
    instagram: 'bg-pink-100 text-pink-700',
    facebook: 'bg-blue-100 text-blue-700',
    whatsapp: 'bg-emerald-100 text-emerald-700',
};

function startOfWeek(d) {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // Lunes = 0
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
}
const iso = (d) => d.toISOString().slice(0, 10);

export default function MarketingCalendar() {
    const { tenantId } = useAuth();
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const dias = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
    });

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const end = new Date(weekStart); end.setDate(end.getDate() + 6);
            const data = await getWeeklyContentCalendar(tenantId, iso(weekStart), iso(end));
            setItems(data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [tenantId, weekStart]);

    useEffect(() => { cargar(); }, [cargar]);

    const itemsDelDia = (d) => items.filter((it) => it.fecha_programada === iso(d));

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-violet-600" /> Calendario semanal
                </h3>
                <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-slate-600">{iso(weekStart)}</span>
                    <Button size="icon" variant="outline" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
            ) : (
                <div className="grid grid-cols-7 gap-2">
                    {dias.map((d, i) => {
                        const hoy = iso(d) === iso(new Date());
                        return (
                            <div key={i} className={`rounded-lg border min-h-[120px] p-2 ${hoy ? 'border-violet-400 bg-violet-50/40' : 'border-slate-200 bg-white'}`}>
                                <div className="text-xs font-bold text-slate-500 mb-2">{DIAS[i]} {d.getDate()}</div>
                                <div className="space-y-1">
                                    {itemsDelDia(d).map((it) => (
                                        <div key={it.id} className={`text-[10px] rounded px-1.5 py-1 leading-tight ${CANAL_COLOR[it.canal_recomendado] || 'bg-slate-100 text-slate-600'}`}>
                                            <div className="font-bold truncate">{it.productos?.codigo || ''}</div>
                                            <div className="truncate">{it.titulo_youtube || it.canal_recomendado}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
