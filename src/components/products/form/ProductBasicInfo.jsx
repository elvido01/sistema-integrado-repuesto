import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import CatalogManagementModal from '@/components/products/form/CatalogManagementModal';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCatalogData } from '@/hooks/useSupabase';

const ProductBasicInfo = ({ formData, setFormData, onCodigoBlur, onProductSelect, isEditing, handleNotImplemented }) => {
  const { tipos, marcas, modelos, proveedores, almacenes, fetchCatalogs } = useCatalogData();
  const [isTipoModalOpen, setIsTipoModalOpen] = useState(false);
  const [isMarcaModalOpen, setIsMarcaModalOpen] = useState(false);
  const [isModeloModalOpen, setIsModeloModalOpen] = useState(false);
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false);
  const [isUbicacionModalOpen, setIsUbicacionModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };
  
  const handleSelectChange = (id, value) => {
    const isNull = value === 'NULL_VALUE' || value === '';
    setFormData(prev => {
        const newState = { ...prev, [id]: isNull ? null : value };
        if (id === 'marca_id') {
            newState.modelo_id = null;
        }
        return newState;
    });
  };

  const handleNumberChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({...prev, [id]: parseFloat(value) || 0 }));
  };
  
  const handleIntChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({...prev, [id]: parseInt(value) || 0 }));
  }

  
  const handleSaveSuccess = () => {
    fetchCatalogs();
  }

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

  const catalogConfig = {
    tipos: { title: 'Tipos de Producto', table: 'tipos_producto', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    marcas: { title: 'Marcas', table: 'marcas', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    modelos: { 
      title: 'Modelos', 
      table: 'modelos', 
      columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }],
      extraData: { marca_id: formData.marca_id }
    },
    proveedores: { title: 'Suplidores', table: 'proveedores', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    ubicaciones: { title: 'Ubicaciones', table: 'almacenes', columns: [{ accessor: 'codigo', header: 'Código', type: 'text' }, { accessor: 'nombre', header: 'Nombre', type: 'text' }] },
  };

  const filteredModelos = useMemo(() => {
    if (!formData.marca_id || !modelos) return [];
    return modelos.filter(m => m.marca_id === formData.marca_id);
  }, [formData.marca_id, modelos]);
  
  useEffect(() => {
    if (formData.modelo_id && !filteredModelos.some(m => m.id === formData.modelo_id)) {
      setFormData(prev => ({...prev, modelo_id: null}));
    }
  }, [formData.marca_id, filteredModelos, setFormData, formData.modelo_id]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="codigo" className="text-xs font-semibold">Código (SKU) * <span className="text-morla-blue font-bold">[F3]</span></Label>
            <Input 
              id="codigo" 
              value={formData.codigo} 
              onChange={handleInputChange} 
              onBlur={(e) => onCodigoBlur(e.target.value)}
              onKeyDown={handleCodigoKeyDown}
              className="h-7 text-sm" 
              required 
              disabled={isEditing}
            />
          </div>
          <div>
            <Label htmlFor="referencia" className="text-xs font-semibold">Referencia Interna</Label>
            <Input id="referencia" value={formData.referencia || ''} onChange={handleInputChange} className="h-7 text-sm" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="descripcion" className="text-xs font-semibold">Descripción *</Label>
            <Textarea id="descripcion" value={formData.descripcion} onChange={handleInputChange} className="text-sm min-h-[60px]" required />
          </div>
          
          <div className="col-span-2 grid grid-cols-2 gap-3">
             <div>
              <Label className="text-xs font-semibold">Tipo</Label>
              <div className="flex items-center gap-1">
                <Select value={formData.tipo_id || 'NULL_VALUE'} onValueChange={(value) => handleSelectChange('tipo_id', value)}>
                  <SelectTrigger className="h-7 text-sm">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-48">
                      <SelectItem value="NULL_VALUE">Sin tipo</SelectItem>
                      {tipos.filter(t => t.activo).map(tipo => <SelectItem key={tipo.id} value={String(tipo.id)}>{tipo.nombre}</SelectItem>)}
                    </ScrollArea>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsTipoModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Marca</Label>
              <div className="flex items-center gap-1">
                <Select value={formData.marca_id || 'NULL_VALUE'} onValueChange={(value) => handleSelectChange('marca_id', value)}>
                  <SelectTrigger className="h-7 text-sm">
                    <SelectValue placeholder="Seleccionar marca" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-48">
                      <SelectItem value="NULL_VALUE">Sin marca</SelectItem>
                      {marcas.filter(m => m.activo).map(marca => <SelectItem key={marca.id} value={String(marca.id)}>{marca.nombre}</SelectItem>)}
                    </ScrollArea>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsMarcaModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Modelo</Label>
              <div className="flex items-center gap-1">
                <Select value={formData.modelo_id || 'NULL_VALUE'} onValueChange={(value) => handleSelectChange('modelo_id', value)} disabled={!formData.marca_id}>
                  <SelectTrigger className="h-7 text-sm">
                    <SelectValue placeholder="Seleccionar modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-48">
                      <SelectItem value="NULL_VALUE">Sin modelo</SelectItem>
                      {filteredModelos.filter(m => m.activo).map(modelo => <SelectItem key={modelo.id} value={String(modelo.id)}>{modelo.nombre}</SelectItem>)}
                    </ScrollArea>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsModeloModalOpen(true)} disabled={!formData.marca_id}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Suplidor</Label>
              <div className="flex items-center gap-1">
                <Select value={formData.suplidor_id || 'NULL_VALUE'} onValueChange={(value) => handleSelectChange('suplidor_id', value)}>
                  <SelectTrigger className="h-7 text-sm">
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-48">
                      <SelectItem value="NULL_VALUE">Sin proveedor</SelectItem>
                      {proveedores.filter(p => p.activo).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
                    </ScrollArea>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsProveedorModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <Label htmlFor="ubicacion" className="text-xs font-semibold">Ubicación</Label>
              <div className="flex items-center gap-1">
                <Select value={formData.ubicacion || 'NULL_VALUE'} onValueChange={(value) => handleSelectChange('ubicacion', value)}>
                  <SelectTrigger className="h-7 text-sm">
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-48">
                      <SelectItem value="NULL_VALUE">Sin ubicación</SelectItem>
                      {almacenes.filter(a => a.activo).map(a => <SelectItem key={a.id} value={String(a.nombre)}>{a.nombre}</SelectItem>)}
                    </ScrollArea>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsUbicacionModalOpen(true)}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Garantía (meses)</Label>
              <Input id="garantia_meses" type="number" value={formData.garantia_meses} onChange={handleIntChange} className="h-7 text-sm" min="0" />
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Existencia</Label>
            <span className="font-bold text-lg">0</span>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, activo: checked }))} />
            <Label htmlFor="activo" className="text-xs font-semibold">Activo</Label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Imagen</Label>
            <div className="w-full h-24 bg-gray-100 rounded flex items-center justify-center">
              <span className="text-gray-400 text-sm">Sin imagen</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => handleNotImplemented('Cambiar Foto')}>Cambiar Foto</Button>
              <Button type="button" variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => handleNotImplemented('Quitar Foto')}>Quitar Foto</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-semibold">Mínima</Label>
              <Input id="min_stock" type="number" value={formData.min_stock} onChange={handleNumberChange} className="h-7 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Máxima</Label>
              <Input id="max_stock" type="number" value={formData.max_stock} onChange={handleNumberChange} className="h-7 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">IE - % ITBIS</Label>
            <Select value={formData.itbis_pct.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, itbis_pct: parseFloat(value) }))}>
              <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0%</SelectItem>
                <SelectItem value="0.16">16%</SelectItem>
                <SelectItem value="0.18">18%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="border rounded-lg p-3 mt-3">
        <Label className="text-xs font-semibold mb-2 block">Tipo de Mercancía</Label>
        <RadioGroup defaultValue="normal" className="flex space-x-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="normal" id="tipo-normal" />
            <Label htmlFor="tipo-normal" className="text-sm font-normal">Normal</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="servicio" id="tipo-servicio" />
            <Label htmlFor="tipo-servicio" className="text-sm font-normal">Servicio</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no-serie" id="tipo-no-serie" />
            <Label htmlFor="tipo-no-serie" className="text-sm font-normal">Usa No. de Serie</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="vencimiento" id="tipo-vencimiento" />
            <Label htmlFor="tipo-vencimiento" className="text-sm font-normal">Usa Fecha de Vencimiento</Label>
          </div>
        </RadioGroup>
      </div>
      <CatalogManagementModal
        isOpen={isTipoModalOpen}
        onClose={() => setIsTipoModalOpen(false)}
        config={catalogConfig.tipos}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isMarcaModalOpen}
        onClose={() => setIsMarcaModalOpen(false)}
        config={catalogConfig.marcas}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isModeloModalOpen}
        onClose={() => setIsModeloModalOpen(false)}
        config={catalogConfig.modelos}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isProveedorModalOpen}
        onClose={() => setIsProveedorModalOpen(false)}
        config={catalogConfig.proveedores}
        onSaveSuccess={handleSaveSuccess}
      />
      <CatalogManagementModal
        isOpen={isUbicacionModalOpen}
        onClose={() => setIsUbicacionModalOpen(false)}
        config={catalogConfig.ubicaciones}
        onSaveSuccess={handleSaveSuccess}
      />
      <ProductSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectProduct={handleProductSelection}
      />
    </>
  );
};

export default ProductBasicInfo;