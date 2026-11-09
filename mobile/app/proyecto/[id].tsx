// Proyecto de ventanas en la app (09/11/2026): estado y CONTROL DE MEDIDAS
// en la obra. El teclado numérico del celular no tiene "/" ni espacio: la
// pulgada entera se escribe y la fracción se toca (⅛ … ⅞).
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Trash2, Pencil } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ESTADOS_PROYECTO, estadoProyecto, numeroProyecto, pulgadasTexto, medidaRazonable, COLORES_ALUMINIO } from '@/src/lib/ventanas';

const FRACCIONES: [string, number][] = [['0', 0], ['⅛', 0.125], ['¼', 0.25], ['⅜', 0.375], ['½', 0.5], ['⅝', 0.625], ['¾', 0.75], ['⅞', 0.875]];

function Medida({ titulo, entero, fraccion, setEntero, setFraccion, mal }: {
  titulo: string; entero: string; fraccion: number; setEntero: (v: string) => void; setFraccion: (v: number) => void; mal: boolean;
}) {
  const valor = entero ? Number(entero) + fraccion : null;
  return (
    <View className="mb-3">
      <View className="flex-row items-center">
        <Text className="text-xs font-bold text-gray-600 uppercase w-14">{titulo}</Text>
        <TextInput className={`flex-1 border rounded-xl px-3 py-3 text-lg bg-white ${mal ? 'border-red-500' : 'border-gray-300'}`}
          keyboardType="number-pad" placeholder="Pulgadas" value={entero} onChangeText={(t) => setEntero(t.replace(/\D/g, '').slice(0, 3))} />
        <Text className={`w-24 text-right font-bold ${mal ? 'text-red-600' : 'text-gray-800'}`}>{mal ? 'Revise' : valor != null ? `${pulgadasTexto(valor)}"` : ''}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 ml-14">
        {FRACCIONES.map(([t, v]) => (
          <TouchableOpacity key={t} onPress={() => setFraccion(v)}
            className={`w-11 h-10 mr-1.5 rounded-lg border items-center justify-center ${fraccion === v ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}>
            <Text className={`text-base font-semibold ${fraccion === v ? 'text-white' : 'text-gray-700'}`}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function ProyectoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tenantId } = useAuthStore();
  const [p, setP] = useState<any>(null);
  const [sistemas, setSistemas] = useState<any[]>([]);
  const [medidas, setMedidas] = useState<any[]>([]);
  const [sistemaId, setSistemaId] = useState('');
  const [hojas, setHojas] = useState(2);
  const [anchoE, setAnchoE] = useState(''); const [anchoF, setAnchoF] = useState(0);
  const [altoE, setAltoE] = useState(''); const [altoF, setAltoF] = useState(0);
  const [cantidad, setCantidad] = useState('1');
  const [color, setColor] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [pr, si, me] = await Promise.all([
      supabase.from('vent_proyectos').select('*, clientes(nombre)').eq('id', id).eq('tenant_id', tenantId).single(),
      supabase.from('vent_sistemas').select('*').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      supabase.from('vent_medidas').select('*').eq('proyecto_id', id).eq('tenant_id', tenantId).order('orden').order('created_at'),
    ]);
    if (pr.error) { Alert.alert('No se pudo abrir', pr.error.message); router.back(); return; }
    setP(pr.data); setSistemas(si.data || []); setMedidas(me.data || []);
    setSistemaId((s) => s || si.data?.[0]?.id || '');
  }, [id, tenantId, router]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const sistema = useMemo(() => sistemas.find((x) => x.id === sistemaId), [sistemas, sistemaId]);
  const hojasDe = (sistema?.hojas as number[]) || [2, 3, 4];
  const ancho = anchoE ? Number(anchoE) + anchoF : null;
  const alto = altoE ? Number(altoE) + altoF : null;
  const anchoMal = (intento || !!anchoE) && !medidaRazonable(ancho);
  const altoMal = (intento || !!altoE) && !medidaRazonable(alto);

  const cambiarEstado = async (estado: string) => {
    const { data, error } = await supabase.from('vent_proyectos').update({ estado }).eq('id', id).eq('tenant_id', tenantId).select('id');
    if (error || !data?.length) { Alert.alert('No se guardó', error?.message || 'Sin permiso'); return; }
    setP((x: any) => ({ ...x, estado }));
  };

  const limpiar = () => { setAnchoE(''); setAnchoF(0); setAltoE(''); setAltoF(0); setCantidad('1'); setUbicacion(''); setEditando(null); setIntento(false); };

  const agregar = async () => {
    setIntento(true);
    if (!sistemaId) { Alert.alert('Falta el tipo de ventana'); return; }
    if (!medidaRazonable(ancho) || !medidaRazonable(alto)) return;
    const h = hojasDe.includes(hojas) ? hojas : hojasDe[0];
    setGuardando(true);
    const fila = { tenant_id: tenantId, proyecto_id: id, sistema_id: sistemaId, hojas: h, ancho, alto,
      cantidad: Math.max(1, parseInt(cantidad, 10) || 1), color: color || null, ubicacion: ubicacion.trim() || null };
    const res = editando
      ? await supabase.from('vent_medidas').update(fila).eq('id', editando).eq('tenant_id', tenantId).select('id')
      : await supabase.from('vent_medidas').insert({ ...fila, orden: medidas.length + 1 }).select('id');
    setGuardando(false);
    if (res.error || !res.data?.length) { Alert.alert('No se guardó la medida', res.error?.message || 'Sin permiso'); return; }
    limpiar();
    cargar();
  };

  const corregir = (me: any) => {
    setEditando(me.id); setSistemaId(me.sistema_id); setHojas(me.hojas);
    const a = Number(me.ancho); const l = Number(me.alto);
    setAnchoE(String(Math.floor(a))); setAnchoF(Math.round((a - Math.floor(a)) * 8) / 8);
    setAltoE(String(Math.floor(l))); setAltoF(Math.round((l - Math.floor(l)) * 8) / 8);
    setCantidad(String(me.cantidad)); setColor(me.color || ''); setUbicacion(me.ubicacion || '');
  };

  const quitar = (me: any) => Alert.alert('Quitar ventana', `${pulgadasTexto(me.ancho)} x ${pulgadasTexto(me.alto)}`, [
    { text: 'No' },
    { text: 'Quitar', style: 'destructive', onPress: async () => {
      const { data, error } = await supabase.from('vent_medidas').delete().eq('id', me.id).eq('tenant_id', tenantId).select('id');
      if (error || !data?.length) { Alert.alert('No se pudo quitar', error?.message || 'Sin permiso'); return; }
      setMedidas((ms) => ms.filter((x) => x.id !== me.id));
    } },
  ]);

  if (!p) return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#1d4ed8" /></View>;
  const nombreSistema = (sid: string) => sistemas.find((x) => x.id === sid)?.nombre || '—';
  const total = medidas.reduce((s, x) => s + Number(x.cantidad || 0), 0);

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center bg-white px-3 py-3 border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2"><ArrowLeft color="#111827" size={24} /></TouchableOpacity>
        <View className="flex-1">
          <Text className="text-base font-bold">{p.nombre}</Text>
          <Text className="text-xs text-gray-500">{numeroProyecto(p.numero)} · {p.clientes?.nombre || p.cliente_nombre || 'Cliente por defecto'}</Text>
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {ESTADOS_PROYECTO.map((e) => (
            <TouchableOpacity key={e.k} onPress={() => cambiarEstado(e.k)}
              className={`px-3 py-1.5 rounded-full border mr-2 ${p.estado === e.k ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}>
              <Text className={`text-xs font-semibold ${p.estado === e.k ? 'text-white' : 'text-gray-600'}`}>{e.t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View className="bg-white rounded-2xl border border-blue-200 p-4 mb-4">
          <Text className="text-sm font-black text-blue-800 uppercase mb-2">Control de medidas</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {sistemas.map((x) => (
              <TouchableOpacity key={x.id} onPress={() => setSistemaId(x.id)}
                className={`px-3 py-2 rounded-xl border mr-2 ${sistemaId === x.id ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}>
                <Text className={`text-sm font-semibold ${sistemaId === x.id ? 'text-white' : 'text-gray-700'}`}>{x.nombre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="flex-row mb-3">
            {hojasDe.map((h) => (
              <TouchableOpacity key={h} onPress={() => setHojas(h)}
                className={`px-4 py-2 rounded-full border mr-2 ${hojas === h ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-300'}`}>
                <Text className={`font-semibold ${hojas === h ? 'text-white' : 'text-gray-600'}`}>{h} {h === 1 ? 'Hoja' : 'Hojas'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Medida titulo="Ancho" entero={anchoE} fraccion={anchoF} setEntero={setAnchoE} setFraccion={setAnchoF} mal={anchoMal} />
          <Medida titulo="Alto" entero={altoE} fraccion={altoF} setEntero={setAltoE} setFraccion={setAltoF} mal={altoMal} />
          <View className="flex-row items-center mb-3">
            <Text className="text-xs font-bold text-gray-600 uppercase w-14">Cant.</Text>
            <TextInput className="w-20 border border-gray-300 rounded-xl px-3 py-3 text-lg bg-white" keyboardType="number-pad" value={cantidad} onChangeText={(t) => setCantidad(t.replace(/\D/g, ''))} />
            <TextInput className="flex-1 ml-2 border border-gray-300 rounded-xl px-3 py-3 text-base bg-white" placeholder="Ubicación (sala, cocina…)" value={ubicacion} onChangeText={setUbicacion} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {COLORES_ALUMINIO.map((c) => (
              <TouchableOpacity key={c} onPress={() => setColor(color === c ? '' : c)}
                className={`px-3 py-1.5 rounded-full border mr-2 ${color === c ? 'bg-gray-800 border-gray-800' : 'bg-white border-gray-300'}`}>
                <Text className={`text-xs font-semibold ${color === c ? 'text-white' : 'text-gray-700'}`}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="flex-row">
            <TouchableOpacity onPress={agregar} disabled={guardando} className="flex-1 bg-blue-700 rounded-xl py-3.5 items-center">
              {guardando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">{editando ? 'Guardar corrección' : 'Agregar ventana'}</Text>}
            </TouchableOpacity>
            {editando && <TouchableOpacity onPress={limpiar} className="ml-2 px-4 rounded-xl border border-gray-300 items-center justify-center"><Text>Cancelar</Text></TouchableOpacity>}
          </View>
        </View>

        <Text className="text-sm font-bold text-gray-700 mb-2">Todas las medidas · {total} ventana(s)</Text>
        {medidas.map((me, i) => (
          <View key={me.id} className={`flex-row items-center bg-white rounded-xl border p-3 mb-2 ${editando === me.id ? 'border-amber-400' : 'border-gray-200'}`}>
            <Text className="text-gray-400 w-6">{i + 1}</Text>
            <View className="flex-1">
              <Text className="font-bold">{pulgadasTexto(me.ancho)}" × {pulgadasTexto(me.alto)}"{me.cantidad > 1 ? `  ×${me.cantidad}` : ''}</Text>
              <Text className="text-xs text-gray-500">{nombreSistema(me.sistema_id)} · {me.hojas} hojas{me.color ? ` · ${me.color}` : ''}{me.ubicacion ? ` · ${me.ubicacion}` : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => corregir(me)} className="p-2"><Pencil color="#374151" size={18} /></TouchableOpacity>
            <TouchableOpacity onPress={() => quitar(me)} className="p-2"><Trash2 color="#dc2626" size={18} /></TouchableOpacity>
          </View>
        ))}
        {!medidas.length && <Text className="text-gray-400 text-center py-6">Todavía no hay medidas.</Text>}
        <View className="h-10" />
      </ScrollView>
    </View>
  );
}
