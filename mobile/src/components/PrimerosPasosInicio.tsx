// "Primeros pasos" en el Inicio de la app (19/11/2026, Fase 2 del onboarding).
// La lista y si cada paso está hecho los arma el servidor con datos reales
// (primeros_pasos(), sql/primeros_pasos.sql): es la misma que ve la web.
// Aquí solo se dibuja; los pasos que la app no tiene (datos de la empresa,
// suplidores, compras, cierre) dicen que se hacen en la web.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { CheckCircle2, Circle, ChevronRight, Rocket } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';

type Paso = { id: string; titulo: string; detalle: string; opcional: boolean; hecho: boolean };
type Datos = { aplica: boolean; completo: boolean; hechos: number; total: number; pasos: Paso[] };

// Pantallas de la app a las que lleva cada paso (el resto: en la web).
const RUTA_DE_PASO: Record<string, string> = {
  producto: '/(tabs)/catalogo',
  venta: '/(tabs)/pos',
};

export default function PrimerosPasosInicio() {
  const router = useRouter();
  const { tenantId } = useAuthStore();
  const [datos, setDatos] = useState<Datos | null>(null);

  // Al volver a Inicio se vuelve a mirar: el paso recién hecho sale marcado.
  useFocusEffect(useCallback(() => {
    let vivo = true;
    if (tenantId) {
      supabase.rpc('primeros_pasos').then(({ data }) => { if (vivo) setDatos((data as Datos) || null); });
    }
    return () => { vivo = false; };
  }, [tenantId]));

  if (!datos?.aplica || datos.completo || !datos.pasos?.length) return null;
  const pct = Math.round((datos.hechos / datos.total) * 100);

  return (
    <View className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm mb-4">
      <View className="flex-row items-center mb-2">
        <View className="bg-blue-50 w-10 h-10 rounded-full items-center justify-center mr-3">
          <Rocket size={20} color="#1d4ed8" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-black text-gray-900">Primeros pasos con MotoFlow</Text>
          <Text className="text-xs text-gray-500">{datos.hechos} de {datos.total} listos · se marcan solos cuando lo haces</Text>
        </View>
      </View>
      <View className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-2">
        <View className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
      </View>
      {datos.pasos.map((p) => {
        const ruta = RUTA_DE_PASO[p.id];
        const abrir = !p.hecho && !!ruta;
        return (
          <TouchableOpacity key={p.id} disabled={!abrir} onPress={() => ruta && router.push(ruta as any)}
            className="flex-row items-center py-2 border-t border-gray-100">
            {p.hecho ? <CheckCircle2 size={20} color="#059669" /> : <Circle size={20} color="#cbd5e1" />}
            <View className="flex-1 ml-3">
              <Text className={p.hecho ? 'text-sm text-gray-400 line-through' : 'text-sm font-bold text-gray-800'}>
                {p.titulo}{p.opcional && !p.hecho ? '  (opcional)' : ''}
              </Text>
              {!p.hecho && (
                <Text className="text-xs text-gray-500">{ruta ? p.detalle : `${p.detalle} Se hace en la web.`}</Text>
              )}
            </View>
            {abrir && <ChevronRight size={16} color="#9ca3af" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
