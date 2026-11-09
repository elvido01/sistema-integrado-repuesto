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
import CroquisVidrios from '@/src/components/ventanas/CroquisVidrios';
import { ESTADOS_PROYECTO, numeroProyecto, pulgadasTexto, medidaRazonable, COLORES_ALUMINIO, desgloseVentana, materialesProyecto, presupuestoProyecto, cobroTexto, barrasConFraccion, planchasVidrio } from '@/src/lib/ventanas';

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
  // sistema: el tipo de ventana escogido en el Inicio (la primera medida ya viene con él).
  const { id, sistema: sistemaParam } = useLocalSearchParams<{ id: string; sistema?: string }>();
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
  const [tab, setTab] = useState<'medidas' | 'desglose' | 'materiales' | 'vidrios' | 'presupuesto'>('medidas');
  const [piezasPorSistema, setPiezasPorSistema] = useState<Record<string, any[]>>({});
  const [cfg, setCfg] = useState<any>(null);
  const [precios, setPrecios] = useState<any[]>([]);
  const [extras, setExtras] = useState<any[]>([]);
  const [cotizando, setCotizando] = useState(false);

  const cargar = useCallback(async () => {
    const [pz, cf, prc, ex] = await Promise.all([
      supabase.from('vent_piezas').select('*').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      supabase.from('vent_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('vent_precios').select('*').eq('tenant_id', tenantId),
      supabase.from('vent_proyecto_extras').select('*, productos(codigo, descripcion)').eq('proyecto_id', id).eq('tenant_id', tenantId).order('orden'),
    ]);
    setPrecios(prc.data || []);
    setExtras(ex.data || []);
    const porSistema: Record<string, any[]> = {};
    for (const x of pz.data || []) (porSistema[x.sistema_id] = porSistema[x.sistema_id] || []).push(x);
    setPiezasPorSistema(porSistema);
    setCfg(cf.data || null);
    const [pr, si, me] = await Promise.all([
      supabase.from('vent_proyectos').select('*, clientes(nombre)').eq('id', id).eq('tenant_id', tenantId).single(),
      supabase.from('vent_sistemas').select('*').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      supabase.from('vent_medidas').select('*').eq('proyecto_id', id).eq('tenant_id', tenantId).order('orden').order('created_at'),
    ]);
    if (pr.error) { Alert.alert('No se pudo abrir', pr.error.message); router.back(); return; }
    setP(pr.data); setSistemas(si.data || []); setMedidas(me.data || []);
    setSistemaId((s) => s || ((si.data || []).some((x: any) => x.id === sistemaParam) ? String(sistemaParam) : si.data?.[0]?.id) || '');
  }, [id, tenantId, router, sistemaParam]);
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

  // Marcar / desmarcar un corte hecho (taller).
  const marcarCorte = async (me: any, piezaId: string) => {
    const hechos = new Set<string>(me.cortes_hechos || []);
    if (hechos.has(piezaId)) hechos.delete(piezaId); else hechos.add(piezaId);
    const nuevos = [...hechos];
    setMedidas((ms) => ms.map((x) => (x.id === me.id ? { ...x, cortes_hechos: nuevos } : x)));
    const { data, error } = await supabase.from('vent_medidas').update({ cortes_hechos: nuevos }).eq('id', me.id).eq('tenant_id', tenantId).select('id');
    if (error || !data?.length) { Alert.alert('No se guardó el corte', error?.message || 'Sin permiso'); cargar(); }
  };

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

        <View className="flex-row bg-white rounded-xl border border-gray-200 p-1 mb-3">
          {([['medidas', 'Medidas'], ['desglose', 'Desglose'], ['materiales', 'Material'], ['vidrios', 'Vidrios'], ['presupuesto', 'Precio']] as const).map(([k, t]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} className={`flex-1 py-2 rounded-lg items-center ${tab === k ? 'bg-blue-700' : ''}`}>
              <Text numberOfLines={1} className={`text-[13px] font-semibold ${tab === k ? 'text-white' : 'text-gray-600'}`}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'vidrios' && (
          <CroquisVidrios proyecto={p} medidas={medidas} piezasPorSistema={piezasPorSistema} nombreSistema={nombreSistema}
            empresaNombre={useAuthStore.getState().empresa?.nombre || ''} />
        )}

        {tab === 'desglose' && (medidas.length ? medidas.map((me, i) => {
          const cortes = desgloseVentana(me, piezasPorSistema[me.sistema_id] || []);
          const hechos = new Set<string>(me.cortes_hechos || []);
          const listos = cortes.filter((c: any) => hechos.has(c.pieza.id)).length;
          const terminada = cortes.length > 0 && listos === cortes.length;
          return (
            <View key={me.id} className={`rounded-2xl border p-3 mb-3 ${terminada ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-200'}`}>
              <View className="flex-row justify-between mb-1">
                <Text className="font-bold flex-1">Ventana {i + 1}{me.cantidad > 1 ? ` (×${me.cantidad})` : ''} · {pulgadasTexto(me.ancho)}" × {pulgadasTexto(me.alto)}"</Text>
                <Text className={`text-xs font-bold ${terminada ? 'text-emerald-700' : 'text-gray-500'}`}>{terminada ? '✓ Terminada' : `${listos}/${cortes.length}`}</Text>
              </View>
              <Text className="text-xs text-gray-500 mb-2">{nombreSistema(me.sistema_id)} · {me.hojas} hojas{me.color ? ` · ${me.color}` : ''}{me.ubicacion ? ` · ${me.ubicacion}` : ''}</Text>
              {cortes.map((c: any) => {
                const ok = hechos.has(c.pieza.id);
                return (
                  <TouchableOpacity key={c.pieza.id} onPress={() => marcarCorte(me, c.pieza.id)} className="flex-row items-center py-2 border-b border-gray-100">
                    <View className={`w-6 h-6 rounded-md border mr-3 items-center justify-center ${ok ? 'bg-emerald-600 border-emerald-600' : 'border-gray-400'}`}>
                      {ok ? <Text className="text-white font-bold">✓</Text> : null}
                    </View>
                    <Text className={`flex-1 ${ok ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{c.pieza.nombre}</Text>
                    <Text className={`font-bold ${ok ? 'text-gray-400' : 'text-gray-900'}`}>{c.cantidad} × {pulgadasTexto(c.largo)}"</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        }) : <Text className="text-gray-400 text-center py-6">Primero agrega las medidas.</Text>)}

        {tab === 'materiales' && (() => {
          const mat = materialesProyecto(medidas, piezasPorSistema, cfg || {});
          const fraccion = !!cfg?.mostrar_fraccion;
          const barrasDe = (x: any) => (fraccion ? barrasConFraccion(x.plan, mat.largoBarra) : { valor: x.barras, texto: String(x.barras) });
          const planchas = planchasVidrio(mat.totalPie2, cfg?.plancha_ancho, cfg?.plancha_alto, fraccion);
          if (!medidas.length) return <Text className="text-gray-400 text-center py-6">Primero agrega las medidas.</Text>;
          return (
            <View>
              <Text className="text-sm font-bold text-gray-700 mb-2">Perfiles · {mat.perfiles.reduce((s: number, x: any) => s + barrasDe(x).valor, 0)} barra(s) de {mat.largoBarra / 12}'</Text>
              {mat.perfiles.map((x: any) => (
                <View key={`${x.perfil}|${x.color}`} className="bg-white rounded-xl border border-gray-200 p-3 mb-2">
                  <View className="flex-row justify-between">
                    <Text className="font-bold flex-1">{x.perfil}{x.color ? ` · ${x.color}` : ''}</Text>
                    <Text className="font-bold text-blue-800">{barrasDe(x).texto} barra(s)</Text>
                  </View>
                  <Text className="text-xs text-gray-500">{x.cortes.length} cortes · {x.pies.toFixed(2)}' · {x.metros.toFixed(2)} m</Text>
                  {x.plan.barras.map((b: any, i: number) => (
                    <Text key={i} className="text-[11px] text-gray-500 mt-0.5">Barra {i + 1}: {b.cortes.map((c: number) => `${pulgadasTexto(c)}"`).join(' + ')} · sobra {pulgadasTexto(b.sobrante)}"</Text>
                  ))}
                </View>
              ))}
              <Text className="text-sm font-bold text-gray-700 mt-3 mb-2">Cristales · {mat.totalPie2.toFixed(2)} pie²{mat.totalPie2 > 0 ? ` · ≈ ${planchas.texto} plancha(s)` : ''}</Text>
              {mat.cristales.map((c: any, i: number) => (
                <View key={i} className="flex-row justify-between bg-white rounded-xl border border-gray-200 p-3 mb-2">
                  <Text className="flex-1">{c.cantidad} × {pulgadasTexto(c.ancho)}" × {pulgadasTexto(c.alto)}"</Text>
                  <Text className="font-semibold">{c.pie2.toFixed(2)} pie²</Text>
                </View>
              ))}
            </View>
          );
        })()}

        {tab === 'presupuesto' && (() => {
          if (!medidas.length) return <Text className="text-gray-400 text-center py-6">Primero agrega las medidas.</Text>;
          const calc = presupuestoProyecto(medidas, precios, extras as any, piezasPorSistema);
          const fmt = (v: number) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const crear = async () => {
            setCotizando(true);
            const { data, error } = await supabase.rpc('vent_crear_cotizacion', { p_proyecto: id, p_dias_vigencia: 15 });
            setCotizando(false);
            if (error) { Alert.alert('No se pudo crear la cotización', error.message); return; }
            Alert.alert(`Cotización ${data.numero}`, `${fmt(data.total)} · el proyecto pasó a Cotizado`);
            cargar();
          };
          return (
            <View>
              {calc.faltan.length > 0 && (
                <View className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3">
                  <Text className="text-amber-800 text-sm">Sin precio: {[...new Set(calc.faltan.map((m: any) => nombreSistema(m.sistema_id)))].join(', ')}. Ponlo en la web: Ventanas → Precios.</Text>
                </View>
              )}
              {calc.lineas.map((l: any, i: number) => (
                <View key={i} className="flex-row justify-between bg-white rounded-xl border border-gray-200 p-3 mb-2">
                  <View className="flex-1 pr-2">
                    <Text className="font-semibold">
                      {l.tipo === 'ventana' ? `${pulgadasTexto(l.medida.ancho)}" × ${pulgadasTexto(l.medida.alto)}"` : (l.extra.descripcion || l.extra.productos?.descripcion)}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {l.tipo === 'ventana' ? `${nombreSistema(l.medida.sistema_id)} · ${cobroTexto(l)}` : 'Extra'} · {l.cantidad} × {fmt(l.unitario)}
                    </Text>
                  </View>
                  <Text className="font-bold">{fmt(l.importe)}</Text>
                </View>
              ))}
              <View className="flex-row justify-between items-center bg-blue-50 border border-blue-200 rounded-xl p-4 mt-1">
                <Text className="font-bold">Total (ITBIS incluido)</Text>
                <Text className="font-black text-lg">{fmt(calc.total)}</Text>
              </View>
              <TouchableOpacity onPress={crear} disabled={cotizando || calc.faltan.length > 0}
                className={`rounded-xl py-4 items-center mt-3 ${calc.faltan.length ? 'bg-gray-300' : 'bg-blue-700'}`}>
                {cotizando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">{p.cotizacion_id ? 'Crear cotización nueva' : 'Crear cotización'}</Text>}
              </TouchableOpacity>
            </View>
          );
        })()}

        {tab === 'medidas' && <>
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
        </>}
        <View className="h-10" />
      </ScrollView>
    </View>
  );
}
