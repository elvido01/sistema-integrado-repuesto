// Inicio de Ventanas en la app (09/11/2026, como el inicio de Desglo): un
// botón por sistema para crear el proyecto y medir, accesos rápidos
// (Cotizar, Facturar, Recibo, Barras, Proyectos) y los proyectos recientes.
// Lo pone la pestaña Inicio SOLO en empresas tipo 'aluminio'.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, FileText, ShoppingCart, Receipt, Scissors, ClipboardList, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { canAccessModule } from '@/src/services/permissions';
import { estadoProyecto, numeroProyecto } from '@/src/lib/ventanas';
import NuevoProyecto from '@/src/components/ventanas/NuevoProyecto';
import CalculadoraBarras from '@/src/components/ventanas/CalculadoraBarras';

export default function VentanasInicio() {
  const router = useRouter();
  const { tenantId, profile, permissions, empresa } = useAuthStore();
  const [sistemas, setSistemas] = useState<{ id: string; nombre: string }[]>([]);
  const [recientes, setRecientes] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState<{ sistema: { id: string; nombre: string } | null } | null>(null);
  const [barras, setBarras] = useState(false);
  const puede = empresa?.tipo_negocio === 'aluminio' && canAccessModule(profile, permissions, 'vent-proyectos');

  const cargar = useCallback(async () => {
    if (!tenantId || !puede) return;
    const { count } = await supabase.from('vent_sistemas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if (!count) await supabase.rpc('vent_preparar_empresa');
    const [si, pr] = await Promise.all([
      supabase.from('vent_sistemas').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      supabase.from('vent_proyectos').select('id, numero, nombre, estado, cliente_nombre, clientes(nombre)')
        .eq('tenant_id', tenantId).order('numero', { ascending: false }).limit(5),
    ]);
    setSistemas((si.data || []) as any);
    setRecientes(pr.data || []);
  }, [tenantId, puede]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  if (!puede) return null;

  const accesos = [
    { t: 'Cotizar', icon: FileText, modulo: 'cotizaciones', onPress: () => router.push('/(tabs)/cotizaciones' as any) },
    { t: 'Facturar', icon: ShoppingCart, modulo: 'ventas', onPress: () => router.push('/(tabs)/pos' as any) },
    { t: 'Recibo', icon: Receipt, modulo: 'recibo-ingreso', onPress: () => router.push('/(tabs)/recibo-ingreso' as any) },
    { t: 'Barras', icon: Scissors, modulo: 'vent-proyectos', onPress: () => setBarras(true) },
    { t: 'Proyectos', icon: ClipboardList, modulo: 'vent-proyectos', onPress: () => router.push('/(tabs)/proyectos' as any) },
  ].filter((a) => canAccessModule(profile, permissions, a.modulo));

  return (
    <View className="mb-4">
      <Text className="text-gray-900 font-black text-base mb-2">Crear proyecto</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <TouchableOpacity onPress={() => setNuevo({ sistema: null })} className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 mr-2 w-32">
          <Plus color="#1d4ed8" size={20} />
          <Text className="font-bold text-blue-800 mt-1">Nuevo proyecto</Text>
          <Text className="text-[10px] text-gray-500">Puertas, ventanas…</Text>
        </TouchableOpacity>
        {sistemas.map((s) => (
          <TouchableOpacity key={s.id} onPress={() => setNuevo({ sistema: s })} className="bg-white border border-gray-200 rounded-xl p-3 mr-2 w-32">
            <View className="bg-blue-600 rounded w-5 h-5 items-center justify-center"><Plus color="#fff" size={14} /></View>
            <Text className="font-semibold text-gray-800 mt-1" numberOfLines={2}>{s.nombre}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text className="text-gray-900 font-black text-base mt-4 mb-2">Acceso rápido</Text>
      <View className="flex-row flex-wrap -mx-1">
        {accesos.map((a) => (
          <View key={a.t} className="w-1/3 px-1 mb-2">
            <TouchableOpacity onPress={a.onPress} className="bg-white border border-gray-200 rounded-xl py-3 items-center">
              <View className="bg-blue-700 rounded-lg w-10 h-10 items-center justify-center"><a.icon color="#fff" size={20} /></View>
              <Text className="text-sm font-semibold text-gray-800 mt-1">{a.t}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View className="flex-row items-center mt-3 mb-2">
        <Text className="text-gray-900 font-black text-base flex-1">Proyectos recientes</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/proyectos' as any)}><Text className="text-blue-700 font-semibold">Ver todos</Text></TouchableOpacity>
      </View>
      {!recientes.length ? (
        <View className="bg-white border border-dashed border-gray-300 rounded-xl py-6 items-center">
          <Text className="text-gray-500">No hay proyectos todavía.</Text>
        </View>
      ) : recientes.map((p) => {
        const est = estadoProyecto(p.estado);
        return (
          <TouchableOpacity key={p.id} onPress={() => router.push(`/proyecto/${p.id}` as any)}
            className="bg-white border border-gray-200 rounded-xl p-3 mb-2 flex-row items-center">
            <View className="flex-1 pr-2">
              <Text className="font-bold text-gray-900" numberOfLines={1}>{p.nombre}</Text>
              <Text className="text-xs text-gray-500">{numeroProyecto(p.numero)} · {p.clientes?.nombre || p.cliente_nombre || 'Cliente por defecto'}</Text>
            </View>
            <View className={`px-2 py-0.5 rounded-full border ${est.c}`}><Text className="text-[11px] font-semibold">{est.t}</Text></View>
            <ChevronRight color="#9ca3af" size={18} />
          </TouchableOpacity>
        );
      })}

      {nuevo && (
        <NuevoProyecto tenantId={tenantId} siguiente={(recientes[0]?.numero || 0) + 1} sistema={nuevo.sistema}
          onClose={() => setNuevo(null)}
          onCreado={(id) => {
            const s = nuevo.sistema?.id;
            setNuevo(null);
            router.push((s ? `/proyecto/${id}?sistema=${s}` : `/proyecto/${id}`) as any);
          }} />
      )}
      {barras && <CalculadoraBarras tenantId={tenantId} onClose={() => setBarras(false)} />}
    </View>
  );
}
