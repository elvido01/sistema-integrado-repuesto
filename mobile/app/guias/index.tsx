// =====================================================================
// Guías de la app (20/11/2026) — Más → "Guías de la app"
// ---------------------------------------------------------------------
// Lista las guías del teléfono (src/guias/definiciones.ts) que la persona
// puede usar según sus permisos, con su estado (pendiente / a medias /
// terminada / dejada) y el botón para empezar, seguir o repetir.
// =====================================================================
import React, { useCallback } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, GraduationCap } from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import { canAccessModule } from '@/src/services/permissions';
import { GUIAS_APP, versionMayor } from '@/src/guias/definiciones';
import { useGuiaMovil } from '@/src/guias/GuiaMovil';

export default function GuiasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, permissions } = useAuthStore();
  const guias = useGuiaMovil();
  // Al volver a esta pantalla se lee de nuevo (la persona pudo avanzar una guía).
  useFocusEffect(useCallback(() => { guias?.cargarProgreso(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = GUIAS_APP.filter((g) => !g.modulo || canAccessModule(profile, permissions, g.modulo));

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 16 }}>
      <TouchableOpacity onPress={() => router.back()} className="mb-3 flex-row items-center">
        <ArrowLeft color="#374151" size={20} /><Text className="ml-1 text-gray-700">Volver</Text>
      </TouchableOpacity>
      <View className="mb-4 flex-row items-center">
        <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-blue-100"><GraduationCap color="#1d4ed8" size={24} /></View>
        <View className="flex-1">
          <Text className="text-xl font-black text-gray-900">Guías de la app</Text>
          <Text className="text-xs text-gray-500">Te enseñan paso a paso, sobre la pantalla de verdad.</Text>
        </View>
      </View>

      {lista.length === 0 && <Text className="text-sm text-gray-500">No hay guías para los módulos que tienes.</Text>}
      {lista.map((g) => {
        const p = guias?.progreso?.[g.id];
        const misma = p && versionMayor(p.version) === versionMayor(g.version);
        const estado = !misma ? 'Pendiente' : p.estado === 'completada' ? 'Terminada' : p.estado === 'omitida' ? 'Dejada' : `A medias (paso ${Math.min((p.paso || 0) + 1, g.pasos.length)} de ${g.pasos.length})`;
        const aMedias = !!misma && p.estado === 'iniciada';
        const color = estado === 'Terminada' ? 'bg-emerald-100 text-emerald-800' : estado.startsWith('A medias') ? 'bg-amber-100 text-amber-800' : estado === 'Dejada' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800';
        return (
          <View key={g.id} className="mb-3 rounded-2xl border border-gray-200 bg-white p-4">
            <View className="flex-row items-start justify-between">
              <Text className="flex-1 pr-2 text-base font-black text-gray-900">{g.nombre}</Text>
              <Text className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${color}`}>{estado}</Text>
            </View>
            <Text className="mt-1 text-xs text-gray-600">{g.descripcion} · {g.pasos.length} pasos</Text>
            <TouchableOpacity onPress={() => guias?.empezar(g.id, aMedias ? p.paso : 0)} className="mt-3 items-center rounded-xl bg-blue-600 py-2.5">
              <Text className="font-bold text-white">{aMedias ? 'Seguir' : estado === 'Terminada' ? 'Repetir' : 'Empezar'}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}
