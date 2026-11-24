// Aviso en el Inicio de la app: listas de inventario que te mandaron a
// confirmar desde la PC (23/11/2026). Solo sale si hay alguna pendiente.
// La app no tiene notificaciones en el teléfono: este aviso es el recordatorio.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function PorConfirmarInicio() {
  const router = useRouter();
  const { user, tenantId } = useAuthStore();
  const [n, setN] = useState(0);

  useFocusEffect(useCallback(() => {
    let vivo = true;
    if (user?.id && tenantId) {
      supabase.from('inv_verificaciones').select('id, inv_verificacion_items(resultado)')
        .eq('asignado_a', user.id).eq('estado', 'pendiente')
        .then(({ data }) => {
          if (!vivo) return;
          // Solo las que faltan; si ya contó todo, recuerda que falta enviar.
          const items = (data || []).flatMap((l: any) => l.inv_verificacion_items || []);
          const faltan = items.filter((i: any) => i.resultado === 'pendiente').length;
          setN(faltan || (items.length ? -1 : 0));
        });
    }
    return () => { vivo = false; };
  }, [user?.id, tenantId]));

  if (!n) return null;
  return (
    <TouchableOpacity onPress={() => router.push('/verificaciones' as any)} activeOpacity={0.8}
      className="bg-blue-600 rounded-xl p-4 mb-4 flex-row items-center">
      <Feather name="clipboard" size={22} color="#fff" />
      <View className="flex-1 ml-3">
        <Text className="text-white font-black text-base">{n > 0 ? `Por confirmar: ${n} pieza${n === 1 ? '' : 's'}` : 'Lista terminada: falta enviarla'}</Text>
        <Text className="text-blue-100 text-xs">{n > 0 ? 'Existencia y ubicación que te pidieron revisar' : 'Ábrela y toca «Enviar a la PC»'}</Text>
      </View>
      <Feather name="chevron-right" size={22} color="#fff" />
    </TouchableOpacity>
  );
}
