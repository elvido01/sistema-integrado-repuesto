import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useToast } from '@/components/ui/use-toast';
import { useVentas } from '@/hooks/useVentas';
import VentasHeader from '@/components/ventas/VentasHeader';
import VentasTable from '@/components/ventas/VentasTable';
import VentasFooter from '@/components/ventas/VentasFooter';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { generateFacturaPDF } from '@/components/common/PDFGenerator';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2 } from 'lucide-react';

const VentasPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    date,
    setDate,
    paymentType,
    setPaymentType,
    diasCredito,
    setDiasCredito,
    items,
    setItems,
    itemCode,
    setItemCode,
    isSaving,
    montoRecibido,
    setMontoRecibido,
    cliente,
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
  } = useVentas();

  // Modal de búsqueda de cliente
  const [isClienteSearchModalOpen, setIsClienteSearchModalOpen] = useState(false);
  const handleOpenClienteSearch = () => setIsClienteSearchModalOpen(true);
  const handleCloseClienteSearch = () => setIsClienteSearchModalOpen(false);

  // Modal de búsqueda de producto
  const [isProductSearchModalOpen, setIsProductSearchModalOpen] = useState(false);
  const { pedidoParaFacturar, setPedidoParaFacturar } = useFacturacion();

  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [vendedores, setVendedores] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [selectedAlmacen, setSelectedAlmacen] = useState('');
  const [nextFacturaNumero, setNextFacturaNumero] = useState(null);
  const [loadingNumero, setLoadingNumero] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoadingInitialData(true);
      try {
        const { data: vendedoresData, error: vendedoresError } = await supabase.rpc('get_perfiles_con_email');
        if (vendedoresError) throw vendedoresError;
        setVendedores(vendedoresData);
        if (user && vendedoresData.some(v => v.id === user.id)) {
          setSelectedVendedor(user.id);
        }

        const { data: almacenesData, error: almacenesError } = await supabase
          .from('almacenes')
          .select('*')
          .eq('activo', true);
        if (almacenesError) throw almacenesError;
        setAlmacenes(almacenesData);
        if (almacenesData.length > 0) setSelectedAlmacen(almacenesData[0].id);

        const { data: numeroData, error: numeroError } = await supabase.rpc('get_next_factura_numero');
        if (numeroError) throw numeroError;
        setNextFacturaNumero(numeroData);
      } catch (error) {
        console.error('Error fetching initial data', error);
        toast({ title: 'Error', description: 'No se pudieron cargar los datos iniciales.', variant: 'destructive' });
      } finally {
        setLoadingInitialData(false);
        setLoadingNumero(false);
      }
    };
    fetchInitialData();
  }, [user, toast]);

  useEffect(() => {
    if (pedidoParaFacturar) {
      handleSelectCliente(pedidoParaFacturar.cliente);
      const newItems = pedidoParaFacturar.detalles.map(d => ({
        id: d.producto_id,
        producto_id: d.producto_id,
        codigo: d.codigo,
        descripcion: d.descripcion,
        ubicacion: d.ubicacion || '',
        cantidad: d.cantidad,
        precio: d.precio,
        descuento: 0,
        unidad: d.unidad,
        itbis_pct: d.productos?.itbis_pct || 0.18,
        itbis: d.precio * d.cantidad * (d.productos?.itbis_pct || 0.18),
        importe: d.precio * d.cantidad * (1 + (d.productos?.itbis_pct || 0.18)),
      }));
      setItems(newItems);
      toast({ title: 'Pedido Cargado', description: `Se ha cargado el pedido #${pedidoParaFacturar.numero} para facturación.` });
      setPedidoParaFacturar(null);
    }
  }, [pedidoParaFacturar, handleSelectCliente, setItems, toast, setPedidoParaFacturar]);

  const handleConfirmAndPrint = () => {
    handleSave(facturaData => {
      if (facturaData) {
        generateFacturaPDF(facturaData);
        toast({ title: 'Factura Guardada', description: `La factura #${facturaData.numero} ha sido generada y guardada.` });
        resetVenta();
      }
    });
  };

  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'F10') {
        e.preventDefault();
        handleConfirmAndPrint();
      }
    },
    [handleConfirmAndPrint]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const onItemCodeKeyDown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddProductByCode(itemCode);
    }
  };

  if (loadingInitialData) {
    return <div className="h-full w-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="p-4 bg-gray-50 h-full flex flex-col">
      <Helmet><title>Ventas - Repuestos Morla</title></Helmet>

      <VentasHeader
        date={date}
        setDate={setDate}
        cliente={cliente}
        onClienteSearch={handleOpenClienteSearch}
        onSelectCliente={handleSelectCliente}
        onClearCliente={() => handleSelectCliente(null)}
        itemCode={itemCode}
        setItemCode={setItemCode}
        onAddProductByCode={() => handleAddProductByCode(itemCode)}
        onAddProduct={addProductToInvoice}
        resetVenta={resetVenta}
        onSelectCotizacion={handleSelectCotizacion}
        vendedores={vendedores}
        selectedVendedor={selectedVendedor}
        onVendedorChange={setSelectedVendedor}
        almacenes={almacenes}
        selectedAlmacen={selectedAlmacen}
        onAlmacenChange={setSelectedAlmacen}
        nextFacturaNumero={nextFacturaNumero}
        loadingNumero={loadingNumero}
      />

      <main className="flex-grow my-4 overflow-hidden">
        <div className="h-full overflow-y-auto bg-white rounded-lg shadow border">
          <VentasTable
            items={items}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            itemCode={itemCode}
            setItemCode={setItemCode}
            onItemCodeKeyDown={onItemCodeKeyDown}
            onProductSearch={() => setIsProductSearchModalOpen(true)}
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
      />

      <ProductSearchModal
        isOpen={isProductSearchModalOpen}
        onClose={() => setIsProductSearchModalOpen(false)}
        onSelectProduct={(product) => {
          addProductToInvoice(product);
          setIsProductSearchModalOpen(false);
        }}
      />

      <ClienteSearchModal
        isOpen={isClienteSearchModalOpen}
        onClose={handleCloseClienteSearch}
        onSelectCliente={(cliente) => {
          handleSelectCliente(cliente);
          handleCloseClienteSearch();
        }}
      />
    </div>
  );
};

export default VentasPage;
