// Buscador de clientes ya creados para el POS móvil (30/10/2026).
// Busca por nombre, RNC/cédula, teléfono o código, igual que la web.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Search, X, User, UserX } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';

export type ClientePOS = {
  id: string;
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  direccion: string | null;
  tipo_ncf: string | null;
  codigo: string | null;
};

const CAMPOS = 'id, nombre, rnc, telefono, direccion, tipo_ncf, codigo';

export async function buscarClientes(term: string): Promise<ClientePOS[]> {
  let q = supabase.from('clientes').select(CAMPOS).eq('activo', true).order('nombre').limit(40);
  // Las comas y paréntesis rompen el filtro .or() de PostgREST.
  const t = term.trim().replace(/[,()]/g, ' ');
  if (t) q = q.or(`nombre.ilike.%${t}%,rnc.ilike.%${t}%,telefono.ilike.%${t}%,codigo.ilike.%${t}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ClientePOS[];
}

export async function leerCliente(id: string): Promise<ClientePOS | null> {
  const { data } = await supabase.from('clientes').select(CAMPOS).eq('id', id).maybeSingle();
  return (data as ClientePOS) || null;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (c: ClientePOS | null) => void;
};

export default function ClientePickerModal({ visible, onClose, onSelect }: Props) {
  const [term, setTerm] = useState('');
  const [lista, setLista] = useState<ClientePOS[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      setError('');
      try {
        const r = await buscarClientes(term);
        if (vivo) setLista(r);
      } catch (e: any) {
        if (vivo) setError(e?.message || 'No se pudieron cargar los clientes');
      } finally {
        if (vivo) setCargando(false);
      }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [term, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50">
        <View className="bg-white px-4 pt-12 pb-3 border-b border-gray-200 flex-row items-center">
          <Text className="flex-1 text-lg font-bold text-gray-900">Elegir cliente</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X color="#6b7280" size={24} />
          </TouchableOpacity>
        </View>
        <View className="px-4 py-3 bg-white border-b border-gray-100">
          <View className="flex-row items-center bg-gray-100 rounded-xl px-3">
            <Search color="#9ca3af" size={18} />
            <TextInput
              className="flex-1 ml-2 text-gray-900"
              style={{ paddingVertical: 10 }}
              placeholder="Nombre, RNC/cédula, teléfono o código"
              placeholderTextColor="#9ca3af"
              value={term}
              onChangeText={setTerm}
              autoFocus
              autoCorrect={false}
            />
          </View>
        </View>

        <TouchableOpacity
          className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200"
          onPress={() => onSelect(null)}
        >
          <UserX color="#6b7280" size={20} />
          <Text className="ml-3 text-gray-700 font-medium">Cliente genérico (consumidor final)</Text>
        </TouchableOpacity>

        {cargando ? <ActivityIndicator className="mt-6" /> : null}
        {error ? <Text className="text-red-600 text-center mt-4 px-4">{error}</Text> : null}

        <FlatList
          data={lista}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!cargando && !error ? (
            <Text className="text-gray-400 text-center mt-8">Sin clientes con ese dato</Text>
          ) : null}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100 active:bg-gray-100"
              onPress={() => onSelect(item)}
            >
              <View className="bg-gray-100 p-2 rounded-full mr-3">
                <User color="#6b7280" size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-bold" numberOfLines={1}>{item.nombre}</Text>
                <Text className="text-gray-500 text-xs" numberOfLines={1}>
                  {[item.rnc ? `RNC/Céd: ${item.rnc}` : null, item.telefono, item.codigo ? `Cód. ${item.codigo}` : null]
                    .filter(Boolean).join(' · ') || 'Sin documento'}
                </Text>
              </View>
              {item.tipo_ncf === '01' ? (
                <Text className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">CRÉDITO FISCAL</Text>
              ) : null}
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}
