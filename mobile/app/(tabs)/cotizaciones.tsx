import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, TextInput, ScrollView, Modal, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FileText, PlusCircle, Search, Trash2, Plus, Minus, Share2, X, RefreshCw, CreditCard } from 'lucide-react-native';
import { useCartStore } from '@/src/store/useCartStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { supabase } from '@/src/supabase/client';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

const CLIENTE_GENERICO_ID = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';

type CotizacionRow = {
  id: string;
  numero: number | string | null;
  fecha_cotizacion: string | null;
  cliente_id?: string | null;
  cliente_nombre: string | null;
  cliente_telefono?: string | null;
  manual_cliente_nombre?: string | null;
  total_cotizacion: number | string | null;
  estado: string | null;
};

const money = (value: number | string | null | undefined) =>
  `RD$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function CotizacionesScreen() {
  const router = useRouter();
  const { user, empresa } = useAuthStore();
  const {
    items,
    clienteId,
    clienteNombre,
    clienteTelefono,
    setCliente,
    addItem,
    getSubtotal,
    getTotal,
    getTotalDiscount,
    removeItem,
    updateQuantity,
    updateDiscount,
    setCotizacionOrigen,
    clearCart,
  } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [sendingToVentaId, setSendingToVentaId] = useState<string | null>(null);
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);
  const [cotizacionModal, setCotizacionModal] = useState<any | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const cotizacionShotRef = useRef<ViewShot>(null);

  const subtotalBruto = getSubtotal();
  const descuentoTotal = getTotalDiscount();
  const total = getTotal();
  const totalItems = items.reduce((acc, item) => acc + item.cantidad, 0);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const bruto = Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0);
        const descuento = Math.min(Number(item.descuento || 0), bruto);
        const importe = Math.max(0, bruto - descuento);
        const itbisPct = Number(item.itbis_pct ?? 0.18);
        const base = importe / (1 + itbisPct);
        const itbis = importe - base;

        acc.subtotal += base;
        acc.descuento_total += descuento;
        acc.itbis_total += itbis;
        acc.total_cotizacion += importe;
        return acc;
      },
      { subtotal: 0, descuento_total: 0, itbis_total: 0, total_cotizacion: 0 }
    );
  }, [items]);

  const fetchCotizaciones = useCallback(async () => {
    setRecentLoading(true);
    try {
      const { data, error } = await supabase
        .from('cotizaciones_list_view')
        .select('*')
        .eq('estado', 'Pendiente')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setCotizaciones((data || []) as CotizacionRow[]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron cargar las cotizaciones.');
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCotizaciones();
  }, [fetchCotizaciones]);

  useFocusEffect(
    useCallback(() => {
      fetchCotizaciones();
    }, [fetchCotizaciones])
  );

  const updateClienteNombre = (nombre: string) => {
    setCliente(clienteId, nombre, clienteTelefono);
  };

  const updateClienteTelefono = (telefono: string) => {
    setCliente(clienteId, clienteNombre, telefono.replace(/[^0-9+]/g, ''));
  };

  const buildCotizacionTexto = (cotizacion: any) => {
    if (!cotizacion) return '';
    const W = 36;
    const fmt = (n: number) => Number(n || 0).toFixed(2);
    const center = (s: string) => {
      const pad = Math.max(0, Math.floor((W - s.length) / 2));
      return ' '.repeat(pad) + s;
    };
    const labelVal = (label: string, value: string) => {
      const spaces = Math.max(1, W - label.length - value.length);
      return label + ' '.repeat(spaces) + value;
    };
    const sep = '-'.repeat(W);
    const sep2 = '='.repeat(W);
    const CANT_W = 8;
    const PRECIO_W = 7;
    const ITBIS_W = 7;
    const MONTO_W = W - CANT_W - PRECIO_W - ITBIS_W;
    const columnsHeader =
      'CANT'.padEnd(CANT_W) +
      'PRECIO'.padStart(PRECIO_W) +
      'ITBIS'.padStart(ITBIS_W) +
      'MONTO'.padStart(MONTO_W);
    const fecha = cotizacion.fecha instanceof Date ? cotizacion.fecha : new Date(cotizacion.fecha);
    const fechaStr = fecha.toLocaleDateString('es-DO');
    const horaStr = fecha.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    const numero = cotizacion.numero ? `CT-${String(cotizacion.numero).padStart(7, '0').slice(-7)}` : 'CT-N/A';
    const empresaNombre = empresa?.razon_social || empresa?.nombre || 'MotoFlow';

    let t = '';
    t += center(empresaNombre) + '\n';
    if (empresa?.direccion1) t += center(empresa.direccion1) + '\n';
    if (empresa?.direccion2) t += center(empresa.direccion2) + '\n';
    if (empresa?.telefono) t += center(empresa.telefono) + '\n';
    if (empresa?.rnc) t += center(`RNC: ${empresa.rnc}`) + '\n';
    t += '\n';
    t += center('COTIZACION') + '\n';
    t += labelVal(`Numero  : ${numero}`, horaStr) + '\n';
    t += `Fecha   : ${fechaStr}\n`;
    t += `Vence   : ${cotizacion.fechaVencimiento || '7 dias'}\n`;
    t += `Cliente : ${cotizacion.cliente || 'CLIENTE GENERICO'}\n`;
    t += `Tel.    : ${clienteTelefono || 'N/A'}\n\n`;
    t += sep + '\n';
    t += 'Descripcion de la Mercancia\n';
    t += sep + '\n';
    t += columnsHeader + '\n';
    t += sep + '\n\n';

    cotizacion.items.forEach((it: any) => {
      const importe = Number(it.importe) || 0;
      t += `${it.descripcion}\n`;
      const cantStr = `${it.cantidad} UND`.padEnd(CANT_W);
      const precioStr = fmt(it.precio).padStart(PRECIO_W);
      const itbisStr = fmt(it.itbis || 0).padStart(ITBIS_W);
      const montoStr = (fmt(importe) + ' E').padStart(MONTO_W);
      t += cantStr + precioStr + itbisStr + montoStr + '\n';
    });

    t += '\n';
    t += labelVal('              Sub-Total :', fmt(cotizacion.subtotalBruto)) + '\n';
    t += labelVal('       Descuento en Items:', fmt(cotizacion.descuentoTotal)) + '\n';
    t += labelVal('Valores en         ITBIS :', fmt(cotizacion.itbisTotal)) + '\n';
    t += 'DOP    ' + '='.repeat(W - 7) + '\n';
    t += labelVal('                  TOTAL :', fmt(cotizacion.total)) + '\n';
    t += sep2 + '\n\n';
    t += center('*** COTIZACION NO AFECTA INVENTARIO ***') + '\n';
    return t;
  };

  const compartirCotizacion = async () => {
    if (!cotizacionModal || compartiendo) return;
    if (!cotizacionShotRef.current) {
      Alert.alert('Error', 'La vista de la cotizacion aun no esta lista para compartir.');
      return;
    }
    setCompartiendo(true);
    try {
      const uri = await captureRef(cotizacionShotRef.current, {
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
        dialogTitle: `Cotizacion ${cotizacionModal?.numero || ''}`,
        UTI: 'public.jpeg',
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo compartir la cotizacion.');
    } finally {
      setCompartiendo(false);
    }
  };

  const cerrarCotizacionYLimpiar = () => {
    clearCart();
    setCotizacionModal(null);
  };

  const enviarCotizacionAVenta = async (cotizacion: any) => {
    if (!cotizacion?.id || sendingToVentaId) return;
    setSendingToVentaId(cotizacion.id);
    try {
      const { data: detalles, error } = await supabase
        .from('cotizaciones_detalle')
        .select('*, productos(id, codigo, descripcion, referencia, imagen_url, itbis_pct)')
        .eq('cotizacion_id', cotizacion.id);

      if (error) throw error;
      if (!detalles?.length) {
        Alert.alert('Sin detalle', 'Esta cotizacion no tiene articulos para enviar a venta.');
        return;
      }

      clearCart();
      setCliente(
        cotizacion.cliente_id || null,
        cotizacion.manual_cliente_nombre || cotizacion.cliente_nombre || 'Cliente Generico',
        cotizacion.cliente_telefono || ''
      );
      setCotizacionOrigen(cotizacion.id, cotizacion.numero);

      detalles.forEach((detalle: any) => {
        const producto = detalle.productos || {};
        const productoParaVenta = {
          id: detalle.producto_id,
          codigo: detalle.codigo || producto.codigo || '',
          descripcion: detalle.descripcion || producto.descripcion || '',
          referencia: producto.referencia || null,
          existencia: 0,
          precio_venta_1: Number(detalle.precio_unitario || 0),
          precio_venta_2: Number(detalle.precio_unitario || 0),
          itbis_pct: Number(producto.itbis_pct ?? 0.18),
          url_imagen: producto.imagen_url || undefined,
        };

        addItem(productoParaVenta, Number(detalle.cantidad || 1), 1);
        if (Number(detalle.descuento_valor || 0) > 0) {
          updateDiscount(detalle.producto_id, Number(detalle.descuento_valor || 0));
        }
      });

      await supabase
        .from('cotizaciones')
        .update({ estado: 'Facturando' })
        .eq('id', cotizacion.id);

      setCotizacionModal(null);
      await fetchCotizaciones();
      router.push('/(tabs)/pos');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo enviar la cotizacion a venta.');
    } finally {
      setSendingToVentaId(null);
    }
  };

  const handleCrearCotizacion = async () => {
    if (items.length === 0) {
      Alert.alert('Carrito vacio', 'Agregue productos para crear una cotizacion.');
      return;
    }

    const nombreManual = clienteNombre?.trim();
    if (!nombreManual) {
      Alert.alert('Cliente requerido', 'Escriba el nombre del cliente o vehiculo.');
      return;
    }

    setLoading(true);
    try {
      const fechaCotizacion = new Date();
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaCotizacion.getDate() + 7);

      const { data: numeroData, error: numeroError } = await supabase.rpc('get_next_cotizacion_numero');
      if (numeroError) throw numeroError;

      const isGeneric = !clienteId || clienteId === CLIENTE_GENERICO_ID || clienteNombre.toUpperCase().includes('GENERICO');
      const cotizacionData = {
        numero: numeroData,
        usuario_id: user?.id,
        fecha_cotizacion: dateOnly(fechaCotizacion),
        fecha_vencimiento: dateOnly(fechaVencimiento),
        cliente_id: clienteId || CLIENTE_GENERICO_ID,
        subtotal: totals.subtotal,
        descuento_total: totals.descuento_total,
        itbis_total: totals.itbis_total,
        total_cotizacion: totals.total_cotizacion,
        manual_cliente_nombre: isGeneric ? nombreManual : null,
        estado: 'Pendiente',
      };

      const { data: cotizacion, error: cotizacionError } = await supabase
        .from('cotizaciones')
        .insert(cotizacionData)
        .select()
        .single();

      if (cotizacionError) throw cotizacionError;

      const detalles = items.map((item) => {
        const bruto = Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0);
        const descuento = Math.min(Number(item.descuento || 0), bruto);
        const importe = Math.max(0, bruto - descuento);
        const descuentoPct = bruto > 0 ? (descuento / bruto) * 100 : 0;
        const itbisPct = Number(item.itbis_pct ?? 0.18);
        const base = importe / (1 + itbisPct);
        const itbis = importe - base;

        return {
          cotizacion_id: cotizacion.id,
          producto_id: item.id,
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad: 'UND',
          precio_unitario: item.precioSeleccionado,
          descuento_pct: descuentoPct,
          descuento_valor: descuento,
          itbis_valor: itbis,
          importe,
        };
      });

      const { error: detallesError } = await supabase.from('cotizaciones_detalle').insert(detalles);
      if (detallesError) throw detallesError;

      const snapshot = {
        id: cotizacion.id,
        numero: cotizacion.numero || numeroData,
        fecha: fechaCotizacion,
        fechaVencimiento: dateOnly(fechaVencimiento),
        cliente: nombreManual,
        subtotalBruto,
        descuentoTotal,
        itbisTotal: totals.itbis_total,
        total,
        items: items.map((item) => ({
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio: item.precioSeleccionado,
          itbis: Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0) - Number(item.descuento || 0) - ((Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0) - Number(item.descuento || 0)) / (1 + Number(item.itbis_pct ?? 0.18))),
          importe: Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0) - Number(item.descuento || 0),
        })),
      };

      setCotizacionModal(snapshot);
      await fetchCotizaciones();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Hubo un error al generar la cotizacion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-gray-500 text-xs font-medium uppercase">Modulo de cotizacion</Text>
            <Text className="text-gray-900 text-xl font-bold">Cotizacion movil</Text>
          </View>
          <TouchableOpacity
            className="bg-orange-500 rounded-full px-3 py-2 flex-row items-center"
            onPress={() => router.push('/(tabs)/catalogo?modo=cotizacion')}
          >
            <PlusCircle color="white" size={18} />
            <Text className="text-white font-bold ml-1.5 text-[13px]">Agregar</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-3 flex-row gap-2">
          <TextInput
            className="flex-1 bg-gray-100 rounded-xl px-3 py-2 text-gray-900"
            placeholder="Cliente o vehiculo"
            placeholderTextColor="#9ca3af"
            value={clienteNombre}
            onChangeText={updateClienteNombre}
          />
          <TextInput
            className="w-[120px] bg-gray-100 rounded-xl px-3 py-2 text-gray-900"
            placeholder="Telefono"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            value={clienteTelefono}
            onChangeText={updateClienteTelefono}
          />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 220 }}
        ListEmptyComponent={
          <View className="items-center justify-center px-8 py-16">
            <View className="bg-orange-100 p-4 rounded-full mb-4">
              <FileText color="#f97316" size={48} />
            </View>
            <Text className="text-gray-900 text-xl font-bold mb-2">Sin articulos</Text>
            <Text className="text-gray-500 text-center mb-6">
              Agregue productos igual que en el punto de venta. La cotizacion no afecta inventario.
            </Text>
            <TouchableOpacity
              className="bg-brand px-6 py-3 rounded-full flex-row items-center"
              onPress={() => router.push('/(tabs)/catalogo?modo=cotizacion')}
            >
              <Search color="white" size={20} />
              <Text className="text-white font-bold ml-2">Buscar Productos</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const importe = Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0) - Number(item.descuento || 0);
          return (
            <View className="bg-white border-b border-gray-100 p-4">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-4">
                  <Text className="text-gray-900 font-bold leading-tight">{item.descripcion}</Text>
                  <Text className="text-gray-500 text-sm mt-1">{item.codigo}</Text>
                  <Text className="text-orange-600 font-medium mt-1">{money(item.precioSeleccionado)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-gray-900 font-bold text-lg mb-2">{money(importe)}</Text>
                  <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden">
                    <TouchableOpacity
                      className="bg-gray-50 p-2 active:bg-gray-200"
                      onPress={() => (item.cantidad > 1 ? updateQuantity(item.id, item.cantidad - 1) : removeItem(item.id))}
                    >
                      <Minus color="#4b5563" size={16} />
                    </TouchableOpacity>
                    <Text className="font-bold px-4">{item.cantidad}</Text>
                    <TouchableOpacity
                      className="bg-gray-50 p-2 active:bg-gray-200"
                      onPress={() => updateQuantity(item.id, item.cantidad + 1)}
                    >
                      <Plus color="#4b5563" size={16} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          items.length === 0 ? (
            <View className="px-4 pt-4">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-gray-900 font-bold text-base">Registros recientes</Text>
                <TouchableOpacity className="p-2" onPress={fetchCotizaciones} disabled={recentLoading}>
                  <RefreshCw color="#6b7280" size={18} />
                </TouchableOpacity>
              </View>
              {cotizaciones.map((cot) => (
                <View key={cot.id} className="bg-white border border-gray-100 rounded-xl p-3 mb-2">
                  <View className="flex-row justify-between">
                    <Text className="text-gray-900 font-bold">#{cot.numero || 'N/A'}</Text>
                    <Text className="text-orange-600 font-bold">{money(cot.total_cotizacion)}</Text>
                  </View>
                  <Text className="text-gray-600 mt-1" numberOfLines={1}>
                    {cot.manual_cliente_nombre || cot.cliente_nombre || 'Cliente Generico'}
                  </Text>
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-gray-400 text-xs">{cot.fecha_cotizacion || 'Sin fecha'}</Text>
                    <Text className="text-gray-400 text-xs">{cot.estado || 'Pendiente'}</Text>
                  </View>
                  {cot.estado === 'Pendiente' && (
                    <TouchableOpacity
                      className={`mt-3 bg-brand rounded-lg py-2 flex-row items-center justify-center ${sendingToVentaId === cot.id ? 'opacity-60' : ''}`}
                      disabled={sendingToVentaId === cot.id}
                      onPress={() => enviarCotizacionAVenta(cot)}
                    >
                      <CreditCard color="white" size={16} />
                      <Text className="text-white font-bold ml-2 text-[13px]">
                        {sendingToVentaId === cot.id ? 'Enviando...' : 'Enviar a venta'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ) : null
        }
      />

      {items.length > 0 && (
        <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-200 p-4 pb-6">
          <TouchableOpacity
            className="bg-gray-100 py-3 rounded-xl flex-row justify-center items-center mb-3"
            onPress={() => router.push('/(tabs)/catalogo?modo=cotizacion')}
          >
            <Search color="#f97316" size={20} />
            <Text className="text-orange-600 font-bold ml-2">Agregar mas articulos</Text>
          </TouchableOpacity>

          <View className="space-y-1 mb-3">
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Articulos</Text>
              <Text className="text-gray-900 font-semibold">{totalItems}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Subtotal</Text>
              <Text className="text-gray-900 font-semibold">{money(subtotalBruto)}</Text>
            </View>
            {descuentoTotal > 0 ? (
              <View className="flex-row justify-between">
                <Text className="text-red-500">Descuento</Text>
                <Text className="text-red-500 font-semibold">-{money(descuentoTotal)}</Text>
              </View>
            ) : null}
            <View className="flex-row justify-between pt-1 border-t border-gray-100">
              <Text className="text-gray-900 text-xl font-bold">Total</Text>
              <Text className="text-orange-600 text-xl font-bold">{money(total)}</Text>
            </View>
          </View>

          <View className="flex-row space-x-3">
            <TouchableOpacity className="bg-gray-100 p-4 rounded-xl flex-1 items-center justify-center" onPress={() => clearCart()}>
              <Trash2 color="#ef4444" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              className={`bg-orange-500 p-4 rounded-xl flex-[4] flex-row justify-center items-center ${loading ? 'opacity-50' : ''}`}
              disabled={loading}
              onPress={handleCrearCotizacion}
            >
              <FileText color="white" size={24} />
              <Text className="text-white font-bold text-lg ml-2">{loading ? 'Guardando...' : 'Guardar Cotizacion'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={cotizacionModal !== null} transparent animationType="slide" onRequestClose={cerrarCotizacionYLimpiar}>
        <View className="flex-1 bg-black/60 justify-center items-center px-3">
          <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden" style={{ maxHeight: '90%' }}>
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500">Cotizacion #{cotizacionModal?.numero}</Text>
                <Text className="text-base font-bold text-gray-900">Cotizacion guardada</Text>
              </View>
              <TouchableOpacity onPress={cerrarCotizacionYLimpiar} className="p-1">
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 0 }}>
              <ViewShot
                ref={cotizacionShotRef}
                options={{ format: 'jpg', quality: 0.95 }}
                style={{ backgroundColor: 'white' }}
              >
                <View style={{ padding: 16, backgroundColor: 'white' }}>
                  <Text
                    style={{
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      fontSize: 11,
                      color: '#111827',
                      lineHeight: 16,
                    }}
                  >
                    {buildCotizacionTexto(cotizacionModal)}
                  </Text>
                </View>
              </ViewShot>
            </ScrollView>

            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity className="flex-1 py-4 items-center justify-center active:bg-gray-100" onPress={cerrarCotizacionYLimpiar}>
                <Text className="text-gray-700 font-medium">Cerrar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-brand active:opacity-80 ${sendingToVentaId === cotizacionModal?.id ? 'opacity-60' : ''}`}
                disabled={sendingToVentaId === cotizacionModal?.id}
                onPress={() => enviarCotizacionAVenta(cotizacionModal)}
              >
                <CreditCard color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {sendingToVentaId === cotizacionModal?.id ? 'Enviando...' : 'Venta'}
                </Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-orange-500 active:opacity-80 ${compartiendo ? 'opacity-60' : ''}`}
                onPress={compartirCotizacion}
                disabled={compartiendo}
              >
                <Share2 color="white" size={18} />
                <Text className="text-white font-bold ml-2">{compartiendo ? 'JPG...' : 'JPG'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
