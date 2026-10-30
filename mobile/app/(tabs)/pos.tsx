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
import { printFacturaPos, encabezadoEmpresa, tituloCorto } from '@/services/printFactura';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import ClientePickerModal, { leerCliente, type ClientePOS } from '@/src/components/ClientePickerModal';
import { getFiscalConfig, emitirFacturaElectronica, datosEcf, documentoValido, rncValido } from '@/src/services/ecfService';

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
// Cliente genérico fijo que guardan cotizaciones y pedidos (cotizaciones.tsx).
// En la factura no se guarda: va como "sin cliente" + el nombre escrito.
const CLIENTE_GENERICO_ID = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';
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
    clienteId,
    clienteNombre,
    clienteTelefono,
    setCliente,
    cotizacionOrigenId,
    cotizacionOrigenNumero,
    pedidoOrigenId,
    pedidoOrigenNumero,
  } = useCartStore();
  const [loading, setLoading] = useState(false);
  // `disabled={loading}` llega un render tarde: dos toques seguidos en Cobrar
  // alcanzaban a grabar dos facturas (FT-3906 y FT-3907, 10/09/2026, 1 minuto).
  const cobrandoRef = useRef(false);
  const [montoPagado, setMontoPagado] = useState<string>('');
  const [facturaModal, setFacturaModal] = useState<any | null>(null);
  const ticketRef = useRef<ViewShot>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  // (30/10/2026) Cliente ya creado: su RNC y su tipo de comprobante deciden
  // si la factura sale de consumo (02/E32) o de crédito fiscal (01/E31).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<ClientePOS | null>(null);
  // El genérico de cotizaciones/pedidos cuenta como "sin cliente".
  const clienteReal = clienteId && clienteId !== CLIENTE_GENERICO_ID ? clienteId : null;

  useEffect(() => {
    let vivo = true;
    if (!clienteReal) { setClienteInfo(null); return undefined; }
    if (clienteInfo?.id === clienteReal) return undefined;
    leerCliente(clienteReal).then((c) => { if (vivo) setClienteInfo(c); }).catch(() => {});
    return () => { vivo = false; };
  }, [clienteReal]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirCliente = (c: ClientePOS | null) => {
    setPickerOpen(false);
    setClienteInfo(c);
    if (c) setCliente(c.id, c.nombre, c.telefono || '');
    else setCliente(null, 'Cliente Generico', '');
  };

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

    if (cobrandoRef.current) return;
    cobrandoRef.current = true;
    setLoading(true);
    try {
      // 0. Cliente y comprobante. El tipo lo dice la ficha del cliente
      //    (01 crédito fiscal / 02 consumo); sin cliente, consumo.
      let cliente = clienteInfo;
      if (clienteReal && cliente?.id !== clienteReal) {
        // Si no se puede leer la ficha no se adivina el comprobante: con un
        // cliente de crédito fiscal saldría de consumo.
        try {
          cliente = await leerCliente(clienteReal);
        } catch {
          Alert.alert('Sin conexión', 'No se pudo leer la ficha del cliente. Revisa la conexión y vuelve a cobrar.');
          return;
        }
        if (!cliente) {
          // Borrado, inactivo o de otra empresa: reintentar no lo arregla.
          setClienteInfo(null);
          setCliente(null, 'Cliente Generico', '');
          Alert.alert('Cliente no encontrado', 'Ese cliente ya no existe en esta empresa. Se cambió a cliente genérico: elige otro si hace falta y vuelve a cobrar.');
          return;
        }
      }
      const tipoNcf = clienteReal && cliente?.tipo_ncf ? cliente.tipo_ncf : '02';
      let fiscal;
      try {
        fiscal = await getFiscalConfig(tenantId);
      } catch {
        // Sin saber si la empresa factura electrónico, cobrar podría sacar
        // una factura sin e-NCF en una empresa que ya está en producción.
        Alert.alert('Sin conexión', 'No se pudo confirmar la facturación electrónica de la empresa. Revisa la conexión y vuelve a cobrar.');
        return;
      }
      const ecfProduccion = fiscal.activo && fiscal.modo === 'produccion';

      // Mismas reglas de la DGII que la web: crédito fiscal exige RNC, y
      // una factura de consumo de RD$250,000 o más exige identificar al
      // comprador (si no, la DGII la rechaza y el número queda gastado).
      if (tipoNcf === '01' && !rncValido(cliente?.rnc)) {
        Alert.alert('Falta el RNC', `${cliente?.nombre || 'Este cliente'} es de crédito fiscal pero su ficha no tiene un RNC (9 dígitos) o cédula (11 dígitos) válido. Corrígelo en Clientes o vende como consumo.`);
        return;
      }
      if (ecfProduccion && total >= 250000 && !documentoValido(cliente?.rnc)) {
        Alert.alert('Falta la cédula o el RNC', 'Para facturas de RD$250,000 o más la DGII exige identificar al comprador. Elige un cliente con su documento.');
        return;
      }

      // Con e-CF en producción el comprobante lo pone emitir-fiscal; si no,
      // NCF de papel. Si no hay secuencia activa, la venta sigue sin NCF +
      // alerta (igual que en la web).
      let ncfAsignado: string | null = null;
      if (!ecfProduccion) {
        try {
          const { data: ncfResult } = await supabase.rpc('get_next_ncf', { p_tipo_ncf: tipoNcf });
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
      }

      const fechaVenta = new Date().toISOString();
      const lineasCalculadas = items.map((item) => ({ item, totals: getLineTotals(item) }));
      const subtotalCalculado = round2(lineasCalculadas.reduce((sum, row) => sum + row.totals.base, 0));
      const itbisCalculado = round2(lineasCalculadas.reduce((sum, row) => sum + row.totals.itbis, 0));
      const totalCalculado = round2(lineasCalculadas.reduce((sum, row) => sum + row.totals.importe, 0));
      let empresaEmision: any = empresa;

      if (tenantId) {
        const { data: empresaActual, error: empresaError } = await supabase
          .from('config_empresa')
          .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, formato_factura')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (empresaError) throw empresaError;
        if (empresaActual) empresaEmision = empresaActual;
      }

      // 1. Guardar Venta en Supabase
      const { data: venta, error: ventaError } = await supabase
        .from('facturas')
        .insert({
          tenant_id: tenantId,
          usuario_id: user?.id,
          cliente_id: clienteReal,
          ...(!clienteReal && clienteNombre && !/GEN[EÉ]RICO/i.test(clienteNombre)
            ? { manual_cliente_nombre: clienteNombre } : {}),
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

      // El costo se lee de la ficha al facturar: lo que llega de una
      // cotización o un pedido entra al carrito sin costo.
      const idsProductos = [...new Set(items.map((it) => it.id).filter(Boolean))];
      const costos = new Map<string, number>();
      if (idsProductos.length) {
        const { data: fichas } = await supabase.from('productos').select('id, costo').in('id', idsProductos);
        (fichas || []).forEach((p: any) => costos.set(p.id, Number(p.costo) || 0));
      }
      const costoDe = (item: any) => costos.get(item.id) ?? (Number(item.costo) || 0);

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
        costo_unitario: costoDe(item),
      }));
      const { error: detallesError } = await supabase.from('facturas_detalle').insert(detalles);
      if (detallesError) throw detallesError;

      // 3. Descontar del inventario. La existencia es la suma del kardex y
      //    hasta el 11/09/2026 el POS móvil no escribía esta salida: sus 49
      //    facturas no restaron nada. Misma forma que la web (useVentas).
      //    Si falla NO se lanza: la factura ya existe y un "Error" invitaría
      //    a cobrar otra vez.
      const movimientos = lineasCalculadas
        .filter(({ item }) => item.id)
        .map(({ item, totals }) => ({
          tenant_id: tenantId,
          producto_id: item.id,
          tipo: 'SALIDA',
          cantidad: -totals.cantidad,
          costo_unitario: costoDe(item),
          referencia_doc: `FT-${venta.numero}`,
          usuario_id: user?.id,
          fecha: fechaVenta,
        }));
      if (movimientos.length) {
        const { error: invError } = await supabase.from('inventario_movimientos').insert(movimientos);
        if (invError) {
          Alert.alert(
            'Factura grabada, inventario sin descontar',
            `FT-${venta.numero}: ${invError.message}. Avise para corregir la existencia.`,
          );
        }
      }

      if (cotizacionOrigenId) {
        const { data: cotOk, error: cotError } = await supabase
          .from('cotizaciones')
          .update({ estado: 'Facturada' })
          .eq('id', cotizacionOrigenId)
          .select('id');
        if (cotError) throw cotError;
        if (!cotOk?.length) Alert.alert('Cotización sin marcar', `FT-${venta.numero} quedó grabada, pero la cotización #${cotizacionOrigenNumero} no se pudo marcar como facturada. Márquela a mano para no cobrarla dos veces.`);
      }

      if (pedidoOrigenId) {
        const { data: pedOk, error: pedidoError } = await supabase
          .from('pedidos')
          .update({ estado: 'Facturado' })
          .eq('id', pedidoOrigenId)
          .select('id');
        if (pedidoError) throw pedidoError;
        if (!pedOk?.length) Alert.alert('Pedido sin marcar', `FT-${venta.numero} quedó grabada, pero el pedido #${pedidoOrigenNumero} no se pudo marcar como facturado. Márquelo a mano para no cobrarlo dos veces.`);
      }

      // 4. Factura electrónica. En producción se espera: el e-NCF va en el
      //    papel. En pruebas va por detrás (el fallo queda en
      //    documentos_fiscales, igual que en la web).
      let ncfFinal: string | null = ncfAsignado;
      let ecf = null;
      if (ecfProduccion) {
        try {
          const r = await emitirFacturaElectronica(venta.id);
          if (r.ok) {
            ncfFinal = r.ncf || r.proveedor_number || null;
            ecf = datosEcf(ncfFinal, r.impresion);
          } else {
            Alert.alert('Factura grabada, e-CF no emitido', `FT-${venta.numero}: ${r.error || 'error desconocido'}. Se puede reintentar desde el Monitor DGII en la web.`);
          }
        } catch (e: any) {
          Alert.alert('Factura grabada, e-CF no emitido', `FT-${venta.numero}: sin conexión con la DGII (${e?.message || e}). Se puede reintentar desde el Monitor DGII en la web.`);
        }
      } else if (fiscal.activo) {
        emitirFacturaElectronica(venta.id)
          .then((r) => { if (!r.ok) console.warn('[e-CF pruebas]', r.error); })
          .catch((e) => console.warn('[e-CF pruebas]', e?.message || e));
      }

      // 5. Preparar snapshot de la factura para el modal
      const numeroFactura = venta.numero || String(venta.id).slice(0, 8).toUpperCase();
      setFacturaModal({
        numero: numeroFactura,
        empresa: empresaEmision,
        cotizacionNumero: cotizacionOrigenNumero,
        pedidoNumero: pedidoOrigenNumero,
        fecha: fechaVenta,
        cliente: cliente?.nombre || clienteNombre,
        clienteRnc: cliente?.rnc || null,
        clienteTel: cliente?.telefono || clienteTelefono || null,
        ncf: ncfFinal,
        ecf,
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
      cobrandoRef.current = false;
      setLoading(false);
    }
  };

  // Construye el texto de la factura en formato ticket POS (monospace).
  // Se envuelve en ``` para que WhatsApp/Telegram/Discord lo rendericen
  // como bloque monospace y se vea como el ticket impreso.
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

    // El mismo emisor que el papel: el que se leyó al cobrar (f.empresa).
    const EMPRESA = encabezadoEmpresa(f.empresa || empresa);
    let t = '```\n';
    t += center(EMPRESA.nombre) + '\n';
    if (EMPRESA.razonSocial) t += center(EMPRESA.razonSocial) + '\n';
    if (EMPRESA.direccion) t += center(EMPRESA.direccion) + '\n';
    if (EMPRESA.direccion2) t += center(EMPRESA.direccion2) + '\n';
    if (EMPRESA.telefono) t += center(EMPRESA.telefono) + '\n';
    if (EMPRESA.rnc) t += center(`RNC: ${EMPRESA.rnc}`) + '\n';
    t += '\n';
    if (f.ecf) {
      t += center(tituloCorto(f.ecf.titulo, W)) + '\n';
      t += center(`e-NCF: ${f.ecf.encf}`) + '\n';
      if (f.ecf.fecha_vencimiento) t += center(`Valida hasta: ${f.ecf.fecha_vencimiento}`) + '\n';
    } else {
      t += center('FACTURA') + '\n';
      if (f.ncf) t += center(`NCF: ${f.ncf}`) + '\n';
    }
    if (f.cotizacionNumero) t += center(`Desde cotizacion #${f.cotizacionNumero}`) + '\n';
    if (f.pedidoNumero) t += center(`Desde pedido #${f.pedidoNumero}`) + '\n';
    t += labelVal(`Numero  : ${numStr}`, horaStr) + '\n';
    t += `Fecha   : ${fechaStr}\n`;
    t += `Vence   : CONTADO\n`;
    t += `Cliente : ${f.cliente || 'CLIENTE GENERICO'}\n`;
    if (f.clienteRnc) t += `RNC/Ced : ${f.clienteRnc}\n`;
    t += `Tel.    : ${f.clienteTel || 'N/A'}\n`;
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
        {/* Tocar el cliente abre el buscador de clientes ya creados */}
        <TouchableOpacity className="flex-row items-center flex-1" onPress={() => setPickerOpen(true)}>
          <View className="bg-gray-100 p-2 rounded-full mr-3">
            <User color="#6b7280" size={20} />
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 font-bold" numberOfLines={1}>{clienteNombre}</Text>
            <Text className="text-gray-500 text-xs" numberOfLines={1}>
              {clienteInfo
                ? [clienteInfo.rnc ? `RNC/Céd: ${clienteInfo.rnc}` : null, clienteInfo.tipo_ncf === '01' ? 'Crédito fiscal' : 'Consumo']
                  .filter(Boolean).join(' · ')
                : (clienteTelefono || 'Toca para elegir cliente')}
            </Text>
          </View>
          <Text className="text-brand text-xs font-bold ml-2">Cambiar</Text>
        </TouchableOpacity>
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

      <ClientePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={elegirCliente} />

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
                  {/* Representación impresa del e-CF: QR + código + firma */}
                  {facturaModal?.ecf ? (
                    <View style={{ alignItems: 'center', marginTop: 8 }}>
                      {facturaModal.ecf.qr_url ? (
                        <QRCode value={facturaModal.ecf.qr_url} size={130} ecl="M" />
                      ) : null}
                      {facturaModal.ecf.codigo_seguridad ? (
                        <Text style={{ fontSize: 11, color: '#111827', marginTop: 6 }}>
                          Código de seguridad: {facturaModal.ecf.codigo_seguridad}
                        </Text>
                      ) : null}
                      {facturaModal.ecf.fecha_firma ? (
                        <Text style={{ fontSize: 11, color: '#111827' }}>
                          Fecha de firma digital: {facturaModal.ecf.fecha_firma}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
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
