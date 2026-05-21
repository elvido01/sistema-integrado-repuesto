import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { generateFacturaPDF } from '@/components/common/PDFGenerator';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { sendProductToOrdenCompra } from '@/services/sendToOrdenCompra';
import { emitInventarioActualizado } from '@/lib/catalogEvents';

const CLIENTE_GENERICO = {
  id: '00000000-0000-0000-0000-000000000000',
  nombre: 'CLIENTE GENERICO',
  rnc: '000000000',
  direccion: 'N/A',
  telefono: 'N/A',
  autorizar_credito: false,
  dias_credito: 0,
  tipo_ncf: '02',
};

export const useVentas = () => {
  const { toast } = useToast();
  const { user, empresa } = useAuth();
  const hasSuplidoresLocales = !!empresa?.feat_suplidores_locales;
  const [date, setDate] = useState(new Date());
  const [paymentType, setPaymentType] = useState('contado');
  const [diasCredito, setDiasCredito] = useState(0);
  const [items, setItems] = useState([]);
  const [itemCode, setItemCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [montoRecibido, setMontoRecibido] = useState('');
  const [cliente, setCliente] = useState(CLIENTE_GENERICO);
  const [manualClienteNombre, setManualClienteNombre] = useState('');
  const [vendedor, setVendedor] = useState(null);
  const [totals, setTotals] = useState({ subTotal: 0, totalDescuento: 0, totalItbis: 0, totalFactura: 0 });
  const [cambio, setCambio] = useState(0);
  const [cotizacionId, setCotizacionId] = useState(null);
  const [printFormat, setPrintFormat] = useState(() => localStorage.getItem('ventas_printFormat') || empresa?.formato_factura || 'pos_4inch'); // pos_4inch, half_page, full_page
  const [printMethod, setPrintMethod] = useState(() => localStorage.getItem('ventas_printMethod') || 'browser');
  const [recargo, setRecargo] = useState(0);
  const [tipoPago, setTipoPago] = useState('EFECTIVO'); // EFECTIVO, TARJETA
  const [pagos, setPagos] = useState([]); // [{ tipo, ref, monto }]
  const [ncfPreview, setNcfPreview] = useState(null); // { ncf: 'B0100000334', tipo_ncf: '01' }

  /* Edit Mode State */
  const [editingFacturaId, setEditingFacturaId] = useState(null);
  const [editingFacturaNumero, setEditingFacturaNumero] = useState(null);
  const [pedidoId, setPedidoId] = useState(null);
  const [currentItem, setCurrentItem] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null); // index of item being edited in-place

  // Sync printFormat default from config_empresa when it loads (if no localStorage override)
  useEffect(() => {
    if (empresa?.formato_factura && !localStorage.getItem('ventas_printFormat')) {
      setPrintFormat(empresa.formato_factura);
    }
  }, [empresa?.formato_factura]);

  /* Ref to access latest items in async callbacks */
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  /* Helper to calculate item derived values */
  const calculateItemValues = (item) => {
    const cantidad = item.cantidad || 0;
    const precioConItbis = item.precio || 0;
    const descuentoPct = item.descuento || 0;
    const itbis_pct = item.itbis_pct || 0.18;

    const importeBruto = cantidad * precioConItbis;
    const descuentoMonto = importeBruto * (descuentoPct / 100);
    const importeNeto = importeBruto - descuentoMonto;

    const baseImponible = importeNeto / (1 + itbis_pct);
    const montoItbis = importeNeto - baseImponible;

    return {
      itbis: montoItbis,
      importe: importeNeto
    };
  };

  const updateCurrentItem = useCallback((field, value) => {
    setCurrentItem(prev => {
      if (!prev) return null;
      const updated = { ...prev, [field]: parseFloat(value) || 0 };

      if (field === 'descuento') {
        const maxDiscount = prev.max_descuento || 0;
        if (updated.descuento > maxDiscount) {
          toast({ title: "Descuento Excedido", description: `El descuento máximo permitido es ${maxDiscount}%`, variant: "destructive" });
          updated.descuento = maxDiscount;
        }
      }

      const calcs = calculateItemValues(updated);
      return { ...updated, ...calcs };
    });
  }, [toast]);

  const commitCurrentItem = useCallback(() => {
    if (!currentItem) return;
    if (!currentItem.cantidad || currentItem.cantidad <= 0) {
      toast({ title: 'Error', description: 'La cantidad debe ser mayor a 0', variant: 'destructive' });
      return;
    }

    setItems(prev => {
      // Mode: editing an existing item in-place
      if (editingItemIndex !== null && editingItemIndex >= 0 && editingItemIndex < prev.length) {
        const updatedItems = [...prev];
        const calcs = calculateItemValues(currentItem);
        updatedItems[editingItemIndex] = { ...currentItem, ...calcs };
        return updatedItems;
      }

      // Mode: adding new item — check if product already exists
      const existingIndex = prev.findIndex(i => i.id === currentItem.id);
      if (existingIndex >= 0) {
        toast({ title: 'Producto ya existe', description: 'El producto ya está en la lista. Se sumará la cantidad.', variant: 'default' });
        const updatedItems = [...prev];
        const existing = updatedItems[existingIndex];
        const updatedExisting = { ...existing, cantidad: (existing.cantidad || 0) + (currentItem.cantidad || 0) };
        const calcs = calculateItemValues(updatedExisting);
        updatedItems[existingIndex] = { ...updatedExisting, ...calcs };
        return updatedItems;
      }
      return [...prev, currentItem];
    });

    setCurrentItem(null);
    setEditingItemIndex(null);
    setItemCode('');
  }, [currentItem, editingItemIndex, toast]);

  const clearCurrentItem = useCallback(() => {
    setCurrentItem(null);
    setEditingItemIndex(null);
    setItemCode('');
  }, []);

  const refreshLocalSupplierSuggestion = useCallback(async (item) => {
    if (!hasSuplidoresLocales || !item?.producto_id) return;

    try {
      const requestedCantidad = Number(item.cantidad || 1);
      const requestedPrecio = Number(item.precio || 0);
      const { data, error } = await supabase.rpc('get_mejor_suplidor_local', {
        p_producto_id: item.producto_id,
        p_cantidad: requestedCantidad,
        p_precio_venta: requestedPrecio,
      });

      if (error) throw error;

      setCurrentItem(prev => {
        if (!prev || prev.producto_id !== item.producto_id) return prev;
        if (Number(prev.cantidad || 1) !== requestedCantidad || Number(prev.precio || 0) !== requestedPrecio) return prev;

        return {
          ...prev,
          existencia_morla: Number(data?.existencia_morla ?? prev.existencia_morla ?? 0),
          local_suplidor_sugerido: data?.hay_opcion ? data : null,
        };
      });
    } catch (error) {
      console.warn('[Ventas] No se pudo consultar suplidor local:', error.message);
    }
  }, [hasSuplidoresLocales]);

  useEffect(() => {
    if (!currentItem || !hasSuplidoresLocales) return;
    refreshLocalSupplierSuggestion(currentItem);
  }, [
    currentItem?.producto_id,
    currentItem?.cantidad,
    currentItem?.precio,
    hasSuplidoresLocales,
    refreshLocalSupplierSuggestion,
  ]);

  /* Double-click: copy item to staging row for in-place editing (item stays in list) */
  const editItem = useCallback((item) => {
    // Find the index of this item in the list
    const idx = items.findIndex(i => i.id === item.id);
    if (idx < 0) return;

    // If there's already an item being edited, commit it back first
    if (currentItem && editingItemIndex !== null && editingItemIndex >= 0) {
      setItems(prev => {
        const updatedItems = [...prev];
        if (editingItemIndex < updatedItems.length) {
          const calcs = calculateItemValues(currentItem);
          updatedItems[editingItemIndex] = { ...currentItem, ...calcs };
        }
        return updatedItems;
      });
    }

    // Copy to staging for editing; item stays in the list
    setEditingItemIndex(idx);
    setCurrentItem({ ...item });
    setItemCode(item.codigo);
    setTimeout(() => {
      document.getElementById('input-cantidad')?.focus();
      document.getElementById('input-cantidad')?.select();
    }, 100);
  }, [items, currentItem, editingItemIndex]);

  const loadNcfPreview = useCallback(async (tipoNcf = '02') => {
    if (!tipoNcf || tipoNcf === '00') {
      setNcfPreview(null);
      return;
    }
    try {
      const { data: seq } = await supabase
        .from('secuencias_ncf')
        .select('serie, tipo_ncf, secuencia_desde, ultimo_emitido')
        .eq('tipo_ncf', tipoNcf)
        .eq('activo', true)
        .gte('fecha_vencimiento', new Date().toISOString().split('T')[0])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (seq) {
        const siguiente = (!seq.ultimo_emitido || seq.ultimo_emitido < seq.secuencia_desde)
          ? seq.secuencia_desde
          : seq.ultimo_emitido + 1;
        const ncfCompleto = `${seq.serie}${seq.tipo_ncf}${String(siguiente).padStart(8, '0')}`;
        setNcfPreview({ ncf: ncfCompleto, tipo_ncf: tipoNcf });
      } else {
        setNcfPreview(null);
      }
    } catch (err) {
      console.warn('No se pudo obtener preview NCF:', err.message);
      setNcfPreview(null);
    }
  }, []);

  useEffect(() => {
    loadNcfPreview(CLIENTE_GENERICO.tipo_ncf);
  }, [loadNcfPreview]);

  const resetVenta = useCallback(() => {
    setDate(new Date());
    setPaymentType('contado');
    setDiasCredito(0);
    setItems([]);
    setItemCode('');
    setIsSaving(false);
    setMontoRecibido('');
    setCliente(CLIENTE_GENERICO);
    setVendedor(null);
    setCotizacionId(null);
    setCurrentItem(null);
    setEditingItemIndex(null);
    setRecargo(0);
    setTipoPago('EFECTIVO');
    setPagos([]);
    setPrintFormat('pos_4inch');
    setEditingFacturaId(null);
    setEditingFacturaNumero(null);
    setPedidoId(null);
    setManualClienteNombre('');
    loadNcfPreview(CLIENTE_GENERICO.tipo_ncf);
  }, [loadNcfPreview]);

  const handleSelectCliente = useCallback(async (selected) => {
    const finalCliente = selected || CLIENTE_GENERICO;
    setCliente(finalCliente);

    // Automation: If client has credit authorized, default to 'CREDITO'
    if (finalCliente.autorizar_credito) {
      setPaymentType('credito');
      setDiasCredito(finalCliente.dias_credito || 0);
    } else {
      setPaymentType('contado');
      setDiasCredito(0);
    }

    // === Preview NCF: mostrar el próximo NCF sin consumirlo ===
    const tipoNcf = finalCliente.tipo_ncf || '02';
    await loadNcfPreview(tipoNcf);

    // Re-apply price level to existing items when client changes
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) return;

    const nivel = finalCliente?.precio_nivel || 1;
    const productIds = currentItems.map(i => i.producto_id).filter(Boolean);

    const { data: products } = await supabase
      .from('productos')
      .select('id, itbis_pct, presentaciones(*)')
      .in('id', productIds);

    if (!products) return;

    setItems(prev => prev.map(item => {
      const product = products.find(p => p.id === item.producto_id);
      if (!product?.presentaciones?.length) return item;

      const mainPres = product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0];
      if (!mainPres) return item;

      const p1 = parseFloat(mainPres.precio1 || 0);
      const p2 = parseFloat(mainPres.precio2 || 0);
      const p3 = parseFloat(mainPres.precio3 || 0);
      const auto2 = !!mainPres.auto_precio2;
      const auto3 = !!mainPres.auto_precio3;

      let priceToUse = p1;
      if (nivel === 3) {
        if (auto3 && p3 > 0) priceToUse = p3;
        else if (auto2 && p2 > 0) priceToUse = p2;
      } else if (nivel === 2) {
        if (auto2 && p2 > 0) priceToUse = p2;
      }

      const maxDesc = (nivel === 2 || nivel === 3) ? 0 : parseFloat(mainPres.descuento_pct || 0);
      const itbis_pct = product.itbis_pct || 0.18;
      const importeNeto = item.cantidad * priceToUse;
      const baseImponible = importeNeto / (1 + itbis_pct);
      const montoItbis = importeNeto - baseImponible;

      return {
        ...item,
        precio: priceToUse,
        descuento: 0,
        itbis_pct,
        itbis: montoItbis,
        importe: importeNeto,
        costo_unitario: Number(product.costo || item.costo_unitario || 0),
        max_descuento: maxDesc,
      };
    }));
  }, [loadNcfPreview]);

  useEffect(() => {
    // Calcular totales desde precio + cantidad + descuento de cada item
    // (no depender del campo importe cacheado, que en algunas rutas — cambio
    // de cliente, carga de pedido — quedaba como bruto sin descuento aplicado).
    // Convencion: precio incluye ITBIS. Sub-Total = base pre-tax pre-descuento;
    // ITBIS = sobre la base pre-descuento; TOTAL = SubTotal - Descuento + ITBIS.
    const calculated = items.reduce((acc, item) => {
      const itbis_pct = Number(item.itbis_pct || 0.18);
      const precio = Number(item.precio || 0);
      const cantidad = Number(item.cantidad || 0);
      const descuentoPct = Number(item.descuento || 0);

      const lineGross = cantidad * precio;
      const lineDescuento = lineGross * (descuentoPct / 100);
      const lineNet = lineGross - lineDescuento;

      const itemSubTotal = lineGross / (1 + itbis_pct);
      const itemItbis = lineGross - itemSubTotal;

      return {
        subTotal: acc.subTotal + itemSubTotal,
        totalDescuento: acc.totalDescuento + lineDescuento,
        totalItbis: acc.totalItbis + itemItbis,
        totalFactura: acc.totalFactura + lineNet
      };
    }, { subTotal: 0, totalDescuento: 0, totalItbis: 0, totalFactura: 0 });

    const finalTotal = (calculated.totalFactura || 0) + Number(recargo || 0);

    setTotals({
      subTotal: calculated.subTotal || 0,
      totalDescuento: calculated.totalDescuento || 0,
      totalItbis: calculated.totalItbis || 0,
      totalFactura: finalTotal
    });
  }, [items, recargo]);

  useEffect(() => {
    const totalPagos = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
    const recibido = totalPagos + (parseFloat(montoRecibido) || 0);
    const total = totals.totalFactura;
    // Permitir negativos para mostrar "faltante" como cambio negativo
    setCambio(recibido - total);
  }, [montoRecibido, pagos, totals.totalFactura]);

  const addProductToInvoice = useCallback((product) => {
    let priceToUse = product.precio || 0;
    let maxDesc = product.max_descuento || 0;
    const itbis_pct = product.itbis_pct || 0.18;

    if (product.presentaciones && product.presentaciones.length > 0) {
      const mainPres = product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0];
      if (mainPres) {
        const nivel = cliente?.precio_nivel || 1;
        const p1 = parseFloat(mainPres.precio1 || 0);
        const p2 = parseFloat(mainPres.precio2 || 0);
        const p3 = parseFloat(mainPres.precio3 || 0);
        const auto2 = !!mainPres.auto_precio2;
        const auto3 = !!mainPres.auto_precio3;

        priceToUse = p1;

        if (nivel === 3) {
          if (auto3 && p3 > 0) {
            priceToUse = p3;
          } else if (auto2 && p2 > 0) {
            priceToUse = p2;
          } else {
            priceToUse = p1;
          }
        } else if (nivel === 2) {
          if (auto2 && p2 > 0) {
            priceToUse = p2;
          } else {
            priceToUse = p1;
          }
        }

        // Level 2 and 3 do NOT get discounts
        if (nivel === 2 || nivel === 3) {
          maxDesc = 0;
        } else {
          maxDesc = parseFloat(mainPres.descuento_pct || 0);
        }
      }
    }

    const baseImponible = priceToUse / (1 + itbis_pct);
    const itbis = priceToUse - baseImponible;

    const newItem = {
      id: product.id,
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      ubicacion: product.ubicacion,
      cantidad: 1,
      unidad: 'UND',
      precio: priceToUse,
      descuento: 0,
      itbis_pct: itbis_pct,
      itbis: itbis,
      importe: priceToUse,
      costo_unitario: Number(product.costo || 0),
      max_descuento: maxDesc,
      existencia_morla: product.existencia ?? product.existencia_morla ?? null,
      local_suplidor_sugerido: product.local_suplidor_sugerido || null,
    };

    setCurrentItem(newItem);
    setItemCode(product.codigo);
  }, [cliente]);

  const handleAddProductByCode = useCallback(async (code) => {
    if (!code.trim()) return;
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*, presentaciones(*)')
        .ilike('codigo', code.trim())
        .maybeSingle();

      if (error) {
        toast({ title: 'Error', description: 'No se pudo buscar el producto.', variant: 'destructive' });
        return;
      }

      if (data) {
        let processedData = { ...data };
        if (data.presentaciones && data.presentaciones.length > 0) {
          const mainPres = data.presentaciones.find(p => p.afecta_ft) || data.presentaciones[0];
          if (mainPres) {
            // Apply price level logic
            const nivel = cliente?.precio_nivel || 1;
            const p1 = parseFloat(mainPres.precio1 || 0);
            const p2 = parseFloat(mainPres.precio2 || 0);
            const p3 = parseFloat(mainPres.precio3 || 0);
            const auto2 = !!mainPres.auto_precio2;
            const auto3 = !!mainPres.auto_precio3;

            let finalPrice = p1;

            if (nivel === 3) {
              if (auto3 && p3 > 0) {
                finalPrice = p3;
              } else if (auto2 && p2 > 0) {
                finalPrice = p2;
              } else {
                finalPrice = p1;
              }
            } else if (nivel === 2) {
              if (auto2 && p2 > 0) {
                finalPrice = p2;
              } else {
                finalPrice = p1;
              }
            }

            processedData.precio = finalPrice;
            // Level 2 and 3 do NOT get discounts
            if (nivel === 2 || nivel === 3) {
              processedData.max_descuento = 0;
            } else {
              processedData.max_descuento = parseFloat(mainPres.descuento_pct || 0);
            }
          }
        }
        addProductToInvoice(processedData);
        setItemCode('');
      } else {
        toast({ title: 'No encontrado', description: `No se encontró un producto con el código ${code}.`, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error Inesperado', description: 'Ocurrió un error al buscar el producto.', variant: 'destructive' });
    }
  }, [addProductToInvoice, toast]);

  const handleUpdateItem = useCallback((id, field, value) => {
    setItems(prevItems =>
      prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: parseFloat(value) || 0 };
          if (field === 'descuento') {
            const maxDiscount = item.max_descuento || 0;
            if (updatedItem.descuento > maxDiscount) {
              toast({ title: "Descuento Excedido", description: `El descuento máximo permitido es ${maxDiscount}%`, variant: "destructive" });
              updatedItem.descuento = maxDiscount;
            }
          }
          const calcs = calculateItemValues(updatedItem);
          return { ...updatedItem, ...calcs };
        }
        return item;
      })
    );
  }, [toast]);

  const handleDeleteItem = useCallback((id) => {
    setItems(prevItems => prevItems.filter(item => item.id !== id));
  }, []);

  const enviarReposicionAutomatica = useCallback(async (facturaItems) => {
    const vendidosPorProducto = facturaItems.reduce((acc, item) => {
      if (!item.producto_id) return acc;
      acc[item.producto_id] = (acc[item.producto_id] || 0) + Number(item.cantidad || 0);
      return acc;
    }, {});

    const productIds = Object.keys(vendidosPorProducto);
    if (productIds.length === 0) return;

    const { data: productos, error } = await supabase
      .from('productos')
      .select('id, codigo, descripcion, min_stock, max_stock, suplidor_id, activo')
      .in('id', productIds);

    if (error || !productos?.length) {
      console.warn('[Ventas] No se pudo verificar reposicion automatica:', error?.message);
      return;
    }

    const enviados = [];
    const sinSuplidor = [];

    for (const producto of productos) {
      const minStock = Number(producto.min_stock || 0);
      if (!producto.activo || minStock <= 0) continue;

      const { data: existenciaData, error: stockError } = await supabase.rpc('get_stock_actual', {
        producto_uuid: producto.id,
      });

      if (stockError) {
        console.warn('[Ventas] No se pudo calcular existencia para reposicion:', producto.codigo, stockError.message);
        continue;
      }

      const existenciaFinal = Number(existenciaData || 0);
      if (existenciaFinal > minStock) continue;

      if (!producto.suplidor_id) {
        sinSuplidor.push(producto.codigo);
        continue;
      }

      const objetivo = Math.max(Number(producto.max_stock || 0), minStock);
      const cantidadSugerida = Math.max(1, Math.ceil(objetivo - existenciaFinal));
      const result = await sendProductToOrdenCompra(producto, { quantity: cantidadSugerida });

      if (result.success) {
        enviados.push(producto.codigo);
      } else {
        console.warn('[Ventas] Reposicion automatica no enviada:', producto.codigo, result.message);
      }
    }

    if (enviados.length > 0) {
      toast({
        title: 'Reposicion automatica',
        description: `${enviados.length} producto(s) enviados a Orden de Compra: ${enviados.slice(0, 5).join(', ')}${enviados.length > 5 ? '...' : ''}`,
        duration: 5000,
      });
    }

    if (sinSuplidor.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Reposicion pendiente',
        description: `${sinSuplidor.length} producto(s) llegaron al minimo pero no tienen suplidor asignado: ${sinSuplidor.slice(0, 5).join(', ')}${sinSuplidor.length > 5 ? '...' : ''}`,
        duration: 7000,
      });
    }
  }, [toast]);

  const handleSave = async (onSuccess, selectedVendedorName = null, selectedVendedorId = null) => {
    if (items.length === 0) {
      toast({ title: 'Factura vacía', description: 'No se puede guardar una factura sin artículos.', variant: 'destructive' });
      return;
    }
    if (paymentType === 'credito' && !cliente.autorizar_credito) {
      toast({ title: 'Error de crédito', description: 'Este cliente no tiene crédito autorizado.', variant: 'destructive' });
      return;
    }
    // Validar que el monto recibido no sea menor al total para ventas de contado
    if (paymentType === 'contado') {
      const totalPagos = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
      const recibido = totalPagos + (parseFloat(montoRecibido) || 0);
      if (recibido < totals.totalFactura) {
        toast({ title: 'Monto insuficiente', description: `El monto recibido (RD$ ${recibido.toFixed(2)}) no puede ser menor al total de la factura (RD$ ${totals.totalFactura.toFixed(2)}).`, variant: 'destructive' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Sesión expirada. Por favor, inicie sesión nuevamente.');
      let finalVendedorName = selectedVendedorName || 'N/A';

      // Verificar si el perfil existe para el FK de facturas.usuario_id
      const { data: profile } = await supabase.from('perfiles').select('id, nombre_completo').eq('id', authUser.id).maybeSingle();
      const safeUsuarioId = profile ? authUser.id : null;
      if (!selectedVendedorName && profile) {
        finalVendedorName = profile.nombre_completo;
      }

      const safeCliente = cliente || CLIENTE_GENERICO;
      const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
      const isGeneric = !safeCliente.id || genericIds.includes(safeCliente.id) || (safeCliente.nombre?.toUpperCase().includes('GENERICO'));

      // Construir la fecha con la hora actual local (America/Santo_Domingo = UTC-4)
      const now = new Date();
      const selectedDate = new Date(date);
      selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      // Formatear con offset de zona horaria local para evitar conversión UTC
      const pad = (n, len = 2) => String(n).padStart(len, '0');
      const tzOffset = -selectedDate.getTimezoneOffset();
      const sign = tzOffset >= 0 ? '+' : '-';
      const absOffset = Math.abs(tzOffset);
      const tzHours = pad(Math.floor(absOffset / 60));
      const tzMinutes = pad(absOffset % 60);
      const localISO = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}T${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}:${pad(selectedDate.getSeconds())}.${pad(selectedDate.getMilliseconds(), 3)}${sign}${tzHours}:${tzMinutes}`;

      const totalPagosRegistrados = pagos.reduce((sum, p) => sum + Number(p.monto), 0) + (parseFloat(montoRecibido) || 0);
      const abonoCredito = paymentType === 'credito' ? totalPagosRegistrados : 0;

      const facturaData = {
        fecha: localISO,
        cliente_id: safeCliente.id,
        manual_cliente_nombre: isGeneric ? manualClienteNombre : null,
        vendedor: finalVendedorName,
        vendedor_id: selectedVendedorId, // NEW FIELD
        almacen: 'A01',
        subtotal: totals.subTotal,
        descuento: totals.totalDescuento,
        itbis: totals.totalItbis,
        total: totals.totalFactura,
        forma_pago: paymentType.toUpperCase(),
        tipo_pago: paymentType === 'contado'
          ? (pagos.length > 0 ? pagos.map(p => p.tipo).join('/') : tipoPago)
          : (abonoCredito > 0 ? 'CREDITO/ABONO' : 'CREDITO'),
        dias_credito: paymentType === 'credito' ? diasCredito : 0,
        monto_recibido: paymentType === 'credito'
          ? abonoCredito
          : (pagos.length > 0 ? totalPagosRegistrados : (parseFloat(montoRecibido) || 0)),
        cambio: paymentType === 'credito'
          ? 0
          : Math.max(0, cambio),
        // NOTE: Do NOT subtract abonoCredito here — the RPC
        // crear_recibo_ingreso_y_actualizar_facturas will handle the
        // deduction. Subtracting here AND in the RPC caused the
        // double-deduction bug (negative monto_pendiente).
        monto_pendiente: paymentType === 'credito'
          ? totals.totalFactura
          : 0,
        estado: paymentType === 'credito' ? 'PENDIENTE' : 'PAGADA',
        usuario_id: safeUsuarioId
      };

      // === Asignar NCF automático según tipo_ncf del cliente (01, 02, 31, 32...) ===
      // Si no hay secuencia activa para ese tipo, se permite emitir la factura
      // sin NCF + warning (útil para tenants nuevos sin autorización DGII aún).
      let ncfData = null;
      const tipoNcfCliente = safeCliente.tipo_ncf || '02';
      if (!editingFacturaId && tipoNcfCliente) {
        const { data: ncfResult, error: ncfError } = await supabase.rpc('get_next_ncf', { p_tipo_ncf: tipoNcfCliente });
        if (ncfError) throw ncfError;
        if (ncfResult && ncfResult.success) {
          facturaData.ncf = ncfResult.ncf;
          ncfData = ncfResult;
        } else if (ncfResult && !ncfResult.success) {
          toast({
            title: 'Sin NCF disponible',
            description: `${ncfResult.error}. La factura se emite sin NCF.`,
            variant: 'destructive',
          });
        }
      }

      let activeFactura;

      if (editingFacturaId) {
        // Mode Update
        const { data, error: updateError } = await supabase
          .from('facturas')
          .update(facturaData)
          .eq('id', editingFacturaId)
          .select()
          .single();
        if (updateError) throw updateError;
        activeFactura = data;

        // Revert Stock
        const { data: oldDetails } = await supabase.from('facturas_detalle').select('*').eq('factura_id', editingFacturaId);
        if (oldDetails) {
          const revertMovs = oldDetails.map(d => ({
            producto_id: d.producto_id,
            tipo: 'ENTRADA',
            cantidad: d.cantidad,
            referencia_doc: `FT-EDIT-REV-${activeFactura.numero}`,
            usuario_id: authUser.id,
            fecha: new Date(),
          }));
          await supabase.from('inventario_movimientos').insert(revertMovs);
        }
        // Cleanup old details
        await supabase.from('facturas_detalle').delete().eq('factura_id', editingFacturaId);
      } else {
        // Mode Insert
        const { data, error: insertError } = await supabase
          .from('facturas')
          .insert(facturaData)
          .select()
          .single();
        if (insertError) throw insertError;
        activeFactura = data;
      }

      const detallesData = items.map(item => {
        const cantidad = item.cantidad || 0;
        const precioConItbis = item.precio || 0;
        const itbisPct = item.itbis_pct || 0;
        const importeBruto = cantidad * precioConItbis;
        const montoDescuento = importeBruto * ((item.descuento || 0) / 100);
        const importeNeto = importeBruto - montoDescuento;
        const baseImponible = importeNeto / (1 + itbisPct);
        const montoItbis = importeNeto - baseImponible;

        return {
          factura_id: activeFactura.id,
          producto_id: item.producto_id,
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: cantidad,
          precio: baseImponible / cantidad,
          descuento: montoDescuento,
          itbis: montoItbis,
          importe: importeNeto,
          costo_unitario: Number(item.costo_unitario || 0),
        };
      });

      const { error: detallesError } = await supabase.from('facturas_detalle').insert(detallesData);
      if (detallesError) throw detallesError;

      const inventarioMovimientos = items.map(item => ({
        producto_id: item.producto_id,
        tipo: 'SALIDA',
        cantidad: -item.cantidad,
        costo_unitario: Number(item.costo_unitario || 0),
        referencia_doc: `FT-${activeFactura.numero}`,
        usuario_id: authUser.id,
        fecha: new Date(),
      }));
      await supabase.from('inventario_movimientos').insert(inventarioMovimientos);

      if (!editingFacturaId) {
        try {
          await enviarReposicionAutomatica(items);
        } catch (repoError) {
          console.warn('[Ventas] Error en reposicion automatica:', repoError.message);
        }
      }

      if (cotizacionId && !editingFacturaId) {
        await supabase.from('cotizaciones').update({ estado: 'Facturada' }).eq('id', cotizacionId);
      }

      // AUTO-CREATE Recibo de Ingreso for partial credit payment (abono)
      // Uses the same RPC as the Recibo de Ingreso module to keep data consistent
      if (paymentType === 'credito' && abonoCredito > 0 && !editingFacturaId) {
        try {
          const reciboRpcData = {
            cliente_id: safeCliente.id,
            fecha: localISO.split('T')[0],
            monto_pagado: abonoCredito,
            concepto: `Abono parcial al momento de la venta - FT-${activeFactura.numero}`,
            formas_pago: JSON.stringify(
              pagos.length > 0
                ? pagos.map(p => ({ forma: p.tipo, monto: p.monto, referencia: p.ref || '' }))
                : [{ forma: tipoPago, monto: abonoCredito, referencia: '' }]
            ),
          };

          const abonosRpcData = JSON.stringify([{
            factura_id: activeFactura.id,
            monto_abono: abonoCredito,
          }]);

          const { data: reciboNumero, error: reciboError } = await supabase.rpc(
            'crear_recibo_ingreso_y_actualizar_facturas',
            {
              p_recibo_data: reciboRpcData,
              p_abonos_data: abonosRpcData,
            }
          );

          if (reciboError) {
            console.warn('Warning: Could not auto-create recibo de ingreso:', reciboError.message);
          } else {
            toast({ title: '\ud83d\udcc4 Recibo Generado', description: `Recibo de Ingreso ${reciboNumero} creado autom\u00e1ticamente por el abono de RD$ ${abonoCredito.toFixed(2)}` });
          }
        } catch (reciboErr) {
          console.warn('Warning: recibo creation failed:', reciboErr.message);
        }
      }

      // Alerta NCF: notificar si quedan pocos comprobantes
      if (ncfData && ncfData.restantes <= ncfData.alerta_cuando_queden) {
        try {
          await supabase.from('notificaciones').insert({
            user_id: authUser.id,
            titulo: 'Comprobantes Fiscales por agotarse',
            mensaje: `Solo quedan ${ncfData.restantes} comprobantes NCF tipo 01 (Crédito Fiscal). Solicite una nueva secuencia a la DGII.`,
            tipo: 'alerta_ncf',
          });
        } catch (e) {
          console.warn('No se pudo crear notificación NCF:', e.message);
        }
      }

      if (onSuccess) {
        const { data: fullFacturaData } = await supabase
          .from('facturas')
          .select('*, facturas_detalle(*), clientes(*), perfiles:usuario_id(email, nombre_completo)')
          .eq('id', activeFactura.id)
          .single();
        const facturaForPrint = fullFacturaData || activeFactura;
        // Asegurar que los datos del cliente siempre estén presentes en el recibo
        if (!facturaForPrint.clientes || !facturaForPrint.clientes.nombre) {
          facturaForPrint.clientes = safeCliente;
        }
        // Inyectar nombre del emisor NCF para el recibo (no se guarda en DB)
        if (ncfData?.nombre_emisor) {
          facturaForPrint.nombre_emisor_ncf = ncfData.nombre_emisor;
        }
        onSuccess(facturaForPrint);
      }
      // Avisar a otros paneles abiertos (ej. Orden de Compra) que el stock bajó,
      // antes de resetVenta() que limpia los items.
      emitInventarioActualizado(items.map(i => i.producto_id).filter(Boolean));
      resetVenta();
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const loadInvoiceByNumero = useCallback(async (numero) => {
    if (!numero) return;
    try {
      const { data: factura, error: fError } = await supabase
        .from('facturas')
        .select('*, clientes(*)')
        .eq('numero', numero)
        .maybeSingle();

      if (fError) throw fError;
      if (!factura) {
        toast({ title: 'No encontrada', description: `La factura #${numero} no existe.`, variant: 'destructive' });
        return;
      }

      const { data: detalles, error: dError } = await supabase
        .from('facturas_detalle')
        .select('*, productos(*)')
        .eq('factura_id', factura.id);

      if (dError) throw dError;

      // Load data into state
      setEditingFacturaId(factura.id);
      setEditingFacturaNumero(factura.numero);
      setCliente(factura.clientes || CLIENTE_GENERICO);
      setDate(new Date(factura.fecha));
      setPaymentType(factura.forma_pago.toLowerCase());
      setDiasCredito(factura.dias_credito || 0);
      setMontoRecibido(factura.monto_recibido?.toString() || '');
      setRecargo(factura.recargo || 0);
      setManualClienteNombre(factura.manual_cliente_nombre || '');

      const mappedItems = detalles.map(d => {
        const itbis_pct = d.productos?.itbis_pct || 0.18;
        const totalLine = d.importe || 0;
        const baseLine = totalLine / (1 + itbis_pct);
        const itbisLine = totalLine - baseLine;

        // Calculate original discount percentage if possible
        // import = (qty * unit_price) * (1 - desc/100)
        // unit_price here in state is price with itbis
        // d.precio is base price. d.precio * (1+itbis) is unit_price_with_itbis
        const unitPriceWithItbis = (d.precio * (1 + itbis_pct));
        const brutoTotal = d.cantidad * unitPriceWithItbis;
        const descPct = brutoTotal > 0 ? (d.descuento / brutoTotal) * 100 : 0;

        return {
          id: d.producto_id, // Use product id as key
          producto_id: d.producto_id,
          codigo: d.codigo,
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precio: unitPriceWithItbis,
          descuento: descPct,
          itbis_pct: itbis_pct,
          itbis: itbisLine,
          importe: totalLine,
          costo_unitario: Number(d.costo_unitario || d.productos?.costo || 0),
          max_descuento: d.productos?.max_descuento || 0,
        };
      });

      setItems(mappedItems);
      toast({ title: 'Factura cargada', description: `Listo para editar factura #${numero}.` });
    } catch (error) {
      console.error('Error loading invoice:', error);
      toast({ title: 'Error', description: 'No se pudo cargar la factura.', variant: 'destructive' });
    }
  }, [toast]);

  const handleSelectCotizacion = useCallback(async (cotizacion) => {
    try {
      resetVenta(); // Clear screen first as requested

      const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
      if (!cotizacion.cliente_id || genericIds.includes(cotizacion.cliente_id)) {
        handleSelectCliente(CLIENTE_GENERICO);
      } else {
        const { data: clienteData, error: clienteError } = await supabase.from('clientes').select('*').eq('id', cotizacion.cliente_id).single();
        if (clienteError) throw clienteError;
        handleSelectCliente(clienteData);
      }

      setManualClienteNombre(cotizacion.manual_cliente_nombre || '');

      const { data: detallesData, error: detallesError } = await supabase.from('cotizaciones_detalle').select(`*, productos(*)`).eq('cotizacion_id', cotizacion.id);
      if (detallesError) throw detallesError;

      const newItems = detallesData.map(d => {
        const itbis_pct = d.productos?.itbis_pct || 0.18;
        const precioConItbis = parseFloat(d.precio_unitario || 0);

        const importeBruto = d.cantidad * precioConItbis;
        const descuentoMonto = importeBruto * ((d.descuento_pct || 0) / 100);
        const importeNeto = importeBruto - descuentoMonto;

        const baseImponible = importeNeto / (1 + itbis_pct);
        const itbisMonto = importeNeto - baseImponible;

        return {
          id: d.producto_id,
          producto_id: d.producto_id,
          codigo: d.codigo,
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precio: precioConItbis,
          descuento: d.descuento_pct || 0,
          unidad: d.unidad,
          itbis_pct: itbis_pct,
          itbis: itbisMonto,
          importe: importeNeto,
          costo_unitario: Number(d.productos?.costo || 0),
          max_descuento: d.productos?.max_descuento || d.descuento_pct || 0,
        };
      });

      setItems(newItems);
      setCotizacionId(cotizacion.id);
      toast({ title: 'Cotización cargada', description: `Se cargaron los datos de la cotización ${cotizacion.numero}.` });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo cargar la cotización.', variant: 'destructive' });
    }
  }, [handleSelectCliente, resetVenta, toast]);

  const handleSelectPedido = useCallback(async (pedido) => {
    try {
      resetVenta(); // Clear screen first as requested

      const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
      if (!pedido.cliente_id || genericIds.includes(pedido.cliente_id)) {
        handleSelectCliente(CLIENTE_GENERICO);
      } else {
        const { data: clienteData, error: clienteError } = await supabase.from('clientes').select('*').eq('id', pedido.cliente_id).single();
        if (clienteError) throw clienteError;
        handleSelectCliente(clienteData);
      }

      setManualClienteNombre(pedido.manual_cliente_nombre || '');

      const { data: detallesData, error: detallesError } = await supabase.from('pedidos_detalle').select(`*, productos(*)`).eq('pedido_id', pedido.id);
      if (detallesError) throw detallesError;

      const newItems = detallesData.map(d => {
        const itbis_pct = d.productos?.itbis_pct || 0.18;
        return {
          id: d.producto_id,
          producto_id: d.producto_id,
          codigo: d.codigo,
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precio: d.precio, // Assuming price includes ITBIS in orders too
          descuento: d.descuento,
          unidad: d.unidad,
          itbis_pct: itbis_pct,
          itbis: d.itbis,
          importe: d.importe,
          costo_unitario: Number(d.productos?.costo || 0),
        };
      });

      setItems(newItems);
      setPedidoId(pedido.id);
      toast({ title: 'Pedido cargado', description: `Se cargaron los datos del pedido ${pedido.numero}.` });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'No se pudo cargar el pedido.', variant: 'destructive' });
    }
  }, [handleSelectCliente, resetVenta, toast]);

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
    recargo, setRecargo,
    tipoPago, setTipoPago,
    pedidoId, setPedidoId,
    handleSelectPedido,
    printFormat, setPrintFormat,
    printMethod, setPrintMethod,
    pagos, setPagos,
    currentItem,
    updateCurrentItem,
    commitCurrentItem,
    clearCurrentItem,
    editItem,
    /* Edit Mode Exports */
    editingFacturaId,
    editingFacturaNumero,
    loadInvoiceByNumero,
    manualClienteNombre,
    setManualClienteNombre,
    ncfPreview,
  };
};
