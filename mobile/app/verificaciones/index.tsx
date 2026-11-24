// Confirmar existencia y ubicación (23/11/2026).
// Listas que mandan desde la PC (Inventario Inteligente → Sin movimiento →
// Enviar a confirmar). Aquí se cuenta pieza por pieza: cuántas hay y dónde
// están. Al terminar se envía de vuelta; el inventario NO cambia hasta que
// en la PC apliquen el ajuste. RPC inv_verif_contar / inv_verif_enviar
// (sql/inventario_verificaciones.sql).
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, FlatList,
  KeyboardAvoidingView, Platform, RefreshControl, BackHandler,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';

type Lista = { id: string; titulo: string; nota: string | null; created_at: string; total: number; hechas: number };
// existencia_actual = la del sistema AHORA (inv_verif_items_de), no la de
// cuando mandaron la lista: si se vendió algo entre medio, no sale un ajuste falso.
type Item = {
  id: string; codigo: string | null; descripcion: string | null;
  existencia_actual: number; ubicacion_sistema: string | null;
  existencia_contada: number | null; ubicacion_confirmada: string | null;
  resultado: 'pendiente' | 'ok' | 'diferencia' | 'no_esta'; nota: string | null;
};

const num = (v: number | null | undefined) => Number(v || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });

export default function VerificacionesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [listas, setListas] = useState<Lista[]>([]);
  const [abierta, setAbierta] = useState<Lista | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!user?.id) { setCargando(false); return; }
    const { data, error } = await supabase.from('inv_verificaciones')
      .select('id, titulo, nota, created_at, inv_verificacion_items(resultado)')
      .eq('asignado_a', user.id).eq('estado', 'pendiente')
      .order('created_at', { ascending: true });
    setCargando(false);
    if (error) { Alert.alert('Por confirmar', error.message); return; }
    setListas((data || []).map((l: any) => ({
      id: l.id, titulo: l.titulo, nota: l.nota, created_at: l.created_at,
      total: (l.inv_verificacion_items || []).length,
      hechas: (l.inv_verificacion_items || []).filter((i: any) => i.resultado !== 'pendiente').length,
    })));
  }, [user?.id]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  if (abierta) return <ListaScreen lista={abierta} onVolver={() => { setAbierta(null); cargar(); }} />;

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2"><Feather name="arrow-left" size={24} color="#111827" /></TouchableOpacity>
        <Feather name="clipboard" size={20} color="#2563eb" />
        <Text className="text-lg font-bold text-gray-900 ml-2 flex-1">Por confirmar</Text>
      </View>
      {cargando ? <ActivityIndicator className="mt-10" color="#2563eb" /> : (
        <FlatList
          data={listas}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={cargar} />}
          ListEmptyComponent={<Text className="text-center text-gray-500 mt-10">No tienes listas por confirmar.</Text>}
          renderItem={({ item: l }) => (
            <TouchableOpacity onPress={() => setAbierta(l)} className="bg-white border border-gray-200 rounded-xl p-4 mb-3" activeOpacity={0.7}>
              <Text className="font-black text-gray-900">{l.titulo}</Text>
              {!!l.nota && <Text className="text-xs text-gray-600 mt-1">{l.nota}</Text>}
              <View className="flex-row items-center mt-2">
                <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-3">
                  <View className="h-full bg-blue-600" style={{ width: `${l.total ? (l.hechas / l.total) * 100 : 0}%` }} />
                </View>
                <Text className="text-xs font-bold text-gray-600">{l.hechas}/{l.total}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function ListaScreen({ lista, onVolver }: { lista: Lista; onVolver: () => void }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('inv_verif_items_de', { p_id: lista.id });
    setCargando(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setItems((data || []) as Item[]);
  }, [lista.id]);

  useEffect(() => { cargar(); }, [cargar]);
  // El botón atrás de Android vuelve a la lista de listas, no sale de la pantalla.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onVolver(); return true; });
    return () => sub.remove();
  }, [onVolver]);

  const actualizar = (it: Item) => setItems((prev) => prev.map((x) => (x.id === it.id ? it : x)));
  const faltan = items.filter((i) => i.resultado === 'pendiente').length;
  const q = busca.trim().toLowerCase();
  const visibles = q ? items.filter((i) => [i.codigo, i.descripcion, i.ubicacion_sistema].some((v) => String(v || '').toLowerCase().includes(q))) : items;

  const enviar = () => {
    if (faltan > 0) return Alert.alert('Faltan piezas', `Te faltan ${faltan} por confirmar.`);
    Alert.alert('Enviar', 'Se manda a la PC para que apliquen los ajustes. ¿Enviar?', [
      { text: 'Todavía no', style: 'cancel' },
      {
        text: 'Enviar', onPress: async () => {
          setEnviando(true);
          const { error } = await supabase.rpc('inv_verif_enviar', { p_id: lista.id });
          setEnviando(false);
          if (error) return Alert.alert('No se pudo enviar', error.message);
          Alert.alert('Enviada', 'Gracias. Ya le llegó a quien te la mandó.');
          onVolver();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
        <TouchableOpacity onPress={onVolver} className="p-1 mr-2"><Feather name="arrow-left" size={24} color="#111827" /></TouchableOpacity>
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900" numberOfLines={1}>{lista.titulo}</Text>
          <Text className="text-xs text-gray-500">{items.length - faltan} de {items.length} confirmadas</Text>
        </View>
      </View>
      <View className="px-4 pt-3">
        <View className="flex-row items-center bg-white border border-gray-300 rounded-xl px-3">
          <Feather name="search" size={16} color="#6b7280" />
          <TextInput value={busca} onChangeText={setBusca} placeholder="Buscar código, nombre o ubicación" placeholderTextColor="#9ca3af"
            className="flex-1 py-2 px-2 text-sm text-gray-900" />
        </View>
      </View>
      {cargando ? <ActivityIndicator className="mt-10" color="#2563eb" /> : (
        <FlatList
          data={visibles}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => <Pieza item={item} onGuardada={actualizar} />}
        />
      )}
      <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-200 p-3" style={{ paddingBottom: 12 + insets.bottom }}>
        <TouchableOpacity onPress={enviar} disabled={enviando}
          className={`py-3 rounded-xl items-center ${faltan === 0 ? 'bg-blue-600' : 'bg-gray-300'}`}>
          {enviando ? <ActivityIndicator color="#fff" /> : (
            <Text className="text-white font-black">{faltan === 0 ? 'Enviar a la PC' : `Faltan ${faltan} por confirmar`}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Pieza({ item, onGuardada }: { item: Item; onGuardada: (i: Item) => void }) {
  const hecha = item.resultado !== 'pendiente';
  const [editando, setEditando] = useState(!hecha);
  const [cant, setCant] = useState(item.existencia_contada != null ? String(item.existencia_contada) : '');
  const [ubic, setUbic] = useState(item.ubicacion_confirmada || item.ubicacion_sistema || '');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (noEsta = false) => {
    const n = Number(String(cant).replace(',', '.'));
    if (!noEsta && (cant.trim() === '' || !Number.isFinite(n) || n < 0)) return Alert.alert('Cantidad', 'Escribe cuántas hay (0 si no hay).');
    setGuardando(true);
    const { data, error } = await supabase.rpc('inv_verif_contar', {
      p_item: item.id, p_cantidad: noEsta ? 0 : n, p_ubicacion: noEsta ? null : ubic.trim() || null, p_no_esta: noEsta, p_nota: null,
    });
    setGuardando(false);
    if (error) return Alert.alert('No se pudo guardar', error.message);
    onGuardada({ ...item, ...(data as any), existencia_actual: item.existencia_actual });
    setEditando(false);
  };

  const color = item.resultado === 'ok' ? 'border-emerald-300 bg-emerald-50'
    : item.resultado === 'diferencia' ? 'border-amber-300 bg-amber-50'
      : item.resultado === 'no_esta' ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white';

  return (
    <View className={`border rounded-xl p-3 mb-3 ${color}`}>
      <Text className="font-bold text-gray-900">{item.descripcion}</Text>
      <Text className="text-xs text-gray-500">{item.codigo} · sistema: <Text className="font-bold">{num(item.existencia_actual)}</Text> en <Text className="font-bold">{item.ubicacion_sistema || 'sin ubicación'}</Text></Text>

      {!editando ? (
        <View className="flex-row items-center mt-2">
          <Feather name={item.resultado === 'ok' ? 'check-circle' : item.resultado === 'no_esta' ? 'x-circle' : 'alert-triangle'} size={16}
            color={item.resultado === 'ok' ? '#059669' : item.resultado === 'no_esta' ? '#dc2626' : '#d97706'} />
          <Text className="text-sm text-gray-800 ml-2 flex-1">
            {item.resultado === 'no_esta' ? 'No está' : `Hay ${num(item.existencia_contada)} en ${item.ubicacion_confirmada || '—'}`}
          </Text>
          <TouchableOpacity onPress={() => setEditando(true)}><Text className="text-blue-700 font-bold text-sm">Cambiar</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          <View className="flex-row mt-2 gap-2">
            <View className="w-28">
              <Text className="text-[10px] font-bold text-gray-600">HAY</Text>
              <TextInput value={cant} onChangeText={setCant} keyboardType="decimal-pad" placeholder={num(item.existencia_actual)} placeholderTextColor="#9ca3af"
                className="border border-gray-300 bg-white rounded-lg px-3 py-2 text-lg font-black text-gray-900 text-center" />
            </View>
            <View className="flex-1">
              <Text className="text-[10px] font-bold text-gray-600">UBICACIÓN</Text>
              <TextInput value={ubic} onChangeText={setUbic} autoCapitalize="characters" placeholder="Ej: H-CAJA-2" placeholderTextColor="#9ca3af"
                className="border border-gray-300 bg-white rounded-lg px-3 py-2 text-base text-gray-900" />
            </View>
          </View>
          <View className="flex-row mt-2 gap-2">
            <TouchableOpacity onPress={() => setCant(String(item.existencia_actual))} className="px-3 py-2 rounded-lg bg-gray-100">
              <Text className="text-xs font-bold text-gray-700">= {num(item.existencia_actual)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => guardar(true)} disabled={guardando} className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <Text className="text-xs font-bold text-red-700">No está</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => guardar(false)} disabled={guardando} className="flex-1 py-2 rounded-lg bg-blue-600 items-center">
              {guardando ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-black">Confirmar</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
