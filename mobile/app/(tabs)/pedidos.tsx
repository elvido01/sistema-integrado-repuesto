import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, TextInput, ScrollView, Modal, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CreditCard, FileText, ListOrdered, Minus, Plus, PlusCircle, RefreshCw, Search, Share2, Trash2, X } from 'lucide-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useCartStore } from '@/src/store/useCartStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { supabase } from '@/src/supabase/client';

const CLIENTE_GENERICO_ID = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';

type PedidoRow = {
  id: string;
  numero: number | string | null;
  fecha: string | null;
  cliente_id?: string | null;
  cliente_nombre: string | null;
  cliente_telefono?: string | null;
  manual_cliente_nombre?: string | null;
  placa_vehiculo?: string | null;
  monto_total: number | string | null;
  estado: string | null;
};

type Vendedor = {
  id: string;
  nombre: string;
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

export default function PedidosScreen() {
  const router = useRouter();
  const { empresa } = useAuthStore();
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
    setPedidoOrigen,
    clearCart,
  } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [sendingToVentaId, setSendingToVentaId] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState<string>('');
  const [placaVehiculo, setPlacaVehiculo] = useState('');
  const [notas, setNotas] = useState('');
  const [pedidoModal, setPedidoModal] = useState<any | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const pedidoShotRef = useRef<ViewShot>(null);

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
        acc.monto_total += importe;
        return acc;
      },
      { subtotal: 0, descuento_total: 0, itbis_total: 0, monto_total: 0 }
    );
  }, [items]);

  const fetchPedidos = useCallback(async () => {
    setRecentLoading(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_list_view')
        .select('*')
        .eq('estado', 'Pendiente')
        .order('fecha', { ascending: false })
        .limit(10);

      if (error) throw error;
      setPedidos((data || []) as PedidoRow[]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron cargar los pedidos.');
    } finally {
      setRecentLoading(false);
    }
  }, []);

  const fetchVendedores = useCallback(async () => {
    const { data, error } = await supabase
      .from('vendedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (!error) {
      const rows = (data || []) as Vendedor[];
      setVendedores(rows);
      setVendedorId(prev => prev || rows[0]?.id || '');
    }
  }, []);

  useEffect(() => {
    fetchPedidos();
    fetchVendedores();
  }, [fetchPedidos, fetchVendedores]);

  useFocusEffect(
    useCallback(() => {
      fetchPedidos();
    }, [fetchPedidos])
  );

  const updateClienteNombre = (nombre: string) => {
    setCliente(clienteId, nombre, clienteTelefono);
  };

  const updateClienteTelefono = (telefono: string) => {
    setCliente(clienteId, clienteNombre, telefono.replace(/[^0-9+]/g, ''));
  };

  const buildPedidoTexto = (pedido: any) => {
    if (!pedido) return '';
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
    const fecha = pedido.fecha instanceof Date ? pedido.fecha : new Date(pedido.fecha);
    const fechaStr = fecha.toLocaleDateString('es-DO');
    const horaStr = fecha.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    const numero = pedido.numero ? `PD-${String(pedido.numero).padStart(7, '0').slice(-7)}` : 'PD-N/A';
    const empresaNombre = empresa?.razon_social || empresa?.nombre || 'MotoFlow';

    let t = '';
    t += center(empresaNombre) + '\n';
    if (empresa?.direccion1) t += center(empresa.direccion1) + '\n';
    if (empresa?.direccion2) t += center(empresa.direccion2) + '\n';
    if (empresa?.telefono) t += center(empresa.telefono) + '\n';
    if (empresa?.rnc) t += center(`RNC: ${empresa.rnc}`) + '\n';
    t += '\n';
    t += center('PEDIDO / PRE-FACTURA') + '\n';
    t += labelVal(`Numero  : ${numero}`, horaStr) + '\n';
    t += `Fecha   : ${fechaStr}\n`;
    t += `Cliente : ${pedido.cliente || 'CLIENTE GENERICO'}\n`;
    if (pedido.placa) t += `Vehiculo: ${pedido.placa}\n`;
    t += `Tel.    : ${clienteTelefono || 'N/A'}\n\n`;
    t += sep + '\n';
    t += 'Descripcion de la Mercancia\n';
    t += sep + '\n';
    t += columnsHeader + '\n';
    t += sep + '\n\n';

    pedido.items.forEach((it: any) => {
      const importe = Number(it.importe) || 0;
      t += `${it.descripcion}\n`;
      const cantStr = `${it.cantidad} UND`.padEnd(CANT_W);
      const precioStr = fmt(it.precio).padStart(PRECIO_W);
      const itbisStr = fmt(it.itbis || 0).padStart(ITBIS_W);
      const montoStr = (fmt(importe) + ' E').padStart(MONTO_W);
      t += cantStr + precioStr + itbisStr + montoStr + '\n';
    });

    t += '\n';
    t += labelVal('              Sub-Total :', fmt(pedido.subtotalBruto)) + '\n';
    t += labelVal('       Descuento en Items:', fmt(pedido.descuentoTotal)) + '\n';
    t += labelVal('Valores en         ITBIS :', fmt(pedido.itbisTotal)) + '\n';
    t += 'DOP    ' + '='.repeat(W - 7) + '\n';
    t += labelVal('                  TOTAL :', fmt(pedido.total)) + '\n';
    t += sep2 + '\n\n';
    t += center('*** PEDIDO NO AFECTA INVENTARIO ***') + '\n';
    return t;
  };

  const compartirPedido = async () => {
    if (!pedidoModal || compartiendo) return;
    if (!pedidoShotRef.current) {
      Alert.alert('Error', 'La vista del pedido aun no esta lista para compartir.');
      return;
    }
    setCompartiendo(true);
    try {
      const uri = await captureRef(pedidoShotRef.current, {
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
        dialogTitle: `Pedido ${pedidoModal?.numero || ''}`,
        UTI: 'public.jpeg',
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo compartir el pedido.');
    } finally {
      setCompartiendo(false);
    }
  };

  const cerrarPedidoYLimpiar = () => {
    clearCart();
    setPlacaVehiculo('');
    setNotas('');
    setPedidoModal(null);
  };

  const enviarPedidoAVenta = async (pedido: any) => {
    if (!pedido?.id || sendingToVentaId) return;
    setSendingToVentaId(pedido.id);
    try {
      const { data: detalles, error } = await supabase
        .from('pedidos_detalle')
        .select('*, productos(id, codigo, descripcion, referencia, imagen_url, itbis_pct)')
        .eq('pedido_id', pedido.id);

      if (error) throw error;
      if (!detalles?.length) {
        Alert.alert('Sin detalle', 'Este pedido no tiene articulos para enviar a venta.');
        return;
      }

      clearCart();
      setCliente(
        pedido.cliente_id || null,
        pedido.manual_cliente_nombre || pedido.cliente_nombre || 'Cliente Generico',
        pedido.cliente_telefono || ''
      );
      setPedidoOrigen(pedido.id, pedido.numero);

      detalles.forEach((detalle: any) => {
        const producto = detalle.productos || {};
        const productoParaVenta = {
          id: detalle.producto_id,
          codigo: detalle.codigo || producto.codigo || '',
          descripcion: detalle.descripcion || producto.descripcion || '',
          referencia: producto.referencia || null,
          existencia: 0,
          precio_venta_1: Number(detalle.precio || 0),
          precio_venta_2: Number(detalle.precio || 0),
          itbis_pct: Number(producto.itbis_pct ?? 0.18),
          url_imagen: producto.imagen_url || undefined,
        };

        addItem(productoParaVenta, Number(detalle.cantidad || 1), 1);
        if (Number(detalle.descuento || 0) > 0) {
          updateDiscount(detalle.producto_id, Number(detalle.descuento || 0));
        }
      });

      await supabase
        .from('pedidos')
        .update({ estado: 'Facturando' })
        .eq('id', pedido.id);

      setPedidoModal(null);
      await fetchPedidos();
      router.push('/(tabs)/pos');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo enviar el pedido a venta.');
    } finally {
      setSendingToVentaId(null);
    }
  };

  const handleCrearPedido = async () => {
    if (items.length === 0) {
      Alert.alert('Carrito vacio', 'Agregue productos para crear un pedido.');
      return;
    }

    const nombreManual = clienteNombre?.trim();
    if (!nombreManual) {
      Alert.alert('Cliente requerido', 'Escriba el nombre del cliente o vehiculo.');
      return;
    }

    if (!vendedorId) {
      Alert.alert('Vendedor requerido', 'Seleccione o configure un vendedor activo.');
      return;
    }

    setLoading(true);
    try {
      const fechaPedido = new Date();
      const isGeneric = !clienteId || clienteId === CLIENTE_GENERICO_ID || clienteNombre.toUpperCase().includes('GENERICO');

      const pedidoData = {
        cliente_id: clienteId || CLIENTE_GENERICO_ID,
        vendedor_id: vendedorId,
        fecha: dateOnly(fechaPedido),
        notas,
        manual_cliente_nombre: isGeneric ? nombreManual : '',
        placa_vehiculo: placaVehiculo,
        subtotal: Math.round(totals.subtotal * 100) / 100,
        descuento_total: Math.round(totals.descuento_total * 100) / 100,
        itbis_total: Math.round(totals.itbis_total * 100) / 100,
        monto_total: Math.round(totals.monto_total * 100) / 100,
      };

      const detalles = items.map((item) => {
        const bruto = Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0);
        const descuento = Math.min(Number(item.descuento || 0), bruto);
        const importe = Math.max(0, bruto - descuento);
        const itbisPct = Number(item.itbis_pct ?? 0.18);
        const base = importe / (1 + itbisPct);
        const itbis = importe - base;

        return {
          producto_id: item.id,
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad: 'UND',
          precio: item.precioSeleccionado,
          descuento,
          itbis_pct: itbisPct,
          itbis: Math.round(itbis * 100) / 100,
          importe: Math.round(importe * 100) / 100,
        };
      });

      const { data: pedidoId, error } = await supabase.rpc('crear_o_actualizar_pedido', {
        p_pedido_data: pedidoData,
        p_detalles_data: detalles,
      });

      if (error) throw error;

      const { data: pedidoRow } = await supabase
        .from('pedidos')
        .select('id, numero')
        .eq('id', pedidoId)
        .maybeSingle();

      const snapshot = {
        id: pedidoRow?.id || pedidoId,
        numero: pedidoRow?.numero || pedidoId,
        fecha: fechaPedido,
        cliente: nombreManual,
        placa: placaVehiculo,
        subtotalBruto,
        descuentoTotal,
        itbisTotal: totals.itbis_total,
        total,
        items: items.map((item) => {
          const importe = Number(item.precioSeleccionado || 0) * Number(item.cantidad || 0) - Number(item.descuento || 0);
          const itbisPct = Number(item.itbis_pct ?? 0.18);
          return {
            codigo: item.codigo,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio: item.precioSeleccionado,
            itbis: importe - (importe / (1 + itbisPct)),
            importe,
          };
        }),
      };

      setPedidoModal(snapshot);
      await fetchPedidos();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Hubo un error al generar el pedido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-gray-500 text-xs font-medium uppercase">Modulo de pedidos</Text>
            <Text className="text-gray-900 text-xl font-bold">Pedido movil</Text>
          </View>
          <TouchableOpacity
            className="bg-emerald-600 rounded-full px-3 py-2 flex-row items-center"
            onPress={() => router.push('/(tabs)/catalogo?modo=pedido')}
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

        <View className="mt-2 flex-row gap-2">
          <TextInput
            className="flex-1 bg-gray-100 rounded-xl px-3 py-2 text-gray-900"
            placeholder="Placa / vehiculo"
            placeholderTextColor="#9ca3af"
            value={placaVehiculo}
            onChangeText={setPlacaVehiculo}
          />
          <Text className="w-[120px] bg-gray-100 rounded-xl px-3 py-2 text-gray-500" numberOfLines={1}>
            {vendedores.find(v => v.id === vendedorId)?.nombre || 'Vendedor'}
          </Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 240 }}
        ListEmptyComponent={
          <View className="items-center justify-center px-8 py-16">
            <View className="bg-emerald-100 p-4 rounded-full mb-4">
              <ListOrdered color="#059669" size={48} />
            </View>
            <Text className="text-gray-900 text-xl font-bold mb-2">Sin articulos</Text>
            <Text className="text-gray-500 text-center mb-6">
              Agregue productos igual que en cotizacion. El pedido no afecta inventario hasta facturarse.
            </Text>
            <TouchableOpacity
              className="bg-brand px-6 py-3 rounded-full flex-row items-center"
              onPress={() => router.push('/(tabs)/catalogo?modo=pedido')}
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
                  <Text className="text-emerald-600 font-medium mt-1">{money(item.precioSeleccionado)}</Text>
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
                <Text className="text-gray-900 font-bold text-base">Pedidos pendientes</Text>
                <TouchableOpacity className="p-2" onPress={fetchPedidos} disabled={recentLoading}>
                  <RefreshCw color="#6b7280" size={18} />
                </TouchableOpacity>
              </View>
              {pedidos.map((pedido) => (
                <View key={pedido.id} className="bg-white border border-gray-100 rounded-xl p-3 mb-2">
                  <View className="flex-row justify-between">
                    <Text className="text-gray-900 font-bold">#{pedido.numero || 'N/A'}</Text>
                    <Text className="text-emerald-600 font-bold">{money(pedido.monto_total)}</Text>
                  </View>
                  <Text className="text-gray-600 mt-1" numberOfLines={1}>
                    {pedido.manual_cliente_nombre || pedido.cliente_nombre || 'Cliente Generico'}
                  </Text>
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-gray-400 text-xs">{pedido.fecha || 'Sin fecha'}</Text>
                    <Text className="text-gray-400 text-xs">{pedido.estado || 'Pendiente'}</Text>
                  </View>
                  {pedido.estado === 'Pendiente' && (
                    <TouchableOpacity
                      className={`mt-3 bg-brand rounded-lg py-2 flex-row items-center justify-center ${sendingToVentaId === pedido.id ? 'opacity-60' : ''}`}
                      disabled={sendingToVentaId === pedido.id}
                      onPress={() => enviarPedidoAVenta(pedido)}
                    >
                      <CreditCard color="white" size={16} />
                      <Text className="text-white font-bold ml-2 text-[13px]">
                        {sendingToVentaId === pedido.id ? 'Enviando...' : 'Enviar a venta'}
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
            onPress={() => router.push('/(tabs)/catalogo?modo=pedido')}
          >
            <Search color="#059669" size={20} />
            <Text className="text-emerald-600 font-bold ml-2">Agregar mas articulos</Text>
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
              <Text className="text-emerald-600 text-xl font-bold">{money(total)}</Text>
            </View>
          </View>

          <View className="flex-row space-x-3">
            <TouchableOpacity className="bg-gray-100 p-4 rounded-xl flex-1 items-center justify-center" onPress={() => clearCart()}>
              <Trash2 color="#ef4444" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              className={`bg-emerald-600 p-4 rounded-xl flex-[4] flex-row justify-center items-center ${loading ? 'opacity-50' : ''}`}
              disabled={loading}
              onPress={handleCrearPedido}
            >
              <FileText color="white" size={24} />
              <Text className="text-white font-bold text-lg ml-2">{loading ? 'Guardando...' : 'Guardar Pedido'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={pedidoModal !== null} transparent animationType="slide" onRequestClose={cerrarPedidoYLimpiar}>
        <View className="flex-1 bg-black/60 justify-center items-center px-3">
          <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden" style={{ maxHeight: '90%' }}>
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500">Pedido #{pedidoModal?.numero}</Text>
                <Text className="text-base font-bold text-gray-900">Pedido guardado</Text>
              </View>
              <TouchableOpacity onPress={cerrarPedidoYLimpiar} className="p-1">
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 0 }}>
              <ViewShot
                ref={pedidoShotRef}
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
                    {buildPedidoTexto(pedidoModal)}
                  </Text>
                </View>
              </ViewShot>
            </ScrollView>

            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity className="flex-1 py-4 items-center justify-center active:bg-gray-100" onPress={cerrarPedidoYLimpiar}>
                <Text className="text-gray-700 font-medium">Cerrar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-brand active:opacity-80 ${sendingToVentaId === pedidoModal?.id ? 'opacity-60' : ''}`}
                disabled={sendingToVentaId === pedidoModal?.id}
                onPress={() => enviarPedidoAVenta(pedidoModal)}
              >
                <CreditCard color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {sendingToVentaId === pedidoModal?.id ? 'Enviando...' : 'Venta'}
                </Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-emerald-600 active:opacity-80 ${compartiendo ? 'opacity-60' : ''}`}
                onPress={compartirPedido}
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
