// ============================================================
// AiCeoBell — Indicador en sidebar con alertas críticas + decisiones
// ============================================================
// Click abre el panel /ai-ceo. Badge muestra # de cosas urgentes.
// Auto-refresh cada 60s.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';

export default function AiCeoBell() {
    const { tenantId } = useAuth();
    const { openPanel } = usePanels();
    const [counts, setCounts] = useState({ critical: 0, high: 0, decisions: 0 });

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        try {
            const [alertsRes, decRes] = await Promise.all([
                supabase.from('ai_alerts').select('severity', { count: 'exact', head: false })
                    .eq('tenant_id', tenantId).eq('status', 'pending'),
                supabase.from('ai_decisions').select('id', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId).eq('status', 'pending'),
            ]);
            const alerts = alertsRes.data || [];
            setCounts({
                critical: alerts.filter((a) => a.severity === 'critical').length,
                high: alerts.filter((a) => a.severity === 'high').length,
                decisions: decRes.count || 0,
            });
        } catch (err) {
            console.error('[AiCeoBell]', err);
        }
    }, [tenantId]);

    useEffect(() => {
        cargar();
        const t = setInterval(cargar, 60_000);
        return () => clearInterval(t);
    }, [cargar]);

    const totalUrgent = counts.critical + counts.high + counts.decisions;
    if (!tenantId) return null;

    const badgeColor = counts.critical > 0
        ? 'bg-red-500'
        : counts.high > 0
        ? 'bg-orange-500'
        : counts.decisions > 0
        ? 'bg-violet-500'
        : 'bg-slate-400';

    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 relative"
            onClick={() => openPanel('ai-ceo')}
            title={`AI CEO: ${counts.critical} crít · ${counts.high} altas · ${counts.decisions} decisiones`}
        >
            <Brain className="w-4 h-4 text-violet-600" />
            {totalUrgent > 0 && (
                <motion.span
                    key={totalUrgent}
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className={`absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white ${badgeColor} rounded-full shadow-sm`}
                >
                    {totalUrgent > 99 ? '99+' : totalUrgent}
                </motion.span>
            )}
        </Button>
    );
}
