import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Save, X, Loader2 } from 'lucide-react';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCompras } from '@/contexts/ComprasContext';
import CompraHeader from '@/components/compras/CompraHeader';
import CompraDetalles from '@/components/compras/CompraDetalles';
import CompraFooter from '@/components/compras/CompraFooter';
import SuplidorSearchModal from '@/components/compras/SuplidorSearchModal';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import InvoiceUploadModal from '@/components/compras/InvoiceUploadModal';
import ProductFormModal from '@/components/products/ProductFormModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ImagePlus, Printer } from 'lucide-react';
import { generateCompraPDF } from '@/components/common/PDFGenerator';

const ComprasPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { ordenParaFacturar, setOrdenParaFacturar } = useCompras();
  const [proveedores, setProveedores] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSuplidorModalOpen, setIsSuplidorModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [tempProductData, setTempProductData] = useState(null);
  const [activeLineId, setActiveLineId] = useState(null);
  const [ocrData, setOcrData] = useState(null);

  const initialState = {
    numero: '',
    fecha: getCurrentDateInTimeZone(),
    ncf: '',
    referencia: '',
    tipo_bienes_servicios: '09',
    sub_tipo: 'Compra de Merc',
    suplidor_id: null,
    almacen_id: 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7',
    itbis_incluido: false,
    actualizar_precios: true,
    forma_pago: 'Contado',
    dias_credito: 0,
    id_orden_origen: null,
  };

  const initialDetalleState = {
    codigo: '',
    descripcion: '',
    cantidad: 1,
    unidad: 'UND',
    costo_unitario: 0,
    descuento_pct: 0,
    itbis_pct: 0.18,
    importe: 0,
    producto_id: null,
  };

  const [compra, setCompra] = useState(initialState);
  const [detalles, setDetalles] = useState([]);
  const [currentDetalle, setCurrentDetalle] = useState(initialDetalleState);
  const [pagos, setPagos] = useState([{ tipo: '01', referencia: '', monto: 0, id: Date.now() }]);
  const [isSaving, setIsSaving] = useState(false);

  const fetchInitialData = useCallback(async () => {
    const { data: provData, error: provError } = await supabase.from('proveedores').select('*');
    if (provError) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los proveedores.' });
    else setProveedores(provData);

    const { data: almData, error: almError } = await supabase.from('almacenes').select('*');
    if (almError) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los almacenes.' });
    else {
      setAlmacenes(almData);
      // Ensure ALM01 is selected if it exists and no other is set
      if (almData.length > 0) {
        setCompra(prev => ({ ...prev, almacen_id: prev.almacen_id || 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7' }));
      }
    }

    const { data: nextNum, error: numError } = await supabase.rpc('get_next_compra_numero');
    if (!numError && nextNum) {
      setCompra(prev => ({ ...prev, numero: nextNum }));
    }
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const resetForm = useCallback(async () => {
    setCompra(initialState);
    setDetalles([]);
    setCurrentDetalle(initialDetalleState);
    setPagos([{ tipo: '01', referencia: '', monto: 0, id: Date.now() }]);

    // Fetch new number after reset
    const { data: nextNum, error: numError } = await supabase.rpc('get_next_compra_numero');
    if (!numError && nextNum) {
      setCompra(prev => ({ ...prev, numero: nextNum }));
    }
  }, []);

  // --- Integration with Orden de Compra ---
  useEffect(() => {
    if (ordenParaFacturar) {
      const { orderData, details } = ordenParaFacturar;

      setCompra(prev => ({
        ...prev,
        suplidor_id: orderData.suplidor_id,
        itbis_incluido: orderData.itbis_incluido ?? true,
        referencia: '', // Dejar vacío para número de factura del suplidor
        id_orden_origen: orderData.id
      }));

      const loadedDetails = details.map(d => ({
        id: Math.random(),
        codigo: d.codigo,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        unidad: d.unidad || 'UND',
        costo_unitario: d.precio || 0,
        descuento_pct: d.descuento_pct || 0,
        itbis_pct: d.itbis_pct ? (parseFloat(d.itbis_pct) / 100) : 0.18,
        importe: d.importe,
        producto_id: d.producto_id,
        is_matched: true
      }));

      setDetalles(loadedDetails);

      toast({
        title: 'Orden de Compra Cargada',
        description: `Se han importado ${loadedDetails.length} productos de la orden ${orderData.numero || ''}.`
      });

      // Clear the context state so it doesn't reload on next visit
      setOrdenParaFacturar(null);
    }
  }, [ordenParaFacturar, setOrdenParaFacturar, toast]);

  const totals = useMemo(() => {
    let exento = 0;
    let gravado = 0;
    let descuento = 0;
    let itbis = 0;

    detalles.forEach(d => {
      const subtotalItem = d.cantidad * d.costo_unitario;
      const descuentoItem = subtotalItem * (d.descuento_pct / 100);
      descuento += descuentoItem;

      const baseCalculo = subtotalItem - descuentoItem;

      if (d.itbis_pct > 0) {
        if (compra.itbis_incluido) {
          // Si está incluido, la base es (Total / 1.18) y el ITBIS es (Total - Base)
          const baseSinItbis = baseCalculo / (1 + d.itbis_pct);
          gravado += baseSinItbis;
          itbis += baseCalculo - baseSinItbis;
        } else {
          // Si no está incluido, se suma al total
          gravado += baseCalculo;
          itbis += baseCalculo * d.itbis_pct;
        }
      } else {
        exento += baseCalculo;
      }
    });

    const total = gravado + exento + itbis;
    return { exento, gravado, descuento, itbis, total };
  }, [detalles, compra.itbis_incluido]);

  const handleProductSelect = (product) => {
    // product.itbis_pct ya viene como decimal (0.18) de la DB
    const itbisPct = product.itbis_pct ?? 0.18;
    setCurrentDetalle(prev => ({
      ...prev,
      codigo: product.codigo,
      descripcion: product.descripcion,
      costo_unitario: product.costo || 0,
      itbis_pct: itbisPct,
      producto_id: product.id,
    }));
    setIsSearchModalOpen(false);
    setTimeout(() => {
      const input = document.getElementById('cantidad-producto');
      if (input) {
        input.focus();
        input.select();
      }
    }, 150);
  };

  const handleSuplidorSelect = (suplidor) => {
    setCompra(prev => ({ ...prev, suplidor_id: suplidor.id }));
    setIsSuplidorModalOpen(false);
  };

  const handleCreateProductFromLine = (line) => {
    setActiveLineId(line.id);
    setTempProductData({
      codigo: line.codigo || '',
      descripcion: line.descripcion || '',
      costo: line.costo_unitario || 0,
    });
    setIsProductModalOpen(true);
  };

  const handleSaveProductFromOCR = async (productData, presentations, isEditing) => {
    try {
      const parseNumeric = (value) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      const productPayload = {
        ...productData,
        costo: parseNumeric(productData.costo),
        precio: parseNumeric(productData.precio),
        itbis_pct: parseNumeric(productData.itbis_pct),
        min_stock: parseNumeric(productData.min_stock),
        max_stock: parseNumeric(productData.max_stock),
        garantia_meses: parseInt(productData.garantia_meses, 10) || 0,
      };

      if (!isEditing) delete productPayload.id;

      // Insertar nuevo producto
      const { data: savedProduct, error } = await supabase
        .from('productos')
        .insert(productPayload)
        .select()
        .single();

      if (error) throw error;

      // Guardar presentaciones si existen
      if (savedProduct && presentations.length > 0) {
        const presentationsToUpsert = presentations.map((p) => {
          const { id, ...rest } = p;
          return {
            ...rest,
            producto_id: savedProduct.id,
            cantidad: parseNumeric(p.cantidad),
            costo: parseNumeric(p.costo),
            margen_pct: parseNumeric(p.margen_pct),
            precio1: parseNumeric(p.precio1),
            descuento_pct: parseNumeric(p.descuento_pct),
            precio_final: parseNumeric(p.precio_final),
          };
        });

        const { error: presError } = await supabase.from('presentaciones').upsert(presentationsToUpsert);
        if (presError) throw presError;
      }

      // VINCULAR EN LA TABLA DE COMPRA
      setDetalles(prev => prev.map(d =>
        d.id === activeLineId
          ? { ...d, producto_id: savedProduct.id, is_matched: true, itbis_pct: savedProduct.itbis_pct }
          : d
      ));

      setIsProductModalOpen(false);
      toast({ title: 'Éxito', description: 'Producto creado y vinculado a la compra correctamente.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al crear producto',
        description: error.message,
      });
    }
  };

  const handleDataExtracted = async (data) => {
    setOcrData({
      image_paths: data.image_paths,
      ocr_text: data.ocr_text,
      extracted_json: data
    });

    const { invoice, items: extractedItems } = data;

    // 1. Mapear Proveedor por RNC o Nombre
    if (invoice.supplier_rnc || invoice.supplier_name) {
      const foundProv = proveedores.find(p =>
        (invoice.supplier_rnc && p.rnc === invoice.supplier_rnc) ||
        (p.nombre.toLowerCase().includes(invoice.supplier_name.toLowerCase()))
      );
      if (foundProv) {
        setCompra(prev => ({ ...prev, suplidor_id: foundProv.id }));
      }
    }

    // 2. Mapear Datos de Encabezado
    setCompra(prev => ({
      ...prev,
      numero: invoice.invoice_number || prev.numero,
      ncf: invoice.ncf || prev.ncf,
      referencia: invoice.reference || prev.referencia,
      fecha: invoice.date ? new Date(invoice.date) : prev.fecha,
    }));

    // 3. Procesar Items y buscar en Inventario
    const processedItems = await Promise.all(extractedItems.map(async (item) => {
      let producto_id = null;
      let matched = false;

      if (item.code) {
        const { data: product } = await supabase
          .from('productos')
          .select('id, descripcion, itbis_pct')
          .eq('codigo', item.code)
          .single();

        if (product) {
          producto_id = product.id;
          matched = true;
        }
      }

      const itbis_pct = item.itbis_pct || 0.18;
      const costo = item.unit_cost || 0;
      const cantidad = item.qty || 0;
      const importe = cantidad * costo * (1 - (item.discount_pct || 0) / 100);

      return {
        id: Math.random(),
        codigo: item.code || '',
        descripcion: item.description || '',
        cantidad,
        unidad: item.unit || 'UND',
        costo_unitario: costo,
        descuento_pct: item.discount_pct || 0,
        itbis_pct,
        importe,
        producto_id,
        is_matched: matched
      };
    }));

    setDetalles(processedItems);

    toast({
      title: "Factura Procesada",
      description: `Se extrajeron ${processedItems.length} items. Por favor revise los datos.`
    });
  };

  const addDetalle = () => {
    const cantidad = parseFloat(currentDetalle.cantidad);
    if (!currentDetalle.codigo || !currentDetalle.descripcion || !cantidad || cantidad <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Complete los datos del producto.' });
      return;
    }
    const costo = parseFloat(currentDetalle.costo_unitario) || 0;
    const descuento = parseFloat(currentDetalle.descuento_pct) || 0;

    let importe = 0;
    const subtotal = cantidad * costo;
    const descValor = subtotal * (descuento / 100);
    const baseCalculo = subtotal - descValor;

    if (currentDetalle.itbis_pct > 0) {
      if (compra.itbis_incluido) {
        importe = baseCalculo;
      } else {
        importe = baseCalculo * (1 + currentDetalle.itbis_pct);
      }
    } else {
      importe = baseCalculo;
    }

    setDetalles([...detalles, { ...currentDetalle, cantidad, costo_unitario: costo, descuento_pct: descuento, importe, id: Date.now() }]);
    setCurrentDetalle(initialDetalleState);
    document.getElementById('codigo-producto')?.focus();
  };

  const removeDetalle = (id) => {
    setDetalles(detalles.filter(d => d.id !== id));
  };

  const handleSave = async () => {
    if (!compra.suplidor_id || !compra.almacen_id || detalles.length === 0) {
      toast({ variant: "destructive", title: "Datos incompletos", description: "Debe seleccionar un suplidor, un almacén y añadir al menos un producto." });
      return;
    }

    const totalPagado = pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
    const diferencia = Math.abs(totalPagado - totals.total);

    if (diferencia > 0.01) {
      toast({
        variant: "destructive",
        title: "Diferencia en Montos",
        description: `El total pagado (${totalPagado.toFixed(2)}) debe ser igual al total de la compra (${totals.total.toFixed(2)}).`
      });
      return;
    }

    // Explicitly get user session to avoid RLS issues
    const { data: { user: authUser } } = await supabase.auth.getUser();
    setIsSaving(true);

    const compraData = {
      ...compra,
      fecha: formatDateForSupabase(compra.fecha),
      total_exento: totals.exento,
      total_gravado: totals.gravado,
      descuento_total: totals.descuento,
      itbis_total: totals.itbis,
      total_compra: totals.total,
      pagos: pagos.filter(p => p.monto > 0),
      usuario_id: authUser?.id || user?.id,
      invoice_image_path: ocrData?.image_paths,
      ocr_text: ocrData?.ocr_text,
      extracted_json: ocrData?.extracted_json,
      id_orden_origen: null // Will be set below if valid
    };

    // Validate id_orden_origen existence
    if (compra.id_orden_origen && compra.id_orden_origen.length > 10) {
      const { data: ordenExists } = await supabase
        .from('ordenes_compra')
        .select('id')
        .eq('id', compra.id_orden_origen)
        .maybeSingle();

      if (ordenExists) {
        compraData.id_orden_origen = compra.id_orden_origen;
      }
    }

    const { data: savedCompra, error: compraError } = await supabase.from('compras').insert(compraData).select().single();

    if (compraError) {
      toast({ variant: "destructive", title: "Error al guardar la compra", description: compraError.message });
      setIsSaving(false);
      return;
    }

    const detallesData = detalles.map(d => ({
      compra_id: savedCompra.id,
      producto_id: d.producto_id,
      codigo: d.codigo,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      unidad: d.unidad,
      costo_unitario: d.costo_unitario,
      descuento_pct: d.descuento_pct,
      itbis_pct: d.itbis_pct,
      importe: d.importe,
    }));

    const { error: detallesError } = await supabase.from('compras_detalle').insert(detallesData);

    if (detallesError) {
      toast({ variant: "destructive", title: "Error al guardar detalles de la compra", description: detallesError.message });
    } else {
      const movimientos = detalles.map(d => ({
        producto_id: d.producto_id,
        tipo: 'ENTRADA',
        cantidad: d.cantidad,
        costo_unitario: d.costo_unitario,
        referencia_doc: `COMPRA-${savedCompra.numero || savedCompra.id}`,
        usuario_id: authUser?.id || user?.id,
        fecha: formatDateForSupabase(compra.fecha)
      }));
      await supabase.from('inventario_movimientos').insert(movimientos);

      // Update source order status to Recibida
      if (savedCompra.id_orden_origen) {
        await supabase
          .from('ordenes_compra')
          .update({ estado: 'Recibida' })
          .eq('id', savedCompra.id_orden_origen);
      }

      // Sync product costs and prices if requested
      if (compra.actualizar_precios) {
        for (const d of detalles) {
          if (!d.producto_id) continue;

          // Fetch ALL presentations for this product to ensure proper synchronization
          const { data: allPres } = await supabase
            .from('presentaciones')
            .select('*')
            .eq('producto_id', d.producto_id);

          if (allPres && allPres.length > 0) {
            const newBaseCosto = parseFloat(d.costo_unitario);
            let mainProductPrecio = 0;

            for (const pres of allPres) {
              const qty = parseFloat(pres.cantidad) || 1;
              const markup = parseFloat(pres.margen_pct) || 0;
              // Cost for this presentation = unit cost * units in presentation
              const newPresCosto = newBaseCosto * qty;
              // Price for this presentation = cost * (1 + markup%)
              const newPresPrecio = newPresCosto * (1 + markup / 100);

              // Recalculate auto prices
              const updateObj = {
                costo: newPresCosto,
                precio1: newPresPrecio
              };

              if (pres.auto_precio2) {
                updateObj.precio2 = (newPresPrecio * 0.90).toFixed(2);
              }
              if (pres.auto_precio3) {
                updateObj.precio3 = (newPresPrecio * 0.85).toFixed(2);
              }

              // Update this specific presentation
              await supabase
                .from('presentaciones')
                .update(updateObj)
                .eq('id', pres.id);

              // If this is the main presentation for the technical sheet, use its price for the main product entry
              if (pres.afecta_ft) {
                mainProductPrecio = newPresPrecio;
              }
            }

            // Update main product table with base cost and main price
            await supabase
              .from('productos')
              .update({
                costo: newBaseCosto,
                precio: mainProductPrecio || (parseFloat(allPres[0]?.precio1) || 0),
                updated_at: new Date().toISOString()
              })
              .eq('id', d.producto_id);
          } else {
            // Fallback: If no presentations, update the main product directly
            const newBaseCosto = parseFloat(d.costo_unitario);
            await supabase
              .from('productos')
              .update({
                costo: newBaseCosto,
                updated_at: new Date().toISOString()
              })
              .eq('id', d.producto_id);
          }
        }
      }

      toast({ title: 'Éxito', description: 'Compra guardada, existencia y precios actualizados correctamente.' });

      // Generate PDF
      const selectedSuplidor = proveedores.find(p => p.id === savedCompra.suplidor_id);
      generateCompraPDF(savedCompra, selectedSuplidor, detalles, authUser || user);

      resetForm();
    }

    setIsSaving(false);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      navigate(-1);
    }
    if (e.key === 'F3') {
      e.preventDefault();
      setIsSearchModalOpen(true);
    }
  }, [navigate, handleSave]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="bg-gray-100 min-h-screen pb-8">
      <Helmet>
        <title>Compra de Mercancía - REPUESTOS MORLA</title>
      </Helmet>

      <ProductSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} onSelectProduct={handleProductSelect} />
      <SuplidorSearchModal isOpen={isSuplidorModalOpen} onClose={() => setIsSuplidorModalOpen(false)} onSelectSuplidor={handleSuplidorSelect} />
      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onDataExtracted={handleDataExtracted}
      />
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProductFromOCR}
        product={tempProductData}
      />

      {/* Blue Header Bar */}
      <div className="bg-morla-blue shadow-md mb-2 border-b-2 border-morla-blue/20">
        <div className="container mx-auto px-4 h-11 flex items-center justify-between">
          <div className="w-32"></div>
          <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">
            COMPRA DE MERCANCIA
          </h1>
          <Button
            size="sm"
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-7 text-[10px] font-bold uppercase transition-all"
            onClick={() => setIsInvoiceModalOpen(true)}
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Subir Factura
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4">
        {/* Main Content Area */}
        <div className="bg-white shadow-2xl border rounded-lg overflow-hidden flex flex-col min-h-[85vh]">
          <div className="flex-1 p-4 lg:p-6 space-y-2">
            <CompraHeader
              compra={compra}
              setCompra={setCompra}
              proveedores={proveedores}
              almacenes={almacenes}
              onOpenSuplidorSearch={() => setIsSuplidorModalOpen(true)}
            />

            <CompraDetalles
              currentDetalle={currentDetalle}
              setCurrentDetalle={setCurrentDetalle}
              detalles={detalles}
              addDetalle={addDetalle}
              removeDetalle={removeDetalle}
              setIsSearchModalOpen={setIsSearchModalOpen}
              onCreateProduct={handleCreateProductFromLine}
              itbisIncluido={compra.itbis_incluido}
            />

            <CompraFooter
              compra={compra}
              setCompra={setCompra}
              pagos={pagos}
              setPagos={setPagos}
              totals={totals}
            />
          </div>

          {/* Action Buttons Footer */}
          <div className="bg-gray-50 p-4 border-t flex justify-end items-center gap-5">
            <Button
              variant="outline"
              className="px-6 py-5 bg-white border-gray-300 shadow-sm hover:bg-gray-100 flex items-center gap-3 group transition-all h-11 border-b-[3px]"
              onClick={() => navigate(-1)}
              disabled={isSaving}
            >
              <div className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-black group-hover:bg-gray-300 transition-colors">ESC</div>
              <span className="font-black uppercase text-xs text-gray-700 tracking-wider">Retornar</span>
            </Button>

            <Button
              className="px-8 py-5 bg-white border-2 border-morla-blue text-morla-blue hover:bg-morla-blue hover:text-white shadow-lg flex items-center gap-3 group transition-all h-11 border-b-[4px]"
              onClick={handleSave}
              disabled={isSaving}
            >
              <div className="bg-morla-blue text-white px-1.5 py-0.5 rounded text-[10px] font-black group-hover:bg-white group-hover:text-morla-blue transition-colors">F10</div>
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              <span className="font-black uppercase text-xs tracking-widest">Grabar Compra</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};


export default ComprasPage;