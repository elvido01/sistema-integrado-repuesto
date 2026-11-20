// =====================================================================
// Bloqueo de suscripción en la app (19/11/2026) — Fase 5 del onboarding
// ---------------------------------------------------------------------
// Hasta hoy la app no miraba la suscripción: una empresa vencida seguía
// vendiendo desde el teléfono. Ahora, igual que la web:
//   * vencida / sin plan (y sin pago en revisión) → pantalla de bloqueo;
//   * plan FREE en pausa por 7 días sin uso → reactivar gratis una vez, o
//     elegir Básico (en la web).
// Además marca la actividad (abrir la app = usar la empresa) al entrar y al
// volver a primer plano. Un fallo al verificar NUNCA bloquea.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';

const ESTADOS_BLOQUEO = ['vencido', 'cancelado', 'sin_suscripcion'];
const WEB = 'https://motoflow.com.do';
const WHATSAPP = 'https://wa.me/18093905965';

type Estado = { estado?: string; pago_pendiente?: boolean; mensaje?: string; puede_reactivar_gratis?: boolean; es_admin?: boolean; plan?: string | null };

// marcar_actividad, activar_free y reactivar_empresa actúan sobre la empresa
// ACTIVA del servidor (get_user_tenant), que el selector de la web puede
// cambiar con el teléfono abierto. La app trabaja con la del perfil: se
// realinea antes de cada acción (como hace useAuthStore al entrar).
async function alinearEmpresa(tenantId: string) {
  const { data: activo } = await supabase.rpc('get_user_tenant');
  if (activo && activo !== tenantId) {
    const { error } = await supabase.rpc('cambiar_empresa_activa', { p_tenant: tenantId });
    if (error) throw error;
  }
}

export default function BloqueoSuscripcion() {
  const { tenantId, profile, signOut } = useAuthStore();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ultimaMarca = useRef(0);
  const intentoFree = useRef(false);

  const revisar = useCallback(async (forzar = false) => {
    if (!tenantId) return;
    if (!forzar && Date.now() - ultimaMarca.current < 10 * 60 * 1000) return;
    ultimaMarca.current = Date.now();
    try {
      await alinearEmpresa(tenantId);
      await supabase.rpc('marcar_actividad');
      let { data } = await supabase.rpc('check_suscripcion_activa', { p_tenant_id: tenantId });
      // Prueba terminada sin haber comprado nunca → pasa a FREE (como la web).
      if (data?.estado === 'vencido' && !data?.pago_pendiente && !intentoFree.current) {
        intentoFree.current = true;
        const { data: free } = await supabase.rpc('activar_free_si_corresponde');
        if (free?.ok) {
          const r = await supabase.rpc('check_suscripcion_activa', { p_tenant_id: tenantId });
          if (r.data) data = r.data;
        }
      }
      if (data) setEstado(data);
    } catch {
      // sin red o sin respuesta: se queda como estaba, no se bloquea por esto
    }
  }, [tenantId]);

  useEffect(() => {
    intentoFree.current = false;
    setEstado(null);
    revisar(true);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') revisar(); });
    return () => sub.remove();
  }, [revisar]);

  if (!estado || profile?.is_superadmin || estado.pago_pendiente) return null;
  const pausada = estado.estado === 'pausada';
  const vencida = ESTADOS_BLOQUEO.includes(String(estado.estado));
  if (!pausada && !vencida) return null;

  const esAdmin = estado.es_admin !== false;
  const gratis = pausada && esAdmin && estado.puede_reactivar_gratis !== false;

  const reactivar = async () => {
    setEnviando(true);
    try {
      if (tenantId) await alinearEmpresa(tenantId);
      const { error } = await supabase.rpc('reactivar_empresa');
      if (error) throw error;
      await revisar(true);
    } catch (e: any) {
      Alert.alert('No se pudo reactivar', e?.message || 'Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-black/60 px-5" style={{ elevation: 50 }}>
      <View className="w-full overflow-hidden rounded-2xl bg-white">
        <View className={`items-center px-6 py-5 ${pausada ? 'bg-amber-500' : 'bg-red-600'}`}>
          <Text className="text-xl font-black uppercase text-white">{pausada ? 'Empresa en pausa' : 'Sistema bloqueado'}</Text>
          <Text className="mt-1 text-sm text-white/90">{pausada ? 'Pasaron 7 días sin usar MotoFlow' : 'Tu suscripción venció'}</Text>
        </View>
        <View className="px-6 py-5">
          <Text className="text-sm text-gray-700">{estado.mensaje}</Text>
          {pausada && (
            <Text className="mt-2 text-xs text-gray-500">Tus datos están guardados. Con un plan pagado tu empresa nunca se pausa.</Text>
          )}
          {pausada && !esAdmin && (
            <Text className="mt-2 text-xs font-bold text-amber-700">Pídele al dueño o a un administrador de la empresa que entre y la reactive.</Text>
          )}
        </View>
        <View className="gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
          {gratis && (
            <TouchableOpacity onPress={reactivar} disabled={enviando} className="flex-row items-center justify-center rounded-xl bg-emerald-600 py-3">
              {enviando && <ActivityIndicator color="#fff" className="mr-2" />}
              <Text className="font-bold text-white">{enviando ? 'Reactivando…' : 'Reactivar gratis'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => Linking.openURL(WEB)} className={`items-center rounded-xl py-3 ${gratis ? 'border border-gray-300 bg-white' : 'bg-blue-600'}`}>
            <Text className={`font-bold ${gratis ? 'text-gray-800' : 'text-white'}`}>{pausada ? 'Elegir el plan Básico (web)' : 'Ver planes y renovar (web)'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(WHATSAPP)} className="items-center rounded-xl border border-gray-300 bg-white py-3">
            <Text className="font-bold text-gray-800">Escribir por WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => revisar(true)} className="items-center py-2">
            <Text className="text-xs font-bold text-blue-700">Ya pagué — verificar de nuevo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signOut()} className="items-center py-1">
            <Text className="text-xs text-gray-500">Cerrar sesión</Text>
          </TouchableOpacity>
          {/* Google Play: borrar la cuenta tiene que poderse aunque esté bloqueada. */}
          <TouchableOpacity onPress={() => router.push('/eliminar-cuenta' as never)} className="items-center py-1">
            <Text className="text-xs text-gray-400 underline">Eliminar mi cuenta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
