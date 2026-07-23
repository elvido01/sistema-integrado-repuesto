import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Modal, TextInput, ScrollView, Platform, KeyboardAvoidingView, Keyboard } from 'react-native';
import { useCartStore } from '@/src/store/useCartStore';
import { Trash2, Plus, Minus, Search, User, CreditCard, ShoppingCart, PlusCircle, Share2, X, Printer } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/useAuthStore';
import { supabase } from '@/src/supabase/client';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getSavedPrinter } from '@/services/bluetoothPrinter';
import { printFacturaPos } from '@/services/printFactura';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const REPUESTOS_MORLA_EMPRESA = {
  nombre: 'REPUESTOS MORLA',
  razon_social: 'REPUESTOS MORLA',
  rnc: '',
  direccion1: 'Av. Duarte, esq. Baldemiro Rijo',
  direccion2: 'Higuey, Rep. Dom.',
  telefono: '809-390-5965',
};
const isCamineroHeader = (empresa: any) => {
  const text = `${empresa?.nombre || ''} ${empresa?.razon_social || ''}`.toUpperCase();
  return text.includes('MPN') || text.includes('CAMINERO');
};
const normalizePosEmpresa = (empresa: any) => (
  isCamineroHeader(empresa) ? { ...empresa, ...REPUESTOS_MORLA_EMPRESA } : empresa
);
const normalizeItbisPct = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.18;
  return parsed > 1 ? parsed / 100 : parsed;
};
const getLineTotals = (item: any) => {
  const cantidad = Number(item.cantidad || 0);
  const precioConItbis = Number(item.precioSeleccionado || 0);
  const descuento = Number(item.descuento || 0);
  const itbisPct = normalizeItbisPct(item.itbis_pct);
  const importe = round2((precioConItbis * cantidad) - descuento);
  const base = itbisPct > 0 ? round2(importe / (1 + itbisPct)) : importe;
  const itbis = round2(importe - base);
  return {
    cantidad,
    precioConItbis,
    descuento,
    importe,
    base,
    itbis,
    precioBase: cantidad > 0 ? round2(base / cantidad) : 0,
  };
};

export default function POSScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, empresa, tenantId } = useAuthStore();
  const {
    items,
    getTotal,
    removeItem,
    updateQuantity,
    clearCart,
    clienteNombre,
    clienteTelefono,
    cotizacionOrigenId,
    cotizacionOrigenNumero,
    pedidoOrigenId,
    pedidoOrigenNumero,
  } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [montoPagado, setMontoPagado] = useState<string>('');
  const [facturaModal, setFacturaModal] = useState<any | null>(null);
  const ticketRef = useRef<ViewShot>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardBottomInset(Math.max(0, event.endCoordinates?.height || 0));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardBottomInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Imprime la factura activa en la impresora Bluetooth vinculada.
  const imprimirEnBluetooth = async () => {
    if (!facturaModal) return;
    setImprimiendo(true);
    try {
      const saved = await getSavedPrinter();
      if (!saved) {
        Alert.alert(
          'Sin impresora',
          'Aún no has vinculado una impresora Bluetooth. Ve a Más → Impresora para configurarla.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Configurar', onPress: () => router.push('/configuracion/impresora') },
          ]
        );
        return;
      }
      await printFacturaPos(facturaModal);
    } catch (e: any) {
      Alert.alert(
        'No se pudo imprimir',
        e?.message || 'Verifica que la impresora esté encendida y cerca.'
      );
    } finally {
      setImprimiendo(false);
    }
  };

  const total = getTotal();
  const pagadoNum = parseFloat(montoPagado.replace(/,/g, '')) || 0;
  const cambio = useMemo(() => Math.max(0, pagadoNum - total), [pagadoNum, total]);
  const faltante = useMemo(() => Math.max(0, total - pagadoNum), [pagadoNum, total]);

  const handleCobrar = async () => {
    if (items.length === 0) {
      Alert.alert('Error', 'El carrito está vacío');
      return;
    }
    if (pagadoNum < total) {
      Alert.alert('Pago insuficiente', `Falta RD$${faltante.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      return;
    }

    setLoading(true);
    try {
      // 0. Intentar asignar NCF tipo 02 (Consumidor Final) — el POS móvil
      //    siempre vende a consumidor genérico. Si no hay secuencia activa,
      //    la venta procede sin NCF + alerta (igual que en la web).
      let ncfAsignado: string | null = null;
      try {
        const { data: ncfResult } = await supabase.rpc('get_next_ncf', { p_tipo_ncf: '02' });
        if (ncfResult?.success) {
          ncfAsignado = ncfResult.ncf;
        } else if (ncfResult && !ncfResult.success) {
          Alert.alert(
            'Sin NCF disponible',
            `${ncfResult.error}. La factura se emite sin NCF.`,
          );
        }
      } catch (ncfErr: any) {
        console.warn('[POS] No se pudo obtener NCF:', ncfErr?.message);
      }

      const fechaVenta = new Date().toISOString();
      const lineasCalculadas = items.map((item) => ({ item, totals: getLineTotals(item) }));
      const subtotalCalculado = round2(lineasCalculadas.reduce((sum, row) => sum + row.totals.base, 0));
      const itbisCalculado = round2(lineasCalculadas.reduce((sum, row) => sum + row.totals.itbis, 0));
      const totalCalculado = round2(lineasCalculadas.reduce((sum, row) => sum + row.totals.importe, 0));
      let empresaEmision = normalizePosEmpresa(empresa);

      if (tenantId) {
        const { data: empresaActual, error: empresaError } = await supabase
          .from('config_empresa')
          .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, formato_factura')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (empresaError) throw empresaError;
        if (empresaActual) empresaEmision = normalizePosEmpresa(empresaActual);
      }

      // 1. Guardar Venta en Supabase
      const { data: venta, error: ventaError } = await supabase
        .from('facturas')
        .insert({
          tenant_id: tenantId,
          usuario_id: user?.id,
          cliente_id: null,
          fecha: fechaVenta,
          subtotal: subtotalCalculado,
          descuento: 0,
          itbis: itbisCalculado,
          total: totalCalculado,
          forma_pago: 'CONTADO',
          tipo_pago: 'EFECTIVO',
          monto_recibido: pagadoNum,
          cambio: round2(pagadoNum - totalCalculado),
          estado: 'PAGADA',
          ncf: ncfAsignado,
          notas: 'POS_MOVIL',
        })
        .select()
        .single();

      if (ventaError) throw ventaError;

      // 2. Guardar Detalles
      const detalles = lineasCalculadas.map(({ item, totals }) => ({
        tenant_id: tenantId,
        factura_id: venta.id,
        producto_id: item.id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: totals.cantidad,
        precio: totals.precioBase,
        descuento: totals.descuento,
        itbis: totals.itbis,
        importe: totals.importe,
      }));
      const { error: detallesError } = await supabase.from('facturas_detalle').insert(detalles);
      if (detallesError) throw detallesError;

      if (cotizacionOrigenId) {
        const { error: cotError } = await supabase
          .from('cotizaciones')
          .update({ estado: 'Facturada' })
          .eq('id', cotizacionOrigenId);
        if (cotError) throw cotError;
      }

      if (pedidoOrigenId) {
        const { error: pedidoError } = await supabase
          .from('pedidos')
          .update({ estado: 'Facturado' })
          .eq('id', pedidoOrigenId);
        if (pedidoError) throw pedidoError;
      }

      // 3. Preparar snapshot de la factura para el modal
      const numeroFactura = venta.numero || String(venta.id).slice(0, 8).toUpperCase();
      setFacturaModal({
        numero: numeroFactura,
        empresa: empresaEmision,
        cotizacionNumero: cotizacionOrigenNumero,
        pedidoNumero: pedidoOrigenNumero,
        fecha: fechaVenta,
        cliente: clienteNombre,
        items: lineasCalculadas.map(({ item: it, totals }) => ({
          codigo: it.codigo,
          descripcion: it.descripcion,
          cantidad: totals.cantidad,
          precio: totals.precioConItbis,
          itbis: totals.itbis,
          importe: totals.importe,
        })),
        subtotal: subtotalCalculado,
        itbis: itbisCalculado,
        total: totalCalculado,
        pagado: pagadoNum,
        cambio: round2(pagadoNum - totalCalculado),
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  // Construye el texto de la factura en formato ticket POS (monospace).
  // Se envuelve en ``` para que WhatsApp/Telegram/Discord lo rendericen
  // como bloque monospace y se vea como el ticket impreso.
  const empresaTicket = normalizePosEmpresa(empresa);
  const EMPRESA = {
    nombre: empresaTicket?.razon_social || empresaTicket?.nombre || 'MotoFlow',
    direccion: empresaTicket?.direccion1 || '',
    direccion2: empresaTicket?.direccion2 || '',
    telefono: empresaTicket?.telefono || '',
    rnc: empresaTicket?.rnc || '',
  };

  const buildFacturaTexto = (f: any) => {
    if (!f) return '';
    const W = 36; // ancho del ticket
    const fmt = (n: number) => Number(n || 0).toFixed(2);
    const center = (s: string) => {
      const pad = Math.max(0, Math.floor((W - s.length) / 2));
      return ' '.repeat(pad) + s;
    };
    const labelVal = (label: string, value: string) => {
      const v = String(value);
      const spaces = Math.max(1, W - label.length - v.length);
      return label + ' '.repeat(spaces) + v;
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

    const fecha = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
    const fechaStr = fecha.toLocaleDateString('es-DO');
    const horaStr = fecha.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    const numStr = f.numero
      ? `FT-${String(f.numero).padStart(7, '0').slice(-7)}`
      : `FT-${String(f.id || '0').replace(/[^0-9]/g, '').padStart(7, '0').slice(-7)}`;

    let t = '```\n';
    t += center(EMPRESA.nombre) + '\n';
    if (EMPRESA.direccion) t += center(EMPRESA.direccion) + '\n';
    if (EMPRESA.direccion2) t += center(EMPRESA.direccion2) + '\n';
    if (EMPRESA.telefono) t += center(EMPRESA.telefono) + '\n';
    if (EMPRESA.rnc) t += center(`RNC: ${EMPRESA.rnc}`) + '\n';
    t += '\n';
    t += center('FACTURA') + '\n';
    if (f.cotizacionNumero) t += center(`Desde cotizacion #${f.cotizacionNumero}`) + '\n';
    if (f.pedidoNumero) t += center(`Desde pedido #${f.pedidoNumero}`) + '\n';
    t += labelVal(`Numero  : ${numStr}`, horaStr) + '\n';
    t += `Fecha   : ${fechaStr}\n`;
    t += `Vence   : CONTADO\n`;
    t += `Cliente : ${f.cliente || 'CLIENTE GENERICO'}\n`;
    t += `Direccion N/A\n`;
    t += `Tel.    : N/A\n`;
    t += '\n';
    t += sep + '\n';
    t += 'Descripcion de la Mercancia\n';
    t += sep + '\n';
    t += columnsHeader + '\n';
    t += sep + '\n';
    t += '\n';

    let subtotal = 0;
    let itbisTotal = 0;
    f.items.forEach((it: any) => {
      const importe = Number(it.importe) || 0;
      const itbis = Number(it.itbis || 0);
      subtotal += Math.max(0, importe - itbis);
      itbisTotal += itbis;
      t += `${it.descripcion}\n`;
      // Linea de cantidades: CANT UND  PRECIO  ITBIS  MONTO E
      const cantStr = `${it.cantidad} UND`.padEnd(CANT_W);
      const precioStr = fmt(it.precio).padStart(PRECIO_W);
      const itbisStr = fmt(itbis).padStart(ITBIS_W);
      const montoStr = (fmt(importe) + (itbis > 0 ? '' : ' E')).padStart(MONTO_W);
      t += cantStr + precioStr + itbisStr + montoStr + '\n';
    });

    t += '\n';
    t += labelVal('              Sub-Total :', fmt(subtotal)) + '\n';
    t += labelVal('       Descuento en Items:', '0.00') + '\n';
    t += labelVal('         Otros Descuento :', '0.00') + '\n';
    t += labelVal('                 Recargo :', '0.00') + '\n';
    t += labelVal('Valores en         ITBIS :', fmt(itbisTotal)) + '\n';
    t += 'DOP    ' + '='.repeat(W - 7) + '\n';
    t += labelVal('                  TOTAL :', fmt(f.total)) + '\n';
    t += sep2 + '\n';
    t += '\n';
    t += labelVal('Pagado :', fmt(f.pagado)) + '\n';
    t += labelVal('Cambio :', fmt(f.cambio)) + '\n';
    t += '\n';
    t += 'Le Atendio : N/A\n';
    t += `Vendedor   : ${EMPRESA.nombre}\n`;
    t += '\n';
    t += center('*** GRACIAS POR SU COMPRA ***') + '\n';
    t += '```';
    return t;
  };

  const compartirFactura = async () => {
    if (compartiendo) return;
    if (!ticketRef.current) {
      Alert.alert('Error', 'La vista de la factura aun no esta lista para compartir.');
      return;
    }
    setCompartiendo(true);
    try {
      // Capturar el ticket renderizado como imagen JPG temporal
      const uri = await captureRef(ticketRef.current, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Compartir no está disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Factura ${facturaModal?.numero || ''}`,
        UTI: 'public.jpeg',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo compartir la factura');
    } finally {
      setCompartiendo(false);
    }
  };

  const cerrarFacturaYLimpiar = () => {
    clearCart();
    setMontoPagado('');
    setFacturaModal(null);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View className="bg-white px-4 pb-4 border-b border-gray-100 flex-row justify-between items-center" style={{ paddingTop: Math.max(insets.top + 12, 16) }}>
        <View className="flex-row items-center flex-1">
          <View className="bg-gray-100 p-2 rounded-full mr-3">
            <User color="#6b7280" size={20} />
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 font-bold" numberOfLines={1}>{clienteNombre}</Text>
            {clienteTelefono ? <Text className="text-gray-500 text-sm">{clienteTelefono}</Text> : null}
          </View>
        </View>
        {items.length > 0 ? (
          <TouchableOpacity
            className="bg-brand rounded-full px-3 py-2 flex-row items-center ml-2"
            onPress={() => router.push('/(tabs)/catalogo?modo=venta')}
          >
            <PlusCircle color="white" size={18} />
            <Text className="text-white font-medium ml-1.5 text-[13px]">Agregar más</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center p-10 mt-20">
            <ShoppingCart color="#d1d5db" size={64} />
            <Text className="text-gray-400 text-lg mt-4 text-center">No hay productos en el carrito</Text>
            <TouchableOpacity
              className="mt-6 bg-brand px-6 py-3 rounded-full flex-row items-center"
              onPress={() => router.push('/(tabs)/catalogo?modo=venta')}
            >
              <Search color="white" size={20} className="mr-2" />
              <Text className="text-white font-medium">Buscar Productos</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white border-b border-gray-100 p-4">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-4">
                <Text className="text-gray-900 font-bold leading-tight">{item.descripcion}</Text>
                <Text className="text-gray-500 text-sm mt-1">{item.codigo}</Text>
                <Text className="text-brand font-medium mt-1">RD${item.precioSeleccionado.toLocaleString()}</Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-900 font-bold text-lg mb-2">
                  RD${(item.precioSeleccionado * item.cantidad).toLocaleString()}
                </Text>
                <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden">
                  <TouchableOpacity 
                    className="bg-gray-50 p-2 active:bg-gray-200"
                    onPress={() => item.cantidad > 1 ? updateQuantity(item.id, item.cantidad - 1) : removeItem(item.id)}
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
        )}
      />

      {items.length > 0 && (
        <View
          className="bg-white border-t border-gray-200 px-4 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom + 16, 24), marginBottom: keyboardBottomInset }}
        >
          {/* Boton para seguir agregando */}
          <TouchableOpacity
            className="bg-gray-100 py-3 rounded-xl flex-row justify-center items-center mb-3"
            onPress={() => router.push('/(tabs)/catalogo?modo=venta')}
          >
            <Search color="#1d4ed8" size={20} />
            <Text className="text-brand font-medium ml-2">+ Agregar más artículos</Text>
          </TouchableOpacity>

          {/* Total */}
          <View className="flex-row justify-between mb-3">
            <Text className="text-gray-900 text-xl font-bold">Total</Text>
            <Text className="text-brand text-xl font-bold">
              RD${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          {/* Monto Pagado (input) */}
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-gray-600">Monto Pagado</Text>
            <View className="flex-row items-center bg-gray-100 rounded-lg px-3" style={{ minWidth: 140 }}>
              <Text className="text-gray-500 mr-1">RD$</Text>
              <TextInput
                className="flex-1 text-right text-gray-900 text-base font-semibold"
                style={{ paddingVertical: 8, includeFontPadding: false } as any}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                value={montoPagado}
                onChangeText={(t) => setMontoPagado(t.replace(/[^0-9.]/g, ''))}
                selectTextOnFocus
              />
            </View>
          </View>

          {/* Cambio o Faltante */}
          {pagadoNum > 0 && (
            <View className="flex-row justify-between mb-3">
              <Text className={faltante > 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
                {faltante > 0 ? 'Falta' : 'Cambio'}
              </Text>
              <Text className={faltante > 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>
                RD${(faltante > 0 ? faltante : cambio).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          )}

          {/* Botones */}
          <View className="flex-row space-x-3">
            <TouchableOpacity
              className="bg-gray-100 p-4 rounded-xl flex-1 items-center justify-center"
              onPress={() => clearCart()}
            >
              <Trash2 color="#ef4444" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              className={`bg-brand p-4 rounded-xl flex-[4] flex-row justify-center items-center ${loading ? 'opacity-50' : ''}`}
              disabled={loading}
              onPress={handleCobrar}
            >
              <CreditCard color="white" size={24} className="mr-2" />
              <Text className="text-white font-bold text-lg">{loading ? 'Procesando...' : 'Finalizar Venta'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal: factura POS al finalizar venta */}
      <Modal
        visible={facturaModal !== null}
        transparent
        animationType="slide"
        onRequestClose={cerrarFacturaYLimpiar}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-3">
          <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden" style={{ maxHeight: '90%' }}>
            {/* Header */}
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500">Factura #{facturaModal?.numero}</Text>
                <Text className="text-base font-bold text-gray-900">Venta completada</Text>
              </View>
              <TouchableOpacity
                onPress={cerrarFacturaYLimpiar}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="p-1"
              >
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            {/* Cuerpo: ticket monospace envuelto en ViewShot para capturar JPG */}
            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 0 }}>
              <ViewShot
                ref={ticketRef}
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
                    {buildFacturaTexto(facturaModal)
                      .replace(/^```\n?/, '')
                      .replace(/\n?```$/, '')}
                  </Text>
                </View>
              </ViewShot>
            </ScrollView>

            {/* Botones */}
            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity
                className="flex-1 py-4 items-center justify-center active:bg-gray-100"
                onPress={cerrarFacturaYLimpiar}
              >
                <Text className="text-gray-700 font-medium">Cerrar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-emerald-600 active:opacity-80 ${imprimiendo ? 'opacity-60' : ''}`}
                onPress={imprimirEnBluetooth}
                disabled={imprimiendo || compartiendo}
              >
                <Printer color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {imprimiendo ? 'Imprimiendo...' : 'Imprimir'}
                </Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-brand active:opacity-80 ${compartiendo ? 'opacity-60' : ''}`}
                onPress={compartirFactura}
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
    </KeyboardAvoidingView>
  );
}
