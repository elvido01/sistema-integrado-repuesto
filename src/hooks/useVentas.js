import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { generateFacturaPDF } from '@/components/common/PDFGenerator';

const CLIENTE_GENERICO = {
  id: '00000000-0000-0000-0000-000000000000',
  nombre: 'CLIENTE GENERICO',
  rnc: '000000000',
  direccion: 'N/A',
  telefono: 'N/A',
  autorizar_credito: false,
  dias_credito: 0,
};

export const useVentas = () => {
  const { toast } = useToast();
  const [date, setDate] = useState(new Date());
  const [paymentType, setPaymentType] = useState('contado');
  const [diasCredito, setDiasCredito] = useState(0);
  const [items, setItems] = useState([]);
  const [itemCode, setItemCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [montoRecibido, setMontoRecibido] = useState('');
  const [cliente, setCliente] = useState(CLIENTE_GENERICO);
  const [vendedor, setVendedor] = useState(null);
  const [totals, setTotals] = useState({ subTotal: 0, totalDescuento: 0, totalItbis: 0, totalFactura: 0 });
  const [cambio, setCambio] = useState(0);
  const [cotizacionId, setCotizacionId] = useState(null);

  const resetVenta = useCallback(() => {
    setDate(new Date());
    setPaymentType('contado');
    setDiasCredito(0);
    setItems([]);
    setItemCode('');
    setIsSaving(false);
    setMontoRecibido('');
    setCliente(CLIENTE_GENERICO);
    setCotizacionId(null);
  }, []);

  const handleSelectCliente = useCallback((selectedCliente) => {
    setCliente(selectedCliente);
    if (!selectedCliente.autorizar_credito) {
      setPaymentType('contado');
    }
  }, []);

  const calculateTotals = useCallback(() => {
    let subTotal = 0;
    let totalDescuento = 0;
    let totalItbis = 0;
    let totalFactura = 0;

    items.forEach(item => {
      const cantidad = item.cantidad || 0;
      const precioConItbis = item.precio || 0;
      const descuentoPct = item.descuento || 0;
      const itbisPct = item.itbis_pct || 0;

      const importeTotal = cantidad * precioConItbis;
      const importeConDescuento = importeTotal * (1 - (descuentoPct / 100));
      
      const baseImponible = importeConDescuento / (1 + itbisPct);
      const montoItbis = importeConDescuento - baseImponible;
      
      subTotal += baseImponible;
      totalItbis += montoItbis;
      totalFactura += importeConDescuento;
      totalDescuento += importeTotal * (descuentoPct / 100);
    });

    setTotals({ subTotal, totalDescuento, totalItbis, totalFactura });
  }, [items]);

  useEffect(() => {
    calculateTotals();
  }, [items, calculateTotals]);

  useEffect(() => {
    const total = totals.totalFactura;
    const recibido = parseFloat(montoRecibido) || 0;
    setCambio(recibido > total ? recibido - total : 0);
  }, [montoRecibido, totals.totalFactura]);

  const addProductToInvoice = useCallback((product) => {
    if (items.some(item => item.id === product.id)) {
      toast({ title: 'Producto duplicado', description: 'Este producto ya está en la factura. Puede modificar la cantidad.', variant: 'destructive' });
      return;
    }
    const precioConItbis = product.precio || 0;
    const itbis_pct = product.itbis_pct || 0.18;
    
    const baseImponible = precioConItbis / (1 + itbis_pct);
    const itbis = precioConItbis - baseImponible;

    const newItem = {
      id: product.id,
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      ubicacion: product.ubicacion,
      cantidad: 1,
      unidad: 'UND',
      precio: precioConItbis,
      descuento: 0,
      itbis_pct: itbis_pct,
      itbis: itbis,
      importe: precioConItbis,
    };
    setItems(prevItems => [...prevItems, newItem]);
  }, [items, toast]);
  
  const handleAddProductByCode = useCallback(async (code) => {
    if (!code.trim()) return;
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('codigo', code.trim())
            .maybeSingle();

        if (error) {
            console.error('Error fetching product by code', error);
            toast({ title: 'Error', description: 'No se pudo buscar el producto.', variant: 'destructive' });
            return;
        }
        
        if (data) {
            addProductToInvoice(data);
            setItemCode('');
        } else {
            toast({ title: 'No encontrado', description: `No se encontró un producto con el código ${code}.`, variant: 'destructive' });
        }
    } catch (error) {
        console.error('Unexpected error in handleAddProductByCode', error);
        toast({ title: 'Error Inesperado', description: 'Ocurrió un error al buscar el producto.', variant: 'destructive' });
    }
}, [addProductToInvoice, toast]);


  const handleUpdateItem = useCallback((id, field, value) => {
    setItems(prevItems =>
      prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: parseFloat(value) || 0 };
          
          const cantidad = updatedItem.cantidad || 0;
          const precioConItbis = updatedItem.precio || 0;
          const descuentoPct = updatedItem.descuento || 0;
          const itbisPct = updatedItem.itbis_pct || 0;

          const importeTotal = cantidad * precioConItbis;
          const importeConDescuento = importeTotal * (1 - (descuentoPct / 100));
          
          const baseImponible = importeConDescuento / (1 + itbisPct);
          const montoItbis = importeConDescuento - baseImponible;

          updatedItem.itbis = montoItbis;
          updatedItem.importe = importeConDescuento;
          
          return updatedItem;
        }
        return item;
      })
    );
  }, []);

  const handleDeleteItem = useCallback((id) => {
    setItems(prevItems => prevItems.filter(item => item.id !== id));
  }, []);
  
  const handleSave = async (onSuccess) => {
    if (items.length === 0) {
      toast({ title: 'Factura vacía', description: 'No se puede guardar una factura sin artículos.', variant: 'destructive' });
      return;
    }
    if (paymentType === 'credito' && !cliente.autorizar_credito) {
      toast({ title: 'Error de crédito', description: 'Este cliente no tiene crédito autorizado.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        let vendedorFullName = 'N/A';
        if(user) {
          const { data: profile, error } = await supabase.from('perfiles').select('nombre_completo').eq('id', user.id).single();
          if (error) console.error("Could not fetch seller name", error);
          else vendedorFullName = profile.nombre_completo;
        }

        const facturaData = {
            fecha: date,
            cliente_id: cliente.id,
            vendedor: vendedorFullName, 
            almacen: 'A01',
            subtotal: totals.subTotal,
            descuento: totals.totalDescuento,
            itbis: totals.totalItbis,
            total: totals.totalFactura,
            forma_pago: paymentType.toUpperCase(),
            tipo_pago: paymentType === 'contado' ? 'EFECTIVO' : 'CREDITO',
            dias_credito: paymentType === 'credito' ? diasCredito : 0,
            monto_recibido: parseFloat(montoRecibido) || 0,
            cambio: cambio,
            monto_pendiente: paymentType === 'credito' ? totals.totalFactura : (totals.totalFactura - (parseFloat(montoRecibido) || 0)),
            estado: paymentType === 'credito' ? 'PENDIENTE' : 'PAGADA',
            usuario_id: user.id
        };

        const { data: newFactura, error: facturaError } = await supabase
            .from('facturas')
            .insert(facturaData)
            .select()
            .single();

        if (facturaError) throw facturaError;

        const detallesData = items.map(item => {
            const cantidad = item.cantidad || 0;
            const precioConItbis = item.precio || 0;
            const descuentoPct = item.descuento || 0;
            const itbisPct = item.itbis_pct || 0;

            const importeTotal = cantidad * precioConItbis;
            const importeConDescuento = importeTotal * (1 - (descuentoPct / 100));
            const baseImponible = importeConDescuento / (1 + itbisPct);
            const montoItbis = importeConDescuento - baseImponible;
            const montoDescuento = importeTotal * (descuentoPct / 100);

            return {
                factura_id: newFactura.id,
                producto_id: item.producto_id,
                codigo: item.codigo,
                descripcion: item.descripcion,
                cantidad: cantidad,
                precio: baseImponible / cantidad,
                descuento: montoDescuento,
                itbis: montoItbis,
                importe: importeConDescuento,
            };
        });

        const { error: detallesError } = await supabase.from('facturas_detalle').insert(detallesData);

        if (detallesError) throw detallesError;
        
        const inventarioMovimientos = items.map(item => ({
            producto_id: item.producto_id,
            tipo: 'SALIDA',
            cantidad: -item.cantidad,
            referencia_doc: `FT-${newFactura.numero}`,
            usuario_id: user.id,
            fecha: new Date(),
        }));

        const { error: inventarioError } = await supabase.from('inventario_movimientos').insert(inventarioMovimientos);
        
        if (inventarioError) throw inventarioError;
        
        if (cotizacionId) {
          const { error: cotizacionError } = await supabase
            .from('cotizaciones')
            .update({ estado: 'Facturada' })
            .eq('id', cotizacionId);
          if (cotizacionError) console.error("Error updating cotizacion status:", cotizacionError);
        }

        if (onSuccess) {
          const { data: fullFacturaData, error: fetchError } = await supabase
            .from('facturas')
            .select(`
              *, 
              facturas_detalle(*), 
              clientes(*),
              perfiles:usuario_id(email, nombre_completo)
            `)
            .eq('id', newFactura.id)
            .single();
          
          if (fetchError) {
             console.error("Error fetching full invoice data:", fetchError);
             toast({ title: 'Error al obtener datos completos de factura', description: fetchError.message, variant: 'destructive' });
             onSuccess(newFactura); 
          } else {
            onSuccess(fullFacturaData);
          }
        }
        resetVenta();

    } catch (error) {
        console.error('Error saving invoice:', error);
        toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleSelectCotizacion = useCallback(async (cotizacion) => {
    try {
      if (!cotizacion.cliente_id || cotizacion.cliente_id === '00000000-0000-0000-0000-000000000000') {
        handleSelectCliente(CLIENTE_GENERICO);
      } else {
        const { data: clienteData, error: clienteError } = await supabase
          .from('clientes')
          .select('*')
          .eq('id', cotizacion.cliente_id)
          .single();
        
        if (clienteError) throw clienteError;
        handleSelectCliente(clienteData);
      }

      const { data: detallesData, error: detallesError } = await supabase
        .from('cotizaciones_detalle')
        .select(`*, productos(*)`)
        .eq('cotizacion_id', cotizacion.id);
      
      if (detallesError) throw detallesError;

      const newItems = detallesData.map(d => {
        const precioConItbis = d.precio_unitario * (1 + (d.productos?.itbis_pct || 0.18));
        const itbis_pct = d.productos?.itbis_pct || 0.18;
        const baseImponible = precioConItbis / (1 + itbis_pct);
        const itbis = precioConItbis - baseImponible;

        return {
            id: d.producto_id,
            producto_id: d.producto_id,
            codigo: d.codigo,
            descripcion: d.descripcion,
            cantidad: d.cantidad,
            precio: precioConItbis,
            descuento: d.descuento_pct,
            unidad: d.unidad,
            itbis_pct: itbis_pct,
            itbis: itbis * d.cantidad,
            importe: precioConItbis * d.cantidad,
        };
      });

      setItems(newItems);
      setCotizacionId(cotizacion.id);
      toast({ title: 'Cotización cargada', description: `Se cargaron los datos de la cotización ${cotizacion.numero}.` });
    } catch (error) {
      console.error("Error loading cotizacion:", error);
      toast({ title: 'Error', description: 'No se pudo cargar la cotización.', variant: 'destructive' });
    }
  }, [handleSelectCliente, toast, setItems]);

  return {
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
    setCotizacionId,
    handleSelectCotizacion,
  };
};