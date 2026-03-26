import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Lock, Info, Zap, Settings, Loader2, Upload, Trash2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import CatalogManagementModal from '@/components/products/form/CatalogManagementModal';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import SearchableSelect from '@/components/common/SearchableSelect';
import MultiSearchableSelect from '@/components/common/MultiSearchableSelect';
import { ScrollArea } from '@/components/ui/scroll-area';

const NULL_VALUE = 'null_value';

const ProductBasicInfo = ({ formData, setFormData, onCodigoBlur, onProductSelect, isEditing, handleNotImplemented, tipos, marcas, modelos, proveedores, almacenes, fetchCatalogs }) => {
  const [isTipoModalOpen, setIsTipoModalOpen] = useState(false);
  const [isMarcaModalOpen, setIsMarcaModalOpen] = useState(false);
  const [isModeloModalOpen, setIsModeloModalOpen] = useState(false);
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false);
  const [isUbicacionModalOpen, setIsUbicacionModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isCalculatingStock, setIsCalculatingStock] = useState(false);
  const [suggestedUbicacion, setSuggestedUbicacion] = useState(null);
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false);
  const { toast } = useToast();

  // Image upload
  const fileInputRef = useRef(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Refs for Enter key navigation
  const referenciaRef = useRef(null);
  const descripcionRef = useRef(null);
  const minStockRef = useRef(null);
  const maxStockRef = useRef(null);

  const catalogConfig = useMemo(() => ({
    tipos: { title: 'Tipos de Producto', table: 'tipos_producto', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    marcas: { title: 'Marcas', table: 'marcas', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    modelos: {
      title: 'Modelos',
      table: 'modelos',
      columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }],
      extraData: { marca_id: formData.marca_id || null }
    },
    proveedores: { title: 'Suplidores', table: 'proveedores', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    ubicaciones: { title: 'Ubicaciones', table: 'almacenes', columns: [{ accessor: 'codigo', header: 'Código', type: 'text' }, { accessor: 'nombre', header: 'Nombre', type: 'text' }] },
  }), [formData.marca_id]);



  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSelectChange = useCallback((id, value) => {
    const parsedValue = (value === NULL_VALUE || value === '') ? null : value; 
    setFormData(prev => {
      const newState = { ...prev, [id]: parsedValue };
      if (id === 'marca_id') {
        newState.modelos_ids = []; // Reset modelos when marca changes
      }
      return newState;
    });
  }, [setFormData]);

  const handleMultiSelectChange = useCallback((id, value) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  }, [setFormData]);

  const handleNumberChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: parseFloat(value) || 0 }));
  };

  const handleIntChange = (e) => {
    const { id, value = '' } = e.target; // Ensure value is a string for parseInt
    setFormData(prev => ({ ...prev, [id]: parseInt(value, 10) || 0 }));
  }

  const handleSaveSuccess = useCallback(() => {
    fetchCatalogs();
  }, [fetchCatalogs]);

  const closeModal = useCallback((setter) => () => setter(false), []);

  const handleCodigoKeyDown = useCallback((e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      setIsSearchModalOpen(true);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      referenciaRef.current?.focus();
    }
  }, []);

  // Generic Enter key handler to move to next field
  const handleEnterToNext = useCallback((e, nextRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextRef?.current) {
        nextRef.current.focus();
      } else if (typeof nextRef === 'string') {
        const el = document.getElementById(nextRef);
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
      }
    }
  }, []);

  // ─── Image Upload Handler ────────────────────────────────────────
  const handleImageUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Formato no válido', description: 'Solo se permiten imágenes JPG, PNG, WebP o GIF.' });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Archivo muy grande', description: 'El tamaño máximo es 5MB.' });
      return;
    }

    setIsUploadingImage(true);
    try {
      // Generate unique filename
      const ext = file.name.split('.').pop();
      const codigo = (formData.codigo || 'producto').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${codigo}_${Date.now()}.${ext}`;

      // If there's an existing image, delete it first
      if (formData.imagen_url) {
        const oldPath = formData.imagen_url.split('/product-images/')[1];
        if (oldPath) {
          await supabase.storage.from('product-images').remove([oldPath]);
        }
      }

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(data.path);

      const publicUrl = urlData.publicUrl;

      // Update form data
      setFormData(prev => ({ ...prev, imagen_url: publicUrl }));

      toast({ title: '✅ Imagen cargada', description: 'La imagen del producto fue actualizada exitosamente.' });
    } catch (error) {
      console.error('[ImageUpload] Error:', error);
      toast({ variant: 'destructive', title: 'Error al subir imagen', description: error.message || 'No se pudo cargar la imagen.' });
    } finally {
      setIsUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [formData.codigo, formData.imagen_url, setFormData, toast]);

  const handleImageRemove = useCallback(async () => {
    if (!formData.imagen_url) return;

    setIsUploadingImage(true);
    try {
      // Extract path from URL
      const oldPath = formData.imagen_url.split('/product-images/')[1];
      if (oldPath) {
        await supabase.storage.from('product-images').remove([oldPath]);
      }
      setFormData(prev => ({ ...prev, imagen_url: '' }));
      toast({ title: 'Imagen eliminada', description: 'La imagen del producto fue removida.' });
    } catch (error) {
      console.error('[ImageRemove] Error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la imagen.' });
    } finally {
      setIsUploadingImage(false);
    }
  }, [formData.imagen_url, setFormData, toast]);

  const handleProductSelection = (product) => {
    onProductSelect(product);
    setIsSearchModalOpen(false);
  };

  const tipoOptions = useMemo(() => {
    return (tipos || [])
      .filter(t => t.activo)
      .map(t => ({ value: String(t.id), label: t.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [tipos]);

  const marcaOptions = useMemo(() => {
    return (marcas || [])
      .filter(m => m.activo)
      .map(m => ({ value: String(m.id), label: m.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [marcas]);

  const filteredModelos = useMemo(() => {
    if (!modelos) return [];
    if (!formData.marca_id) return modelos; // Show all models if no brand is selected
    return modelos.filter(m => String(m.marca_id) === String(formData.marca_id));
  }, [formData.marca_id, modelos]);

  const modeloOptions = useMemo(() => {
    return (filteredModelos || [])
      .filter(m => m.activo)
      .map(m => ({ value: String(m.id), label: m.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [filteredModelos]);

  const proveedorOptions = useMemo(() => {
    return (proveedores || [])
      .filter(p => p.activo)
      .map(p => ({ value: String(p.id), label: p.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [proveedores]);

  const ubicacionOptions = useMemo(() => {
    return (almacenes || [])
      .filter(a => a.activo)
      .map(a => ({ value: String(a.nombre), label: a.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [almacenes]);

  useEffect(() => {
    if (formData.modelo_id && !filteredModelos.some(m => m.id === formData.modelo_id)) {
      setFormData(prev => ({ ...prev, modelo_id: null }));
    }
  }, [formData.marca_id, filteredModelos, setFormData, formData.modelo_id]);

  // --- Sugerencia de ubicación basada en productos similares ---
  const fetchUbicacionSuggestion = useCallback(async () => {
    // Solo sugerir cuando la ubicación está vacía
    if (formData.ubicacion) {
      setSuggestedUbicacion(null);
      return;
    }

    // Necesitamos al menos tipo O modelos, y una descripción
    const hasType = !!formData.tipo_id;
    const hasModelos = formData.modelos_ids && formData.modelos_ids.length > 0;
    const hasDescription = !!formData.descripcion?.trim();

    if (!hasDescription || (!hasType && !hasModelos)) {
      setSuggestedUbicacion(null);
      return;
    }

    // Extraer palabras significativas de la descripción (>=3 caracteres, no números puros)
    const palabras = formData.descripcion
      .toUpperCase()
      .split(/[\s,.-]+/)
      .filter(w => w.length >= 3 && !/^\d+$/.test(w));

    if (palabras.length === 0) {
      setSuggestedUbicacion(null);
      return;
    }

    setIsFetchingSuggestion(true);
    try {
      // Construir query para buscar productos similares con ubicación definida
      let query = supabase
        .from('productos')
        .select('ubicacion, descripcion')
        .not('ubicacion', 'is', null)
        .neq('ubicacion', '');

      // Filtrar por tipo si disponible
      if (hasType) {
        query = query.eq('tipo_id', formData.tipo_id);
      }

      // Filtrar por modelos si disponibles (overlap = tiene al menos uno en común)
      if (hasModelos) {
        query = query.overlaps('modelos_ids', formData.modelos_ids);
      }

      // Excluir el producto actual si estamos editando
      if (formData.id) {
        query = query.neq('id', formData.id);
      }

      const { data: candidates, error } = await query.limit(50);

      if (error || !candidates || candidates.length === 0) {
        setSuggestedUbicacion(null);
        return;
      }

      // De los candidatos, buscar los que comparten al menos una palabra de la descripción
      const matches = candidates.filter(c => {
        if (!c.descripcion) return false;
        const descCandidate = c.descripcion.toUpperCase();
        return palabras.some(palabra => descCandidate.includes(palabra));
      });

      if (matches.length === 0) {
        setSuggestedUbicacion(null);
        return;
      }

      // Contar frecuencia de ubicaciones
      const ubicacionCount = {};
      matches.forEach(m => {
        const ub = m.ubicacion;
        if (ub) {
          ubicacionCount[ub] = (ubicacionCount[ub] || 0) + 1;
        }
      });

      // Tomar la ubicación más frecuente
      const bestUbicacion = Object.entries(ubicacionCount)
        .sort((a, b) => b[1] - a[1])[0];

      if (bestUbicacion) {
        setSuggestedUbicacion({
          ubicacion: bestUbicacion[0],
          count: bestUbicacion[1]
        });
      } else {
        setSuggestedUbicacion(null);
      }
    } catch (err) {
      console.error('Error buscando sugerencia de ubicación:', err);
      setSuggestedUbicacion(null);
    } finally {
      setIsFetchingSuggestion(false);
    }
  }, [formData.ubicacion, formData.tipo_id, formData.modelos_ids, formData.descripcion, formData.id]);

  // Debounce de la búsqueda de sugerencia para no hacer queries en cada keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUbicacionSuggestion();
    }, 600);
    return () => clearTimeout(timer);
  }, [fetchUbicacionSuggestion]);

  const acceptUbicacionSuggestion = useCallback(() => {
    if (suggestedUbicacion) {
      setFormData(prev => ({ ...prev, ubicacion: suggestedUbicacion.ubicacion }));
      setSuggestedUbicacion(null);
    }
  }, [suggestedUbicacion, setFormData]);

  const calculateAutoStock = useCallback(async () => {
    if (!formData.id || formData.stock_mode !== 'auto') return;

    setIsCalculatingStock(true);
    try {
      const { data, error } = await supabase.rpc('calcular_stock_automatico', {
        producto_uuid: formData.id
      });

      if (error) throw error;

      if (data) {
        setFormData(prev => ({
          ...prev,
          min_stock: data.min_stock,
          max_stock: data.max_stock
        }));

        toast({
          title: "Stock Calculado",
          description: `Ventas 90d: ${data.total_vendido_90d} | Ciclo: ${data.ciclo_compra_dias || 15}d | Mín: ${data.min_stock}, Máx: ${data.max_stock}`,
        });
      }
    } catch (error) {
      console.error("Error calculando stock:", error);
      toast({
        title: "Error de Cálculo",
        description: "No se pudo calcular el stock sugerido. Asegúrese de realizar la migración SQL.",
        variant: "destructive"
      });
      // Fallback a manual si falla
      setFormData(prev => ({ ...prev, stock_mode: 'manual' }));
    } finally {
      setIsCalculatingStock(false);
    }
  }, [formData.id, formData.stock_mode, setFormData, toast]);

  useEffect(() => {
    calculateAutoStock();
  }, [calculateAutoStock]);

  const toggleStockMode = () => {
    const newMode = formData.stock_mode === 'auto' ? 'manual' : 'auto';
    setFormData(prev => ({ ...prev, stock_mode: newMode }));
    if (newMode === 'auto' && !formData.id) {
      toast({
        title: "Nota",
        description: "Guarde el producto primero para calcular en base al historial de ventas.",
      });
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Columna Izquierda: Datos Básicos (8/12) */}
        <div className="md:col-span-8 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {/* Código y Referencia */}
            <div className="md:col-span-1">
              <Label htmlFor="codigo" className="text-[11px] font-bold text-gray-700 uppercase">Código (SKU)</Label>
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <Input
                    id="codigo"
                    value={formData.codigo}
                    onChange={handleInputChange}
                    onBlur={(e) => onCodigoBlur(e.target.value)}
                    onKeyDown={handleCodigoKeyDown}
                    className={`h-7 text-xs ${isEditing ? 'bg-gray-100 pr-8' : 'bg-white'}`}
                    required
                    disabled={isEditing}
                  />
                  {isEditing && (
                    <Lock className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1.5" />
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => setIsSearchModalOpen(true)} title="F3 - Buscar"><Info className="w-4 h-4" /></Button>
              </div>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="referencia" className="text-[11px] font-bold text-gray-700 uppercase">Referencia Interna</Label>
              <Input id="referencia" ref={referenciaRef} value={formData.referencia || ''} onChange={handleInputChange} onKeyDown={(e) => handleEnterToNext(e, descripcionRef)} className="h-7 text-xs bg-white" />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <Label htmlFor="descripcion" className="text-[11px] font-bold text-gray-700 uppercase">Descripción del Producto</Label>
            <Textarea id="descripcion" ref={descripcionRef} value={formData.descripcion} onChange={handleInputChange} onKeyDown={(e) => handleEnterToNext(e, minStockRef)} className="text-sm min-h-[40px] bg-white p-2 border-morla-gold/20" required />
          </div>

          {/* Selectores con estilo de formulario clásico (Labels a la izquierda) */}
          <div className="space-y-1.5 px-1">
            {/* Ubicación / Tramo */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-[11px] font-bold text-gray-600 uppercase text-right col-span-1 pt-2">Ubicación / Tramo</Label>
              <div className="col-span-3 space-y-1">
                <div className="flex items-center gap-1">
                  <SearchableSelect
                    placeholder="Seleccionar ubicación"
                    options={ubicacionOptions}
                    value={formData.ubicacion || ''}
                    onChange={(v) => {
                      handleSelectChange('ubicacion', v);
                      if (v) setSuggestedUbicacion(null);
                    }}
                    className="flex-grow"
                  />
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-2 border" onClick={() => setIsUbicacionModalOpen(true)} title="Gestionar Ubicaciones"><MoreHorizontal className="w-4 h-4" /></Button>
                </div>
                {/* Sugerencia de ubicación basada en productos similares */}
                {!formData.ubicacion && suggestedUbicacion && (
                  <button
                    type="button"
                    onClick={acceptUbicacionSuggestion}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer w-full group"
                    title="Click para aceptar esta sugerencia de ubicación"
                  >
                    <span className="text-emerald-600 text-[10px] font-bold uppercase shrink-0">💡 Sugerencia:</span>
                    <span className="text-emerald-700 text-xs font-bold group-hover:underline">{suggestedUbicacion.ubicacion}</span>
                    <span className="text-emerald-500 text-[10px] ml-auto">({suggestedUbicacion.count} producto{suggestedUbicacion.count > 1 ? 's' : ''} similar{suggestedUbicacion.count > 1 ? 'es' : ''})</span>
                  </button>
                )}
                {!formData.ubicacion && isFetchingSuggestion && (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                    <span className="text-[10px] text-gray-400">Buscando ubicación de productos similares...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tipo */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-[11px] font-bold text-gray-600 uppercase text-right col-span-1">Tipo</Label>
              <div className="col-span-3 flex items-center gap-1">
                <SearchableSelect
                  placeholder="Seleccionar tipo"
                  options={tipoOptions}
                  value={formData.tipo_id ?? ''}
                  onChange={(v) => handleSelectChange('tipo_id', v)}
                  className="flex-grow"
                />
                <Button type="button" variant="ghost" size="sm" className="h-9 px-2 border" onClick={() => setIsTipoModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Marca */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-[11px] font-bold text-gray-600 uppercase text-right col-span-1">Marca</Label>
              <div className="col-span-3 flex items-center gap-1">
                <SearchableSelect
                  placeholder="Seleccionar marca"
                  options={marcaOptions}
                  value={formData.marca_id ?? ''}
                  onChange={(v) => handleSelectChange('marca_id', v)}
                  className="flex-grow"
                />
                <Button type="button" variant="ghost" size="sm" className="h-9 px-2 border" onClick={() => setIsMarcaModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Modelo */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-[11px] font-bold text-gray-600 uppercase text-right col-span-1">Modelo</Label>
              <div className="col-span-3 flex items-center gap-1">
                <MultiSearchableSelect
                  placeholder="Seleccionar modelos"
                  options={modeloOptions}
                  value={formData.modelos_ids || []}
                  onChange={(v) => handleMultiSelectChange('modelos_ids', v)}
                  className="flex-grow"
                />
                <Button type="button" variant="ghost" size="sm" className="h-9 px-2 border" onClick={() => setIsModeloModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Suplidor */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-[11px] font-bold text-gray-600 uppercase text-right col-span-1">Suplidor</Label>
              <div className="col-span-3 flex items-center gap-1">
                <SearchableSelect
                  placeholder="Seleccionar proveedor"
                  options={proveedorOptions}
                  value={formData.suplidor_id ?? ''}
                  onChange={(v) => handleSelectChange('suplidor_id', v)}
                  className="flex-grow"
                />
                <Button type="button" variant="ghost" size="sm" className="h-9 px-2 border" onClick={() => setIsProveedorModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Garantía */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-[11px] font-bold text-gray-600 uppercase text-right col-span-1">Garantía (Meses)</Label>
              <div className="col-span-1">
                <Input id="garantia_meses" type="number" value={formData.garantia_meses} onChange={handleIntChange} className="h-7 text-sm bg-white border-gray-300" min="0" />
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Panel de Control (4/12) */}
        <div className="md:col-span-4 border-l pl-4 space-y-2">
          {/* Existencia y Estado */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center justify-center bg-gray-100 px-3 py-1 rounded-md border border-gray-200 flex-1">
              <Label className="text-[9px] font-bold text-gray-500 uppercase">Existencia actual</Label>
              <Input
                id="existencia"
                type="number"
                value={formData.existencia !== undefined ? formData.existencia : ''}
                onChange={handleNumberChange}
                className="h-8 text-lg font-bold text-blue-900 border-gray-300 text-center bg-white"
                placeholder="0.00"
              />
            </div>
            <div className="flex items-center space-x-1 bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">
              <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, activo: checked }))} />
              <Label htmlFor="activo" className="text-[10px] font-bold uppercase text-gray-800 cursor-pointer">Activo</Label>
            </div>
          </div>

          {/* Cuadro de Imagen Estilo Clásico */}
          <div className="space-y-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div
              className={`w-full h-24 bg-white rounded border border-gray-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] flex items-center justify-center relative overflow-hidden group ${!formData.imagen_url && !isUploadingImage ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors' : ''}`}
              onClick={() => { if (!formData.imagen_url && !isUploadingImage) fileInputRef.current?.click(); }}
            >
              {isUploadingImage ? (
                <div className="flex flex-col items-center gap-2 text-blue-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-[10px] uppercase font-bold">Subiendo...</span>
                </div>
              ) : formData.imagen_url ? (
                <img src={formData.imagen_url} alt="Producto" className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-300 p-4">
                  <div className="w-16 h-16 border-2 border-dashed border-gray-200 rounded flex items-center justify-center bg-gray-50">
                    <Upload className="w-8 h-8 opacity-30" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-tight">Cargar Imagen</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px] font-bold uppercase bg-white hover:bg-gray-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
              >
                {formData.imagen_url ? 'Cambiar Foto' : 'Cargar Foto'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px] font-bold uppercase bg-white hover:bg-gray-50 transition-colors text-red-600"
                onClick={handleImageRemove}
                disabled={!formData.imagen_url || isUploadingImage}
              >
                Quitar Foto
              </Button>
            </div>
          </div>

          {/* Stock Mínimo/Máximo */}
          <div className="pt-2 border-t">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-gray-600 uppercase flex items-center gap-1">
                  Mínima
                  {formData.stock_mode === 'auto' && <Zap className="w-3 h-3 text-purple-600" />}
                </Label>
                <Input
                  id="min_stock"
                  ref={minStockRef}
                  type="number"
                  value={formData.min_stock}
                  onChange={handleNumberChange}
                  onKeyDown={(e) => handleEnterToNext(e, maxStockRef)}
                  disabled={formData.stock_mode === 'auto'}
                  className={`h-7 text-xs text-center border-gray-300 ${formData.stock_mode === 'auto' ? 'bg-purple-50 text-purple-900 font-bold' : 'bg-white'}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-gray-600 uppercase flex items-center gap-1">
                  Máxima
                  {formData.stock_mode === 'auto' && <Zap className="w-3 h-3 text-purple-600" />}
                </Label>
                <Input
                  id="max_stock"
                  ref={maxStockRef}
                  type="number"
                  value={formData.max_stock}
                  onChange={handleNumberChange}
                  disabled={formData.stock_mode === 'auto'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Find the first costo input in presentations
                      const costoInputs = document.querySelectorAll('[id^="costo-"]');
                      if (costoInputs.length > 0) {
                        costoInputs[0].focus();
                        costoInputs[0].select();
                      }
                    }
                  }}
                  className={`h-7 text-xs text-center border-gray-300 ${formData.stock_mode === 'auto' ? 'bg-purple-50 text-purple-900 font-bold' : 'bg-white'}`}
                />
              </div>
            </div>
            {/* Toggle Automático/Manual */}
            <div className="mt-1 flex items-center justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleStockMode}
                disabled={isCalculatingStock}
                className={`w-full h-8 text-[10px] font-bold uppercase transition-colors shadow-sm ${formData.stock_mode === 'auto'
                  ? 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-300'
                  }`}
              >
                {isCalculatingStock ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : formData.stock_mode === 'auto' ? (
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                ) : (
                  <Settings className="w-3.5 h-3.5 mr-1.5" />
                )}
                {formData.stock_mode === 'auto' ? 'Auto Mín/Máx' : 'Manual Mín/Máx'}
              </Button>
            </div>
          </div>

          {/* Impuestos */}
          <div className="pt-1">
            <Label className="text-[11px] font-bold text-gray-600 uppercase mb-1 block">IE - % ITBIS</Label>
            <Select value={formData.itbis_pct.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, itbis_pct: parseFloat(value) }))}>
              <SelectTrigger className="h-8 text-xs bg-white border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0" className="text-xs">0% EXENTO</SelectItem>
                <SelectItem value="0.16" className="text-xs">16% REDUCIDO</SelectItem>
                <SelectItem value="0.18" className="text-xs">18% GENERAL</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <CatalogManagementModal
        isOpen={isTipoModalOpen}
        onClose={closeModal(setIsTipoModalOpen)}
        config={catalogConfig.tipos}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isMarcaModalOpen}
        onClose={closeModal(setIsMarcaModalOpen)}
        config={catalogConfig.marcas}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isModeloModalOpen}
        onClose={closeModal(setIsModeloModalOpen)}
        config={catalogConfig.modelos}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isProveedorModalOpen}
        onClose={closeModal(setIsProveedorModalOpen)}
        config={catalogConfig.proveedores}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isUbicacionModalOpen}
        onClose={closeModal(setIsUbicacionModalOpen)}
        config={catalogConfig.ubicaciones}
        onSaveSuccess={handleSaveSuccess}
      />
      <ProductSearchModal
        isOpen={isSearchModalOpen}
        onClose={closeModal(setIsSearchModalOpen)}
        onSelectProduct={handleProductSelection}
      />
    </>
  );
};

export default ProductBasicInfo;