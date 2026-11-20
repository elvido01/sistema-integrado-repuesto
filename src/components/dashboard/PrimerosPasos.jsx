// =====================================================================
// "Primeros pasos" en Inicio (19/11/2026) — Fase 2 del onboarding
// ---------------------------------------------------------------------
// La lista y el estado de cada paso los arma el servidor con datos reales
// (primeros_pasos(), sql/primeros_pasos.sql): un paso se marca cuando la
// operación existe, no porque alguien abrió el módulo. Aquí solo se dibuja y
// cada paso lleva a su pantalla, si el usuario tiene permiso y su plan la trae.
// Se esconde sola al completar lo obligatorio; "Ocultar" la quita en este
// navegador (preferencia personal, no un dato del negocio).
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, ChevronRight, Rocket, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { canAccess } from '@/lib/permissionsHelper';
import { accesoFuncion } from '@/lib/planes';

// A dónde lleva cada paso.
const PANEL_DE_PASO = {
  empresa: 'perfil-empresa',
  vendedor: 'vendedores',
  producto: 'mercancias',
  cliente: 'clientes',
  suplidor: 'suplidores',
  compra: 'compras',
  venta: 'ventas',
  cierre: 'cierre-caja',
};

const claveOculto = (tenantId, userId) => `motoflow_primeros_pasos_oculto:${tenantId}:${userId}`;
const leerOculto = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const guardarOculto = (k) => { try { localStorage.setItem(k, '1'); } catch { /* sin almacenamiento */ } };

// panel: el panel donde está la tarjeta (se vuelve a leer al volver a él).
// sinOcultar: en Aprende MotoFlow sale aunque se haya ocultado en Inicio.
export default function PrimerosPasos({ className = '', panel = 'inicio', sinOcultar = false }) {
  const { user, profile, permissions, tenantId, isSuperAdmin } = useAuth();
  const { activePanel, openPanel } = usePanels();
  const { planActual, especialVigente } = useSuscripcion();
  const [datos, setDatos] = useState(null);
  const clave = claveOculto(tenantId, user?.id);
  const [oculto, setOculto] = useState(() => leerOculto(clave));
  useEffect(() => { setOculto(leerOculto(clave)); }, [clave]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase.rpc('primeros_pasos');
    setDatos(data || null);
  }, [tenantId]);

  // Al volver a Inicio se vuelve a mirar: quien acaba de crear su primer
  // artículo lo ve marcado sin recargar.
  useEffect(() => { if (activePanel === panel) cargar(); }, [activePanel, cargar, panel]);

  if ((oculto && !sinOcultar) || !datos?.aplica || datos.completo || !datos.pasos?.length) return null;

  const pasos = datos.pasos;
  const pct = Math.round((datos.hechos / datos.total) * 100);
  const siguiente = pasos.find((p) => !p.hecho && !p.opcional) || pasos.find((p) => !p.hecho);
  const puedeAbrir = (panel) => panel
    && canAccess(profile, permissions, panel)
    && accesoFuncion(panel, { planActual, especial: especialVigente, superAdmin: isSuperAdmin }).estado === 'libre';

  return (
    <div className={`rounded-2xl border border-blue-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Rocket className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-gray-900">Primeros pasos con MotoFlow</div>
          <div className="text-xs text-gray-500">{datos.hechos} de {datos.total} listos · se marcan solos cuando lo haces</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {!sinOcultar && <button type="button" title="Ocultar" onClick={() => { guardarOculto(clave); setOculto(true); }}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>}
      </div>

      <ul className="mt-3 divide-y divide-gray-100">
        {pasos.map((p) => {
          const panel = PANEL_DE_PASO[p.id];
          const abrir = !p.hecho && puedeAbrir(panel);
          const esSiguiente = siguiente?.id === p.id;
          return (
            <li key={p.id}>
              <button type="button" disabled={!abrir} onClick={() => abrir && openPanel(panel)}
                className={`flex w-full items-center gap-3 py-2 text-left ${abrir ? 'hover:bg-gray-50' : 'cursor-default'} ${esSiguiente ? 'rounded-lg bg-blue-50/60 px-2' : ''}`}>
                {p.hecho
                  ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  : <Circle className={`h-5 w-5 shrink-0 ${esSiguiente ? 'text-blue-600' : 'text-gray-300'}`} />}
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${p.hecho ? 'text-gray-400 line-through' : 'font-bold text-gray-800'}`}>
                    {p.titulo}{p.opcional && !p.hecho && <span className="ml-1 text-[10px] font-medium uppercase text-gray-400">opcional</span>}
                  </span>
                  {!p.hecho && <span className="block text-xs text-gray-500">{p.detalle}</span>}
                </span>
                {abrir && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
