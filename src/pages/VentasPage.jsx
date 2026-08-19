import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useToast } from '@/components/ui/use-toast';
import { useVentas } from '@/hooks/useVentas';
import VentasHeader from '@/components/ventas/VentasHeader';
import VentasTable from '@/components/ventas/VentasTable';
import VentasFooter from '@/components/ventas/VentasFooter';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import DocumentSearchModal from '@/components/ventas/DocumentSearchModal';
import SugerenciasEquivalentesModal from '@/components/ventas/SugerenciasEquivalentesModal';
import { generateFacturaPDF, generateFacturaCartaPDF } from '@/components/common/PDFGenerator';
import { printFacturaPOS, printFacturaQZ, printFacturaWebUsb } from '@/lib/printPOS';
import { setPreferredBackend, getPreferredBackend } from '@/services/printerAdapter';
import { isSilentPrintEnabled } from '@/lib/printHtmlSmart';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { supabase } from '@/lib/customSupabaseClient';
import { findAlmacenPrincipal } from '@/lib/almacenUtils';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { escucharOrdenes } from '@/lib/puenteAgente';
import { publicarDatos } from '@/lib/pantallaContexto';
import { Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { esClienteGenerico } from '@/lib/clienteGenerico';

const VentasPage = () => {
  const { toast } = useToast();
  const { user, profile, empresa, fiscalActivo } = useAuth();
  const grabarBtnRef = useRef(null);
  /* UI state for invoice editing search */
  const [isEditingNumero, setIsEditingNumero] = useState(false);
  const [editNumero, setEditNumero] = useState('');
  const [clienteCodigoInput, setClienteCodigoInput] = useState('');
  // Lo que el agente pidió cobrar, esperando a que la pantalla lo refleje.
  const [cobroPedido, setCobroPedido] = useState(null);

  const {
    date, setDate,
    paymentType, setPaymentType,
    confirmarContado, setConfirmarContado, confirmarPasarAContado,
    diasCredito, setDiasCredito,
    items, setItems,
    itemCode, setItemCode,
    isSaving,
    montoRecibido, setMontoRecibido,
    cliente, setCliente,
    vendedor, setVendedor,
    totals,
    cambio,
    resetVenta,
    handleSelectCliente,
    handleSave,
    addProductToInvoice,
    handleUpdateItem,
    handleDeleteItem,
    handleAddProductByCode,
    handleSelectCotizacion,
    handleSelectCotizacionMagna,
    handleSelectPedido,
    currentItem,
    updateCurrentItem,
    commitCurrentItem,
    clearCurrentItem,
    editItem,
    printFormat, setPrintFormat,
    printMethod, setPrintMethod,
    recargo, setRecargo,
    tipoPago, setTipoPago,
    cuentaBancoId, setCuentaBancoId,
    pagos, setPagos,
    notas, setNotas,
    editingFacturaId,
    editingFacturaNumero,
    loadInvoiceByNumero,
    manualClienteNombre,
    setManualClienteNombre,
    ncfPreview,
    pideCanalOrigen,
    canalOrigen, setCanalOrigen,
    canalSugerido,
  } = useVentas();

  const { activePanel } = usePanels();

  const handleEditFacturaToggle = () => {
    setIsEditingNumero(!isEditingNumero);
    if (!isEditingNumero) setEditNumero('');
  };

  const handleSearchInvoice = async () => {
    if (!editNumero) return;
    await loadInvoiceByNumero(editNumero);
    setIsEditingNumero(false);
    setEditNumero('');
  };

  // Modal de búsqueda de cliente
  const [isClienteSearchModalOpen, setIsClienteSearchModalOpen] = useState(false);
  const handleOpenClienteSearch = () => setIsClienteSearchModalOpen(true);
  const handleCloseClienteSearch = () => setIsClienteSearchModalOpen(false);

  const handleSearchClienteByCodigo = async (codigo) => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .ilike('codigo', codigo)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        handleSelectCliente(data);
        setClienteCodigoInput(data.codigo || '');
        setTimeout(() => document.getElementById('input-codigo')?.focus(), 100);
      } else {
        toast({ title: 'No encontrado', description: `No se encontró un cliente con el código "${codigo}".`, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error searching client by code:', error);
      toast({ title: 'Error', description: 'No se pudo buscar el cliente.', variant: 'destructive' });
    }
  };

  // Modal de búsqueda de producto
  const [isProductSearchModalOpen, setIsProductSearchModalOpen] = useState(false);
  const [modalSessionKey, setModalSessionKey] = useState(0);
  const [isCotizacionModalOpen, setIsCotizacionModalOpen] = useState(false);
  const [isPedidoModalOpen, setIsPedidoModalOpen] = useState(false);

  // Fase 4: Sugerir equivalente al vender producto agotado
  const [sugerenciasEquiv, setSugerenciasEquiv] = useState({ open: false, original: null, lista: [] });

  const checkAndSuggestEquivalentes = useCallback(async (product) => {
    const exist = Number(product?.existencia ?? product?.existencia_morla ?? 0);
    if (exist > 0) return;  // tiene stock, no sugerir nada
    if (!product?.id) return;
    try {
      const { data, error } = await supabase.rpc('sugerir_equivalentes_disponibles', {
        p_producto_id: product.id,
      });
      if (error || !data || data.length === 0) return;
      setSugerenciasEquiv({
        open: true,
        original: { codigo: product.codigo, descripcion: product.descripcion, existencia: exist },
        lista: data,
      });
    } catch (_) { /* silencioso */ }
  }, []);

  // Vigila currentItem para detectar cuando se agrega via codigo+Enter con stock 0
  const lastCheckedItemIdRef = useRef(null);
  useEffect(() => {
    if (!currentItem || !currentItem.producto_id) return;
    if (lastCheckedItemIdRef.current === currentItem.producto_id) return;
    lastCheckedItemIdRef.current = currentItem.producto_id;
    const exist = Number(currentItem.existencia_morla ?? 0);
    if (exist > 0) return;
    checkAndSuggestEquivalentes({
      id: currentItem.producto_id,
      codigo: currentItem.codigo,
      descripcion: currentItem.descripcion,
      existencia: exist,
    });
  }, [currentItem, checkAndSuggestEquivalentes]);

  const handleSelectSugerencia = useCallback(async (sug) => {
    // Reemplazar el currentItem por el equivalente: trae presentaciones tambien
    try {
      const { data: producto } = await supabase
        .from('productos')
        .select('*, presentaciones(*)')
        .eq('id', sug.id)
        .maybeSingle();
      if (producto) {
        clearCurrentItem();
        addProductToInvoice({ ...producto, existencia: sug.existencia });
        toast({
          title: '✅ Equivalente aplicado',
          description: `${sug.codigo} ${sug.es_preferido ? '⭐' : ''} - Stock: ${sug.existencia}`,
        });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo aplicar el equivalente.' });
    }
  }, [addProductToInvoice, clearCurrentItem, toast]);
  const { pedidoParaFacturar, setPedidoParaFacturar } = useFacturacion();

  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [vendedores, setVendedores] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [selectedAlmacen, setSelectedAlmacen] = useState('');
  const [nextFacturaNumero, setNextFacturaNumero] = useState(null);
  const [loadingNumero, setLoadingNumero] = useState(true);

  const fetchNextNumero = useCallback(async () => {
    setLoadingNumero(true);
    try {
      const { data: numeroData, error: numeroError } = await supabase.rpc('get_next_factura_numero');
      if (numeroError) throw numeroError;
      setNextFacturaNumero(numeroData);
    } catch (error) {
      console.error('Error fetching next number', error);
    } finally {
      setLoadingNumero(false);
    }
  }, []);

  // Las líneas de AHORA, para el oyente de órdenes. Va por ref y no por
  // dependencia a propósito: ver más abajo, junto al escucharOrdenes.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // ── LO QUE JARVIS VE DE ESTA PANTALLA ──────────────────────────────
  //
  // (2026-08-17) "Mira la pantalla, hay un error, cámbiate la mercancía",
  // estando parado en Ventas. Jarvis contestó "eso se hace en Ventas, ¿te lo
  // abro?" — y tenía razón en no saber qué decir: `pantalla_actual.datos`
  // llegaba en null. La tubería de publicar contexto existía desde hacía
  // meses y NINGUNA pantalla la usaba; era código muerto.
  //
  // Esto viaja en cada pregunta y se paga por token, así que va lo justo:
  // qué líneas hay, de quién es y cuánto suma. Sin ubicaciones, sin ids, sin
  // el objeto entero. Con eso alcanza para "quita el tanque" y para "¿cuánto
  // llevo?", que es lo que se pregunta delante de un cliente.
  useEffect(() => {
    publicarDatos({
      venta_en_pantalla: {
        cliente: manualClienteNombre || cliente?.nombre || 'CONSUMIDOR FINAL',
        // Numeradas, y con el MISMO criterio que usa el chat para "el número
        // dos": el orden en que se ven en la rejilla.
        lineas: (items || []).slice(0, 15).map((it, i) => ({
          n: i + 1,
          codigo: it.codigo,
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad || 0),
          precio: Number(it.precio || 0),
        })),
        total: Number(totals?.totalFactura ?? 0),
        forma_pago: tipoPago || null,
        recibido: Number(montoRecibido || 0) || null,
        // Que se note que NO está grabada: sin esto el modelo dice "la
        // factura quedó hecha" mirando una pantalla llena que nadie guardó.
        estado: 'sin grabar — se graba con F10',
      },
    });
  }, [items, cliente, manualClienteNombre, totals, tipoPago, montoRecibido]);

  // El agente deja la factura ARMADA, no la graba. Coloca las piezas, la
  // forma de pago y lo recibido; grabar sigue siendo F10, de una persona.
  //
  // Se agrega unidad por unidad con handleAddProductByCode a propósito: es el
  // mismo camino que teclear el código en la fila amarilla, así que pasa por
  // el control de existencia, las sugerencias de equivalentes y el bloqueo de
  // venta bajo costo. Meter las líneas por otra vía se saltaría todo eso.
  useEffect(() => {
    // Las órdenes se atienden EN FILA. El agente manda preparar y cobrar de un
    // tirón; preparar va a buscar la cotización y tarda, así que sin esta fila
    // cobrar se ejecutaba primero, ponía el monto recibido, y al terminar
    // preparar lo borraba con su resetVenta(). La pantalla quedaba con la
    // mercancía puesta y RECIBIDO en cero, y la factura sin grabar.
    const atender = async (orden) => {
      // ── PASO 2: cobrar ──────────────────────────────────────
      // No se graba aquí. Se anota lo pedido y el efecto de abajo espera a
      // que la pantalla lo refleje de verdad antes de pulsar F10.
      if (orden?.tipo === 'cobrar_venta') {
        if (orden.forma_pago) setTipoPago(orden.forma_pago);
        if (orden.recibido) setMontoRecibido(String(orden.recibido));
        setCobroPedido({ ...orden, pedidoEn: Date.now() });
        return;
      }

      // ── CORREGIR lo que ya está armado ──────────────────────────
      // NO limpia la pantalla, y esa es toda la diferencia: quita las líneas
      // que se pidieron y agrega las nuevas encima de lo que hay. Antes, para
      // cambiar una pieza, la única orden disponible era preparar_venta, que
      // arranca con resetVenta() — o sea, rehacer la factura entera con el
      // cliente y la forma de pago otra vez.
      if (orden?.tipo === 'corregir_venta') {
        try {
          const antes = itemsRef.current || [];
          const codigo = (v) => String(v || '').trim().toUpperCase();
          const quitar = new Set((orden.quitar || []).map(codigo));

          for (const it of antes) {
            if (quitar.has(codigo(it.codigo))) handleDeleteItem(it.id);
          }
          for (const l of orden.agregar || []) {
            for (let i = 0; i < l.cantidad; i++) await handleAddProductByCode(l.codigo);
          }

          // Que se diga cuando se pidió quitar algo que no estaba. Callarlo
          // deja creer que se corrigió, y lo que se ve en pantalla es lo que
          // se va a facturar.
          const noEstaban = [...quitar].filter(
            (c) => !antes.some((it) => codigo(it.codigo) === c));
          toast({
            title: noEstaban.length ? 'Corregí lo que pude' : 'Factura corregida',
            description: noEstaban.length
              ? `No estaba en la factura: ${noEstaban.join(', ')}. Revísala; nada se ha guardado.`
              : 'Revísala. Nada se ha guardado todavía.',
            variant: noEstaban.length ? 'destructive' : undefined,
          });
        } catch (e) {
          toast({ title: 'No pude corregir la factura', description: String(e?.message || e), variant: 'destructive' });
        }
        return;
      }

      if (orden?.tipo !== 'preparar_venta') return;
      try {
        // Se limpia SIEMPRE antes de llenar. Sin esto, preparar la venta dos
        // veces —que es justo lo que pasa cuando el agente corrige algo—
        // dejaba las cantidades duplicadas: la segunda pasada agregaba encima
        // de la primera y nadie lo notaba hasta ver el total.
        resetVenta();

        if (orden.cotizacion) {
          // Pasar una cotización a factura sin volver a teclearla. Es el
          // mismo camino que el botón del módulo de Cotizaciones.
          const { data: cot, error } = await supabase
            .from('cotizaciones')
            .select('*')
            .eq('numero', orden.cotizacion)
            .maybeSingle();
          if (error) throw error;
          if (!cot) throw new Error(`No encontré la cotización ${orden.cotizacion}.`);
          await handleSelectCotizacion(cot);
        } else {
          // Unidad por unidad con handleAddProductByCode a propósito: es el
          // mismo camino que teclear el código en la fila amarilla, así que
          // pasa por el control de existencia, las sugerencias de
          // equivalentes y el bloqueo de venta bajo costo.
          for (const l of orden.lineas || []) {
            for (let i = 0; i < l.cantidad; i++) {
              await handleAddProductByCode(l.codigo);
            }
          }
          if (orden.cliente_nombre) setManualClienteNombre(orden.cliente_nombre);
        }

        if (orden.forma_pago) setTipoPago(orden.forma_pago);
        if (orden.recibido) setMontoRecibido(String(orden.recibido));
        toast({
          title: 'Factura preparada',
          description: 'Revísala. Nada se ha guardado todavía.',
        });
      } catch (e) {
        toast({ title: 'No pude preparar la factura', description: String(e?.message || e), variant: 'destructive' });
      }
    };

    let fila = Promise.resolve();
    return escucharOrdenes('ventas', (orden) => {
      fila = fila.then(() => atender(orden)).catch((e) => console.error('[ventas] orden', e));
    });
    // `items` NO va aquí: entra por itemsRef. Ponerlo en las dependencias
    // volvería a montar el oyente con cada línea agregada, y con él la fila
    // que garantiza que preparar termine antes de que empiece cobrar.
  }, [handleAddProductByCode, handleSelectCotizacion, handleDeleteItem, resetVenta,
      setManualClienteNombre, setTipoPago, setMontoRecibido, toast]);


  useEffect(() => {
    const fetchInitialData = async () => {
      setLoadingInitialData(true);
      try {
        const { data: vendedoresData, error: vendedoresError } = await supabase
          .from('vendedores')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre', { ascending: true });
        if (vendedoresError) throw vendedoresError;
        setVendedores(vendedoresData);
        if (vendedoresData.length === 0) {
          toast({
            title: 'Advertencia',
            description: 'No se encontraron vendedores activos. Verifique los permisos o el catálogo.',
            variant: 'warning'
          });
        }

        // Default selection: closest to 'A' or current user if they are a vendor
        if (user && vendedoresData.some(v => v.id === user.id)) {
          setSelectedVendedor(user.id);
        } else if (vendedoresData.length > 0) {
          setSelectedVendedor(vendedoresData[0].id);
        }

        const { data: almacenesData, error: almacenesError } = await supabase
          .from('almacenes')
          .select('*')
          .eq('activo', true);
        if (almacenesError) throw almacenesError;
        setAlmacenes(almacenesData);
        const defaultAlmacen = findAlmacenPrincipal(almacenesData);
        if (defaultAlmacen) setSelectedAlmacen(defaultAlmacen.id);

        await fetchNextNumero();
      } catch (error) {
        console.error('Error fetching initial data', error);
        toast({ title: 'Error', description: 'No se pudieron cargar los datos iniciales.', variant: 'destructive' });
      } finally {
        setLoadingInitialData(false);
        setTimeout(() => document.getElementById('input-codigo')?.focus(), 200);
      }
    };
    fetchInitialData();
  }, [user, toast, fetchNextNumero]);

  useEffect(() => {
    if (pedidoParaFacturar) {
      if (pedidoParaFacturar.type === 'cotizacion_magna') {
        handleSelectCotizacionMagna(pedidoParaFacturar);
      } else if (pedidoParaFacturar.type === 'cotizacion') {
        handleSelectCotizacion(pedidoParaFacturar);
      } else if (pedidoParaFacturar.type === 'pedido') {
        handleSelectPedido(pedidoParaFacturar);
      }
      setPedidoParaFacturar(null);
    }
  }, [pedidoParaFacturar, handleSelectCotizacion, handleSelectCotizacionMagna, handleSelectPedido, setPedidoParaFacturar]);

  // Sincronizar el campo "CÓDIGO DEL CLIENTE" cuando cambia el cliente (al cargar
  // un pedido/cotización desde solicitud). Fallback a RNC/cédula si no hay código.
  useEffect(() => {
    if (!cliente || esClienteGenerico(cliente)) {
      setClienteCodigoInput('');
    } else {
      setClienteCodigoInput(cliente.codigo || cliente.rnc || '');
    }
  }, [cliente]);

  const emitirECF = async (facturaId, facturaNumero) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emitir-fiscal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'emitir_factura', factura_id: facturaId }),
      });
      const result = await resp.json();
      if (result.ok) {
        toast({ title: 'e-CF Emitido', description: `Factura #${facturaNumero} emitida fiscalmente. NCF: ${result.ncf || result.proveedor_number || 'OK'}` });
        return result;
      } else {
        toast({ variant: 'destructive', title: 'Error e-CF', description: result.error || 'No se pudo emitir el e-CF. Puede reintentarlo desde el historial.', duration: 8000 });
        return null;
      }
    } catch (err) {
      console.error('[e-CF] Error:', err);
      toast({ variant: 'destructive', title: 'Error e-CF', description: 'Error de conexión al emitir e-CF. La factura fue guardada correctamente.', duration: 8000 });
      return null;
    }
  };

  const handleConfirmAndPrint = () => {
    // Morla Vieja (solo consulta): el POS se abre solo para consultar y mover
    // productos al sistema nuevo. No se puede facturar.
    if (empresa?.solo_consulta) {
      toast({
        variant: 'destructive',
        title: 'Solo consulta',
        description: `${empresa?.nombre || 'Esta empresa'} es solo para consultar y mover productos al sistema nuevo. No se puede vender desde esta empresa.`,
        duration: 6000,
      });
      return;
    }
    const activeVendedor = vendedores.find(v => v.id === selectedVendedor);
    handleSave(async (facturaData) => {
      if (facturaData) {
        let facturaParaImprimir = facturaData;

        // Emitir e-CF antes de imprimir para que el comprobante salga con e-NCF.
        if (fiscalActivo && facturaData.id) {
          const fiscal = await emitirECF(facturaData.id, facturaData.numero);
          if (fiscal?.ncf || fiscal?.proveedor_number) {
            facturaParaImprimir = {
              ...facturaData,
              ncf: fiscal.ncf || fiscal.proveedor_number,
              encf: fiscal.ncf || fiscal.proveedor_number,
              track_id: fiscal.proveedor_invoice_id || fiscal.trackId || fiscal.track_id || null,
            };
          }
        }

        // Route printing based on selected method.
        // "Imprimir sin diálogo" (checkbox) → texto ESC/POS NATIVO por el agente
        // (misma fuente nativa que daba QZ Tray, pero estable y sin permiso).
        const silentOn = isSilentPrintEnabled();
        // PDF: no imprime, DEJA EL ARCHIVO. Es lo que hace falta para
        // mandarle la factura a una empresa por correo o WhatsApp; el
        // diálogo de impresión del navegador no deja nada que adjuntar.
        // En hoja (carta/media) va el formato completo con NCF; en formato
        // POS, el ticket de 80mm que ya existía.
        if (printMethod === 'pdf') {
          if (printFormat === 'full_page' || printFormat === 'half_page') {
            await generateFacturaCartaPDF(facturaParaImprimir, empresa, 'descargar');
          } else {
            generateFacturaPDF(facturaParaImprimir, empresa);
          }
        } else if (printMethod === 'qz' || printMethod === 'agent' || silentOn) {
          // printFacturaQZ usa el adapter (respeta la preferencia global).
          const previousBackend = getPreferredBackend();
          if (printMethod === 'qz') setPreferredBackend('qz');
          else setPreferredBackend('agent'); // silent o 'agent' → agente
          try {
            await printFacturaQZ(facturaParaImprimir);
          } catch (err) {
            console.error(`[print] Error ESC/POS nativo, uso navegador:`, err);
            toast({
              variant: "destructive",
              title: 'No se pudo imprimir con el agente',
              description: `${err.message || String(err)}. Usando impresión navegador.`,
              duration: 5000,
            });
            printFacturaPOS(facturaParaImprimir, printFormat);
          } finally {
            setPreferredBackend(previousBackend);
          }
        } else if (printMethod === 'webusb') {
          try {
            await printFacturaWebUsb(facturaParaImprimir);
          } catch (err) {
            console.error('[WebUSB] Error, falling back to browser:', err);
            toast({
              variant: "destructive",
              title: "Error WebUSB",
              description: `${err.message || String(err)}. Usando impresión navegador.`,
              duration: 5000,
            });
            printFacturaPOS(facturaParaImprimir, printFormat);
          }
        } else {
          printFacturaPOS(facturaParaImprimir, printFormat);
        }

        toast({ title: 'Factura Guardada', description: `La factura #${facturaData.numero} ha sido generada y guardada.` });

        resetVenta();
        setModalSessionKey(k => k + 1);
        setClienteCodigoInput('');
        fetchNextNumero();
        setTimeout(() => document.getElementById('input-codigo')?.focus(), 150);
      }
    }, activeVendedor?.nombre, selectedVendedor);
  };

  // ── Grabar solo cuando la pantalla YA dice lo que se pidió ────
  // handleSave lee la forma de pago y lo recibido del estado del hook. Poner
  // el estado y grabar en la misma vuelta grabaría con los valores VIEJOS: la
  // factura saldría a crédito, o daría "monto insuficiente" teniendo el
  // dinero puesto. Así que se espera a que el estado llegue de verdad, y
  // recién ahí se pulsa F10 por dentro.
  //
  // Va aquí abajo y no junto al resto de las órdenes porque necesita
  // handleConfirmAndPrint, que se define más arriba de esta línea y no
  // existe todavía cuando se monta aquel efecto.
  useEffect(() => {
    if (!cobroPedido) return;

    const formaLista = !cobroPedido.forma_pago || tipoPago === cobroPedido.forma_pago;
    const montoListo = !cobroPedido.recibido
      || Number(montoRecibido) === Number(cobroPedido.recibido);

    // >>> Y QUE LOS TOTALES YA ESTÉN CALCULADOS <<<
    // (2026-08-16) FT-3504 se grabó con la línea correcta (importe 20.00) y la
    // cabecera EN CERO: sub 0, ITBIS 0, TOTAL 0. Salió impresa así y así entró
    // en la lista de transacciones.
    //
    // `totals` no se deriva de `items` al vuelo: es un useState que rellena un
    // efecto DESPUÉS del render en que cambian las líneas. Al cobrar en el
    // mismo turno, F10 se pulsaba en ese hueco — el detalle lo arma `items`,
    // que ya estaba, y la cabecera `totals`, que aún valía cero.
    //
    // Ninguna de las dos defensas de handleSave lo veía: "factura vacía" mira
    // items, y "monto insuficiente" compara contra un total de cero, que
    // cualquier pago supera.
    //
    // (Una factura legítima de total cero —todo con 100% de descuento— se
    // quedaría esperando y saltaría el aviso de los 3 segundos. Es preferible
    // a grabar una de verdad en cero.)
    const totalesListos = items.length > 0 && Number(totals?.totalFactura) > 0;

    if (!formaLista || !montoListo || !totalesListos) {
      // Un reloj de verdad, no una comprobación de fecha: si el estado no
      // llega, este efecto no se vuelve a ejecutar solo y la espera quedaría
      // colgada en silencio. Cuando el estado sí llega, el efecto se repite y
      // la limpieza cancela el reloj antes de que suene.
      const reloj = setTimeout(() => {
        setCobroPedido(null);
        toast({
          variant: 'destructive',
          title: 'No grabé la factura',
          description: 'La pantalla no terminó de armarse. Revísala y pulsa F10.',
        });
      }, 3000);
      return () => clearTimeout(reloj);
    }

    setCobroPedido(null);
    handleConfirmAndPrint();
  }, [cobroPedido, tipoPago, montoRecibido, items, totals, handleConfirmAndPrint, toast]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (activePanel !== 'ventas') return;

      if (e.key === 'F3') {
        e.preventDefault();
        setIsProductSearchModalOpen(true);
      }
      if (e.key === 'F10') {
        e.preventDefault();
        handleConfirmAndPrint();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleConfirmAndPrint, activePanel]);

  const handleProductSearchSelect = async (product) => {
    try {
      const { data: presData } = await supabase
        .from('presentaciones')
        .select('*')
        .eq('producto_id', product.id);

      let processedProduct = { ...product };
      if (presData && presData.length > 0) {
        processedProduct.presentaciones = presData;
        const mainPres = presData.find(p => p.afecta_ft) || presData[0];
        if (mainPres) {
          processedProduct.precio = parseFloat(mainPres.precio1 || 0);
          processedProduct.max_descuento = parseFloat(mainPres.descuento_pct || 0);
        }
      }
      addProductToInvoice(processedProduct);
      checkAndSuggestEquivalentes(processedProduct);
    } catch (e) {
      console.error("Error fetching presentations", e);
      addProductToInvoice(product);
      checkAndSuggestEquivalentes(product);
    } finally {
      setIsProductSearchModalOpen(false);
      // Focus will return to Cantidad via VentasTable useEffect
    }
  };

  if (loadingInitialData) {
    return <div className="h-full w-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="bg-gray-50 h-full flex flex-col">
      <Helmet><title>Ventas — {empresa?.nombre || 'MotoFlow'}</title></Helmet>

      {empresa?.solo_consulta && (
        <div className="bg-amber-100 border-b-2 border-amber-400 text-amber-900 px-4 py-2 text-sm font-bold text-center">
          🔒 SOLO CONSULTA — {empresa?.nombre}. Puedes buscar productos y moverlos al sistema nuevo (clic derecho), pero NO se puede vender.
        </div>
      )}

      <VentasHeader
        date={date}
        setDate={setDate}
        cliente={cliente}
        onClienteSearch={handleOpenClienteSearch}
        onSelectCliente={(c) => {
          handleSelectCliente(c);
          setClienteCodigoInput(c?.codigo || '');
        }}
        onClearCliente={() => {
          resetVenta();
          setClienteCodigoInput('');
        }}
        onSearchClienteByCodigo={handleSearchClienteByCodigo}
        clienteCodigoInput={clienteCodigoInput}
        setClienteCodigoInput={setClienteCodigoInput}
        vendedores={vendedores}
        selectedVendedor={selectedVendedor}
        onVendedorChange={setSelectedVendedor}
        almacenes={almacenes}
        selectedAlmacen={selectedAlmacen}
        onAlmacenChange={setSelectedAlmacen}
        nextFacturaNumero={nextFacturaNumero}
        loadingNumero={loadingNumero}
        onEditFactura={handleEditFacturaToggle}
        onCotizacionesClick={() => setIsCotizacionModalOpen(true)}
        onPedidosClick={() => setIsPedidoModalOpen(true)}
        isEditingNumero={isEditingNumero}
        editNumero={editNumero}
        setEditNumero={setEditNumero}
        onSearchInvoice={handleSearchInvoice}
        editingFacturaNumero={editingFacturaNumero}
        manualClienteNombre={manualClienteNombre}
        setManualClienteNombre={setManualClienteNombre}
        ncfPreview={ncfPreview}
      />

      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto bg-white shadow border-b border-gray-300">
          <VentasTable
            items={items}
            itemCode={itemCode}
            setItemCode={setItemCode}
            onItemCodeKeyDown={async (e) => {
              if (e.key === 'Enter') {
                await handleAddProductByCode(itemCode);
              }
            }}
            onProductSearch={() => setIsProductSearchModalOpen(true)}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onEditItem={editItem}
            currentItem={currentItem}
            updateCurrentItem={updateCurrentItem}
            commitCurrentItem={commitCurrentItem}
            clearCurrentItem={clearCurrentItem}
            userRole={profile?.role}
          />
        </div>
      </main>

      <VentasFooter
        cliente={cliente}
        paymentType={paymentType}
        setPaymentType={setPaymentType}
        diasCredito={diasCredito}
        setDiasCredito={setDiasCredito}
        montoRecibido={montoRecibido}
        setMontoRecibido={setMontoRecibido}
        cambio={cambio}
        totals={totals}
        onFacturar={handleConfirmAndPrint}
        isSaving={isSaving}
        printFormat={printFormat}
        setPrintFormat={(v) => { setPrintFormat(v); localStorage.setItem('ventas_printFormat', v); }}
        printMethod={printMethod}
        setPrintMethod={(v) => { setPrintMethod(v); localStorage.setItem('ventas_printMethod', v); }}
        tipoPago={tipoPago}
        setTipoPago={setTipoPago}
        cuentaBancoId={cuentaBancoId}
        setCuentaBancoId={setCuentaBancoId}
        pagos={pagos}
        setPagos={setPagos}
        recargo={recargo}
        setRecargo={setRecargo}
        resetVenta={resetVenta}
        grabarBtnRef={grabarBtnRef}
        notas={notas}
        setNotas={setNotas}
        pideCanalOrigen={pideCanalOrigen}
        canalOrigen={canalOrigen}
        setCanalOrigen={setCanalOrigen}
        canalSugerido={canalSugerido}
      />

      <ProductSearchModal
        isOpen={isProductSearchModalOpen}
        onClose={() => setIsProductSearchModalOpen(false)}
        onSelectProduct={handleProductSearchSelect}
        sessionKey={modalSessionKey}
        useConfigDefault={true}
      />

      <ClienteSearchModal
        isOpen={isClienteSearchModalOpen}
        onClose={handleCloseClienteSearch}
        onSelectCliente={(cliente) => {
          handleSelectCliente(cliente);
          setClienteCodigoInput(cliente?.codigo || '');
          handleCloseClienteSearch();
        }}
      />

      <DocumentSearchModal
        isOpen={isCotizacionModalOpen}
        onClose={() => setIsCotizacionModalOpen(false)}
        type="cotizacion"
        vendedores={vendedores}
        onSelect={handleSelectCotizacion}
      />

      <DocumentSearchModal
        isOpen={isPedidoModalOpen}
        onClose={() => setIsPedidoModalOpen(false)}
        type="pedido"
        vendedores={vendedores}
        onSelect={handleSelectPedido}
      />

      <SugerenciasEquivalentesModal
        isOpen={sugerenciasEquiv.open}
        onClose={() => setSugerenciasEquiv({ open: false, original: null, lista: [] })}
        productoOriginal={sugerenciasEquiv.original}
        sugerencias={sugerenciasEquiv.lista}
        onSelectSugerencia={handleSelectSugerencia}
      />

      {/* Pasar a contado una venta que vino de una solicitud financiada cancela
          el prestamo en la financiera, y editarla despues NO lo crea. Por eso
          se avisa antes en vez de dejarlo cambiar en silencio. */}
      <AlertDialog open={confirmarContado} onOpenChange={setConfirmarContado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esta venta es financiada</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Viene de una <b>solicitud de compra financiada</b>. Si la grabas de
                  CONTADO, <b>no se creara el prestamo</b> en la financiera ni la cuenta
                  por cobrar del cliente.
                </p>
                <p className="font-semibold text-red-600">
                  Y no se arregla editandola despues: el prestamo solo se crea al grabar
                  en credito. Habria que repararlo a mano.
                </p>
                <p>Si de verdad el cliente pago todo de contado, continua.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Dejarla en credito</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarPasarAContado} className="bg-red-600 hover:bg-red-700">
              Si, pasar a contado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VentasPage;
