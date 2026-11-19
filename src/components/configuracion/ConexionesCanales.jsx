// =====================================================================
// Conexiones (19/11/2026) — Perfil Empresa
// ---------------------------------------------------------------------
// Paso 1 del CRM vendible: la empresa conecta su WhatsApp UNA vez con el
// registro integrado de Meta (coexistencia: sigue usando la app del
// teléfono). La ventana de Meta devuelve código + cuenta + número
// (lib/whatsappRegistro.js) y la función whatsapp-conectar hace el resto en
// el servidor. Aquí solo se ve el estado (whatsapp_conexiones: la empresa
// lee, no escribe). Solo dueño/administrador.
// Mientras MotoFlow no tenga su app aprobada en Meta (VITE_META_APP_ID +
// VITE_WHATSAPP_ES_CONFIG_ID), el botón sale en gris con la explicación.
// Plan: https://claude.ai/artifact/S6eV7xsKbWij3HCHmkNEzs
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  registroDisponible, cargarSdkMeta, opcionesLogin, leerAvisoRegistro, estadoConexionTexto,
} from '@/lib/whatsappRegistro';

const TONOS = {
  verde: 'bg-green-50 text-green-700 border-green-200',
  rojo: 'bg-red-50 text-red-700 border-red-200',
  gris: 'bg-gray-50 text-gray-600 border-gray-200',
};
const fechaHora = (ts) => (ts ? new Date(ts).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function ConexionesCanales() {
  const { profile, isSuperAdmin, tenantId } = useAuth();
  const { toast } = useToast();
  const puede = isSuperAdmin || ['admin', 'owner'].includes(profile?.role);
  const [cx, setCx] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const aviso = useRef(null);     // lo último que dijo la ventana de Meta
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    // La viva primero; si no hay, la última desconectada (para decir por qué).
    const { data } = await supabase.from('whatsapp_conexiones')
      .select('id, numero, nombre_visible, modo, estado, motivo_desconexion, conectado_at, desconectado_at, ultimo_mensaje_at, historial_progreso, historial_rechazado, ultimo_error')
      .eq('tenant_id', tenantId)
      .order('conectado_at', { ascending: false })
      .limit(5);
    if (!montado.current) return;
    const filas = data || [];
    setCx(filas.find((f) => f.estado !== 'desconectado') || filas[0] || null);
    setCargando(false);
  }, [tenantId]);
  useEffect(() => { if (puede && tenantId) cargar(); }, [puede, tenantId, cargar]);

  // La ventana de Meta avisa por postMessage (cuenta y número).
  useEffect(() => {
    const oir = (e) => { const a = leerAvisoRegistro(e.origin, e.data); if (a) aviso.current = a; };
    window.addEventListener('message', oir);
    return () => window.removeEventListener('message', oir);
  }, []);

  const conectar = async () => {
    if (conectando) return;
    setConectando(true);
    aviso.current = null;
    try {
      const FB = await cargarSdkMeta();
      const code = await new Promise((resolve) => {
        FB.login((r) => resolve(r?.authResponse?.code || null), opcionesLogin());
      });
      // El aviso con la cuenta y el número puede llegar justo después del código.
      for (let i = 0; i < 20 && !aviso.current; i++) await new Promise((r) => setTimeout(r, 150));
      const a = aviso.current;
      if (!code || a?.estado === 'cancelado') { toast({ title: 'Conexión cancelada', description: 'No se cambió nada.' }); return; }
      if (a?.estado === 'error') throw new Error(a.mensaje);
      if (a?.estado !== 'terminado' || !a.wabaId || !a.phoneNumberId) {
        throw new Error(a?.soloCuenta ? 'Meta creó la cuenta pero no se eligió un número. Vuelve a intentarlo y escribe el número de WhatsApp.' : 'Meta no devolvió la cuenta y el número. Vuelve a intentarlo.');
      }
      const { data, error } = await supabase.functions.invoke('whatsapp-conectar', {
        body: { code, waba_id: a.wabaId, phone_number_id: a.phoneNumberId, coexistencia: a.coexistencia },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'No se pudo conectar');
      toast({
        title: `WhatsApp conectado${data.numero ? `: ${data.numero}` : ''}`,
        description: data.avisos?.length ? 'Conectado, pero Meta no aceptó traer todo el historial. Los mensajes nuevos sí entran.' : 'Los mensajes nuevos ya entran al CRM. El historial llega en unos minutos.',
      });
      await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo conectar WhatsApp', description: e?.message || String(e) });
    } finally {
      if (montado.current) setConectando(false);
    }
  };

  if (!puede) return null;
  const disponible = registroDisponible();
  const est = estadoConexionTexto(cx);
  const viva = cx && cx.estado !== 'desconectado';

  return (
    <div className="border-t border-gray-200 pt-5">
      <h3 className="text-sm font-black text-gray-700 uppercase mb-1">Conexiones</h3>
      <p className="text-[11px] text-gray-500 italic mb-3">
        Conecta tus canales una sola vez: los mensajes entran al CRM aunque las computadoras estén apagadas.
      </p>

      <div className="rounded-md border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <MessageCircle className="w-5 h-5 text-green-600 shrink-0" />
        <div className="flex-1 min-w-[12rem]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-800">WhatsApp</span>
            {cargando ? <Loader2 className="w-3 h-3 animate-spin text-gray-400" /> : (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${TONOS[est.tono]}`}>{est.texto}</span>
            )}
          </div>
          {!cargando && viva && (
            <div className="text-[11px] text-gray-600 mt-1 space-y-0.5">
              <div>{cx.numero || 'Número sin nombre'}{cx.nombre_visible ? ` · ${cx.nombre_visible}` : ''}{cx.modo === 'coexistencia' ? ' · sigue en la app del teléfono' : ''}</div>
              <div>Último mensaje: {fechaHora(cx.ultimo_mensaje_at)}</div>
              {cx.historial_rechazado
                ? <div className="text-amber-700">El historial no se compartió al conectar: solo entran los mensajes nuevos.</div>
                : (cx.historial_progreso != null && cx.historial_progreso < 100 && <div>Trayendo historial: {cx.historial_progreso}%</div>)}
            </div>
          )}
          {!cargando && cx && !viva && (
            <div className="text-[11px] text-red-700 mt-1">
              Se desconectó el {fechaHora(cx.desconectado_at)}{cx.motivo_desconexion ? ` (${cx.motivo_desconexion})` : ''}. Vuelve a conectar.
            </div>
          )}
          {!disponible && (
            <div className="text-[11px] text-gray-500 mt-1">Pronto: MotoFlow está terminando su registro con Meta para habilitar este botón.</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {viva && (
            <Button variant="ghost" size="sm" onClick={cargar} title="Actualizar estado"><RefreshCw className="w-4 h-4" /></Button>
          )}
          <Button
            onClick={conectar}
            disabled={!disponible || conectando}
            variant={viva ? 'outline' : 'default'}
            className={`h-9 px-4 font-bold text-xs uppercase ${viva ? '' : 'bg-green-600 hover:bg-green-700 text-white'}`}
          >
            {conectando ? <Loader2 className="w-4 h-4 animate-spin" /> : (viva ? 'Reconectar' : 'Conectar WhatsApp')}
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Al conectar, WhatsApp desvincula los dispositivos vinculados; vuelve a vincular los compatibles (la app de WhatsApp para Windows no lo es).
        Los grupos no entran al CRM.
      </p>
    </div>
  );
}
