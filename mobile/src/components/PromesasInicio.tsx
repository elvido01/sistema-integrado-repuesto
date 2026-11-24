// "Le prometí…" en el Inicio de la app (23/11/2026).
// Anotar en 10 segundos lo que se le prometió a un cliente y para cuándo; ese
// día a las 8 am avisa en la campanita (cron promesas-avisos) y, si se vence,
// sigue avisando. Mismos datos que la web (PromesasCard): tabla
// promesas_clientes + RPC promesa_crear / promesa_marcar / promesa_posponer
// (sql/promesas_clientes.sql).
import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Linking, Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';

type Promesa = {
  id: string; que: string; cliente_nombre: string | null; telefono: string | null;
  fecha: string; para_suplidor: boolean; estado: string;
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const sumarDias = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const diaSemana = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const proximoLunes = (iso: string) => sumarDias(iso, ((8 - diaSemana(iso)) % 7) || 7);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const etiqueta = (iso: string, hoy: string) => {
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  if (iso < hoy) return `Vencida ${ddmm(iso)}`;
  const d = DIAS[diaSemana(iso)];
  return `${d[0].toUpperCase()}${d.slice(1)} ${ddmm(iso)}`;
};
const waLink = (tel: string | null) => {
  const dig = String(tel || '').replace(/\D/g, '');
  if (dig.length < 10) return null;
  return `https://wa.me/${dig.length === 10 ? `1${dig}` : dig}`;
};

export default function PromesasInicio() {
  const { tenantId } = useAuthStore();
  const [lista, setLista] = useState<Promesa[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabase.from('promesas_clientes')
      .select('id, que, cliente_nombre, telefono, fecha, para_suplidor, estado')
      .eq('tenant_id', tenantId).eq('estado', 'pendiente')
      .order('fecha', { ascending: true }).order('created_at', { ascending: true }).limit(30);
    if (!error) setLista((data || []) as Promesa[]);
  }, [tenantId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const accion = async (p: Promesa, tipo: 'hecha' | 'cancelada' | 'manana') => {
    setTrabajando(p.id);
    const r = tipo === 'manana'
      ? await supabase.rpc('promesa_posponer', { p_id: p.id, p_fecha: sumarDias(hoyRD(), 1) })
      : await supabase.rpc('promesa_marcar', { p_id: p.id, p_estado: tipo });
    setTrabajando(null);
    if (r.error) { Alert.alert('No se pudo', r.error.message); return; }
    cargar();
  };

  const hoy = hoyRD();
  const urgentes = lista.filter((p) => p.fecha <= hoy).length;

  return (
    <View className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <View className="flex-row items-center">
        <View className="bg-amber-50 w-10 h-10 rounded-xl items-center justify-center mr-3">
          <Feather name="bookmark" size={20} color="#d97706" />
        </View>
        <View className="flex-1">
          <Text className="text-gray-500 text-[10px] font-black uppercase tracking-wider">Promesas a clientes</Text>
          <Text className={`text-sm ${urgentes ? 'text-red-600 font-black' : 'text-gray-700'}`}>
            {lista.length === 0 ? 'Nada pendiente' : urgentes ? `${urgentes} para hoy o vencida${urgentes === 1 ? '' : 's'}` : `${lista.length} pendiente${lista.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setAbierto(true)} className="bg-amber-500 rounded-lg px-3 py-2 flex-row items-center" activeOpacity={0.8}>
          <Feather name="plus" size={16} color="#fff" />
          <Text className="text-white font-black ml-1">Le prometí…</Text>
        </TouchableOpacity>
      </View>

      {lista.map((p) => {
        const vencida = p.fecha < hoy;
        const wa = waLink(p.telefono);
        return (
          <View key={p.id} className="border-t border-gray-100 mt-3 pt-3">
            <View className="flex-row items-start">
              <View className={`px-2 py-0.5 rounded-full mr-2 mt-0.5 ${vencida ? 'bg-red-100' : p.fecha === hoy ? 'bg-amber-100' : 'bg-gray-100'}`}>
                <Text className={`text-[10px] font-black ${vencida ? 'text-red-700' : p.fecha === hoy ? 'text-amber-800' : 'text-gray-600'}`}>{etiqueta(p.fecha, hoy)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-bold">{p.que}</Text>
                <Text className="text-xs text-gray-500">
                  {[p.cliente_nombre || 'Cliente', p.telefono, p.para_suplidor ? 'preguntar al suplidor' : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
            <View className="flex-row mt-2 gap-2">
              {trabajando === p.id ? <ActivityIndicator color="#d97706" /> : (<>
                {wa && (
                  <TouchableOpacity onPress={() => Linking.openURL(wa)} className="flex-row items-center px-2.5 py-1.5 rounded-lg bg-emerald-50">
                    <Feather name="message-circle" size={14} color="#047857" /><Text className="text-emerald-700 text-xs font-bold ml-1">WhatsApp</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => accion(p, 'hecha')} className="flex-row items-center px-2.5 py-1.5 rounded-lg bg-emerald-600">
                  <Feather name="check" size={14} color="#fff" /><Text className="text-white text-xs font-bold ml-1">Cumplida</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => accion(p, 'manana')} className="flex-row items-center px-2.5 py-1.5 rounded-lg bg-amber-50">
                  <Feather name="clock" size={14} color="#b45309" /><Text className="text-amber-800 text-xs font-bold ml-1">Mañana</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Quitar', '¿Quitar esta promesa?', [
                  { text: 'No', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => accion(p, 'cancelada') },
                ])} className="px-2.5 py-1.5 rounded-lg bg-gray-100">
                  <Feather name="x" size={14} color="#6b7280" />
                </TouchableOpacity>
              </>)}
            </View>
          </View>
        );
      })}

      <NuevaPromesa visible={abierto} onClose={() => setAbierto(false)} onCreada={cargar} />
    </View>
  );
}

function NuevaPromesa({ visible, onClose, onCreada }: { visible: boolean; onClose: () => void; onCreada: () => void }) {
  const hoy = hoyRD();
  const [que, setQue] = useState('');
  const [cliente, setCliente] = useState('');
  const [tel, setTel] = useState('');
  const [fecha, setFecha] = useState(sumarDias(hoy, 1));
  const [suplidor, setSuplidor] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const limpiar = () => { setQue(''); setCliente(''); setTel(''); setFecha(sumarDias(hoyRD(), 1)); setSuplidor(false); };
  const opciones: [string, string][] = [
    ['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Pasado mañana', sumarDias(hoy, 2)],
    [`Lunes ${ddmm(proximoLunes(hoy))}`, proximoLunes(hoy)], ['En 1 semana', sumarDias(hoy, 7)],
  ];

  const guardar = async () => {
    if (que.trim().length < 2) return Alert.alert('Falta', 'Escribe qué le prometiste.');
    if (!cliente.trim() && !tel.trim()) return Alert.alert('¿A quién?', 'Pon el nombre o el teléfono del cliente.');
    setGuardando(true);
    const { error } = await supabase.rpc('promesa_crear', {
      p_que: que.trim(), p_fecha: fecha, p_cliente_nombre: cliente.trim() || null,
      p_telefono: tel.trim() || null, p_para_suplidor: suplidor, p_origen: 'app',
    });
    setGuardando(false);
    if (error) return Alert.alert('No se pudo anotar', error.message);
    limpiar(); onCreada(); onClose();
    Alert.alert('Anotado', `Te aviso ${etiqueta(fecha, hoyRD()).toLowerCase()} a las 8 am en la campanita.`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-black/40 justify-end">
        <View className="bg-white rounded-t-2xl p-4 pb-8 max-h-[90%]">
          <ScrollView keyboardShouldPersistTaps="handled">
            <View className="flex-row items-center mb-3">
              <Text className="flex-1 text-lg font-black text-gray-900">Le prometí…</Text>
              <TouchableOpacity onPress={onClose} className="p-1"><Feather name="x" size={22} color="#111827" /></TouchableOpacity>
            </View>
            <TextInput value={que} onChangeText={setQue} placeholder="Ej: precio de los plásticos rojos Tauro CRX250"
              multiline maxLength={500} autoFocus placeholderTextColor="#9ca3af"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-900 min-h-[64px]" />
            <View className="flex-row gap-2 mt-2">
              <TextInput value={cliente} onChangeText={setCliente} placeholder="Cliente" placeholderTextColor="#9ca3af"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
              <TextInput value={tel} onChangeText={setTel} placeholder="Teléfono" keyboardType="phone-pad" placeholderTextColor="#9ca3af"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
            </View>
            <Text className="text-[11px] font-bold text-gray-600 mt-3 mb-1">¿PARA CUÁNDO?</Text>
            <View className="flex-row flex-wrap">
              {opciones.map(([l, f]) => (
                <TouchableOpacity key={l} onPress={() => setFecha(f)}
                  className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${fecha === f ? 'bg-amber-500 border-amber-500' : 'bg-white border-gray-300'}`}>
                  <Text className={`text-xs font-bold ${fecha === f ? 'text-white' : 'text-gray-700'}`}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row items-center justify-between mt-1">
              <Text className="text-sm text-gray-700 flex-1">Tengo que preguntarle al suplidor</Text>
              <Switch value={suplidor} onValueChange={setSuplidor} />
            </View>
            <TouchableOpacity onPress={guardar} disabled={guardando} className="mt-4 py-3 rounded-lg bg-amber-500 items-center">
              {guardando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-black">Anotar</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
