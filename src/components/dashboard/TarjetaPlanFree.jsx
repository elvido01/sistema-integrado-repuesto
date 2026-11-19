// =====================================================================
// Tarjeta del plan FREE en Inicio (19/11/2026)
// ---------------------------------------------------------------------
// Transparente, sin trucos (decisión del dueño): cuánto lleva usado de su
// plan gratis, qué trae el Básico y el botón "Probar Pro 15 días" (una sola
// vez por empresa: probar_pro / estado_prueba_pro en sql/plan_free.sql).
// Los límites los frena el servidor (sql/limites_plan_servidor.sql).
// =====================================================================
import React, { useEffect, useState } from 'react';
import { Gift, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { usePanels } from '@/contexts/PanelContext';
import { useToast } from '@/components/ui/use-toast';
import { getCurrentDateInTimeZone, formatInTimeZone, rangoDeFechas } from '@/lib/dateUtils';

const Barra = ({ titulo, usados, limite }) => {
  const pct = limite ? Math.min(100, Math.round((usados / limite) * 100)) : 0;
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>{titulo}</span>
        <span className="font-bold">{usados ?? '…'} de {limite}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default function TarjetaPlanFree() {
  const { tenantId } = useAuth();
  const { limites, refetch } = useSuscripcion();
  const { openPanel } = usePanels();
  const { toast } = useToast();
  const [uso, setUso] = useState({ productos: null, ventas: null });
  const [puedeProbar, setPuedeProbar] = useState(false);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    if (!tenantId) return undefined;
    let vivo = true;
    const hoy = getCurrentDateInTimeZone();
    const primero = formatInTimeZone(new Date(hoy.getFullYear(), hoy.getMonth(), 1), 'yyyy-MM-dd');
    const { desde, hasta } = rangoDeFechas(primero, formatInTimeZone(hoy, 'yyyy-MM-dd'));
    Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('activo', true),
      supabase.from('facturas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
        .gte('fecha', desde).lte('fecha', hasta).not('es_saldo_inicial', 'is', true),
      supabase.rpc('estado_prueba_pro'),
    ]).then(([p, f, e]) => {
      if (!vivo) return;
      setUso({ productos: p.count ?? 0, ventas: f.count ?? 0 });
      setPuedeProbar(!!e.data?.puede_probar);
    });
    return () => { vivo = false; };
  }, [tenantId]);

  const probarPro = async () => {
    setActivando(true);
    const { data, error } = await supabase.rpc('probar_pro');
    setActivando(false);
    if (error || !data?.ok) {
      toast({ variant: 'destructive', title: 'No se pudo activar la prueba', description: data?.error || error?.message });
      return;
    }
    toast({ title: '¡Listo! Tienes Pro por 15 días', description: 'Ya puedes usar todo lo del plan Pro. Al terminar vuelves a FREE, sin perder nada.' });
    await refetch();
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Gift className="h-5 w-5" /></div>
        <div className="flex-1">
          <div className="text-sm font-black text-gray-900">Plan FREE</div>
          <div className="text-xs text-gray-500">Gratis para siempre · 1 usuario · ventas y compras de contado</div>
        </div>
        <button type="button" onClick={() => openPanel('planes')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">Ver planes</button>
      </div>

      <div className="mt-3 space-y-2">
        <Barra titulo="Artículos y servicios" usados={uso.productos} limite={limites?.productos || 100} />
        <Barra titulo="Ventas de este mes" usados={uso.ventas} limite={limites?.facturas || 300} />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        ¿Necesitas facturación electrónica, ventas a crédito o cotizaciones? Vienen desde el plan <b>Básico</b>.
      </p>

      {puedeProbar && (
        <button type="button" onClick={probarPro} disabled={activando}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          {activando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Probar Pro 15 días gratis
        </button>
      )}
    </div>
  );
}
