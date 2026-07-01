import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Check, CreditCard, Search, UserRound, Wallet } from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  buscarClientesFinanciera,
  ClienteFinanciera,
  CuotaFinanciera,
  debugFinancieraExterna,
  FinancieraDebugResumen,
  EstadoPrestamosFinanciera,
  getPrestamosClienteFinanciera,
  registrarPagoPrestamoFinanciera,
} from '@/src/services/reciboPagoFinancieraService';
import { formatFechaDMY } from '@/src/utils/formatDate';

const money = (value: number) =>
  `RD$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function ReciboPagoFinancieraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuthStore();
  const [cliente, setCliente] = useState<ClienteFinanciera | null>(null);
  const [estado, setEstado] = useState<EstadoPrestamosFinanciera | null>(null);
  const [loadingEstado, setLoadingEstado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientes, setClientes] = useState<ClienteFinanciera[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [debugFinanciera, setDebugFinanciera] = useState<FinancieraDebugResumen | null>(null);
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [cuenta, setCuenta] = useState('');
  const [banco, setBanco] = useState('');
  const [comentarios, setComentarios] = useState('');

  const cobrador = profile?.nombre_completo || profile?.full_name || user?.email || null;
  const montoNumber = Number(String(monto).replace(/,/g, '')) || 0;
  const cuotas = useMemo(() => estado?.cuotas || [], [estado?.cuotas]);

  useEffect(() => {
    if (!clientModalOpen) return;
    debugFinancieraExterna().then(setDebugFinanciera).catch(() => setDebugFinanciera(null));
    setLoadingClientes(true);
    const timer = setTimeout(async () => {
      try {
        const data = await buscarClientesFinanciera(clientSearch);
        setClientes(data);
      } catch (error: any) {
        Alert.alert('Clientes', error?.message || 'No se pudieron buscar clientes.');
      } finally {
        setLoadingClientes(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientModalOpen, clientSearch]);

  const loadEstado = async (selected: ClienteFinanciera) => {
    setCliente(selected);
    setClientModalOpen(false);
    setLoadingEstado(true);
    try {
      const data = await getPrestamosClienteFinanciera(selected.id);
      setEstado(data);
      setMonto(data.balance_total > 0 ? String(data.balance_total.toFixed(2)) : '');
    } catch (error: any) {
      setEstado(null);
      Alert.alert('Prestamos', error?.message || 'No se pudo cargar el balance del cliente.');
    } finally {
      setLoadingEstado(false);
    }
  };

  const handleSave = async () => {
    if (!cliente) {
      Alert.alert('Cliente requerido', 'Selecciona el cliente de Motoprestamos Los Naranjos.');
      return;
    }
    if (montoNumber <= 0) {
      Alert.alert('Monto requerido', 'Indica el monto recibido.');
      return;
    }

    setSaving(true);
    try {
      const result = await registrarPagoPrestamoFinanciera({
        clienteId: cliente.id,
        monto: montoNumber,
        fecha,
        cobrador,
        formaPago,
        cuenta,
        banco,
        comentarios,
      });
      const refreshed = await getPrestamosClienteFinanciera(cliente.id);
      setEstado(refreshed);
      setMonto('');
      setComentarios('');
      Alert.alert(
        'Pago registrado',
        `Recibo ${result.numero}\nPagado: ${money(result.total_pagado)}\nBalance actual: ${money(result.balance_actual)}`
      );
    } catch (error: any) {
      Alert.alert('No se pudo registrar', error?.message || 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const renderCuota = ({ item }: { item: CuotaFinanciera }) => (
    <View className="rounded-xl border border-gray-200 bg-white p-3 mb-2">
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-3">
          <Text className="text-gray-900 font-bold">Prestamo {item.prestamo_numero || '-'}</Text>
          <Text className="text-gray-500 text-xs mt-1">Cuota {item.referencia || '-'}</Text>
          <Text className="text-gray-500 text-xs">Vence {item.fecha_vencimiento ? formatFechaDMY(item.fecha_vencimiento) : '-'}</Text>
        </View>
        <View className="items-end">
          {item.vencida ? (
            <Text className="text-red-600 text-xs font-bold mb-1">Vencida</Text>
          ) : (
            <Text className="text-emerald-600 text-xs font-bold mb-1">Al dia</Text>
          )}
          <Text className="text-gray-900 font-bold">{money(item.pendiente)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="bg-brand px-4 py-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center mr-2">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white text-xl font-bold">Recibo de Pago</Text>
          <Text className="text-blue-100 text-xs">Motoprestamos Los Naranjos</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 150 }}
        >
          <TouchableOpacity
            className="bg-white border border-gray-200 rounded-xl p-4 flex-row items-center mb-4"
            onPress={() => setClientModalOpen(true)}
          >
            <View className="w-11 h-11 rounded-full bg-blue-50 items-center justify-center mr-3">
              <UserRound color="#1d4ed8" size={22} />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-gray-500 font-bold uppercase">Cliente financiera</Text>
              <Text className="text-gray-900 font-bold text-base">{cliente?.nombre || 'Buscar cliente'}</Text>
              {cliente ? (
                <Text className="text-gray-500 text-xs">{cliente.codigo || cliente.rnc || cliente.telefono || ''}</Text>
              ) : (
                <Text className="text-gray-500 text-xs">Clientes registrados en Motoprestamos</Text>
              )}
            </View>
            <Search color="#64748b" size={22} />
          </TouchableOpacity>

          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <View className="flex-row items-center mb-3">
              <View className="w-10 h-10 rounded-full bg-emerald-50 items-center justify-center mr-3">
                <Wallet color="#059669" size={22} />
              </View>
              <View>
                <Text className="text-xs text-gray-500 font-bold uppercase">Balance pendiente</Text>
                <Text className="text-2xl font-bold text-gray-900">
                  {loadingEstado ? 'Cargando...' : money(estado?.balance_total || 0)}
                </Text>
              </View>
            </View>
            <View className="flex-row justify-between border-t border-gray-100 pt-3">
              <View>
                <Text className="text-xs text-gray-500">Capital</Text>
                <Text className="font-bold text-gray-800">{money(estado?.capital_pendiente || 0)}</Text>
              </View>
              <View>
                <Text className="text-xs text-gray-500">Interes</Text>
                <Text className="font-bold text-gray-800">{money(estado?.intereses_pendientes || 0)}</Text>
              </View>
              <View>
                <Text className="text-xs text-gray-500">Mora</Text>
                <Text className="font-bold text-gray-800">{money(estado?.mora_pendiente || 0)}</Text>
              </View>
            </View>
          </View>

          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <Text className="text-xs text-gray-500 font-bold uppercase mb-2">Datos del pago</Text>
            <Text className="text-xs text-gray-500 font-bold mb-1">Monto recibido</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 mb-3"
              keyboardType="decimal-pad"
              value={monto}
              onChangeText={setMonto}
              placeholder="0.00"
            />

            <Text className="text-xs text-gray-500 font-bold mb-1">Fecha</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-gray-900 mb-3"
              value={fecha}
              onChangeText={setFecha}
              placeholder="YYYY-MM-DD"
            />

            <Text className="text-xs text-gray-500 font-bold mb-2">Forma de pago</Text>
            <View className="flex-row mb-3">
              {['Efectivo', 'Transferencia', 'Cheque'].map((forma) => (
                <TouchableOpacity
                  key={forma}
                  className={`flex-1 rounded-xl border py-3 items-center mr-2 ${
                    formaPago === forma ? 'bg-brand border-brand' : 'bg-white border-gray-200'
                  }`}
                  onPress={() => setFormaPago(forma)}
                >
                  <Text className={`font-bold text-xs ${formaPago === forma ? 'text-white' : 'text-gray-700'}`}>
                    {forma}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-gray-500 font-bold mb-1">Cuenta / referencia</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-gray-900 mb-3"
              value={cuenta}
              onChangeText={setCuenta}
              placeholder="Opcional"
            />

            <Text className="text-xs text-gray-500 font-bold mb-1">Banco</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-gray-900 mb-3"
              value={banco}
              onChangeText={setBanco}
              placeholder="Opcional"
            />

            <Text className="text-xs text-gray-500 font-bold mb-1">Comentarios</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-gray-900 min-h-[86px]"
              value={comentarios}
              onChangeText={setComentarios}
              multiline
              textAlignVertical="top"
              placeholder="Opcional"
            />
          </View>

          <Text className="text-xs text-gray-500 font-bold uppercase mb-2">Cuotas pendientes</Text>
          {loadingEstado ? (
            <View className="py-8 items-center">
              <ActivityIndicator color="#1d4ed8" />
            </View>
          ) : cuotas.length > 0 ? (
            cuotas.map((cuota) => <View key={cuota.cuota_id}>{renderCuota({ item: cuota })}</View>)
          ) : (
            <View className="bg-white border border-gray-200 rounded-xl p-5 items-center">
              <CreditCard color="#94a3b8" size={28} />
              <Text className="text-gray-500 mt-2 text-center">Selecciona un cliente para ver sus cuotas.</Text>
            </View>
          )}
        </ScrollView>

        <View
          className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-200 px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom + 18, 28) }}
        >
          <TouchableOpacity
            className={`rounded-xl py-4 flex-row items-center justify-center ${saving ? 'bg-gray-400' : 'bg-emerald-600'}`}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Check color="#fff" size={22} />}
            <Text className="text-white font-bold text-base ml-2">{saving ? 'Registrando...' : 'Registrar pago'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={clientModalOpen} animationType="slide" onRequestClose={() => setClientModalOpen(false)}>
        <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
          <View className="bg-brand px-4 py-4 flex-row items-center">
            <TouchableOpacity onPress={() => setClientModalOpen(false)} className="w-10 h-10 items-center justify-center mr-2">
              <ArrowLeft color="#fff" size={24} />
            </TouchableOpacity>
            <Text className="text-white text-xl font-bold flex-1">Buscar cliente</Text>
          </View>
          <View className="p-4">
            <View className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex-row items-center mb-3">
              <Search color="#64748b" size={22} />
              <TextInput
                className="flex-1 ml-2 text-base text-gray-900"
                value={clientSearch}
                onChangeText={setClientSearch}
                placeholder="Nombre, codigo, RNC o telefono"
                autoFocus
              />
            </View>
          </View>
          {loadingClientes ? (
            <View className="py-8 items-center">
              <ActivityIndicator color="#1d4ed8" />
            </View>
          ) : (
            <FlatList
              data={clientes}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="bg-white border border-gray-200 rounded-xl p-4 mb-2"
                  onPress={() => loadEstado(item)}
                >
                  <Text className="text-gray-900 font-bold text-base">{item.nombre}</Text>
                  <Text className="text-gray-500 text-xs mt-1">
                    {[item.codigo, item.rnc, item.telefono].filter(Boolean).join(' | ') || 'Sin datos adicionales'}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View className="py-10 items-center px-4">
                  <Text className="text-gray-500 text-center">
                    {debugFinanciera
                      ? `No hay clientes para mostrar con este filtro.\nFinanciera: ${debugFinanciera.financiera_nombre || 'No detectada'} · Activos: ${debugFinanciera.clientes_activos}`
                      : 'No hay clientes para mostrar.'}
                  </Text>
                  {debugFinanciera?.prestamos_activos ? (
                    <Text className="text-gray-400 text-xs mt-2 text-center">
                      Prestamos activos: {debugFinanciera.prestamos_activos}
                    </Text>
                  ) : null}
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
