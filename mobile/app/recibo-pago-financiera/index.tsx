import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowLeft, Check, CreditCard, Printer, Search, Share2, UserRound, Wallet, X } from 'lucide-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '@/src/store/useAuthStore';
import { getSavedPrinter } from '@/services/bluetoothPrinter';
import {
  printReciboFinanciera,
  type ReciboFinancieraDetalle,
  type ReciboFinancieraPrintData,
} from '@/services/printReciboFinanciera';
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

const formatAmountInput = (value: string) => {
  const cleaned = String(value || '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const [integerRaw, ...decimalParts] = cleaned.split('.');
  const integer = integerRaw.replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = Number(integer).toLocaleString('en-US');
  if (!cleaned.includes('.')) return formattedInteger;
  return `${formattedInteger}.${decimalParts.join('').slice(0, 2)}`;
};

const formatAmountNumber = (value: number) =>
  Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatTicketDate = (value?: string | null) => {
  const raw = String(value || '').slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const roundMoney = (value: number) => Number((Number(value || 0)).toFixed(2));

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
  const ticketRef = useRef<ViewShot>(null);
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
  const fecha = todayISO();
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [cuenta, setCuenta] = useState('');
  const [banco, setBanco] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [showComentarios, setShowComentarios] = useState(false);
  const [selectedCuotas, setSelectedCuotas] = useState<string[]>([]);
  const [excludedCuotaIds, setExcludedCuotaIds] = useState<string[]>([]);
  const [reciboPreview, setReciboPreview] = useState<ReciboFinancieraPrintData | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const lastCuotaTapRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

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
      setMonto('');
      setSelectedCuotas([]);
      setExcludedCuotaIds([]);
      setShowComentarios(false);
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
      const cuentaPago = formaPago === 'Efectivo' ? '' : cuenta.trim();
      const bancoPago = formaPago === 'Efectivo' ? '' : banco.trim();
      const cuotasAplicables = getCuotasAplicables(cuotas, excludedCuotaIds);
      if (!cuotasAplicables.length) {
        Alert.alert('Cuotas requeridas', 'No hay cuotas disponibles para aplicar este pago.');
        return;
      }
      const detallesPago = buildDetalleTransaccion(cuotas, montoNumber, excludedCuotaIds);
      const result = await registrarPagoPrestamoFinanciera({
        clienteId: cliente.id,
        monto: montoNumber,
        fecha,
        cobrador,
        formaPago,
        cuenta: cuentaPago,
        banco: bancoPago,
        comentarios,
        cuotaIds: excludedCuotaIds.length ? cuotasAplicables.map((cuota) => cuota.cuota_id) : null,
      });
      setReciboPreview({
        numero: result.numero,
        fecha,
        clienteNombre: cliente.nombre,
        clienteCodigo: cliente.codigo || cliente.rnc || cliente.telefono || null,
        totalPagado: result.total_pagado,
        sobrante: result.sobrante,
        balanceAnterior: result.balance_anterior,
        balanceActual: result.balance_actual,
        formaPago,
        cuenta: cuentaPago,
        banco: bancoPago,
        comentarios: comentarios.trim(),
        cobrador,
        detalles: detallesPago,
      });
      const refreshed = await getPrestamosClienteFinanciera(cliente.id);
      setEstado(refreshed);
      setMonto('');
      setSelectedCuotas([]);
      setExcludedCuotaIds([]);
      setCuenta('');
      setBanco('');
      setComentarios('');
      setShowComentarios(false);
    } catch (error: any) {
      Alert.alert('No se pudo registrar', error?.message || 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleMontoChange = (value: string) => {
    setMonto(formatAmountInput(value));
    setSelectedCuotas([]);
  };

  const handleFormaPagoChange = (forma: string) => {
    setFormaPago(forma);
    if (forma === 'Efectivo') {
      setCuenta('');
      setBanco('');
    }
  };

  const toggleCuotaMonto = (cuota: CuotaFinanciera) => {
    const alreadySelected = selectedCuotas.includes(cuota.cuota_id);
    const cuotaMonto = Number(cuota.pendiente || 0);
    const next = alreadySelected ? montoNumber - cuotaMonto : montoNumber + cuotaMonto;
    setMonto(next > 0 ? formatAmountNumber(next) : '');
    setExcludedCuotaIds([]);
    setSelectedCuotas((current) => (
      alreadySelected
        ? current.filter((id) => id !== cuota.cuota_id)
        : [...current, cuota.cuota_id]
    ));
  };

  const handleCuotaPress = (cuota: CuotaFinanciera) => {
    if (montoNumber > 0) {
      setExcludedCuotaIds((current) => (
        current.includes(cuota.cuota_id)
          ? current.filter((id) => id !== cuota.cuota_id)
          : [...current, cuota.cuota_id]
      ));
      setSelectedCuotas([]);
      lastCuotaTapRef.current = { id: null, at: 0 };
      return;
    }

    const now = Date.now();
    const previous = lastCuotaTapRef.current;
    if (previous.id === cuota.cuota_id && now - previous.at <= 450) {
      toggleCuotaMonto(cuota);
      lastCuotaTapRef.current = { id: null, at: 0 };
      return;
    }
    lastCuotaTapRef.current = { id: cuota.cuota_id, at: now };
  };

  const buildDetalleTransaccion = (
    sourceCuotas: CuotaFinanciera[],
    amount: number,
    cuotasExcluidas: string[] = []
  ): ReciboFinancieraDetalle[] => {
    let restante = roundMoney(amount);
    return [...sourceCuotas]
      .filter((cuota) => !cuotasExcluidas.includes(cuota.cuota_id))
      .sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')))
      .map((cuota) => {
        if (restante <= 0) return null;
        const mora = Math.max(0, Number(cuota.mora_pend || 0));
        const interes = Math.max(0, Number(cuota.interes_pend || 0));
        const capital = Math.max(0, Number(cuota.capital_pend || 0));
        const abonoMora = Math.min(restante, mora);
        restante = roundMoney(restante - abonoMora);
        const abonoInteres = Math.min(restante, interes);
        restante = roundMoney(restante - abonoInteres);
        const abonoCapital = Math.min(restante, capital);
        restante = roundMoney(restante - abonoCapital);
        const abono = roundMoney(abonoMora + abonoInteres + abonoCapital);
        if (abono <= 0) return null;
        const pendiente = Math.max(0, roundMoney(Number(cuota.pendiente || 0) - abono));
        return {
          cuotaId: cuota.cuota_id,
          documento: cuota.prestamo_numero || cuota.prestamo_id || '-',
          referencia: cuota.referencia || cuota.cuota_id || '-',
          fecha: cuota.fecha_vencimiento || cuota.fecha || fecha,
          monto: Number(cuota.monto_cuota || cuota.pendiente || 0),
          abono,
          pendiente,
          abonoCapital,
          abonoInteres,
          abonoMora,
        };
      })
      .filter(Boolean) as ReciboFinancieraDetalle[];
  };

  const getCuotasAplicables = (
    sourceCuotas: CuotaFinanciera[],
    cuotasExcluidas: string[] = []
  ) => sourceCuotas.filter((cuota) => !cuotasExcluidas.includes(cuota.cuota_id));

  const buildReciboTexto = (recibo: ReciboFinancieraPrintData | null) => {
    if (!recibo) return '';
    const W = 48;
    const detallesAfectados = (recibo.detalles || []).filter((item) => Number(item.abono || 0) > 0);
    const clean = (value?: string | null) => String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
    const center = (value: string) => {
      const text = clean(value);
      const pad = Math.max(0, Math.floor((W - text.length) / 2));
      return ' '.repeat(pad) + text;
    };
    const leftRight = (left: string, right: string) => {
      const l = clean(left);
      const r = clean(right);
      const spaces = Math.max(1, W - l.length - r.length);
      return l + ' '.repeat(spaces) + r;
    };

    let text = '```\n';
    text += center('MOTOPRESTAMOS LOS NARANJOS') + '\n';
    text += center('RECIBO DE PAGO') + '\n\n';
    text += leftRight(`No. Recibo: ${clean(recibo.numero)}`, formatTicketDate(recibo.fecha)) + '\n';
    text += `MONTO: ${formatAmountNumber(recibo.totalPagado)}\n`;
    if (recibo.cobrador) text += `COBRADOR: ${clean(recibo.cobrador)}\n`;
    text += '\n';
    text += 'HEMOS RECIBIDO DE:\n';
    text += `${clean(recibo.clienteNombre).toUpperCase()}\n`;
    if (recibo.clienteCodigo) text += `CODIGO: ${clean(recibo.clienteCodigo)}\n`;
    text += '\n';
    text += 'POR CONCEPTO DE:\n';
    text += `${clean(recibo.comentarios).toUpperCase()}\n`;
    text += '-'.repeat(W) + '\n';
    if (detallesAfectados.length) {
      detallesAfectados.forEach((item) => {
        text += `Documento : ${clean(item.documento)}\n`;
        text += `Referencia: ${clean(item.referencia)}\n`;
        text += `Fecha: ${formatTicketDate(item.fecha)}\n`;
        text += `Monto: ${formatAmountNumber(item.monto)}\n`;
        text += `Abono: ${formatAmountNumber(item.abono)}\n`;
        text += `Pendiente: ${formatAmountNumber(item.pendiente)}\n`;
        text += '\n';
      });
      text += '-'.repeat(W) + '\n';
    }
    text += leftRight('Balance Anterior:', formatAmountNumber(recibo.balanceAnterior)) + '\n';
    text += leftRight('Abono a Cuenta:', formatAmountNumber(recibo.totalPagado)) + '\n';
    if (Number(recibo.sobrante || 0) > 0) {
      text += leftRight('Sobrante:', formatAmountNumber(Number(recibo.sobrante || 0))) + '\n';
    }
    text += leftRight('Balance Actual:', formatAmountNumber(recibo.balanceActual)) + '\n';
    text += '\n';
    text += `${clean(recibo.formaPago).toUpperCase()}\n`;
    if (recibo.cuenta) text += `REF: ${clean(recibo.cuenta)}\n`;
    if (recibo.banco) text += `BANCO: ${clean(recibo.banco)}\n`;
    text += '\n\n';
    text += center('________________________') + '\n';
    text += center('Firma') + '\n';
    text += center('*** GRACIAS POR SU PAGO ***') + '\n';
    text += center('Motoflow Mobile') + '\n';
    text += '```';
    return text;
  };

  const imprimirRecibo = async () => {
    if (!reciboPreview) return;
    setImprimiendo(true);
    try {
      const saved = await getSavedPrinter();
      if (!saved) {
        Alert.alert(
          'Sin impresora',
          'Aun no has vinculado una impresora Bluetooth. Ve a Mas -> Impresora para configurarla.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Configurar', onPress: () => router.push('/configuracion/impresora' as any) },
          ]
        );
        return;
      }
      await printReciboFinanciera(reciboPreview);
    } catch (error: any) {
      Alert.alert('No se pudo imprimir', error?.message || 'Verifique la impresora Bluetooth.');
    } finally {
      setImprimiendo(false);
    }
  };

  const compartirRecibo = async () => {
    if (!reciboPreview || compartiendo) return;
    if (!ticketRef.current) {
      Alert.alert('Error', 'La vista del recibo aun no esta lista para compartir.');
      return;
    }

    setCompartiendo(true);
    try {
      const uri = await captureRef(ticketRef.current, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Compartir no esta disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Recibo ${reciboPreview.numero}`,
        UTI: 'public.jpeg',
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo compartir el recibo.');
    } finally {
      setCompartiendo(false);
    }
  };

  const defaultDetallesPreview = buildDetalleTransaccion(cuotas, montoNumber);
  const defaultAbonosPreview = new Map(
    defaultDetallesPreview.map((detalle) => [detalle.cuotaId, detalle])
  );
  const detallesPreview = buildDetalleTransaccion(cuotas, montoNumber, excludedCuotaIds);
  const abonosPreview = new Map(
    detallesPreview.map((detalle) => [detalle.cuotaId, detalle])
  );

  const renderCuota = ({ item }: { item: CuotaFinanciera }) => {
    const selected = selectedCuotas.includes(item.cuota_id);
    const excluded = excludedCuotaIds.includes(item.cuota_id);
    const abonoPreview = abonosPreview.get(item.cuota_id);
    const defaultAbonoPreview = defaultAbonosPreview.get(item.cuota_id);
    const pendingExcluded = roundMoney(Number(defaultAbonoPreview?.abono || 0));
    const hasAbonoPreview = Boolean(abonoPreview && montoNumber > 0);
    return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={() => handleCuotaPress(item)}
      className={`rounded-xl border px-3 py-1.5 mb-1.5 ${
        hasAbonoPreview
          ? 'border-emerald-500 bg-emerald-50'
          : excluded
            ? 'border-orange-300 bg-orange-50'
          : selected
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-white'
      }`}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-3">
          <Text className="text-gray-900 font-bold text-sm">Prestamo {item.prestamo_numero || '-'}</Text>
          <Text className="text-gray-500 text-[11px] mt-0.5">
            Cuota {item.referencia || '-'} - Vence {item.fecha_vencimiento ? formatFechaDMY(item.fecha_vencimiento) : '-'}
          </Text>
          {hasAbonoPreview ? (
            <Text className="text-emerald-700 text-[11px] font-bold mt-0.5">
              Abono {money(abonoPreview?.abono || 0)} - Queda {money(abonoPreview?.pendiente || 0)}
            </Text>
          ) : selected ? (
            <Text className="text-blue-700 text-[11px] font-bold mt-0.5">Seleccionada</Text>
          ) : excluded ? (
            <Text className="text-orange-700 text-[11px] font-bold mt-0.5">
              {pendingExcluded > 0 ? `Pendiente ${money(pendingExcluded)}` : 'Omitida'}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          {item.vencida ? (
            <Text className="text-red-600 text-[11px] font-bold mb-0.5">Vencida</Text>
          ) : (
            <Text className="text-emerald-600 text-[11px] font-bold mb-0.5">Al dia</Text>
          )}
          <Text className="text-gray-900 font-bold text-sm">{money(item.pendiente)}</Text>
          {hasAbonoPreview ? (
            <Text className="text-emerald-700 text-[11px] font-bold mt-0.5">Aplicar</Text>
          ) : excluded ? (
            <Text className="text-orange-700 text-[11px] font-bold mt-0.5">Omitida</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
    );
  };

  const renderCuotasPendientes = () => (
    <View className="mb-3">
      <Text className="text-[11px] text-gray-500 font-bold uppercase mb-1.5">Cuotas pendientes</Text>
      {loadingEstado ? (
        <View className="py-8 items-center">
          <ActivityIndicator color="#1d4ed8" />
        </View>
      ) : cuotas.length > 0 ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator
          className="max-h-[244px]"
          contentContainerStyle={{ paddingBottom: 2 }}
        >
          {cuotas.map((cuota) => <View key={cuota.cuota_id}>{renderCuota({ item: cuota })}</View>)}
        </ScrollView>
      ) : (
        <View className="bg-white border border-gray-200 rounded-xl p-3 items-center">
          <CreditCard color="#94a3b8" size={22} />
          <Text className="text-gray-500 mt-1 text-center text-xs">Selecciona un cliente para ver sus cuotas.</Text>
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="bg-brand px-4 py-3 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center mr-2">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white text-lg font-bold">Recibo de Pago</Text>
          <Text className="text-blue-100 text-xs">Motoprestamos Los Naranjos</Text>
        </View>
        <View className="items-end ml-3">
          <Text className="text-blue-100 text-[11px] font-bold uppercase">Fecha</Text>
          <Text className="text-white text-sm font-bold">{formatFechaDMY(fecha)}</Text>
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
          contentContainerStyle={{ padding: 10, paddingBottom: insets.bottom + 140 }}
        >
          <TouchableOpacity
            className="bg-white border border-gray-200 rounded-xl p-3 flex-row items-center mb-3"
            onPress={() => setClientModalOpen(true)}
          >
            <View className="w-9 h-9 rounded-full bg-blue-50 items-center justify-center mr-3">
              <UserRound color="#1d4ed8" size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-[11px] text-gray-500 font-bold uppercase">Cliente financiera</Text>
              <Text className="text-gray-900 font-bold text-base">{cliente?.nombre || 'Buscar cliente'}</Text>
              {cliente ? (
                <Text className="text-gray-500 text-xs">{cliente.codigo || cliente.rnc || cliente.telefono || ''}</Text>
              ) : (
                <Text className="text-gray-500 text-xs">Clientes registrados en Motoprestamos</Text>
              )}
            </View>
            <Search color="#64748b" size={20} />
          </TouchableOpacity>

          <View className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
            <View className="flex-row items-center">
              <View className="w-9 h-9 rounded-full bg-emerald-50 items-center justify-center mr-3">
                <Wallet color="#059669" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500 font-bold uppercase">Balance pendiente</Text>
                <Text className="text-xl font-bold text-gray-900">
                  {loadingEstado ? 'Cargando...' : money(estado?.balance_total || 0)}
                </Text>
              </View>
              <View className="items-end ml-2 min-w-[132px]">
                <Text className="text-xs text-gray-500">
                  Cap <Text className="font-bold text-gray-800">{money(estado?.capital_pendiente || 0)}</Text>
                </Text>
                <Text className="text-xs text-gray-500">
                  Int <Text className="font-bold text-gray-800">{money(estado?.intereses_pendientes || 0)}</Text>
                </Text>
                <Text className="text-xs text-gray-500">
                  Mora <Text className="font-bold text-gray-800">{money(estado?.mora_pendiente || 0)}</Text>
                </Text>
              </View>
            </View>
          </View>

          {renderCuotasPendientes()}

          <View className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
            <View className="flex-row items-center mb-2">
              <View className="flex-1 pr-3">
                <Text className="text-[11px] text-gray-500 font-bold uppercase">Datos del pago</Text>
                <Text className="text-[11px] text-gray-500 font-bold mt-1">Monto recibido</Text>
              </View>
              <TextInput
                className="border border-gray-300 rounded-xl px-3 py-2 text-base font-bold text-gray-900"
                style={{ width: 184, textAlign: 'right' }}
                keyboardType="decimal-pad"
                value={monto}
                onChangeText={handleMontoChange}
                placeholder="0.00"
              />
            </View>

            <Text className="text-[11px] text-gray-500 font-bold mb-1.5">Forma de pago</Text>
            <View className="flex-row mb-2">
              {['Efectivo', 'Transferencia', 'Cheque'].map((forma) => (
                <TouchableOpacity
                  key={forma}
                  className={`flex-1 rounded-xl border py-2.5 items-center mr-2 ${
                    formaPago === forma ? 'bg-brand border-brand' : 'bg-white border-gray-200'
                  }`}
                  onPress={() => handleFormaPagoChange(forma)}
                >
                  <Text className={`font-bold text-[11px] ${formaPago === forma ? 'text-white' : 'text-gray-700'}`}>
                    {forma}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {formaPago !== 'Efectivo' ? (
              <>
                <Text className="text-[11px] text-gray-500 font-bold mb-1">Cuenta / referencia</Text>
                <TextInput
                  className="border border-gray-300 rounded-xl px-3 py-2 text-gray-900 mb-2"
                  value={cuenta}
                  onChangeText={setCuenta}
                  placeholder="Opcional"
                />

                <Text className="text-[11px] text-gray-500 font-bold mb-1">Banco</Text>
                <TextInput
                  className="border border-gray-300 rounded-xl px-3 py-2 text-gray-900 mb-2"
                  value={banco}
                  onChangeText={setBanco}
                  placeholder="Opcional"
                />
              </>
            ) : null}

            <TouchableOpacity
              className="self-start py-1"
              onPress={() => setShowComentarios((current) => !current)}
            >
              <Text className="text-[11px] text-blue-700 font-bold">
                {showComentarios ? 'Ocultar comentarios' : comentarios ? 'Editar comentarios' : 'Agregar comentario'}
              </Text>
            </TouchableOpacity>

            {showComentarios ? (
              <>
                <Text className="text-[11px] text-gray-500 font-bold mb-1 mt-1">Comentarios</Text>
                <TextInput
                  className="border border-gray-300 rounded-xl px-3 py-2 text-gray-900 min-h-[62px]"
                  value={comentarios}
                  onChangeText={setComentarios}
                  multiline
                  textAlignVertical="top"
                  placeholder="Opcional"
                />
              </>
            ) : null}
          </View>
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
                      ? `No hay clientes para mostrar con este filtro.\nFinanciera: ${debugFinanciera.financiera_nombre || 'No detectada'} - Activos: ${debugFinanciera.clientes_activos}`
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

      <Modal
        visible={reciboPreview !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setReciboPreview(null)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-3">
          <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden" style={{ maxHeight: '90%' }}>
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500">Recibo #{reciboPreview?.numero}</Text>
                <Text className="text-base font-bold text-gray-900">Recibo guardado</Text>
              </View>
              <TouchableOpacity
                onPress={() => setReciboPreview(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="p-1"
              >
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 0 }}>
              <ViewShot
                ref={ticketRef}
                options={{ format: 'jpg', quality: 0.95 }}
                style={{ backgroundColor: 'white' }}
              >
                <View style={{ paddingVertical: 14, paddingHorizontal: 8, backgroundColor: 'white' }}>
                  <Text
                    style={{
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      fontSize: 11,
                      color: '#111827',
                      lineHeight: 16,
                    }}
                  >
                    {buildReciboTexto(reciboPreview)
                      .replace(/^```\n?/, '')
                      .replace(/\n?```$/, '')}
                  </Text>
                </View>
              </ViewShot>
            </ScrollView>

            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity
                className="flex-1 py-4 items-center justify-center active:bg-gray-100"
                onPress={() => setReciboPreview(null)}
              >
                <Text className="text-gray-700 font-medium">Cerrar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-emerald-600 active:opacity-80 ${imprimiendo ? 'opacity-60' : ''}`}
                onPress={imprimirRecibo}
                disabled={imprimiendo || compartiendo}
              >
                <Printer color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {imprimiendo ? 'Imprimiendo...' : 'Imprimir'}
                </Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-blue-700 active:opacity-80 ${compartiendo ? 'opacity-60' : ''}`}
                onPress={compartirRecibo}
                disabled={compartiendo || imprimiendo}
              >
                <Share2 color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {compartiendo ? 'Generando...' : 'Compartir'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
