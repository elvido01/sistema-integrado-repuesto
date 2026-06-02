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
import { generateFacturaPDF } from '@/components/common/PDFGenerator';
import { printFacturaPOS, printFacturaQZ, printFacturaWebUsb } from '@/lib/printPOS';
import { setPreferredBackend, getPreferredBackend } from '@/services/printerAdapter';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { supabase } from '@/lib/customSupabaseClient';
import { findAlmacenPrincipal } from '@/lib/almacenUtils';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { Loader2 } from 'lucide-react';

const VentasPage = () => {
  const { toast } = useToast();
  const { user, profile, empresa, fiscalActivo } = useAuth();
  const grabarBtnRef = useRef(null);
  /* UI state for invoice editing search */
  const [isEditingNumero, setIsEditingNumero] = useState(false);
  const [editNumero, setEditNumero] = useState('');
  const [clienteCodigoInput, setClienteCodigoInput] = useState('');
  const [notasFactura, setNotasFactura] = useState('');

  const {
    date, setDate,
    paymentType, setPaymentType,
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
    pagos, setPagos,
    editingFacturaId,
    editingFacturaNumero,
    loadInvoiceByNumero,
    manualClienteNombre,
    setManualClienteNombre,
    ncfPreview,
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
      if (pedidoParaFacturar.type === 'cotizacion') {
        handleSelectCotizacion(pedidoParaFacturar);
      } else if (pedidoParaFacturar.type === 'pedido') {
        handleSelectPedido(pedidoParaFacturar);
      }
      setPedidoParaFacturar(null);
    }
  }, [pedidoParaFacturar, handleSelectCotizacion, handleSelectPedido, setPedidoParaFacturar]);

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

        // Route printing based on selected method
        if (printMethod === 'qz' || printMethod === 'agent') {
          // Forzar backend según método elegido. printFacturaQZ usa el adapter
          // que respeta la preferencia global (setPreferredBackend).
          const previousBackend = getPreferredBackend();
          if (printMethod === 'agent') setPreferredBackend('agent');
          else setPreferredBackend('qz');
          try {
            await printFacturaQZ(facturaParaImprimir);
          } catch (err) {
            console.error(`[${printMethod}] Error, falling back to browser:`, err);
            toast({
              variant: "destructive",
              title: printMethod === 'agent' ? 'Error con Motoflow Print Agent' : 'Error de conexión QZ Tray',
              description: `${err.message || String(err)}. Usando impresión navegador.`,
              duration: 5000,
            });
            printFacturaPOS(facturaParaImprimir);
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
    } catch (e) {
      console.error("Error fetching presentations", e);
      addProductToInvoice(product);
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
        pagos={pagos}
        setPagos={setPagos}
        recargo={recargo}
        setRecargo={setRecargo}
        resetVenta={resetVenta}
        grabarBtnRef={grabarBtnRef}
        notas={notasFactura}
        setNotas={setNotasFactura}
      />

      <ProductSearchModal
        isOpen={isProductSearchModalOpen}
        onClose={() => setIsProductSearchModalOpen(false)}
        onSelectProduct={handleProductSearchSelect}
        sessionKey={modalSessionKey}
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
    </div>
  );
};

export default VentasPage;
