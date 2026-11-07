// ============================================================
// PlanGate.jsx — Restringe una función a ciertos planes (Plus)
// ============================================================
// Si el tenant no tiene el plan requerido (y no es super admin),
// muestra una pantalla de upsell en vez del contenido.
// ============================================================
import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { Lock } from 'lucide-react';
import { puedeCrm } from '@/lib/planes';

// crm: la regla del Sales Hub (lib/planes): también EDUCA PRO/TOTAL, y no con precio especial.
// mensaje: texto propio de "Disponible en..." (p. ej. solo Educa Total).
export default function PlanGate({ planes = ['PRO', 'ENTERPRISE'], nombre = 'Esta función', crm = false, mensaje = null, children }) {
    const { isSuperAdmin } = useAuth();
    const { planActual, especialVigente } = useSuscripcion();
    const permitido = isSuperAdmin || (crm ? puedeCrm(planActual, especialVigente) : planes.includes((planActual || '').toUpperCase()));

    if (permitido) return children;

    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[420px] text-center p-8">
            <div className="bg-violet-100 text-violet-700 p-4 rounded-full mb-4">
                <Lock className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">{nombre} es una función Plus</h2>
            <p className="text-slate-500 mt-2 max-w-md">
                {mensaje || (crm && String(planActual || '').toUpperCase().startsWith('EDUCA')
                    ? <>Disponible en los planes <b className="text-violet-600">Educa Pro</b> y <b className="text-violet-600">Educa Total</b> a precio completo.</>
                    : <>Disponible en los planes <b className="text-violet-600">PRO</b> y <b className="text-violet-600">Enterprise</b>.</>)}
                Actualiza tu plan para desbloquearla.
            </p>
            <p className="text-xs text-slate-400 mt-4">Tu plan actual: <b>{planActual || 'sin plan'}</b></p>
        </div>
    );
}
