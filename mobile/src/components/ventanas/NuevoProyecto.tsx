// Nuevo proyecto de ventanas (09/11/2026), compartido por Proyectos y el
// Inicio de Ventanas. Con `sistema` (botón "Ventana Tradicional" del Inicio)
// la primera medida ya viene con ese tipo de ventana.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { X } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';

const fmtTel = (v: string) => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

export default function NuevoProyecto({ tenantId, siguiente, onClose, onCreado, sistema = null }: { tenantId: string | null; siguiente: number; onClose: () => void; onCreado: (id: string) => void; sistema?: { id: string; nombre: string } | null }) {
  const [nombre, setNombre] = useState(`Proyecto ${siguiente}`);
  const [buscar, setBuscar] = useState('');
  const [cliente, setCliente] = useState<{ id: string; nombre: string; telefono?: string; direccion?: string } | null>(null);
  const [resultados, setResultados] = useState<any[]>([]);
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const q = buscar.trim().replace(/[%,()]/g, ' ');
    if (cliente || q.length < 2) { setResultados([]); return undefined; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, telefono, direccion')
        .eq('tenant_id', tenantId).or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`).order('nombre').limit(6);
      setResultados(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [buscar, cliente, tenantId]);

  const crear = async () => {
    if (!nombre.trim()) { Alert.alert('Falta el nombre', 'Escribe el nombre del proyecto.'); return; }
    setGuardando(true);
    const { data, error } = await supabase.from('vent_proyectos').insert({
      tenant_id: tenantId, nombre: nombre.trim(), cliente_id: cliente?.id || null,
      cliente_nombre: cliente ? null : (buscar.trim() || null),
      direccion: direccion.trim() || null, telefono: telefono.trim() || null,
    }).select('id').single();
    setGuardando(false);
    if (error) { Alert.alert('No se pudo crear', error.message); return; }
    onCreado(data.id);
  };

  const campo = 'border border-gray-300 rounded-xl px-3 py-3 text-base bg-white mt-1';
  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <ScrollView className="bg-white rounded-t-3xl max-h-[90%]" contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-bold">Nuevo proyecto</Text>
            <TouchableOpacity onPress={onClose}><X color="#6b7280" size={24} /></TouchableOpacity>
          </View>
          {sistema ? (
            <View className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-3">
              <Text className="text-[11px] font-bold text-gray-500 uppercase">Ventana preseleccionada</Text>
              <Text className="font-bold text-gray-900">{sistema.nombre}</Text>
            </View>
          ) : null}
          <Text className="text-xs font-bold text-gray-600 uppercase">Nombre del proyecto</Text>
          <TextInput className={campo} value={nombre} onChangeText={setNombre} />
          <Text className="text-xs font-bold text-gray-600 uppercase mt-3">Cliente</Text>
          {cliente ? (
            <View className="flex-row items-center justify-between border border-emerald-300 bg-emerald-50 rounded-xl px-3 py-3 mt-1">
              <Text className="font-semibold">{cliente.nombre}</Text>
              <TouchableOpacity onPress={() => setCliente(null)}><X color="#6b7280" size={18} /></TouchableOpacity>
            </View>
          ) : (
            <TextInput className={campo} placeholder="Busca o escribe el nombre (vacío = cliente por defecto)" value={buscar} onChangeText={setBuscar} />
          )}
          {resultados.map((c) => (
            <TouchableOpacity key={c.id} className="py-2.5 px-3 border-b border-gray-100"
              onPress={() => { setCliente(c); setBuscar(''); setResultados([]); if (!direccion) setDireccion(c.direccion || ''); if (!telefono) setTelefono(fmtTel(c.telefono || '')); }}>
              <Text className="font-semibold">{c.nombre}</Text>
              {c.telefono ? <Text className="text-xs text-gray-500">{c.telefono}</Text> : null}
            </TouchableOpacity>
          ))}
          <Text className="text-xs font-bold text-gray-600 uppercase mt-3">Dirección</Text>
          <TextInput className={campo} value={direccion} onChangeText={setDireccion} />
          <Text className="text-xs font-bold text-gray-600 uppercase mt-3">Teléfono</Text>
          <TextInput className={campo} keyboardType="phone-pad" placeholder="809-000-0000" value={telefono} onChangeText={(t) => setTelefono(fmtTel(t))} />
          <TouchableOpacity onPress={crear} disabled={guardando} className="bg-blue-700 rounded-xl py-4 items-center mt-5">
            {guardando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">Crear proyecto y medir</Text>}
          </TouchableOpacity>
          <View className="h-8" />
        </ScrollView>
      </View>
    </Modal>
  );
}
