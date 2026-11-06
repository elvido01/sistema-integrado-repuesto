import React from 'react';
import { Crown } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { usePanels } from '@/contexts/panelCore';
import { Button } from '@/components/ui/button';
import { esPlanProOMas } from '@/lib/planes';

/**
 * Muestra la pantalla solo si la empresa tiene plan Pro o más (o es el
 * superadmin). Si no, un aviso con el botón para ver los planes.
 * El menú ya la esconde; esto cubre los otros caminos (accesos rápidos, Jarvis).
 */
export default function PlanProGate({ funcion, children }) {
  const { isSuperAdmin, empresa } = useAuth();
  const { planActual } = useSuscripcion();
  const { openPanel } = usePanels();
  if (isSuperAdmin || esPlanProOMas(planActual)) return children;

  const planPro = empresa?.tipo_negocio === 'educativo' ? 'Educa Pro' : 'Pro';
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-white border border-gray-200 rounded-xl shadow-sm p-8">
        <Crown className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-black text-gray-800">{funcion} está en el plan {planPro}</h2>
        <p className="text-sm text-gray-600 mt-2">
          Tu plan actual ({planActual || 'sin plan'}) no la incluye. Sube al plan {planPro} o superior para usarla.
        </p>
        <Button className="mt-5" onClick={() => openPanel('planes')}>Ver planes</Button>
      </div>
    </div>
  );
}
