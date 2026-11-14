import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useToast } from '@/components/ui/use-toast';
import { useVentas } from '@/hooks/useVentas';
import VentasHeader from '@/components/ventas/VentasHeader';
import VentasTable from '@/components/ventas/VentasTable';
import LineasServicios from '@/components/ventas/LineasServicios';
import VentasFooter from '@/components/ventas/VentasFooter';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import VarianteVentaModal from '@/components/ventas/VarianteVentaModal';
import VentaTactil from '@/components/ventas/VentaTactil';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import DocumentSearchModal from '@/components/ventas/DocumentSearchModal';
import SugerenciasEquivalentesModal from '@/components/ventas/SugerenciasEquivalentesModal';
import { generateFacturaPDF, generateFacturaCartaPDF } from '@/components/common/PDFGenerator';
import { imprimirFactura } from '@/lib/printPOS';
import { registrarError } from '@/lib/registroErrores';
import { isSilentPrintEnabled } from '@/lib/printHtmlSmart';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { supabase } from '@/lib/customSupabaseClient';
import { findAlmacenPrincipal } from '@/lib/almacenUtils';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { escucharOrdenes } from '@/lib/puenteAgente';
import { publicarDatos } from '@/lib/pantallaContexto';
import { Gift, Loader2, X } from 'lucide-react';
import { nombreCanal } from '@/lib/canalesOrigen';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { esClienteGenerico } from '@/lib/clienteGenerico';
import { docFiscalValido, tipoExigeRnc } from '@/lib/docFiscal';
import { useLayout } from '@/contexts/LayoutContext';
import { useEsTelefono, leerVistaCompleta, guardarVistaCompleta } from '@/hooks/useEsTelefono';
import { Smartphone } from 'lucide-react';

const VentasPage = () => {
  const { toast } = useToast();
  const { user, profile, empresa, fiscalActivo, fiscalModo, tenantId } = useAuth();
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
    moneda, setMoneda, tasaCambio, setTasaCambio,
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
    promoAplicada,
    quitarCodigoPromo,
    handleSelectCotizacion,
    handleSelectCotizacionMagna,
    handleSelectPedido,
    currentItem,
    updateCurrentItem,
    commitCurrentItem,
    clearCurrentItem,
    editItem,
    editingItemIndex,
    printFormat, setPrintFormat,
    printMethod, setPrintMethod,
    recargo, setRecargo,
    propina, setPropina,
    setRetencionEstimada,
    tipoPago, setTipoPago,
    cuentaBancoId, setCuentaBancoId,
    pagos, setPagos,
    notas, setNotas,
    editingFacturaId,
    editingFacturaNumero,
    editingFacturaNcf,
    loadInvoiceByNumero,
    manualClienteNombre,
    setManualClienteNombre,
    ncfPreview,
    loadNcfPreview,
    pideCanalOrigen,
    canalOrigen,
    agregarProductoPorId,
    agregarLineaDirecta,
    setInterceptorProducto,
  } = useVentas();

  // (09/11/2026) Ventanas y aluminio: antes de agregar un producto se pregunta
  // el color y si va por unidad o por pies (VarianteVentaModal). Si no tiene
  // colores ni largo de barra, el modal lo agrega directo. Otros tipos: nada.
  const [varianteDe, setVarianteDe] = useState(null);
  const esAluminio = empresa?.tipo_negocio === 'aluminio';
  // Mientras el agente arma o corrige la factura, los productos entran directo
  // (no puede contestar el modal y cada uno taparía al anterior).
  const agenteArmandoRef = useRef(false);
  useEffect(() => {
    setInterceptorProducto(esAluminio ? (product) => {
      if (agenteArmandoRef.current) return false;
      setVarianteDe(product);
      return true;
    } : null);
    return () => setInterceptorProducto(null);
  }, [esAluminio, setInterceptorProducto]);

  const { activePanel } = usePanels();

  // (11/11/2026) Cafetería: Ventas abre en pantalla táctil (VentaTactil).
  // Cobrar ahí usa el mismo camino que el agente: pone la forma de pago y lo
  // recibido, y el efecto de cobroPedido pulsa F10 cuando la pantalla ya lo
  // refleja (grabar, imprimir, caja, cierre y e-CF como siempre).
  const esCafeteria = empresa?.tipo_negocio === 'cafeteria';
  const [modoTactil, setModoTactil] = useState(true);
  const tactilAbierto = esCafeteria && modoTactil;
  const cobrarTactil = async ({ forma_pago, recibido }) => {
    // Tarjeta/transferencia: la cuenta a la que entra, como la escoge el pie
    // de la factura (CuentaBancariaSelect): default de Ventas → default
    // general → primera. Sin esto se grababa antes de que el pie la cargara.
    let cuenta = null;
    if (forma_pago !== 'EFECTIVO') {
      const [{ data: lista }, { data: defs }] = await Promise.all([
        supabase.rpc('get_cuentas_seleccionables', { p_moneda: 'DOP' }),
        supabase.from('cuentas_bancarias_default').select('modulo, cuenta_id').eq('tenant_id', tenantId),
      ]);
      const cuentas = (lista || []).filter((c) => c.moneda === 'DOP');
      const defId = (defs || []).find((d) => d.modulo === 'ventas')?.cuenta_id || empresa?.cuenta_bancaria_default_id;
      cuenta = (cuentas.find((c) => c.id === defId) || cuentas[0])?.id || null;
      setCuentaBancoId(cuenta);
    }
    setPagos([]);
    setPaymentType('contado');
    setTipoPago(forma_pago);
    setMontoRecibido(String(recibido));
    setCobroPedido({ tipo: 'cobrar_venta', forma_pago, recibido, contado: true, cuenta, pedidoEn: Date.now() });
  };
  const { setSidebarOpen } = useLayout();

  // (11/11/2026) Punto de venta en el teléfono: la misma venta (mismo
  // useVentas, mismo F10/grabar, NCF, e-CF y retenciones) con otra forma:
  // cabecera compacta, líneas en tarjetas y "Cobrar" abajo. Se puede pedir la
  // vista completa (se recuerda en ese teléfono) y volver.
  const esTelefono = useEsTelefono();
  const [vistaCompleta, setVistaCompleta] = useState(leerVistaCompleta);
  const movil = esTelefono && !vistaCompleta;
  const cambiarVista = (completa) => { guardarVistaCompleta(completa); setVistaCompleta(completa); };

  // (29/10/2026) El punto de venta necesita todo el ancho: en pantallas
  // medianas, al entrar a Ventas (o al achicar la ventana) se recoge el menú
  // lateral antes de que la factura se deforme. Nunca lo vuelve a abrir solo.
  useEffect(() => {
    if (activePanel !== 'ventas') return undefined;
    const ANCHO_MINIMO = 1500; // menú abierto (260 px) + factura completa
    const revisar = () => {
      if (window.innerWidth < ANCHO_MINIMO) setSidebarOpen(false);
    };
    revisar();
    window.addEventListener('resize', revisar);
    return () => window.removeEventListener('resize', revisar);
  }, [activePanel, setSidebarOpen]);

  // (30/10/2026) Al abrir "editar factura" el campo trae la ÚLTIMA factura
  // (la que más se corrige) ya seleccionada: Enter la abre, o se escribe
  // encima cualquier número anterior. No hay límite de día ni de hora.
  const handleEditFacturaToggle = async () => {
    if (isEditingNumero) {
      setIsEditingNumero(false);
      setEditNumero('');
      return;
    }
    // Primero el número y DESPUÉS se abre el campo: así el autoFocus lo
    // encuentra puesto y lo deja seleccionado para escribir encima.
    let ultimo = '';
    try {
      const { data } = await supabase.from('facturas')
        .select('numero').order('numero', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (data?.numero != null) ultimo = String(data.numero);
    } catch (_) { /* sin el último número, el campo queda vacío como antes */ }
    setEditNumero(ultimo);
    setIsEditingNumero(true);
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

  // (11/11/2026) Lupa del RNC: el cliente se busca por RNC/cédula; si no es
  // cliente todavía y está en el registro de la DGII, se crea con su razón
  // social (crédito fiscal) y queda escogido. sql/dgii_contribuyentes.sql
  const handleBuscarRnc = async (doc) => {
    // RNC borrado del todo: se quita el cliente (vuelve al genérico).
    if (!String(doc || '').trim()) {
      handleSelectCliente(null);
      setClienteCodigoInput('');
      setManualClienteNombre('');
      return true;
    }
    try {
      const { data, error } = await supabase.rpc('cliente_desde_rnc', { p_doc: doc });
      if (error) throw error;
      if (!data?.ok) {
        const msg = {
          formato: 'Un RNC lleva 9 dígitos y una cédula 11.',
          no_inscrito: data?.cargado === false
            ? 'Todavía no está cargado el listado de la DGII. Crea el cliente a mano por ahora.'
            : 'Ese RNC/cédula no está inscrito como contribuyente en la DGII. Revisa el número.',
          sin_empresa: 'No se pudo saber la empresa activa. Refresca la página.',
          inactivo: `Ese RNC es de ${data?.nombre || 'un cliente'} (${data?.codigo || ''}), que está DESACTIVADO. Actívalo en Clientes si quieres facturarle.`,
        }[data?.motivo] || 'No se pudo buscar el RNC.';
        toast({ variant: 'destructive', title: 'RNC no encontrado', description: msg, duration: 8000 });
        return false;
      }
      const c = data.cliente;
      handleSelectCliente(c);
      setClienteCodigoInput(c.codigo || '');
      const estado = String(data.estado_dgii || '').toUpperCase();
      toast({
        title: data.existente ? `Cliente: ${c.nombre}` : `Cliente nuevo: ${c.nombre}`,
        description: data.existente
          ? 'Ya estaba en tus clientes.'
          : 'Creado con los datos de la DGII (crédito fiscal). La próxima vez ya aparece.',
      });
      if (estado && estado !== 'ACTIVO') {
        toast({ variant: 'destructive', title: `Ojo: en la DGII figura ${estado}`, description: 'Confirma con el cliente antes de facturarle crédito fiscal.', duration: 10000 });
      }
      setTimeout(() => document.getElementById('input-codigo')?.focus(), 100);
      return true;
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo buscar el RNC', description: err.message || String(err) });
      return false;
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
          agenteArmandoRef.current = true;
          try {
            for (const l of orden.agregar || []) {
              for (let i = 0; i < l.cantidad; i++) await handleAddProductByCode(l.codigo);
            }
          } finally { agenteArmandoRef.current = false; }

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
            .eq('tenant_id', tenantId)   // numeración por empresa
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
          agenteArmandoRef.current = true;
          try {
            for (const l of orden.lineas || []) {
              for (let i = 0; i < l.cantidad; i++) {
                await handleAddProductByCode(l.codigo);
              }
            }
          } finally { agenteArmandoRef.current = false; }
          if (orden.cliente_nombre) setManualClienteNombre(orden.cliente_nombre);
          if (orden.cliente_id) {
            const { data: cli } = await supabase.from('clientes').select('*')
              .eq('id', orden.cliente_id).eq('tenant_id', tenantId).maybeSingle();
            if (cli) await handleSelectCliente(cli, { repreciar: false });
          }
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
      setManualClienteNombre, setTipoPago, setMontoRecibido, toast, handleSelectCliente, tenantId]);


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
            title: 'Debe crear un vendedor',
            description: 'Esta empresa no tiene vendedores y sin vendedor no se puede facturar. Créalo en Catálogo → Vendedores.',
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

  const emitirECF = async (facturaId, facturaNumero, { silencioso = false } = {}) => {
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
        if (!silencioso) toast({ title: 'e-CF Emitido', description: `Factura #${facturaNumero} emitida fiscalmente. NCF: ${result.ncf || result.proveedor_number || 'OK'}` });
        return result;
      } else {
        // En pruebas no se le pinta un cuadro rojo al cajero por cada venta:
        // el fallo queda en documentos_fiscales, que es donde se trabaja la
        // integración. Un aviso que sale siempre deja de ser un aviso.
        if (!silencioso) registrarError('ventas.emitirECF', result.error || 'e-CF no emitido', { factura: facturaNumero });
        if (!silencioso) toast({ variant: 'destructive', title: 'Error e-CF', description: result.error || 'No se pudo emitir el e-CF. Puede reintentarlo desde el historial.', duration: 8000 });
        else console.warn('[e-CF pruebas] no emitido:', result.error);
        return null;
      }
    } catch (err) {
      console.error('[e-CF] Error:', err);
      if (!silencioso) registrarError('ventas.emitirECF.conexion', err, { factura: facturaNumero });
      if (!silencioso) toast({ variant: 'destructive', title: 'Error e-CF', description: 'Error de conexión al emitir e-CF. La factura fue guardada correctamente.', duration: 8000 });
      return null;
    }
  };

  const handleConfirmAndPrint = async () => {
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
    // (12/11/2026) VENDEDOR: sin él la base rechazaba la factura con un
    // mensaje técnico ("invalid input syntax for type uuid"). Si no hay uno
    // escogido se vuelve a leer la lista (lo pudieron crear con Ventas
    // abierta) y se deja escogido el del usuario o el primero, PERO no se
    // graba en esta pasada: se avisa cuál quedó para que lo confirmen (la
    // comisión es de quien vendió). Sin ninguno, se avisa claro y no se graba.
    const vendedorFactura = vendedores.find(v => v.id === selectedVendedor);
    if (!vendedorFactura) {
      let lista = null, errVend = null;
      try {
        const r = await supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre', { ascending: true });
        lista = r.data; errVend = r.error;
      } catch (e) { errVend = e; }
      if (!errVend && lista?.length) {
        const elegido = lista.find(v => v.id === user?.id) || lista[0];
        setVendedores(lista);
        setSelectedVendedor(elegido.id);
        toast({
          variant: 'warning',
          title: 'Revisa el vendedor',
          description: `Quedó escogido ${elegido.nombre}. Si es otro, cámbialo en la cabecera (Más datos en el teléfono) y vuelve a cobrar.`,
          duration: 10000,
        });
      } else {
        toast({
          variant: 'destructive',
          title: errVend ? 'No se pudieron leer los vendedores' : 'Debe crear un vendedor',
          description: errVend
            ? `${errVend.message || errVend}. Intenta de nuevo.`
            : 'Esta empresa no tiene vendedores y sin vendedor no se puede facturar. Créalo en Catálogo → Vendedores y vuelve a cobrar.',
          duration: 10000,
        });
      }
      return;
    }
    // (14/10/2026) La DGII rechaza la factura de consumo electrónica de
    // RD$250,000 o más si el comprador no está identificado, y el número queda
    // gastado (D Mario FT-6, E320000000002). Se frena antes de grabar.
    // Cédula/RNC (9 u 11 dígitos) o pasaporte (va como IdentificadorExtranjero).
    const pasaporte = String(cliente?.rnc || '').toUpperCase().replace(/[\s-]/g, '');
    const clienteIdentificado = docFiscalValido(cliente?.rnc)
      || (/^[A-Z0-9]{5,20}$/.test(pasaporte) && /[A-Z]/.test(pasaporte) && /[1-9]/.test(pasaporte));
    if (fiscalActivo && fiscalModo === 'produccion' && Number(totals?.totalFactura || 0) >= 250000 && !clienteIdentificado) {
      toast({
        variant: 'destructive',
        title: 'Falta la cédula, el RNC o el pasaporte del cliente',
        description: 'Para facturas de RD$250,000 o más la DGII exige identificar al comprador. Elige o crea el cliente con su documento y vuelve a pulsar F10.',
        duration: 9000,
      });
      return;
    }
    // (11/11/2026) Ya se puede encender producción con E31 o E32 sola (BRIMAR
    // solo tiene E31). Si esta venta cae en el tipo que la empresa no tiene (o
    // está agotado), la DGII no la puede emitir y la cola la reintentaría en
    // vano: se frena aquí, antes de grabar.
    // Editar una factura ya hecha no toma número nuevo: no aplica. Y el aviso
    // tiene que ser del tipo que le toca a ESTE cliente (mismo criterio que
    // loadNcfPreview), no uno viejo de otro cliente.
    const tipoCliEcf = String(cliente?.tipo_ncf || '').toUpperCase().replace(/^[BE]/, '');
    const tipoEsperado = !docFiscalValido(cliente?.rnc) || tipoCliEcf === '02' || tipoCliEcf === '32' ? '32' : '31';
    const avisoSec = String(ncfPreview?.aviso || '');
    if (fiscalActivo && fiscalModo === 'produccion' && !editingFacturaId && ncfPreview?.electronico
        && !ncfPreview?.ncf && ncfPreview?.tipo_ncf === tipoEsperado
        && /^(Sin secuencia|E\d+ agotada|E\d+ mal cargada)/.test(avisoSec)) {
      const t = ncfPreview.tipo_ncf;
      const nombre = empresa?.nombre || 'La empresa';
      const como = avisoSec.startsWith('Sin secuencia') ? `no tiene números E${t} cargados`
        : avisoSec.includes('agotada') ? `ya gastó todos sus números E${t}` : `tiene la secuencia E${t} mal cargada`;
      toast({
        variant: 'destructive',
        title: `No se puede facturar: ${nombre} ${como}`,
        description: t === '32'
          ? 'Esta venta sale como CONSUMO (E32). Escoge un cliente con RNC o cédula válida marcado crédito fiscal, o carga/corrige la E32 en Configuración → Secuencias e-NCF autorizadas.'
          : `Esta venta sale como CRÉDITO FISCAL (E${t}). Carga/corrige la E${t} en Configuración → Secuencias e-NCF autorizadas, o márcale al cliente consumo.`,
        duration: 10000,
      });
      // Se vuelve a leer la secuencia: si la acaban de cargar en
      // Configuración, el próximo F10 ya pasa sin re-escoger al cliente.
      loadNcfPreview?.(cliente?.tipo_ncf || '02', cliente);
      return;
    }
    // (10/11/2026) Cliente marcado crédito fiscal con RNC/cédula inválido: la
    // factura electrónica sale como CONSUMO (E32) y el cliente pierde su
    // crédito fiscal. Se pregunta antes de gastar el número.
    if (fiscalActivo && fiscalModo === 'produccion' && tipoExigeRnc(cliente?.tipo_ncf) && !docFiscalValido(cliente?.rnc)) {
      const ok = window.confirm(`${cliente?.nombre || 'El cliente'} está marcado CRÉDITO FISCAL, pero su RNC/cédula (${cliente?.rnc || 'vacío'}) no es válido: un RNC lleva 9 dígitos y una cédula 11.\n\nSi grabas así, la factura sale como CONSUMO (E32).\n\nAceptar = grabar como consumo.\nCancelar = corregir el RNC en la ficha del cliente y volver a escogerlo.`);
      if (!ok) return;
    }
    handleSave(async (facturaData, marca) => {
      if (facturaData) {
        let facturaParaImprimir = facturaData;

        // >>> EN PRUEBAS, EL MOSTRADOR NO ESPERA <<<
        // La emisión a la DGII se espera SOLO en producción, porque ahí el
        // e-NCF va impreso en el papel y sin él la factura no vale.
        //
        // En modo pruebas no vale nada: son 389 emisiones fallidas en 30 días
        // contra el ambiente de test (TesteCF), todas con el mismo error, y
        // cada una de ellas era medio segundo —a veces seis— de un cliente
        // esperando de pie por un comprobante que no existe. Se sigue
        // emitiendo, porque así avanza la integración y los fallos quedan
        // registrados en documentos_fiscales, pero por detrás.
        const esperarFiscal = fiscalActivo && fiscalModo === 'produccion';

        if (fiscalActivo && facturaData.id && !esperarFiscal) {
          emitirECF(facturaData.id, facturaData.numero, { silencioso: true })
            .catch((e) => console.warn('[e-CF pruebas]', e?.message || e));
        }

        if (esperarFiscal && facturaData.id) {
          const fiscal = await emitirECF(facturaData.id, facturaData.numero);
          // La única espera obligatoria antes del papel. Se mide aparte para
          // saber cuánto pesa.
          marca?.('fiscal');
          if (fiscal?.ncf || fiscal?.proveedor_number) {
            facturaParaImprimir = {
              ...facturaData,
              ncf: fiscal.ncf || fiscal.proveedor_number,
              encf: fiscal.ncf || fiscal.proveedor_number,
              track_id: fiscal.proveedor_invoice_id || fiscal.trackId || fiscal.track_id || null,
              // QR / código de seguridad / fecha de firma para el papel
              // (lib/ecfImpresion.js); así no hace falta otra consulta.
              impresion_ecf: fiscal.impresion || null,
            };
          }
        }

        // Route printing based on selected method.
        // "Imprimir sin diálogo" (checkbox) → texto ESC/POS NATIVO por el agente
        // (misma fuente nativa que daba QZ Tray, pero estable y sin permiso).
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
        } else {
          // Misma regla que la reimpresión (lib/printPOS.js → imprimirFactura).
          await imprimirFactura(facturaParaImprimir, {
            printFormat, printMethod,
            onError: (err) => {
              console.error('[print] Error de impresión nativa, uso navegador:', err);
              toast({
                variant: "destructive",
                title: 'No se pudo imprimir con el método elegido',
                description: `${err.message || String(err)}. Usando impresión navegador.`,
                duration: 5000,
              });
            },
          });
        }

        toast({ title: 'Factura Guardada', description: `La factura #${facturaData.numero} ha sido generada y guardada.` });

        resetVenta();
        setModalSessionKey(k => k + 1);
        setClienteCodigoInput('');
        fetchNextNumero();
        setTimeout(() => document.getElementById('input-codigo')?.focus(), 150);
      }
    }, vendedorFactura.nombre, vendedorFactura.id,
       // Cómo se imprimió, para poder comparar: el agente, el diálogo del
       // navegador y el PDF no tardan lo mismo ni de lejos.
       isSilentPrintEnabled() ? 'silencioso' : printMethod);
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
    // Pantalla táctil (cafetería): además, de contado, sin pagos partidos
    // viejos y con la cuenta del banco puesta (tarjeta/transferencia).
    const tactilListo = !cobroPedido.contado || (paymentType === 'contado' && pagos.length === 0
      && (cobroPedido.cuenta == null || cuentaBancoId === cobroPedido.cuenta));

    if (!formaLista || !montoListo || !totalesListos || !tactilListo) {
      // Un reloj de verdad, no una comprobación de fecha: si el estado no
      // llega, este efecto no se vuelve a ejecutar solo y la espera quedaría
      // colgada en silencio. Cuando el estado sí llega, el efecto se repite y
      // la limpieza cancela el reloj antes de que suene.
      const reloj = setTimeout(() => {
        setCobroPedido(null);
        toast({
          variant: 'destructive',
          title: 'No grabé la factura',
          description: cobroPedido.contado
            ? 'La pantalla no terminó de armarse. Toca Cobrar otra vez; si se repite, revísala en "Factura normal".'
            : 'La pantalla no terminó de armarse. Revísala y pulsa F10.',
        });
      }, 3000);
      return () => clearTimeout(reloj);
    }

    setCobroPedido(null);
    handleConfirmAndPrint();
  }, [cobroPedido, tipoPago, montoRecibido, items, totals, paymentType, pagos, cuentaBancoId, handleConfirmAndPrint, toast]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (activePanel !== 'ventas') return;
      // Con la pantalla táctil encima, F3/F10 no actúan sobre la factura de abajo.
      if (tactilAbierto) return;

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
  }, [handleConfirmAndPrint, activePanel, tactilAbierto]);

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
      // Pieza traída de la otra empresa del grupo: entra con la cantidad traspasada.
      addProductToInvoice(processedProduct, product._cantidadTraida > 0 ? { cantidad: product._cantidadTraida } : {});
      // En aluminio el producto puede ser el "modelo" sin existencia propia (la
      // tienen sus colores): el aviso de equivalentes lo da después la línea real.
      if (!esAluminio) checkAndSuggestEquivalentes(processedProduct);
    } catch (e) {
      console.error("Error fetching presentations", e);
      addProductToInvoice(product, product._cantidadTraida > 0 ? { cantidad: product._cantidadTraida } : {});
      if (!esAluminio) checkAndSuggestEquivalentes(product);
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
      <Helmet><title>Ventas — MotoFlow</title></Helmet>

      {tactilAbierto && (
        <VentaTactil
          visible={activePanel === 'ventas'}
          titulo={empresa?.nombre}
          items={items}
          total={totals?.totalFactura}
          isSaving={isSaving || !!cobroPedido}
          onAgregar={agregarLineaDirecta}
          onCantidad={(id, n) => handleUpdateItem(id, 'cantidad', n)}
          onQuitar={handleDeleteItem}
          onLimpiar={resetVenta}
          onCobrar={cobrarTactil}
          onSalir={() => setModoTactil(false)}
        />
      )}
      {esCafeteria && !modoTactil && (
        <button type="button" onClick={() => setModoTactil(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 px-5 h-12 rounded-full bg-emerald-600 text-white font-black shadow-lg">
          Pantalla táctil
        </button>
      )}

      {empresa?.solo_consulta && (
        <div className="bg-amber-100 border-b-2 border-amber-400 text-amber-900 px-4 py-2 text-sm font-bold text-center">
          🔒 SOLO CONSULTA — {empresa?.nombre}. Puedes buscar productos y moverlos al sistema nuevo (clic derecho), pero NO se puede vender.
        </div>
      )}

      {/* En el teléfono la cabecera sube con las líneas (un solo desplazamiento)
          y abajo queda fija la barra de cobro. En la computadora, igual que antes. */}
      <div className={movil ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : 'contents'}>
      <VentasHeader
        {...(['servicios', 'inmobiliaria'].includes(empresa?.tipo_negocio)
          ? { moneda, setMoneda, tasaCambio, setTasaCambio } : {})}
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
        onBuscarRnc={handleBuscarRnc}
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
        movil={movil}
        onVistaCompleta={() => cambiarVista(true)}
      />
      {esTelefono && !movil && (
        <button type="button" onClick={() => cambiarVista(false)}
          className="flex items-center justify-center gap-1 bg-emerald-600 py-1.5 text-xs font-black uppercase text-white">
          <Smartphone className="h-4 w-4" /> Volver a la vista de teléfono
        </button>
      )}

      <main className={movil ? 'flex-1 bg-white' : 'flex-1 min-h-0 overflow-hidden px-2 pb-2'}>
        <div className={movil ? '' : 'h-full overflow-y-auto bg-white shadow-sm border border-gray-300 rounded-lg'}>
          {/* Codigo de promocion tecleado en la fila amarilla (T101, I101...). */}
          {promoAplicada && (
            <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
              <Gift className="h-3.5 w-3.5" />
              <span>
                <b>Código {promoAplicada.codigo}</b> · vino por {nombreCanal(promoAplicada.canal)} ·{' '}
                {Number(promoAplicada.pct)}% en {promoAplicada.descripcion}
              </span>
              <button type="button" onClick={quitarCodigoPromo} title="Quitar el código y su descuento"
                className="ml-auto rounded p-0.5 hover:bg-emerald-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* (28/10/2026) Servicios e inmobiliarias facturan por líneas libres
              (servicio · descripción · referencia · monto), no por códigos con
              existencia. Ver components/ventas/LineasServicios.jsx */}
          {['servicios', 'inmobiliaria'].includes(empresa?.tipo_negocio) ? (
            <LineasServicios items={items} setItems={setItems} cliente={cliente} moneda={moneda} tasa={tasaCambio}
              // Lleva e-CF ESTA factura (no la empresa): la base retiene según el NCF real.
              emiteEcf={editingFacturaId ? /^E\d{12}$/.test(String(editingFacturaNcf || '').trim()) : !!ncfPreview?.electronico}
              movil={movil} propina={propina} setPropina={setPropina} onRetencion={setRetencionEstimada} />
          ) : (
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
            movil={movil}
            editandoIndex={editingItemIndex}
          />
          )}
        </div>
      </main>
      </div>

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
        setPrintFormat={(v) => { setPrintFormat(v); /* solo esta venta: ver useVentas */ }}
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
        movil={movil}
      />

      {varianteDe && (
        <VarianteVentaModal
          producto={varianteDe}
          onCancelar={() => setVarianteDe(null)}
          onDirecto={() => { const p = varianteDe; setVarianteDe(null); addProductToInvoice(p, { directo: true }); }}
          onAgregar={({ productoId, cantidad, nota }) => { setVarianteDe(null); agregarProductoPorId(productoId, { cantidad, nota }); }}
        />
      )}

      <ProductSearchModal
        isOpen={isProductSearchModalOpen}
        onClose={() => setIsProductSearchModalOpen(false)}
        onSelectProduct={handleProductSearchSelect}
        sessionKey={modalSessionKey}
        useConfigDefault={true}
        permiteTraspaso
        movil={movil}
      />

      <ClienteSearchModal
        movil={movil}
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
