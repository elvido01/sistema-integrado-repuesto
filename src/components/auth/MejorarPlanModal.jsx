// =====================================================================
// Ventanita de "mejorar plan" (07/11/2026)
// ---------------------------------------------------------------------
// Sale al tocar en el menú una función del plan siguiente (en gris con ★).
// Dice qué hace, qué más trae ese plan y cuánto más cuesta; "Ahora no"
// cierra y deja al usuario en lo que estaba. Reglas: lib/planes.js
// =====================================================================
import React from 'react';
import { Star, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { FUNCIONES_PLAN } from '@/lib/planes';

const nombreBonito = (p) => String(p || '').toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const rd = (n) => `RD$ ${Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 0 })}`;

export default function MejorarPlanModal({ abierta, funcion, plan, onCerrar, onVerPlanes }) {
  const { planes, planActual, especialVigente } = useSuscripcion();
  const f = FUNCIONES_PLAN[funcion];
  if (!f) return null;
  const destino = (planes || []).find((p) => String(p.nombre).toUpperCase() === String(plan).toUpperCase());
  const actual = (planes || []).find((p) => String(p.nombre).toUpperCase() === String(planActual || '').toUpperCase());
  const pagaHoy = especialVigente?.precio ?? actual?.precio;
  const diferencia = destino && pagaHoy != null ? Number(destino.precio) - Number(pagaHoy) : null;
  const incluye = f.incluye?.[String(plan).toUpperCase()] || [];

  return (
    <Dialog open={abierta} onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <DialogContent className="max-w-md rounded-2xl p-6">
        <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center">
          <Star className="w-6 h-6 fill-violet-500" />
        </div>
        <DialogTitle className="text-xl font-bold text-gray-900 mt-3">{f.titulo}</DialogTitle>
        <DialogDescription className="text-sm text-gray-600 leading-relaxed">{f.descripcion}</DialogDescription>
        {incluye.length > 0 && (
          <ul className="space-y-1.5 mt-1">
            {incluye.map((t) => (
              <li key={t} className="flex gap-2 text-sm text-gray-700"><Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />{t}</li>
            ))}
          </ul>
        )}
        <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
          Viene en el plan <b className="text-base">{nombreBonito(plan)}</b>
          {destino && <> · {rd(destino.precio)}/mes</>}
          {diferencia > 0 && <> · {rd(diferencia)} más que su plan actual</>}
        </div>
        <div className="flex gap-2 mt-1">
          <button type="button" onClick={onCerrar} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">Ahora no</button>
          <button type="button" onClick={onVerPlanes} className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 py-2.5 text-sm font-bold text-white">Ver planes</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
