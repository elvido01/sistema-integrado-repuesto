import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Lock, Info } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import CatalogManagementModal from '@/components/products/form/CatalogManagementModal';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import SearchableSelect from '@/components/common/SearchableSelect';
import { ScrollArea } from '@/components/ui/scroll-area';

const NULL_VALUE = 'null_value';

const ProductBasicInfo = ({ formData, setFormData, onCodigoBlur, onProductSelect, isEditing, handleNotImplemented, tipos, marcas, modelos, proveedores, almacenes, fetchCatalogs }) => {
  const [isTipoModalOpen, setIsTipoModalOpen] = useState(false);
  const [isMarcaModalOpen, setIsMarcaModalOpen] = useState(false);
  const [isModeloModalOpen, setIsModeloModalOpen] = useState(false);
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false);
  const [isUbicacionModalOpen, setIsUbicacionModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

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
    const parsedValue = (value === NULL_VALUE || value === '') ? null : value; // Corrected: Removed Number() conversion
    setFormData(prev => {
      const newState = { ...prev, [id]: parsedValue };
      if (id === 'marca_id') {
        newState.modelo_id = null; // Reset modelo when marca changes
      }
      return newState;
    });
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
  }, []);

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
    return modelos.filter(m => m.marca_id === formData.marca_id);
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

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Columna Izquierda: Datos Básicos (8/12) */}
        <div className="md:col-span-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              <Input id="referencia" value={formData.referencia || ''} onChange={handleInputChange} className="h-7 text-xs bg-white" />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <Label htmlFor="descripcion" className="text-[11px] font-bold text-gray-700 uppercase">Descripción del Producto</Label>
            <Textarea id="descripcion" value={formData.descripcion} onChange={handleInputChange} className="text-sm min-h-[60px] bg-white p-2 border-morla-gold/20" required />
          </div>

          {/* Selectores con estilo de formulario clásico (Labels a la izquierda) */}
          <div className="space-y-3 px-1">
            {/* Ubicación / Tramo */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-[11px] font-bold text-gray-600 uppercase text-right col-span-1">Ubicación / Tramo</Label>
              <div className="col-span-3 flex items-center gap-1">
                <SearchableSelect
                  placeholder="Seleccionar ubicación"
                  options={ubicacionOptions}
                  value={formData.ubicacion || ''}
                  onChange={(v) => handleSelectChange('ubicacion', v)}
                  className="flex-grow"
                />
                <Button type="button" variant="ghost" size="sm" className="h-9 px-2 border" onClick={() => setIsUbicacionModalOpen(true)} title="Gestionar Ubicaciones"><MoreHorizontal className="w-4 h-4" /></Button>
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
                <SearchableSelect
                  placeholder="Seleccionar modelo"
                  options={modeloOptions}
                  value={formData.modelo_id ?? ''}
                  onChange={(v) => handleSelectChange('modelo_id', v)}
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
        <div className="md:col-span-4 border-l pl-6 space-y-4">
          {/* Existencia y Estado */}
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center bg-gray-100 p-2 rounded-md border border-gray-200">
              <Label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Existencia</Label>
              <span className="font-bold text-2xl text-blue-900 leading-none">0.00</span>
            </div>
            <div className="flex items-center justify-center space-x-2 bg-white p-1 rounded border border-gray-200 shadow-sm">
              <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, activo: checked }))} />
              <Label htmlFor="activo" className="text-xs font-bold uppercase text-gray-800 cursor-pointer">Activo</Label>
            </div>
          </div>

          {/* Cuadro de Imagen Estilo Clásico */}
          <div className="space-y-2">
            <div className="w-full h-40 bg-white rounded border border-gray-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] flex items-center justify-center relative overflow-hidden group">
              {formData.imagen_url ? (
                <img src={formData.imagen_url} alt="Producto" className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-300 p-4">
                  <div className="w-16 h-16 border-2 border-dashed border-gray-200 rounded flex items-center justify-center bg-gray-50">
                    <Info className="w-8 h-8 opacity-20" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-tight">Cargar Imagen</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] font-bold uppercase bg-white hover:bg-gray-50 transition-colors" onClick={() => handleNotImplemented('Cambiar Foto')}>Cambiar Foto</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] font-bold uppercase bg-white hover:bg-gray-50 transition-colors text-red-600" onClick={() => handleNotImplemented('Quitar Foto')}>Quitar Foto</Button>
            </div>
          </div>

          {/* Stock Mínimo/Máximo */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-gray-600 uppercase">Mínima</Label>
              <Input id="min_stock" type="number" value={formData.min_stock} onChange={handleNumberChange} className="h-7 text-xs bg-white text-center border-gray-300" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-gray-600 uppercase">Máxima</Label>
              <Input id="max_stock" type="number" value={formData.max_stock} onChange={handleNumberChange} className="h-7 text-xs bg-white text-center border-gray-300" />
            </div>
          </div>

          {/* Impuestos */}
          <div className="pt-2">
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