// Aviso en el Inicio de la app: listas de inventario que te mandaron a
// confirmar desde la PC (23/11/2026). Solo sale si hay alguna pendiente.
// La app no tiene notificaciones en el teléfono: este aviso es el recordatorio.
// (25/11/2026) Se vuelve a mirar al regresar a la app y cada minuto mientras
// el Inicio está a la vista: antes solo al entrar al Inicio, y con la app ya
// abierta en esa pantalla una lista nueva no salía nunca.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, AppState } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function PorConfirmarInicio() {
  const router = useRouter();
  const { user, tenantId } = useAuthStore();
  const [n, setN] = useState(0);
  const turno = useRef(0);   // solo cuenta la respuesta de la última consulta

  useFocusEffect(useCallback(() => {
    let vivo = true;
    const mirar = () => {
      if (!user?.id || !tenantId) { setN(0); return; }
      if (AppState.currentState !== 'active') return;   // en segundo plano no se consulta
      const yo = ++turno.current;
      supabase.from('inv_verificaciones').select('id, inv_verificacion_items(resultado)')
        .eq('asignado_a', user.id).eq('estado', 'pendiente')
        .then(({ data, error }) => {
          // Si falla (red despertando al volver a la app) se queda el aviso que había.
          if (!vivo || error || yo !== turno.current) return;
          // Solo las que faltan; si ya contó todo, recuerda que falta enviar.
          const items = (data || []).flatMap((l: any) => l.inv_verificacion_items || []);
          const faltan = items.filter((i: any) => i.resultado === 'pendiente').length;
          setN(faltan || (items.length ? -1 : 0));
        });
    };
    mirar();
    const cada = setInterval(mirar, 60000);
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') mirar(); });
    return () => { vivo = false; clearInterval(cada); app.remove(); };
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
