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
import { printFacturaPOS, printFacturaQZ } from '@/lib/printPOS';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2 } from 'lucide-react';

const VentasPage = () => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const grabarBtnRef = useRef(null);
  /* UI state for invoice editing search */
  const [isEditingNumero, setIsEditingNumero] = useState(false);
  const [editNumero, setEditNumero] = useState('');

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
    printFormat, setPrintFormat,
    printMethod, setPrintMethod,
    recargo, setRecargo,
    editingFacturaId,
    editingFacturaNumero,
    loadInvoiceByNumero,
    manualClienteNombre,
    setManualClienteNombre
  } = useVentas();

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

  // Modal de búsqueda de producto
  const [isProductSearchModalOpen, setIsProductSearchModalOpen] = useState(false);
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
        const defaultAlmacen = almacenesData.find(a => a.id === 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7') || almacenesData[0];
        if (defaultAlmacen) setSelectedAlmacen(defaultAlmacen.id);

        await fetchNextNumero();
      } catch (error) {
        console.error('Error fetching initial data', error);
        toast({ title: 'Error', description: 'No se pudieron cargar los datos iniciales.', variant: 'destructive' });
      } finally {
        setLoadingInitialData(false);
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

  const handleConfirmAndPrint = () => {
    const activeVendedor = vendedores.find(v => v.id === selectedVendedor);
    handleSave(async (facturaData) => {
      if (facturaData) {
        // Route to QZ Tray or browser based on printMethod
        if (printMethod === 'qz') {
          try {
            await printFacturaQZ(facturaData);
          } catch (err) {
            console.error('[QZ] Error, falling back to browser:', err);
            printFacturaPOS(facturaData);
          }
        } else {
          printFacturaPOS(facturaData);
        }

        toast({ title: 'Factura Guardada', description: `La factura #${facturaData.numero} ha sido generada y guardada.` });
        resetVenta();
        fetchNextNumero();
      }
    }, activeVendedor?.nombre, selectedVendedor);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
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
  }, [handleConfirmAndPrint]);

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
      <Helmet><title>Ventas - Repuestos Morla</title></Helmet>

      <VentasHeader
        date={date}
        setDate={setDate}
        cliente={cliente}
        onClienteSearch={handleOpenClienteSearch}
        onSelectCliente={handleSelectCliente}
        onClearCliente={resetVenta}
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
      />

      <main className="flex-grow overflow-hidden">
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
        setPrintFormat={setPrintFormat}
        printMethod={printMethod}
        setPrintMethod={(v) => { setPrintMethod(v); localStorage.setItem('ventas_printMethod', v); }}
        recargo={recargo}
        setRecargo={setRecargo}
        resetVenta={resetVenta}
        grabarBtnRef={grabarBtnRef}
      />

      <ProductSearchModal
        isOpen={isProductSearchModalOpen}
        onClose={() => setIsProductSearchModalOpen(false)}
        onSelectProduct={handleProductSearchSelect}
      />

      <ClienteSearchModal
        isOpen={isClienteSearchModalOpen}
        onClose={handleCloseClienteSearch}
        onSelectCliente={(cliente) => {
          handleSelectCliente(cliente);
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
