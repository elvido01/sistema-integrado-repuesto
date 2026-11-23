import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, Modal, ScrollView, FlatList,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ShieldCheck, Search, X, Receipt, Building2, CheckCircle2, XCircle } from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  fetchEmpresasAdmin, fetchPlanes, fetchPagosPendientes, aprobarPago, rechazarPago,
  registrarPago, cambiarPlan, extenderSuscripcion, activarEmpresa, suspenderEmpresa, enlaceComprobante,
  type EmpresaAdmin, type Plan, type PagoPendiente, type RegistrarPagoInput,
} from '@/src/services/superadminService';

// (23/11/2026) Panel de super administrador en la app: revisar los pagos que
// suben los clientes, registrar pagos en efectivo/transferencia, cambiar plan,
// dar días y activar/suspender. Solo lo ve is_superadmin (el servidor también
// lo exige en cada RPC).

// '1,950.50', '1950,50' (teclado en español) y '1950' → número; '' → NaN.
function leerMonto(txt: string): number {
  let t = String(txt || '').trim().replace(/\s/g, '');
  if (!t) return NaN;
  // Termina en coma + 1-2 cifras: la coma es el decimal y los puntos, miles.
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(/,(\d{1,2})$/, '.$1');
  t = t.replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const money = (n?: number | null) => `RD$${Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;
const fecha = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
};

type Filtro = 'todas' | 'vencidas' | 'por_vencer' | 'trial' | 'activas';
const FILTROS: { k: Filtro; label: string }[] = [
  { k: 'todas', label: 'Todas' },
  { k: 'vencidas', label: 'Vencidas' },
  { k: 'por_vencer', label: 'Vencen en 7 días' },
  { k: 'trial', label: 'En prueba' },
  { k: 'activas', label: 'Al día' },
];

function estadoDe(e: EmpresaAdmin): { texto: string; color: string; fondo: string } {
  const s = e.suscripcion;
  if (!e.activo) return { texto: 'Suspendida', color: 'text-gray-700', fondo: 'bg-gray-200' };
  if (!s || s.estado === 'vencido') return { texto: 'Vencida', color: 'text-red-700', fondo: 'bg-red-100' };
  if (s.estado === 'trial') return { texto: `Prueba · ${s.dias_restantes ?? 0} d`, color: 'text-amber-800', fondo: 'bg-amber-100' };
  if ((s.dias_restantes ?? 0) <= 7) return { texto: `Vence en ${s.dias_restantes ?? 0} d`, color: 'text-orange-800', fondo: 'bg-orange-100' };
  return { texto: `Al día · ${s.dias_restantes ?? 0} d`, color: 'text-emerald-800', fondo: 'bg-emerald-100' };
}

function Chip({ activo, onPress, children }: { activo: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity onPress={onPress}
      className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${activo ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-300'}`}>
      <Text className={`text-xs font-bold ${activo ? 'text-white' : 'text-gray-700'}`}>{children}</Text>
    </TouchableOpacity>
  );
}

export default function SuperAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const esSuper = !!profile?.is_superadmin;

  const [tab, setTab] = useState<'pagos' | 'empresas'>('pagos');
  const [empresas, setEmpresas] = useState<EmpresaAdmin[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [pagos, setPagos] = useState<PagoPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [abierta, setAbierta] = useState<EmpresaAdmin | null>(null);

  const cargar = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const [e, p, pg] = await Promise.all([fetchEmpresasAdmin(), fetchPlanes(), fetchPagosPendientes()]);
      setEmpresas(e); setPlanes(p); setPagos(pg);
      setAbierta((a) => (a ? e.find((x) => x.id === a.id) || null : null));
    } catch (err: any) {
      Alert.alert('Super Admin', err?.message || 'No se pudo cargar.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (esSuper) cargar(); else setLoading(false); }, [esSuper, cargar]);
  useEffect(() => { if (!loading && pagos.length === 0) setTab((t) => (t === 'pagos' ? 'empresas' : t)); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => {
    const vencidas = empresas.filter((e) => e.activo && (!e.suscripcion || e.suscripcion.estado === 'vencido')).length;
    const porVencer = empresas.filter((e) => e.activo && e.suscripcion?.estado === 'activo' && (e.suscripcion.dias_restantes ?? 0) <= 7).length;
    const mrr = empresas.filter((e) => e.activo && e.suscripcion?.estado === 'activo')
      .reduce((s, e) => s + Number(e.suscripcion?.plan_precio || 0), 0);
    return { vencidas, porVencer, mrr };
  }, [empresas]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empresas
      .filter((e) => !q || [e.nombre, e.email, e.rnc, e.telefono].some((v) => String(v || '').toLowerCase().includes(q)))
      .filter((e) => {
        const s = e.suscripcion;
        if (filtro === 'vencidas') return e.activo && (!s || s.estado === 'vencido');
        if (filtro === 'por_vencer') return e.activo && s?.estado === 'activo' && (s.dias_restantes ?? 0) <= 7;
        if (filtro === 'trial') return s?.estado === 'trial';
        if (filtro === 'activas') return e.activo && s?.estado === 'activo';
        return true;
      })
      .sort((a, b) => (a.suscripcion?.dias_restantes ?? -1) - (b.suscripcion?.dias_restantes ?? -1));
  }, [empresas, busqueda, filtro]);

  if (!esSuper) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center p-8" style={{ paddingTop: insets.top }}>
        <ShieldCheck color="#9ca3af" size={48} />
        <Text className="text-gray-500 text-center mt-4">Solo el super administrador puede ver esta pantalla.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2">
          <ArrowLeft color="#111827" size={24} />
        </TouchableOpacity>
        <ShieldCheck color="#7c3aed" size={22} />
        <Text className="text-lg font-bold text-gray-900 ml-2 flex-1">Super Admin</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#7c3aed" /></View>
      ) : (
        <>
          <View className="flex-row px-4 pt-3 gap-2">
            <View className="flex-1 bg-white rounded-xl border border-gray-200 p-3">
              <Text className="text-[10px] font-black text-gray-500 uppercase">Cobro mensual</Text>
              <Text className="text-base font-black text-gray-900" numberOfLines={1} adjustsFontSizeToFit>{money(resumen.mrr)}</Text>
            </View>
            <View className="flex-1 bg-white rounded-xl border border-gray-200 p-3">
              <Text className="text-[10px] font-black text-gray-500 uppercase">Vencidas</Text>
              <Text className="text-base font-black text-red-600">{resumen.vencidas}</Text>
            </View>
            <View className="flex-1 bg-white rounded-xl border border-gray-200 p-3">
              <Text className="text-[10px] font-black text-gray-500 uppercase">Vencen ≤7 d</Text>
              <Text className="text-base font-black text-orange-600">{resumen.porVencer}</Text>
            </View>
          </View>

          <View className="flex-row mx-4 mt-3 bg-gray-200 rounded-xl p-1">
            {(['pagos', 'empresas'] as const).map((t) => (
              <TouchableOpacity key={t} onPress={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg items-center ${tab === t ? 'bg-white' : ''}`}>
                <Text className={`font-bold text-sm ${tab === t ? 'text-violet-700' : 'text-gray-600'}`}>
                  {t === 'pagos' ? `Pagos por revisar${pagos.length ? ` (${pagos.length})` : ''}` : `Empresas (${empresas.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'pagos' ? (
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargar(true)} />}>
              {pagos.length === 0 ? (
                <View className="items-center py-12">
                  <Receipt color="#9ca3af" size={40} />
                  <Text className="text-gray-500 mt-3 text-center">No hay comprobantes por revisar.{'\n'}Los pagos en efectivo se registran desde la empresa.</Text>
                </View>
              ) : pagos.map((p) => <TarjetaPago key={p.id} pago={p} onHecho={() => cargar(true)} />)}
            </ScrollView>
          ) : (
            <>
              <View className="px-4 pt-3">
                <View className="flex-row items-center bg-white border border-gray-300 rounded-xl px-3">
                  <Search size={18} color="#6b7280" />
                  <TextInput value={busqueda} onChangeText={setBusqueda} placeholder="Nombre, RNC, correo o teléfono"
                    className="flex-1 py-2.5 px-2 text-sm text-gray-900" placeholderTextColor="#9ca3af" />
                  {!!busqueda && <TouchableOpacity onPress={() => setBusqueda('')}><X size={18} color="#6b7280" /></TouchableOpacity>}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                  {FILTROS.map((f) => <Chip key={f.k} activo={filtro === f.k} onPress={() => setFiltro(f.k)}>{f.label}</Chip>)}
                </ScrollView>
              </View>
              <FlatList
                data={lista}
                keyExtractor={(e) => e.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargar(true)} />}
                ListEmptyComponent={<Text className="text-center text-gray-500 py-10">Ninguna empresa con ese filtro.</Text>}
                renderItem={({ item: e }) => {
                  const est = estadoDe(e);
                  return (
                    <TouchableOpacity onPress={() => setAbierta(e)} activeOpacity={0.7}
                      className="bg-white border border-gray-200 rounded-xl p-3 mb-2">
                      <View className="flex-row items-center">
                        <Text className="flex-1 font-black text-gray-900" numberOfLines={1}>{e.nombre}</Text>
                        <View className={`px-2 py-0.5 rounded-full ${est.fondo}`}>
                          <Text className={`text-[10px] font-black ${est.color}`}>{est.texto}</Text>
                        </View>
                      </View>
                      <Text className="text-xs text-gray-500 mt-1" numberOfLines={1}>
                        {(e.suscripcion?.plan_nombre || e.plan || 'Sin plan').toUpperCase()} · vence {fecha(e.suscripcion?.fecha_fin)} · {e.total_usuarios} usuarios
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </>
      )}

      <EmpresaModal empresa={abierta} planes={planes} onClose={() => setAbierta(null)} onCambio={() => cargar(true)} />
    </View>
  );
}

function TarjetaPago({ pago, onHecho }: { pago: PagoPendiente; onHecho: () => void }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const aprobar = () => Alert.alert('Aprobar pago', `${pago.empresa_nombre}: ${money(pago.monto)} por el plan ${pago.plan_nombre}. ¿Activar el plan?`, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Aprobar', onPress: async () => {
        setTrabajando(true);
        try { await aprobarPago(pago.id); onHecho(); } catch (e: any) { Alert.alert('Error', e?.message); } finally { setTrabajando(false); }
      },
    },
  ]);

  const rechazar = async () => {
    setTrabajando(true);
    try { await rechazarPago(pago.id, motivo.trim()); onHecho(); } catch (e: any) { Alert.alert('Error', e?.message); } finally { setTrabajando(false); }
  };

  return (
    <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="font-black text-gray-900">{pago.empresa_nombre}</Text>
          <Text className="text-xs text-gray-500">{pago.plan_nombre} · {pago.ciclo || 'mensual'} · {fecha(pago.created_at)}</Text>
        </View>
        <Text className="text-lg font-black text-gray-900">{money(pago.monto)}</Text>
      </View>
      <Text className="text-xs text-gray-600 mt-2">
        {[pago.banco_origen && `Banco: ${pago.banco_origen}`, pago.titular_cuenta && `Titular: ${pago.titular_cuenta}`, pago.referencia && `Ref: ${pago.referencia}`].filter(Boolean).join(' · ') || 'Sin datos de la transferencia'}
      </Text>
      {Number(pago.monto) < Number(pago.plan_precio) && (
        <Text className="text-xs font-bold text-amber-700 mt-1">Ojo: el plan cuesta {money(pago.plan_precio)}</Text>
      )}
      {!!pago.comprobante_url && (
        <TouchableOpacity className="mt-2" onPress={async () => {
          const url = await enlaceComprobante(pago.comprobante_url);
          if (url) Linking.openURL(url);
        }}>
          <Text className="text-violet-700 font-bold text-sm">Ver comprobante</Text>
        </TouchableOpacity>
      )}

      {rechazando ? (
        <View className="mt-3">
          <TextInput value={motivo} onChangeText={setMotivo} placeholder="Motivo (ej: comprobante borroso)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholderTextColor="#9ca3af" />
          <View className="flex-row mt-2 gap-2">
            <TouchableOpacity onPress={() => setRechazando(false)} className="flex-1 py-2.5 rounded-lg bg-gray-100 items-center">
              <Text className="font-bold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={rechazar} disabled={trabajando} className="flex-1 py-2.5 rounded-lg bg-red-600 items-center">
              <Text className="font-bold text-white">Rechazar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="flex-row mt-3 gap-2">
          <TouchableOpacity onPress={() => setRechazando(true)} disabled={trabajando}
            className="flex-1 py-2.5 rounded-lg border border-red-300 flex-row items-center justify-center">
            <XCircle size={16} color="#dc2626" /><Text className="font-bold text-red-600 ml-1">Rechazar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={aprobar} disabled={trabajando}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 flex-row items-center justify-center">
            {trabajando ? <ActivityIndicator color="#fff" size="small" /> : <><CheckCircle2 size={16} color="#fff" /><Text className="font-bold text-white ml-1">Aprobar</Text></>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const METODOS: RegistrarPagoInput['metodo'][] = ['efectivo', 'transferencia', 'deposito', 'tarjeta'];

function EmpresaModal({ empresa, planes, onClose, onCambio }: {
  empresa: EmpresaAdmin | null; planes: Plan[]; onClose: () => void; onCambio: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pagables = planes.filter((p) => !['TRIAL', 'FREE'].includes(p.nombre.toUpperCase()));
  const [plan, setPlan] = useState('');
  const [meses, setMeses] = useState(1);
  const [monto, setMonto] = useState('');
  const [montoTocado, setMontoTocado] = useState(false);
  const [metodo, setMetodo] = useState<RegistrarPagoInput['metodo']>('efectivo');
  const [referencia, setReferencia] = useState('');
  const [dias, setDias] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (!empresa) return;
    const actual = (empresa.suscripcion?.plan_nombre || empresa.plan || '').toUpperCase();
    setPlan(pagables.some((p) => p.nombre.toUpperCase() === actual) ? actual : (pagables[0]?.nombre.toUpperCase() || ''));
    setMeses(1); setMontoTocado(false); setMetodo('efectivo'); setReferencia(''); setDias('');
  }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const precio = pagables.find((p) => p.nombre.toUpperCase() === plan)?.precio || 0;
  useEffect(() => { if (!montoTocado) setMonto(String(precio * meses)); }, [precio, meses, montoTocado]);

  if (!empresa) return null;
  const est = estadoDe(empresa);
  const s = empresa.suscripcion;

  const hacer = async (fn: () => Promise<any>, ok: string | ((r: any) => string)) => {
    setTrabajando(true);
    try {
      const r = await fn();
      Alert.alert('Listo', typeof ok === 'function' ? ok(r) : ok);
      onCambio();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo.');
    } finally { setTrabajando(false); }
  };

  const registrar = () => {
    const m = leerMonto(monto);
    if (!plan) return Alert.alert('Falta el plan', 'Escoge el plan que pagó.');
    if (!(m > 0)) return Alert.alert('Monto', 'Escribe el monto recibido (mayor que cero). Si es cortesía, usa «Dar días».');
    Alert.alert('Registrar pago', `${empresa.nombre}\n${plan} · ${meses} ${meses === 1 ? 'mes' : 'meses'} · ${money(m)} (${metodo})`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Registrar', onPress: () => hacer(
          () => registrarPago({ tenantId: empresa.id, plan, meses, monto: m, metodo, referencia: referencia.trim() }),
          (r) => `Pago registrado. ${r?.plan || plan} activo hasta ${fecha(r?.fecha_fin)}.`,
        ),
      },
    ]);
  };

  return (
    <Modal visible={!!empresa} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
        <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
          <Building2 color="#7c3aed" size={22} />
          <Text className="text-lg font-bold text-gray-900 ml-2 flex-1" numberOfLines={1}>{empresa.nombre}</Text>
          <TouchableOpacity onPress={onClose} className="p-1"><X color="#111827" size={24} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {/* Estado */}
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-black text-gray-900">{(s?.plan_nombre || empresa.plan || 'Sin plan').toUpperCase()}</Text>
              <View className={`px-2 py-0.5 rounded-full ${est.fondo}`}><Text className={`text-[10px] font-black ${est.color}`}>{est.texto}</Text></View>
            </View>
            <Text className="text-xs text-gray-600 mt-2">Vence: {fecha(s?.fecha_fin)}{s?.monto_pagado ? ` · último pago ${money(s.monto_pagado)} (${s.metodo_pago || '—'})` : ''}</Text>
            <Text className="text-xs text-gray-600 mt-1">
              {[empresa.rnc && `RNC ${empresa.rnc}`, empresa.telefono, empresa.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
            </Text>
            <Text className="text-xs text-gray-600 mt-1">{empresa.total_usuarios} usuarios · {empresa.total_productos} productos · ventas del mes {money(empresa.total_ventas_mes)}</Text>
          </View>

          {/* Registrar pago */}
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <Text className="font-black text-gray-900 mb-1">Registrar pago</Text>
            <Text className="text-xs text-gray-500 mb-3">Efectivo o transferencia que el cliente no subió. Si paga antes de vencer, los días que le quedaban se suman.</Text>
            <Text className="text-[11px] font-bold text-gray-600 mb-1">PLAN</Text>
            <View className="flex-row flex-wrap">
              {pagables.map((p) => (
                <Chip key={p.id} activo={plan === p.nombre.toUpperCase()} onPress={() => setPlan(p.nombre.toUpperCase())}>
                  {p.nombre} · {money(p.precio)}
                </Chip>
              ))}
            </View>
            <Text className="text-[11px] font-bold text-gray-600 mt-2 mb-1">MESES</Text>
            <View className="flex-row flex-wrap">
              {[1, 2, 3, 6, 12].map((m) => <Chip key={m} activo={meses === m} onPress={() => setMeses(m)}>{m === 12 ? '1 año' : `${m} ${m === 1 ? 'mes' : 'meses'}`}</Chip>)}
            </View>
            <Text className="text-[11px] font-bold text-gray-600 mt-2 mb-1">MONTO RECIBIDO (RD$)</Text>
            <TextInput value={monto} onChangeText={(v) => { setMonto(v); setMontoTocado(true); }} keyboardType="decimal-pad"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base font-bold text-gray-900" />
            {montoTocado && leerMonto(monto) !== precio * meses && (
              <TouchableOpacity onPress={() => setMontoTocado(false)}>
                <Text className="text-xs text-violet-700 mt-1">Precio del plan: {money(precio * meses)} (tocar para usarlo)</Text>
              </TouchableOpacity>
            )}
            <Text className="text-[11px] font-bold text-gray-600 mt-3 mb-1">MÉTODO</Text>
            <View className="flex-row flex-wrap">
              {METODOS.map((m) => <Chip key={m} activo={metodo === m} onPress={() => setMetodo(m)}>{m[0].toUpperCase() + m.slice(1)}</Chip>)}
            </View>
            <TextInput value={referencia} onChangeText={setReferencia} placeholder="Referencia o nota (opcional)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 mt-1" placeholderTextColor="#9ca3af" />
            <TouchableOpacity onPress={registrar} disabled={trabajando} className="mt-3 py-3 rounded-lg bg-emerald-600 items-center">
              {trabajando ? <ActivityIndicator color="#fff" /> : <Text className="font-black text-white">Registrar pago</Text>}
            </TouchableOpacity>
          </View>

          {/* Cambiar plan */}
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <Text className="font-black text-gray-900 mb-1">Cambiar plan</Text>
            <Text className="text-xs text-gray-500 mb-3">Corrige el tipo de plan sin registrar pago. Empieza de nuevo con la duración del plan (30 días; Free no vence).</Text>
            <View className="flex-row flex-wrap">
              {planes.map((p) => (
                <Chip key={p.id} activo={(s?.plan_nombre || '').toUpperCase() === p.nombre.toUpperCase()}
                  onPress={() => Alert.alert('Cambiar plan', `¿Pasar ${empresa.nombre} al plan ${p.nombre}?`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Cambiar', onPress: () => hacer(() => cambiarPlan(empresa.id, p.nombre), `Ahora está en ${p.nombre}.`) },
                  ])}>
                  {p.nombre}
                </Chip>
              ))}
            </View>
          </View>

          {/* Dar días */}
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <Text className="font-black text-gray-900 mb-1">Dar días</Text>
            <Text className="text-xs text-gray-500 mb-3">Alarga la suscripción actual sin cobrar (cortesía o espera de pago).</Text>
            <View className="flex-row items-center gap-2">
              {[7, 15, 30].map((d) => <Chip key={d} activo={dias === String(d)} onPress={() => setDias(String(d))}>{d} días</Chip>)}
              <TextInput value={dias} onChangeText={(v) => setDias(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Otro"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 w-20 mb-2" placeholderTextColor="#9ca3af" />
            </View>
            <TouchableOpacity disabled={trabajando || !(Number(dias) > 0)}
              onPress={() => hacer(() => extenderSuscripcion(empresa.id, Number(dias)), `+${dias} días.`)}
              className={`mt-1 py-2.5 rounded-lg items-center ${Number(dias) > 0 ? 'bg-violet-600' : 'bg-gray-200'}`}>
              <Text className={`font-bold ${Number(dias) > 0 ? 'text-white' : 'text-gray-500'}`}>Dar {dias || '…'} días</Text>
            </TouchableOpacity>
          </View>

          {/* Activar / suspender */}
          {empresa.activo ? (
            <TouchableOpacity disabled={trabajando}
              onPress={() => Alert.alert('Suspender', `¿Suspender ${empresa.nombre}? Sus usuarios no podrán entrar.`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Suspender', style: 'destructive', onPress: () => hacer(() => suspenderEmpresa(empresa.id), 'Empresa suspendida.') },
              ])}
              className="py-3 rounded-xl border border-red-300 items-center bg-white">
              <Text className="font-bold text-red-600">Suspender empresa</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity disabled={trabajando} onPress={() => hacer(() => activarEmpresa(empresa.id), 'Empresa activada.')}
              className="py-3 rounded-xl bg-emerald-600 items-center">
              <Text className="font-bold text-white">Activar empresa</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
