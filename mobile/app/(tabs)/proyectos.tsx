// Ventanas y aluminio · Proyectos (09/11/2026). Lista con filtros por
// estado, crear proyecto (cliente, dirección, teléfono, cita) y abrirlo para
// medir en la obra. Mismas tablas que la web (sql/ventanas_base.sql).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Modal, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Search, X } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ESTADOS_PROYECTO, estadoProyecto, numeroProyecto } from '@/src/lib/ventanas';

type Proyecto = {
  id: string; numero: number; nombre: string; estado: string; cliente_nombre: string | null;
  direccion: string | null; telefono: string | null; fecha_cita: string | null; hora_cita: string | null;
  clientes?: { nombre: string | null } | null;
};

const sinTilde = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtTel = (v: string) => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

export default function ProyectosScreen() {
  const router = useRouter();
  const { tenantId } = useAuthStore();
  const [cargando, setCargando] = useState(true);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [ventanas, setVentanas] = useState<Record<string, number>>({});
  const [buscar, setBuscar] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const { count } = await supabase.from('vent_sistemas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if (!count) await supabase.rpc('vent_preparar_empresa');
    const [pr, me] = await Promise.all([
      supabase.from('vent_proyectos').select('*, clientes(nombre)').eq('tenant_id', tenantId).order('numero', { ascending: false }),
      supabase.from('vent_medidas').select('proyecto_id, cantidad').eq('tenant_id', tenantId),
    ]);
    setCargando(false);
    if (pr.error) { Alert.alert('No se pudieron cargar los proyectos', pr.error.message); return; }
    setProyectos((pr.data || []) as Proyecto[]);
    const c: Record<string, number> = {};
    for (const m of me.data || []) c[m.proyecto_id] = (c[m.proyecto_id] || 0) + Number(m.cantidad || 0);
    setVentanas(c);
  }, [tenantId]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const clienteDe = (p: Proyecto) => p.clientes?.nombre || p.cliente_nombre || 'Cliente por defecto';
  const filtrados = useMemo(() => {
    const q = sinTilde(buscar).trim();
    return proyectos.filter((p) => (!fEstado || p.estado === fEstado)
      && (!q || sinTilde(`${p.nombre} ${clienteDe(p)} ${numeroProyecto(p.numero)} ${p.direccion || ''}`).includes(q)));
  }, [proyectos, buscar, fEstado]);
  const cuenta = (k: string) => proyectos.filter((p) => p.estado === k).length;
  const activos = proyectos.filter((p) => !['cobrado', 'cancelado'].includes(p.estado)).length;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-4 pt-3 pb-2 border-b border-gray-200">
        <Text className="text-xs text-gray-500">{proyectos.length} proyectos · {activos} activos · {cuenta('cobrado')} cobrados</Text>
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 mt-2">
          <Search color="#9ca3af" size={18} />
          <TextInput className="flex-1 py-2.5 px-2 text-base" placeholder="Buscar proyecto o cliente…" value={buscar} onChangeText={setBuscar} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
          <TouchableOpacity onPress={() => setFEstado('')} className={`px-3 py-1.5 rounded-full border mr-2 ${!fEstado ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}>
            <Text className={`text-xs font-semibold ${!fEstado ? 'text-white' : 'text-gray-600'}`}>Todas {proyectos.length}</Text>
          </TouchableOpacity>
          {ESTADOS_PROYECTO.map((e) => (
            <TouchableOpacity key={e.k} onPress={() => setFEstado(fEstado === e.k ? '' : e.k)}
              className={`px-3 py-1.5 rounded-full border mr-2 ${fEstado === e.k ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}>
              <Text className={`text-xs font-semibold ${fEstado === e.k ? 'text-white' : 'text-gray-600'}`}>{e.t} {cuenta(e.k)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-4 pt-3" refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}>
        {!cargando && !filtrados.length && (
          <View className="items-center py-16">
            <Text className="text-gray-500 text-center">{proyectos.length ? 'Ningún proyecto con esos filtros.' : 'No hay proyectos todavía.\nCrea el primero para medir.'}</Text>
          </View>
        )}
        {filtrados.map((p) => {
          const est = estadoProyecto(p.estado);
          return (
            <TouchableOpacity key={p.id} onPress={() => router.push(`/proyecto/${p.id}` as any)} className="bg-white rounded-2xl border border-gray-200 p-4 mb-3">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-base font-bold text-gray-900">{p.nombre}</Text>
                  <Text className="text-xs text-gray-500">{numeroProyecto(p.numero)} · {clienteDe(p)}</Text>
                </View>
                <View className={`px-2 py-0.5 rounded-full border ${est.c}`}><Text className="text-[11px] font-semibold">{est.t}</Text></View>
              </View>
              <Text className="text-xs text-gray-500 mt-2">
                {ventanas[p.id] || 0} ventana(s){p.fecha_cita ? ` · Cita ${p.fecha_cita.split('-').reverse().join('/')}${p.hora_cita ? ` ${p.hora_cita.slice(0, 5)}` : ''}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View className="h-24" />
      </ScrollView>

      <TouchableOpacity onPress={() => setNuevo(true)} className="absolute bottom-6 right-6 bg-blue-700 w-14 h-14 rounded-full items-center justify-center shadow-lg">
        <Plus color="#fff" size={28} />
      </TouchableOpacity>

      {nuevo && (
        <NuevoProyecto tenantId={tenantId} siguiente={(proyectos[0]?.numero || 0) + 1} onClose={() => setNuevo(false)}
          onCreado={(id) => { setNuevo(false); router.push(`/proyecto/${id}` as any); }} />
      )}
    </View>
  );
}

function NuevoProyecto({ tenantId, siguiente, onClose, onCreado }: { tenantId: string | null; siguiente: number; onClose: () => void; onCreado: (id: string) => void }) {
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
