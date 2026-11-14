// ============================================================
// Comprobantes de gastos en el teléfono — ayudante contable, Fase 2
// (12/11/2026)
// ------------------------------------------------------------
// Foto de la factura del gasto (supermercado, combustible, servicios…):
// se sube al bucket privado "comprobantes" en la carpeta de la empresa, la
// lee la función leer-comprobante y queda "por revisar". Al aprobarla
// entra al 606 y al ITBIS estimado. Misma tabla y mismas reglas que la web
// (src/pages/ComprobantesGastosPage.jsx, sql/ayudante_contable_fase2.sql).
// La app no puede redimensionar la foto (no hay módulo para eso en esta
// versión): se toma con calidad baja para que pese poco; el bucket no
// acepta más de 2 MB.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ArrowLeft, Camera, CheckCircle2, ImageIcon, Receipt, TriangleAlert, X } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { hoyRD } from '@/src/lib/seguimientos';

type Comprobante = {
  id: string; fecha: string; rnc: string; proveedor_nombre: string | null; ncf: string;
  monto_gravado: number; monto_exento: number; itbis: number; propina: number; total: number;
  estado: 'por_revisar' | 'aprobado' | 'descartado'; avisos: string[]; imagen_path: string | null; entra_606: boolean;
  gasto_id: string | null; forma_pago: string;
};
// Gasto diario (anotado en la web) al que se puede unir el comprobante.
type GastoDiario = { id: string; fecha: string; monto: number; descripcion: string; cuenta_bancaria_id: string | null };

const fmt = (v: any) => `RD$ ${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fdate = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const estadoDe = (f: Comprobante): [string, string] => (
  f.estado === 'por_revisar' ? ['Por revisar', 'text-amber-700']
  : f.estado === 'descartado' ? ['Descartado', 'text-gray-400']
  : f.entra_606 ? ['Aprobado · va al 606', 'text-emerald-700']
  : ['Aprobado · NO entra al 606', 'text-red-700']
);
const fechaValida = (f: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const num = (v: string) => { const n = Number(String(v || '').replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };

export default function ComprobantesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tenantId } = useAuthStore();
  const [filas, setFilas] = useState<Comprobante[]>([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [edit, setEdit] = useState<Comprobante | null>(null);
  const [form, setForm] = useState({ fecha: '', rnc: '', ncf: '', monto_gravado: '', monto_exento: '', itbis: '', total: '' });
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // «¿De qué gasto es?»: gastos recientes sin comprobante, el más parecido primero.
  const [gastos, setGastos] = useState<GastoDiario[]>([]);
  const [gastoSel, setGastoSel] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Lo SUBIDO en los últimos 60 días + todo lo que siga por revisar. Por fecha
    // de subida y no de la factura: si la fecha se leyó mal, no desaparece.
    const desde = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data, error } = await supabase.from('gastos_comprobantes')
      .select('id, fecha, rnc, proveedor_nombre, ncf, monto_gravado, monto_exento, itbis, propina, total, estado, avisos, imagen_path, entra_606, gasto_id, forma_pago')
      .or(`creado_at.gte.${desde},estado.eq.por_revisar`)
      .order('creado_at', { ascending: false }).limit(200);
    if (error) Alert.alert('No se pudieron cargar los comprobantes', error.message);
    else setFilas((data || []) as Comprobante[]);
    setLoading(false);
    setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (uri: string) => {
    if (!tenantId) { Alert.alert('Sin empresa activa'); return; }
    setSubiendo(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (bytes.length > 2 * 1024 * 1024) {
        throw new Error('La foto pesa más de 2 MB. Tómela de nuevo un poco más lejos o con menos luz de fondo.');
      }
      const hoy = hoyRD();
      const path = `${tenantId}/${hoy.slice(0, 4)}/${hoy.slice(5, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: eUp } = await supabase.storage.from('comprobantes').upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
      if (eUp) throw new Error(eUp.message);

      let d: any = {};
      let leida = true;
      const { data: r, error: eFn } = await supabase.functions.invoke('leer-comprobante', { body: { path } });
      if (eFn || !r?.ok) leida = false; else d = r.datos || {};

      const { error: eIns } = await supabase.from('gastos_comprobantes').insert({
        tenant_id: tenantId, fecha: fechaValida(d.fecha) ? d.fecha : hoy, rnc: d.rnc || '', proveedor_nombre: d.proveedor_nombre || null,
        ncf: d.ncf || '', tipo_bs: d.tipo_bs || 2, monto_gravado: d.monto_gravado || 0, monto_exento: d.monto_exento || 0,
        itbis: d.itbis || 0, propina: d.propina || 0, total: d.total || 0, forma_pago: d.forma_pago || '01',
        imagen_path: path, lectura: d, origen: 'app',
      }).select('id');
      if (eIns) {
        // La foto que no llegó a registrarse no se queda ocupando espacio.
        await supabase.storage.from('comprobantes').remove([path]).catch(() => {});
        if (/gastos_comprobantes_unico/.test(eIns.message)) {
          Alert.alert('Ya estaba registrado', 'Ese comprobante (mismo RNC y NCF) ya se había subido. No se repitió.');
        } else throw new Error(eIns.message);
      } else {
        Alert.alert('Comprobante subido', leida
          ? 'Revise los datos y apruébelo para que entre al 606.'
          : 'No se pudo leer la foto: complete los datos a mano y apruébelo.');
      }
      cargar();
    } catch (e: any) {
      Alert.alert('No se pudo subir', e?.message || 'Intente de nuevo.');
    } finally {
      setSubiendo(false);
    }
  };

  const tomarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el permiso de cámara en los ajustes del teléfono.'); return; }
    // Calidad baja a propósito: el comprobante se lee bien y pesa poco.
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.35, allowsEditing: false, exif: false });
    if (!r.canceled && r.assets?.[0]?.uri) subir(r.assets[0].uri);
  };

  const deGaleria = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Activa el permiso de fotos en los ajustes del teléfono.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.35, allowsEditing: false, exif: false });
    if (!r.canceled && r.assets?.[0]?.uri) subir(r.assets[0].uri);
  };

  const abrir = async (f: Comprobante) => {
    setEdit(f);
    setForm({
      fecha: f.fecha, rnc: f.rnc || '', ncf: f.ncf || '',
      monto_gravado: String(f.monto_gravado ?? ''), monto_exento: String(f.monto_exento ?? ''), itbis: String(f.itbis ?? ''), total: String(f.total ?? ''),
    });
    setFotoUrl(null);
    setGastoSel(f.gasto_id || null);
    setGastos([]);
    cargarGastos(f);
    if (f.imagen_path) {
      const { data } = await supabase.storage.from('comprobantes').createSignedUrl(f.imagen_path, 600);
      setFotoUrl(data?.signedUrl || null);
    }
  };

  // Gastos de los 30 días antes de la factura (y 7 después), sin anular, que no
  // tengan ya otro comprobante. El de monto más cercano al total va primero.
  const cargarGastos = async (f: Comprobante) => {
    if (!tenantId) return;
    const d0 = new Date(`${fechaValida(f.fecha) ? f.fecha : hoyRD()}T12:00:00Z`);
    const desde = new Date(d0.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const hasta = new Date(d0.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const [{ data: gs }, { data: usados }] = await Promise.all([
      supabase.from('gastos_diarios').select('id, fecha, monto, descripcion, cuenta_bancaria_id')
        .eq('tenant_id', tenantId).eq('anulado', false).not('es_tercero', 'is', true).gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false }).limit(150),
      supabase.from('gastos_comprobantes').select('gasto_id').not('gasto_id', 'is', null).neq('estado', 'descartado').neq('id', f.id),
    ]);
    const ocupados = new Set((usados || []).map((u: any) => u.gasto_id));
    const total = Number(f.total) || 0;
    const lista = ((gs || []) as GastoDiario[])
      .filter((g) => !ocupados.has(g.id) || g.id === f.gasto_id)
      .sort((a, b) => Math.abs((Number(a.monto) || 0) - total) - Math.abs((Number(b.monto) || 0) - total))
      .slice(0, 8);
    setGastos(lista);
  };

  const guardar = async (estado: 'aprobado' | 'descartado' | null) => {
    if (!edit) return;
    if (!fechaValida(form.fecha)) { Alert.alert('Fecha inválida', 'Escríbala así: 2026-11-12 (año-mes-día).'); return; }
    setGuardando(true);
    const { data, error } = await supabase.from('gastos_comprobantes').update({
      fecha: form.fecha, rnc: form.rnc, ncf: form.ncf,
      monto_gravado: num(form.monto_gravado), monto_exento: num(form.monto_exento), itbis: num(form.itbis), total: num(form.total),
      gasto_id: gastoSel,
      // Gasto pagado desde el banco: en el 606 es transferencia/cheque (02).
      ...(gastoSel && gastos.find((g) => g.id === gastoSel)?.cuenta_bancaria_id && edit.forma_pago === '01' ? { forma_pago: '02' } : {}),
      ...(estado ? { estado } : {}),
    }).eq('id', edit.id).select('id, avisos, entra_606');
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar', /gastos_comprobantes_unico/.test(error.message)
        ? 'Ya hay otro comprobante con ese mismo RNC y NCF.' : error.message);
      return;
    }
    if (!data?.length) { Alert.alert('No se guardó', 'El comprobante ya no existe o no tiene permiso.'); return; }
    const avisos: string[] = (data[0] as any).avisos || [];
    setEdit(null);
    if (estado === 'aprobado' && !(data[0] as any).entra_606) Alert.alert('Aprobado, pero NO entra al 606', avisos.join('\n') || 'Revise el NCF y el RNC.');
    else if (estado === 'aprobado' && avisos.length) Alert.alert('Aprobado con avisos', avisos.join('\n'));
    cargar();
  };

  const porRevisar = filas.filter((f) => f.estado === 'por_revisar').length;

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2">
          <ArrowLeft color="#111827" size={24} />
        </TouchableOpacity>
        <Receipt color="#1d4ed8" size={22} />
        <Text className="text-lg font-bold text-gray-900 ml-2 flex-1">Comprobantes de gastos</Text>
      </View>

      <View className="bg-white px-3 py-3 border-b border-gray-200">
        <View className="flex-row">
          <TouchableOpacity disabled={subiendo} onPress={tomarFoto}
            className="flex-1 flex-row items-center justify-center bg-blue-700 rounded-lg py-3 mr-2">
            {subiendo ? <ActivityIndicator color="#fff" /> : <Camera color="#fff" size={20} />}
            <Text className="text-white font-bold ml-2">{subiendo ? 'Subiendo y leyendo…' : 'Tomar foto de la factura'}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={subiendo} onPress={deGaleria} className="items-center justify-center bg-gray-100 rounded-lg px-4">
            <ImageIcon color="#374151" size={20} />
          </TouchableOpacity>
        </View>
        <Text className="text-[11px] text-gray-500 mt-2">
          Solo facturas con NCF a nombre de la empresa. Que se vean el RNC del negocio, el NCF y el total.
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#1d4ed8" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
        >
          <Text className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
            Últimos 60 días · {porRevisar} por revisar
          </Text>
          {filas.length === 0 && (
            <View className="bg-white border border-gray-200 rounded-xl p-6 items-center">
              <Text className="text-gray-500 text-center">Todavía no hay comprobantes.</Text>
              <Text className="text-gray-400 text-center text-xs mt-1">Tome la foto de la factura cuando haga el gasto.</Text>
            </View>
          )}
          {filas.map((f) => {
            const [txt, tono] = estadoDe(f);
            return (
              <TouchableOpacity key={f.id} onPress={() => abrir(f)} className="bg-white border border-gray-200 rounded-xl p-3 mb-2">
                <View className="flex-row justify-between">
                  <Text className="text-sm font-bold text-gray-900 flex-1 pr-2" numberOfLines={1}>
                    {f.proveedor_nombre || f.rnc || 'Sin suplidor'}
                  </Text>
                  <Text className="text-sm font-bold text-gray-900">{fmt(f.total)}</Text>
                </View>
                <Text className="text-xs text-gray-500 mt-0.5">{fdate(f.fecha)} · {f.ncf || 'sin NCF'} · ITBIS {fmt(f.itbis)}</Text>
                <View className="flex-row items-center mt-1">
                  <Text className={`text-xs font-semibold ${tono}`}>{txt}</Text>
                  {f.estado !== 'descartado' && f.avisos?.length > 0 && (
                    <View className="flex-row items-center ml-2">
                      <TriangleAlert color="#b45309" size={13} />
                      <Text className="text-xs text-amber-700 ml-1">{f.avisos.length} aviso(s)</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Revisar */}
      <Modal visible={!!edit} animationType="slide" onRequestClose={() => setEdit(null)}>
        <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
          <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
            <TouchableOpacity onPress={() => setEdit(null)} className="p-1 mr-2"><X color="#111827" size={24} /></TouchableOpacity>
            <Text className="text-lg font-bold text-gray-900 flex-1">Revisar comprobante</Text>
          </View>
          {edit && (
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
              {fotoUrl
                ? <Image source={{ uri: fotoUrl }} style={{ width: '100%', height: 320 }} resizeMode="contain" />
                : <View className="h-24 items-center justify-center"><Text className="text-xs text-gray-400">{edit.imagen_path ? 'Cargando la foto…' : 'Sin foto'}</Text></View>}
              {edit.avisos?.length > 0 && (
                <View className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
                  {edit.avisos.map((a) => <Text key={a} className="text-xs text-amber-900">• {a}</Text>)}
                </View>
              )}
              {([
                ['ncf', 'NCF', 'default'], ['rnc', 'RNC o cédula del suplidor', 'number-pad'], ['fecha', 'Fecha (año-mes-día)', 'default'],
                ['monto_gravado', 'Monto gravado (sin ITBIS)', 'decimal-pad'], ['monto_exento', 'Monto exento (ej. combustible)', 'decimal-pad'],
                ['itbis', 'ITBIS', 'decimal-pad'], ['total', 'Total', 'decimal-pad'],
              ] as const).map(([k, label, teclado]) => (
                <View key={k} className="mt-2.5">
                  <Text className="text-xs font-semibold text-gray-600 mb-1">{label}</Text>
                  <TextInput
                    value={(form as any)[k]} onChangeText={(t) => setForm((p) => ({ ...p, [k]: t }))}
                    keyboardType={teclado as any} autoCapitalize={k === 'ncf' ? 'characters' : 'none'}
                    className="bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-base text-gray-900"
                  />
                </View>
              ))}
              <Text className="text-xs font-semibold text-gray-600 mt-3 mb-1">¿De qué gasto diario es?</Text>
              {gastos.length === 0 ? (
                <Text className="text-[11px] text-gray-400">No hay gastos diarios recientes sin comprobante.</Text>
              ) : (
                <View className="bg-white border border-gray-200 rounded-lg">
                  {[{ id: null as string | null, fecha: '', monto: 0, descripcion: 'Ninguno (no es de un gasto diario)', cuenta_bancaria_id: null }, ...gastos].map((g, i) => {
                    const sel = gastoSel === g.id;
                    return (
                      <TouchableOpacity key={g.id || 'ninguno'} onPress={() => setGastoSel(g.id)}
                        className={`flex-row items-center px-3 py-2 ${i ? 'border-t border-gray-100' : ''} ${sel ? 'bg-blue-50' : ''}`}>
                        <View className={`w-4 h-4 rounded-full border mr-2 ${sel ? 'bg-blue-600 border-blue-600' : 'border-gray-400'}`} />
                        <Text className="flex-1 text-xs text-gray-800" numberOfLines={1}>
                          {g.id ? `${fdate(g.fecha)} · ${g.descripcion}` : g.descripcion}
                        </Text>
                        {g.id ? <Text className="text-xs font-bold text-gray-900 ml-2">{fmt(g.monto)}</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <Text className="text-[11px] text-gray-500 mt-2">
                Compare con la foto. El tipo de gasto y los demás datos se ajustan en la página web.
              </Text>
              <TouchableOpacity disabled={guardando} onPress={() => guardar('aprobado')}
                className="flex-row items-center justify-center bg-emerald-600 rounded-lg py-3 mt-4">
                {guardando ? <ActivityIndicator color="#fff" /> : <CheckCircle2 color="#fff" size={20} />}
                <Text className="text-white font-bold ml-2">Aprobar</Text>
              </TouchableOpacity>
              <View className="flex-row mt-2">
                <TouchableOpacity disabled={guardando} onPress={() => guardar(null)} className="flex-1 items-center bg-gray-100 rounded-lg py-3 mr-2">
                  <Text className="text-gray-700 font-semibold">Guardar sin aprobar</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={guardando} onPress={() => guardar('descartado')} className="flex-1 items-center bg-red-50 rounded-lg py-3">
                  <Text className="text-red-700 font-semibold">Descartar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}
