// ============================================================
// Seguimientos — "le diste precio y no volvió a escribir" (12/11/2026)
// ------------------------------------------------------------
// El sistema crea solo un seguimiento cuando se dio precio y el cliente
// calló 18 h. Aquí se trabajan desde el teléfono: el mensaje ya viene
// escrito; un toque abre WhatsApp con él (o se copia), y se marca cómo
// quedó. Misma tabla y misma función que la web (Seguimientos de Hoy):
// todo se escribe por crm_upsert_seguimiento.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Check, Copy, MessageCircle, Repeat, X } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import {
  Seguimiento, cuandoSeLeDio, enlaceWhatsApp, hoyRD, mensajeDeSeguimiento,
  precioQueSeLeDio, sumarDias, tocaHoy,
} from '@/src/lib/seguimientos';

const CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Messenger', tiktok: 'TikTok', tienda: 'Tienda',
};
const ESTADO: Record<string, string> = {
  nuevo: 'Nuevo', interesado: 'Interesado', precio_enviado: 'Precio enviado', pendiente_pago: 'Pendiente de pago',
  prometio_pasar: 'Prometió pasar', requiere_aprobacion: 'Requiere aprobación', agotado_solicitado: 'Agotado solicitado',
};

export default function SeguimientosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fichas, setFichas] = useState<Seguimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verDespues, setVerDespues] = useState(false);
  const hoy = hoyRD();

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('crm_seguimiento')
      .select('id, cliente_nombre, telefono, canal_origen, producto_consultado, codigo_producto, estado, prioridad, proxima_accion, fecha_seguimiento, notas, creado_por, creado_en')
      .not('estado', 'in', '(comprado,perdido)')
      .order('creado_en', { ascending: false })
      .limit(300);
    if (error) Alert.alert('No se pudieron cargar los seguimientos', error.message);
    else setFichas((data || []) as Seguimiento[]);
    setLoading(false);
    setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const { paraHoy, despues } = useMemo(() => {
    const a: Seguimiento[] = [], b: Seguimiento[] = [];
    for (const f of fichas) (tocaHoy(f, hoy) ? a : b).push(f);
    // Primero los de "precio sin respuesta": son los que traen mensaje listo.
    a.sort((x, y) => Number(y.estado === 'precio_enviado') - Number(x.estado === 'precio_enviado'));
    return { paraHoy: a, despues: b };
  }, [fichas, hoy]);

  // ÚNICA vía de escritura del CRM (igual que la web): crm_upsert_seguimiento.
  // Identifica la ficha por teléfono + producto; lo que va en null no se toca.
  const guardar = async (f: Seguimiento, cambios: { estado?: string; fecha?: string; nota: string }) => {
    if (!f.telefono) {
      Alert.alert('Sin teléfono', 'Esta ficha no tiene teléfono: se gestiona desde la página web.');
      return;
    }
    setOcupado(f.id);
    const { error } = await supabase.rpc('crm_upsert_seguimiento', {
      p_telefono: f.telefono,
      p_producto: f.producto_consultado,
      p_codigo: f.codigo_producto,
      p_estado: cambios.estado ?? null,
      p_prioridad: null,
      p_proxima_accion: null,
      p_fecha_seguimiento: cambios.fecha ?? null,
      p_nota: cambios.nota,
      p_solicitud_id: null,
      p_creado_por: 'web',
    });
    setOcupado(null);
    if (error) { Alert.alert('No se pudo guardar', error.message); return; }
    cargar();
  };

  const leEscribi = (f: Seguimiento) =>
    guardar(f, { fecha: sumarDias(hoy, 2), nota: 'Se le escribió para dar seguimiento (app).' });

  const noQuiso = (f: Seguimiento) =>
    Alert.alert('¿No quiso?', `${f.cliente_nombre || 'El cliente'} sale de los seguimientos como "perdido".`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, no quiso', style: 'destructive', onPress: () => guardar(f, { estado: 'perdido', nota: 'No quiso (marcado desde la app).' }) },
    ]);

  const copiar = async (texto: string) => {
    await Clipboard.setStringAsync(texto);
    Alert.alert('Mensaje copiado', 'Pégalo en el chat del cliente.');
  };

  const abrirWhatsApp = async (url: string, texto: string) => {
    try { await Linking.openURL(url); }
    catch { await copiar(texto); }
  };

  const tarjeta = (f: Seguimiento) => {
    const esPrecio = f.estado === 'precio_enviado';
    const precio = precioQueSeLeDio(f.notas);
    const cuando = cuandoSeLeDio(f.notas);
    const mensaje = mensajeDeSeguimiento(f);
    const url = esPrecio ? enlaceWhatsApp(f, mensaje) : null;
    const trabajando = ocupado === f.id;
    return (
      <View key={f.id} className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
        <View className="flex-row items-start">
          <View className="flex-1 min-w-0">
            <Text className="text-base font-bold text-gray-900" numberOfLines={1}>{f.cliente_nombre || 'Cliente'}</Text>
            <Text className="text-xs text-gray-500">
              {CANAL[f.canal_origen || ''] || f.canal_origen || '—'} · {ESTADO[f.estado] || f.estado}
              {f.fecha_seguimiento && f.fecha_seguimiento < hoy ? ' · vencido' : ''}
            </Text>
          </View>
          {trabajando && <ActivityIndicator color="#059669" />}
        </View>

        {esPrecio ? (
          <>
            <Text className="text-sm text-gray-700 mt-2">
              Le diste precio{cuando ? ` el ${cuando}` : ''} y no volvió a escribir.
            </Text>
            {!!precio && <Text className="text-sm text-gray-900 font-semibold mt-1">Precio: «{precio}»</Text>}
            <View className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mt-2">
              <Text className="text-[13px] text-emerald-900">{mensaje}</Text>
            </View>
            <View className="flex-row mt-2.5">
              {url ? (
                <TouchableOpacity disabled={trabajando} onPress={() => abrirWhatsApp(url, mensaje)}
                  className="flex-1 flex-row items-center justify-center bg-emerald-600 rounded-lg py-2.5 mr-2">
                  <MessageCircle color="#fff" size={18} />
                  <Text className="text-white font-bold ml-2">Abrir WhatsApp</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity disabled={trabajando} onPress={() => copiar(mensaje)}
                className={`flex-row items-center justify-center rounded-lg py-2.5 px-4 ${url ? 'bg-gray-100' : 'flex-1 bg-emerald-600'}`}>
                <Copy color={url ? '#374151' : '#fff'} size={18} />
                <Text className={`font-bold ml-2 ${url ? 'text-gray-700' : 'text-white'}`}>Copiar</Text>
              </TouchableOpacity>
            </View>
            {!url && (
              <Text className="text-[11px] text-gray-500 mt-1.5">
                Copia el mensaje y búscalo en WhatsApp por su nombre.
              </Text>
            )}
          </>
        ) : (
          <>
            {!!f.producto_consultado && <Text className="text-sm text-gray-800 mt-2">{f.producto_consultado}</Text>}
            {!!f.proxima_accion && <Text className="text-sm text-emerald-700 mt-1">→ {f.proxima_accion}</Text>}
          </>
        )}

        <View className="flex-row mt-2.5 pt-2.5 border-t border-gray-100">
          <TouchableOpacity disabled={trabajando} onPress={() => leEscribi(f)}
            className="flex-1 flex-row items-center justify-center py-1.5 mr-2">
            <Check color="#059669" size={16} />
            <Text className="text-emerald-700 font-semibold ml-1.5 text-sm">Ya le escribí</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={trabajando} onPress={() => noQuiso(f)}
            className="flex-1 flex-row items-center justify-center py-1.5">
            <X color="#dc2626" size={16} />
            <Text className="text-red-600 font-semibold ml-1.5 text-sm">No quiso</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2">
          <ArrowLeft color="#111827" size={24} />
        </TouchableOpacity>
        <Repeat color="#059669" size={22} />
        <Text className="text-lg font-bold text-gray-900 ml-2 flex-1">Seguimientos</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
        >
          <Text className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
            Para hoy ({paraHoy.length})
          </Text>
          {paraHoy.length === 0 ? (
            <View className="bg-white border border-gray-200 rounded-xl p-6 mb-3 items-center">
              <Text className="text-gray-500 text-center">No hay seguimientos para hoy.</Text>
              <Text className="text-gray-400 text-center text-xs mt-1">
                Aparecen solos cuando das un precio y el cliente no vuelve a escribir.
              </Text>
            </View>
          ) : paraHoy.map(tarjeta)}

          {despues.length > 0 && (
            <>
              <TouchableOpacity onPress={() => setVerDespues((v) => !v)} className="py-2">
                <Text className="text-xs font-black text-gray-500 uppercase tracking-wider">
                  Más adelante ({despues.length}) · {verDespues ? 'ocultar' : 'ver'}
                </Text>
              </TouchableOpacity>
              {verDespues && despues.map(tarjeta)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
