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
import SuplidorFormModal from '@/components/catalogo/SuplidorFormModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { ImagePlus, Printer } from 'lucide-react';
import { generateCompraPDF } from '@/components/common/PDFGenerator';
import { printCompraPOS } from '@/lib/printPOS';

const ComprasPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, empresa } = useAuth();
  const { ordenParaFacturar, setOrdenParaFacturar } = useCompras();
  const { panels, activePanel, closePanel } = usePanels();
  const currentPanel = panels.find(p => p.id === activePanel);
  const compraParaEditar = currentPanel?.extraData?.compraParaEditar;
  const [isEditMode, setIsEditMode] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [catalogMarcas, setCatalogMarcas] = useState([]);
  const [catalogModelos, setCatalogModelos] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSuplidorModalOpen, setIsSuplidorModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isEditSuplidorModalOpen, setIsEditSuplidorModalOpen] = useState(false);
  const [tempProductData, setTempProductData] = useState(null);
  const [selectedSuplidorToEdit, setSelectedSuplidorToEdit] = useState(null);
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
    referencia: '',
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
  const [printMethod, setPrintMethod] = useState('pos');
  const [paperSize, setPaperSize] = useState('4inch');

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

    // Cargar catálogos de marcas y modelos para auto-detección OCR
    const { data: marcasData } = await supabase.from('marcas').select('id, nombre').order('nombre');
    if (marcasData) setCatalogMarcas(marcasData);

    const { data: modelosData } = await supabase.from('modelos').select('id, nombre').order('nombre');
    if (modelosData) setCatalogModelos(modelosData);

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

  // --- EDICION DE COMPRA ---
  useEffect(() => {
    const loadCompraData = async () => {
      if (!compraParaEditar) return;
      setIsEditMode(true);
      
      const { data, error } = await supabase
        .from('compras')
        .select(`*, compras_detalle(*)`)
        .eq('id', compraParaEditar.id)
        .single();
        
      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la compra.' });
        return;
      }
      
      setCompra({
        id: data.id,
        numero: data.numero,
        fecha: new Date(data.fecha),
        ncf: data.ncf || '',
        referencia: data.referencia || '',
        tipo_bienes_servicios: data.tipo_bienes_servicios || '09',
        sub_tipo: data.sub_tipo || 'Compra de Merc',
        suplidor_id: data.suplidor_id,
        almacen_id: data.almacen_id || 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7',
        itbis_incluido: data.itbis_incluido ?? false,
        actualizar_precios: data.actualizar_precios ?? true,
        forma_pago: data.forma_pago || 'Contado',
        dias_credito: data.dias_credito || 0,
        id_orden_origen: data.id_orden_origen || null,
      });

      if (data.compras_detalle) {
        setDetalles(data.compras_detalle.map(d => ({
          ...d,
          original_id: d.id,
          id: Math.random() // for local unique key rendering
        })));
      }

      const rawPagos = data.pagos || [];
      if (rawPagos.length > 0) {
          setPagos(rawPagos);
      } else if (data.monto_pagado > 0) {
          setPagos([{ tipo: '01', referencia: '', monto: data.monto_pagado, id: Date.now() }]);
      }
      
      toast({ title: 'Modo Edición', description: `Editando compra ${data.numero}` });
    };
    
    loadCompraData();
  }, [compraParaEditar, toast]);

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
      const subtotalItem = Number((d.cantidad * d.costo_unitario).toFixed(2));
      const descuentoItem = Number((subtotalItem * (d.descuento_pct / 100)).toFixed(2));
      descuento += descuentoItem;

      const baseCalculo = Number((subtotalItem - descuentoItem).toFixed(2));

      if (d.itbis_pct > 0) {
        if (compra.itbis_incluido) {
          // Si está incluido, la base es (Total / 1.18) y el ITBIS es (Total - Base)
          const baseSinItbis = Number((baseCalculo / (1 + d.itbis_pct)).toFixed(2));
          gravado += baseSinItbis;
          itbis += Number((baseCalculo - baseSinItbis).toFixed(2));
        } else {
          // TRUNCAR A 2 DECIMALES SEGUN REQUERIMIENTO USER
          const itbisItem = Math.trunc((baseCalculo * d.itbis_pct) * 100) / 100;
          gravado += baseCalculo;
          itbis += itbisItem;
        }
      } else {
        exento += baseCalculo;
      }
    });

    const total = Number((gravado + exento + itbis).toFixed(2));
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

  const handleSearchByCode = async (code) => {
    if (!code) return;
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .ilike('codigo', code)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        handleProductSelect(data);
      } else {
        toast({ variant: 'destructive', title: 'No encontrado', description: 'Producto no encontrado con ese código.' });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'Error al buscar producto.' });
    }
  };

  const handleSuplidorSelect = (suplidor) => {
    setCompra(prev => ({
      ...prev,
      suplidor_id: suplidor.id,
      forma_pago: suplidor.vende_a_credito ? 'Credito' : prev.forma_pago,
      dias_credito: suplidor.vende_a_credito ? suplidor.dias_credito : prev.dias_credito
    }));
    setIsSuplidorModalOpen(false);
  };

  const handleEditSuplidor = (suplidor) => {
    setSelectedSuplidorToEdit(suplidor);
    setIsEditSuplidorModalOpen(true);
  };

  const handleEditSuplidorClose = (refresh) => {
    setIsEditSuplidorModalOpen(false);
    setSelectedSuplidorToEdit(null);
    if (refresh) {
      fetchInitialData();
    }
  };

  // --- Helpers para auto-detectar marca y modelos en la descripción ---
  const detectMarcaFromDescription = useCallback((descripcion) => {
    if (!descripcion || catalogMarcas.length === 0) return null;
    const desc = descripcion.toUpperCase();
    // Buscar marcas en la descripción, priorizando las más largas (para evitar falsos positivos)
    const sortedMarcas = [...catalogMarcas].sort((a, b) => b.nombre.length - a.nombre.length);
    for (const marca of sortedMarcas) {
      // Usar boundary check: la marca debe estar como palabra completa
      const regex = new RegExp(`\\b${marca.nombre.toUpperCase().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
      if (regex.test(desc)) {
        return marca.id;
      }
    }
    return null;
  }, [catalogMarcas]);

  const detectModelosFromDescription = useCallback((descripcion) => {
    if (!descripcion || catalogModelos.length === 0) return [];
    const desc = descripcion.toUpperCase();
    const foundIds = [];
    const seenNames = new Set();
    // Buscar modelos, priorizando los más largos
    const sortedModelos = [...catalogModelos].sort((a, b) => b.nombre.length - a.nombre.length);
    for (const modelo of sortedModelos) {
      const nombreUpper = modelo.nombre.toUpperCase();
      if (seenNames.has(nombreUpper)) continue;
      // Solo buscar modelos con al menos 2 caracteres para evitar falsos positivos
      if (nombreUpper.length < 2) continue;
      const regex = new RegExp(`\\b${nombreUpper.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
      if (regex.test(desc)) {
        foundIds.push(modelo.id);
        seenNames.add(nombreUpper);
      }
    }
    return foundIds;
  }, [catalogModelos]);

  const handleCreateProductFromLine = (line) => {
    setActiveLineId(line.id);

    // Auto-detectar marca y modelos desde la descripción
    const autoMarcaId = detectMarcaFromDescription(line.descripcion);
    const autoModelosIds = detectModelosFromDescription(line.descripcion);

    setTempProductData({
      codigo: line.codigo || '',
      referencia: line.referencia || '',
      descripcion: line.descripcion || '',
      costo: line.costo_unitario || 0,
      // Auto-llenar suplidor con el seleccionado en la compra
      suplidor_id: compra.suplidor_id || null,
      // Auto-llenar marca si se detecta en la descripción
      marca_id: autoMarcaId,
      // Auto-llenar modelos si se detectan en la descripción
      modelos_ids: autoModelosIds,
    });
    setIsProductModalOpen(true);
  };

  const handleSaveProductFromOCR = async (productData, presentations, isEditing) => {
    try {
      const parseNumeric = (value) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      const { existencia, id: _, ...restProductData } = productData;

      const productPayload = {
        ...restProductData,
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

      // VINCULAR EN LA TABLA DE COMPRA — reflejar todos los cambios hechos en el formulario
      setDetalles(prev => prev.map(d =>
        d.id === activeLineId
          ? {
            ...d,
            producto_id: savedProduct.id,
            is_matched: true,
            codigo: savedProduct.codigo || d.codigo,
            descripcion: savedProduct.descripcion || d.descripcion,
            referencia: savedProduct.referencia || d.referencia,
            itbis_pct: savedProduct.itbis_pct,
          }
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

    // El suplidor ya fue seleccionado previamente (requerido antes de subir foto)
    // Solo actualizamos datos de encabezado de la factura

    // 2. Mapear Datos de Encabezado
    setCompra(prev => ({
      ...prev,
      // No reemplazamos 'numero' para mantener el orden del sistema
      ncf: invoice.ncf || prev.ncf,
      referencia: invoice.invoice_number || invoice.reference || prev.referencia, // Factura subida va a referencia
      // Añadimos T12:00:00 para evitar que el ajuste de zona horaria retrase la fecha un día
      fecha: invoice.date ? new Date(`${invoice.date}T12:00:00`) : prev.fecha,
    }));

    // 3. Procesar Items y buscar en Inventario
    const processedItems = await Promise.all(extractedItems.map(async (item) => {
      let producto_id = null;
      let matched = false;
      let descripcion = item.description || '';

      // Pre-procesar porcentajes (si vienen como 18 en lugar de 0.18)
      let itbis_pct = item.itbis_pct || 0.18;
      if (itbis_pct > 1) itbis_pct = itbis_pct / 100;

      let discount_pct = item.discount_pct || 0;
      if (discount_pct > 1) discount_pct = discount_pct / 100;

      if (item.code) {
        // Corrección de OCR: Si la IA lee '1-' o 'l-' al inicio de un código, reemplazarlo por 'I-' mayúscula
        item.code = item.code.replace(/^[1l]-/i, 'I-');

        const { data: product } = await supabase
          .from('productos')
          .select('id, descripcion, itbis_pct, referencia, suplidor_id, marca_id, modelos_ids')
          .ilike('codigo', item.code)
          .maybeSingle();

        if (product) {
          producto_id = product.id;
          matched = true;
          // De las mercancías creadas anteriormente solo traemos nuevo el costo y lo relativo a la factura
          descripcion = product.descripcion;
          itbis_pct = product.itbis_pct ?? itbis_pct;

          // Campos a actualizar si están vacíos en el producto existente
          const updateFields = {};

          // Si el producto no tiene referencia pero el OCR extrajo una, actualizar
          if (!product.referencia && item.reference) {
            updateFields.referencia = item.reference;
          }

          // Si el producto no tiene suplidor, asignar el suplidor seleccionado en la compra
          if (!product.suplidor_id && compra.suplidor_id) {
            updateFields.suplidor_id = compra.suplidor_id;
          }

          // Si el producto no tiene marca, intentar detectarla de la descripción
          if (!product.marca_id) {
            const detectedMarca = detectMarcaFromDescription(product.descripcion || descripcion);
            if (detectedMarca) {
              updateFields.marca_id = detectedMarca;
            }
          }

          // Si el producto no tiene modelos, intentar detectarlos de la descripción
          if (!product.modelos_ids || product.modelos_ids.length === 0) {
            const detectedModelos = detectModelosFromDescription(product.descripcion || descripcion);
            if (detectedModelos.length > 0) {
              updateFields.modelos_ids = detectedModelos;
            }
          }

          // Actualizar en BD solo si hay campos nuevos que llenar
          if (Object.keys(updateFields).length > 0) {
            await supabase
              .from('productos')
              .update(updateFields)
              .eq('id', product.id);
          }
        }
      }

      const costo = item.unit_cost || 0;
      const cantidad = item.qty || 0;

      // La base se calcula restando el descuento
      const baseCalculo = cantidad * costo * (1 - discount_pct);

      // Si el ITBIS no está incluido, lo sumamos al importe de la línea (TRUNCANDO ITBIS)
      let importe = baseCalculo;
      if (itbis_pct > 0 && !compra.itbis_incluido) {
        const itbisValor = Math.trunc((baseCalculo * itbis_pct) * 100) / 100;
        importe = baseCalculo + itbisValor;
      }

      return {
        id: Math.random(),
        codigo: item.code || '',
        referencia: item.reference || '',
        descripcion,
        cantidad,
        unidad: item.unit || 'UND',
        costo_unitario: costo,
        descuento_pct: discount_pct * 100, // Lo guardamos como entero (e.g. 15) para el resto del sistema
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
    const subtotal = Number((cantidad * costo).toFixed(2));
    const descValor = Number((subtotal * (descuento / 100)).toFixed(2));
    const baseCalculo = Number((subtotal - descValor).toFixed(2));

    if (currentDetalle.itbis_pct > 0) {
      if (compra.itbis_incluido) {
        importe = baseCalculo;
      } else {
        // TRUNCAR A 2 DECIMALES SEGUN REQUERIMIENTO USER
        const itbisValor = Math.trunc((baseCalculo * currentDetalle.itbis_pct) * 100) / 100;
        importe = Number((baseCalculo + itbisValor).toFixed(2));
      }
    } else {
      importe = baseCalculo;
    }

    setDetalles([...detalles, { ...currentDetalle, cantidad, costo_unitario: costo, descuento_pct: descuento, importe: Number(importe.toFixed(2)), id: Date.now() }]);
    setCurrentDetalle(initialDetalleState);
    document.getElementById('codigo-producto')?.focus();
  };

  const removeDetalle = (id) => {
    setDetalles(detalles.filter(d => d.id !== id));
  };

  const handleEditLine = (line) => {
    // Si ya hay algo en edición, no lo perdemos? 
    // Por simplicidad, reemplazamos lo que esté en el staging area
    setCurrentDetalle({
      codigo: line.codigo,
      referencia: line.referencia || '',
      descripcion: line.descripcion,
      cantidad: line.cantidad,
      unidad: line.unidad || 'UND',
      costo_unitario: line.costo_unitario,
      descuento_pct: line.descuento_pct,
      itbis_pct: line.itbis_pct,
      importe: line.importe,
      producto_id: line.producto_id,
    });
    // Remove the line from the list so it can be re-added after editing
    removeDetalle(line.id);

    // Focus on quantity to start editing
    setTimeout(() => {
      document.getElementById('cantidad-producto')?.focus();
    }, 100);
  };

  const handleSave = async () => {
    if (isSaving) return;

    if (!compra.suplidor_id || !compra.almacen_id || detalles.length === 0 || (!compra.referencia || compra.referencia.trim() === '')) {
      toast({ 
        variant: "destructive", 
        title: "Datos incompletos", 
        description: "Debe seleccionar un suplidor, añadir al menos un producto y especificar la Referencia (No. Factura)." 
      });
      return;
    }

    const totalPagado = pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
    const diferencia = Math.abs(totalPagado - totals.total);

    // Solo exigimos pago completo si NO es crédito
    if (compra.forma_pago !== 'Credito' && diferencia > 0.01) {
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

    // Validación de duplicidad (Mismo Suplidor con misma Referencia o NCF)
    let queryVal = supabase.from('compras').select('id, referencia, ncf').eq('suplidor_id', compra.suplidor_id);
    const orConds = [];
    if (compra.referencia && compra.referencia.trim() !== '') {
      orConds.push(`referencia.eq."${compra.referencia}"`);
    }
    if (compra.ncf && compra.ncf.trim() !== '') {
      orConds.push(`ncf.eq."${compra.ncf}"`);
    }
    
    if (orConds.length > 0) {
      queryVal = queryVal.or(orConds.join(','));
      if (isEditMode && compra.id) {
        queryVal = queryVal.neq('id', compra.id);
      }
      
      const { data: posiblesDuplicados, error: dupError } = await queryVal;
      
      if (!dupError && posiblesDuplicados && posiblesDuplicados.length > 0) {
        const refUpper = compra.referencia?.toUpperCase() || '';
        const ncfUpper = compra.ncf?.toUpperCase() || '';
        
        const matchRef = posiblesDuplicados.some(c => c.referencia?.toUpperCase() === refUpper);
        const matchNCF = posiblesDuplicados.some(c => c.ncf?.toUpperCase() === ncfUpper && ncfUpper !== '');
        
        let msj = '';
        if (matchRef && matchNCF) msj = 'La Referencia (Factura) y el NCF ya existen';
        else if (matchRef) msj = `La Factura N° "${compra.referencia}" ya existe`;
        else if (matchNCF) msj = `El NCF "${compra.ncf}" ya existe`;
        
        if (msj) {
           toast({
             variant: "destructive",
             title: "Bloqueo: Factura Duplicada",
             description: `${msj} para este suplidor en una compra anterior.`
           });
           setIsSaving(false);
           return;
        }
      }
    }

    const compraData = {
      ...compra,
      fecha: formatDateForSupabase(compra.fecha),
      total_exento: totals.exento,
      total_gravado: totals.gravado,
      descuento_total: totals.descuento,
      itbis_total: totals.itbis,
      total_compra: totals.total,
      monto_pagado: compra.forma_pago === 'Credito' ? 0 : totals.total,
      monto_pendiente: compra.forma_pago === 'Credito' ? totals.total : 0,
      estado: compra.forma_pago === 'Credito' ? 'PENDIENTE' : 'PAGADA',
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

    let savedCompra;
    if (isEditMode) {
      const { data, error: compraError } = await supabase.from('compras').update(compraData).eq('id', compra.id).select().single();
      if (compraError) {
        toast({ variant: "destructive", title: "Error al actualizar la compra", description: compraError.message });
        setIsSaving(false);
        return;
      }
      savedCompra = data;
      
      // Limpiar detalles y movimientos previos para repoblarlos frescos con los cambios
      await supabase.from('compras_detalle').delete().eq('compra_id', savedCompra.id);
      await supabase.from('inventario_movimientos').delete().eq('referencia_doc', `COMPRA-${savedCompra.numero || savedCompra.id}`);
    } else {
      const { data, error: compraError } = await supabase.from('compras').insert(compraData).select().single();
      if (compraError) {
        toast({ variant: "destructive", title: "Error al guardar la compra", description: compraError.message });
        setIsSaving(false);
        return;
      }
      savedCompra = data;
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
      // ============================================
      // LIMPIEZA AUTOMÁTICA DE ÓRDENES PENDIENTES
      // ============================================
      try {
        const CONFIG_ID = '00000000-0000-0000-0000-000000000001';
        const { data: config } = await supabase.from('config_empresa').select('limpiar_ordenes_compra_auto, modo_limpieza_orden').eq('id', CONFIG_ID).single();

        if (config?.limpiar_ordenes_compra_auto) {
          // Buscar todas las órdenes pendientes del mismo suplidor
          const { data: ordenesPendientes } = await supabase
            .from('ordenes_compra')
            .select('id, numero')
            .eq('suplidor_id', savedCompra.suplidor_id)
            .eq('estado', 'Pendiente');

          if (ordenesPendientes && ordenesPendientes.length > 0) {
            for (const orden of ordenesPendientes) {
              const { data: ordenDetalles } = await supabase
                .from('ordenes_compra_detalle')
                .select('*')
                .eq('orden_compra_id', orden.id);

              if (ordenDetalles) {
                for (const d of detalles) {
                  const match = ordenDetalles.find(od => od.codigo === d.codigo);
                  if (match) {
                    if (config.modo_limpieza_orden === 'agresivo') {
                      // Borrado agresivo: cualquier cantidad recibida elimina la línea de la orden
                      await supabase.from('ordenes_compra_detalle').delete().eq('id', match.id);
                    } else {
                      // Proporcional: restar cantidad
                      if (d.cantidad >= match.cantidad) {
                        await supabase.from('ordenes_compra_detalle').delete().eq('id', match.id);
                      } else {
                        await supabase.from('ordenes_compra_detalle').update({ 
                          cantidad: match.cantidad - d.cantidad 
                        }).eq('id', match.id);
                      }
                    }
                  }
                }

                // Verificar si la orden se quedó sin detalles
                const { data: remainDetalles } = await supabase
                  .from('ordenes_compra_detalle')
                  .select('id', { count: 'exact' })
                  .eq('orden_compra_id', orden.id);
                
                if (!remainDetalles || remainDetalles.length === 0) {
                   await supabase.from('ordenes_compra').update({ estado: 'Recibida' }).eq('id', orden.id);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Error en limpieza automática de órdenes:", err);
      }

      // Update source order status to Recibida (si vino de flujo formal)
      if (savedCompra.id_orden_origen) {
        await supabase
          .from('ordenes_compra')
          .update({ estado: 'Recibida' })
          .eq('id', savedCompra.id_orden_origen);
      }

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
            // Costo real unitario considerando descuento e ITBIS (TRUNCANDO ITBIS)
            const costoSinITBIS = d.costo_unitario * (1 - (d.descuento_pct / 100));
            const itbisMonto = d.itbis_pct > 0 && !compra.itbis_incluido
              ? Math.trunc((costoSinITBIS * d.itbis_pct) * 100) / 100
              : 0;

            const costoRealUnitario = Number((costoSinITBIS + itbisMonto).toFixed(2));

            const newBaseCosto = costoRealUnitario;
            let mainProductPrecio = 0;

            for (const pres of allPres) {
              const qty = parseFloat(pres.cantidad) || 1;
              const markup = parseFloat(pres.margen_pct) || 0;
              // Cost for this presentation = unit cost * units in presentation
              const newPresCosto = Number((newBaseCosto * qty).toFixed(2));
              // Price for this presentation = cost * (1 + markup%)
              const newPresPrecio = Number((newPresCosto * (1 + markup / 100)).toFixed(2));

              // Recalculate auto prices
              const updateObj = {
                costo: newPresCosto,
                precio1: newPresPrecio
              };

              if (pres.auto_precio2) {
                updateObj.precio2 = Number((newPresPrecio * 0.90).toFixed(2));
              }
              if (pres.auto_precio3) {
                updateObj.precio3 = Number((newPresPrecio * 0.85).toFixed(2));
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
            // Fallback: Si no hay presentaciones, crear una y actualizar el producto
            // USAR COSTO REAL (CON DESCUENTO E ITBIS)
            const costoSinITBIS = d.costo_unitario * (1 - (d.descuento_pct / 100));
            const itbisMonto = d.itbis_pct > 0 && !compra.itbis_incluido
              ? Math.trunc((costoSinITBIS * d.itbis_pct) * 100) / 100
              : 0;
            const costoRealUnitario = Number((costoSinITBIS + itbisMonto).toFixed(2));

            // Crear presentación base automáticamente para que el formulario muestre datos correctos
            await supabase
              .from('presentaciones')
              .insert({
                producto_id: d.producto_id,
                tipo: 'UND - Unidad',
                cantidad: 1,
                costo: costoRealUnitario,
                margen_pct: 0,
                precio1: costoRealUnitario,
                precio2: 0,
                precio3: 0,
                auto_precio2: true,
                auto_precio3: true,
                descuento_pct: 0,
                precio_final: costoRealUnitario,
                afecta_ft: true,
                afecta_inv: true,
              });

            await supabase
              .from('productos')
              .update({
                costo: costoRealUnitario,
                precio: costoRealUnitario,
                updated_at: new Date().toISOString()
              })
              .eq('id', d.producto_id);
          }
        }
      }

      toast({ title: 'Éxito', description: 'Compra guardada, existencia y precios actualizados correctamente.' });

      // ============================================
      // COMPROBAR Y RECIBIR SOLICITUDES AGOTADAS
      // ============================================
      try {
        const { data: todasSolicitudesPendientes, error: errorSols } = await supabase
          .from('solicitudes_clientes')
          .select('id, producto_id, estado, productos(descripcion, codigo), clientes(nombre), notas, producto_texto')
          .in('estado', ['abierta', 'solicitado']);

        if (!errorSols && todasSolicitudesPendientes && todasSolicitudesPendientes.length > 0) {
          const idsToUpdate = [];
          const notificaciones = [];

          for (const s of todasSolicitudesPendientes) {
            let matched = false;

            for (const d of detalles) {
              // 1. Coincidencia exacta por ID de producto
              if (s.producto_id && d.producto_id && s.producto_id === d.producto_id) {
                matched = true;
                break;
              }

              // 2. Coincidencia por texto libre o notas (Primera Compra)
              const isPrimeraCompra = s.productos?.codigo === '01';
              if (!s.producto_id || isPrimeraCompra) {
                const descCompra = (d.descripcion || '').toLowerCase().trim();
                const codCompra = (d.codigo || '').toLowerCase().trim();
                
                const textoSol = (s.producto_texto || '').toLowerCase().trim();
                const notasSol = (s.notas || '').toLowerCase().trim();

                const safeMatch = (str1, str2) => {
                  if (!str1 || !str2) return false;
                  if (str1.length < 4 || str2.length < 4) return false;
                  return str1.includes(str2) || str2.includes(str1);
                };

                if (
                  safeMatch(descCompra, textoSol) ||
                  safeMatch(descCompra, notasSol) ||
                  safeMatch(codCompra, textoSol) ||
                  safeMatch(codCompra, notasSol)
                ) {
                  matched = true;
                  break;
                }
              }
            }

            if (matched) {
              idsToUpdate.push(s.id);
              const productName = s.productos?.descripcion || s.producto_texto || 'Producto desconocido';
              const clientName = s.clientes?.nombre || 'Cliente sin registrar';
              notificaciones.push({ productName, clientName });
            }
          }

          if (idsToUpdate.length > 0) {
            await supabase
              .from('solicitudes_clientes')
              .update({ estado: 'notificada' })
              .in('id', idsToUpdate);

            const listItems = notificaciones.map(n => `${n.productName} (Para: ${n.clientName})`).slice(0, 3).join(", ");
            const countExt = idsToUpdate.length > 3 ? ` y ${idsToUpdate.length - 3} más...` : '';

            toast({
              title: '⭐ ¡Artículos Agotados Recibidos!',
              description: `Se notificaron ${idsToUpdate.length} solicitudes en espera: ${listItems}${countExt}`,
              duration: 7000,
            });
          }
        }
      } catch (e) {
        console.error("Error al actualizar solicitudes agotadas:", e);
      }
      // ============================================

      // Generate PDF
      const selectedSuplidor = proveedores.find(p => p.id === savedCompra.suplidor_id);
      
      if (printMethod === 'pos') {
        printCompraPOS(savedCompra, selectedSuplidor, detalles, paperSize);
      } else {
        generateCompraPDF(savedCompra, selectedSuplidor, detalles, authUser || user, empresa);
      }

      resetForm();
      
      if (isEditMode) {
        setIsEditMode(false);
        closePanel('compras');
        openPanel('reporte-compras');
      }
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
        <title>Compra de Mercancía - MotoFlow</title>
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
      <SuplidorFormModal
        isOpen={isEditSuplidorModalOpen}
        onClose={handleEditSuplidorClose}
        suplidor={selectedSuplidorToEdit}
      />

      {/* Blue Header Bar */}
      <div className="bg-morla-blue shadow-md mb-2 border-b-2 border-morla-blue/20">
        <div className="container mx-auto px-4 h-11 flex items-center justify-between">
          <div className="w-32"></div>
          <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">
            {isEditMode ? 'EDITAR COMPRA DE MERCANCIA' : 'COMPRA DE MERCANCIA'}
          </h1>
          <Button
            size="sm"
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-7 text-[10px] font-bold uppercase transition-all"
            onClick={() => {
              if (!compra.suplidor_id) {
                toast({
                  variant: 'destructive',
                  title: 'Suplidor requerido',
                  description: 'Debe seleccionar un suplidor antes de subir una factura.'
                });
                return;
              }
              setIsInvoiceModalOpen(true);
            }}
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
              onEditSuplidor={handleEditSuplidor}
            />

            <CompraDetalles
              currentDetalle={currentDetalle}
              setCurrentDetalle={setCurrentDetalle}
              detalles={detalles}
              addDetalle={addDetalle}
              removeDetalle={removeDetalle}
              onEditLine={handleEditLine}
              setIsSearchModalOpen={setIsSearchModalOpen}
              onCreateProduct={handleCreateProductFromLine}
              itbisIncluido={compra.itbis_incluido}
              onSearchByCode={handleSearchByCode}
            />

            <CompraFooter
              compra={compra}
              setCompra={setCompra}
              pagos={pagos}
              setPagos={setPagos}
              totals={totals}
              printMethod={printMethod}
              setPrintMethod={setPrintMethod}
              paperSize={paperSize}
              setPaperSize={setPaperSize}
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