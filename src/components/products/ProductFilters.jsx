import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCatalogData } from '@/hooks/useSupabase';

const NULL_VALUE = 'null_value';

const ProductFilters = ({
  searchTerm,
  setSearchTerm,
  filters,
  setFilters,
  onExport,
  onFileUpload,
  onUpdateLocation
}) => {
  const searchInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const { marcas, tipos, modelos } = useCatalogData();

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilterChange = useCallback((filterName, value) => {
    console.log(`Changing filter ${filterName} to: ${value}`);
    setFilters(prev => ({
      ...prev,
      [filterName]: value === NULL_VALUE ? null : Number(value)
    }));
  }, [setFilters]);

  const marcaOptions = useMemo(() => {
    return (marcas || []).filter(m => m.activo).map(marca => (
      <SelectItem key={marca.id} value={String(marca.id)}>{marca.nombre}</SelectItem>
    ));
  }, [marcas]);

  const tipoOptions = useMemo(() => {
    return (tipos || []).filter(t => t.activo).map(tipo => (
      <SelectItem key={tipo.id} value={String(tipo.id)}>{tipo.nombre}</SelectItem>
    ));
  }, [tipos]);

  const modeloOptions = useMemo(() => {
    return (modelos || []).filter(m => m.activo).map(modelo => (
      <SelectItem key={modelo.id} value={String(modelo.id)}>{modelo.nombre}</SelectItem>
    ));
  }, [modelos]);

  return (
    <div className="p-4 border-b space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar por código, referencia, descripción o ubicación... (F3)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={onExport}>
              <Download className="w-4 h-4 mr-2" /> Exportar
            </Button>
            <Button variant="outline" onClick={handleImportClick}>
              <Upload className="w-4 h-4 mr-2" /> Importar Existencias
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".csv"
              onChange={onFileUpload}
            />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="marca-filter" className="whitespace-nowrap">Marca</Label>
          <Select
            value={filters.marca_id === null ? NULL_VALUE : String(filters.marca_id)}
            onValueChange={(value) => handleFilterChange('marca_id', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas las marcas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_VALUE}>Todas las marcas</SelectItem>
              {marcaOptions}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="tipo-filter" className="whitespace-nowrap">Tipo</Label>
          <Select
            value={filters.tipo_id === null ? NULL_VALUE : String(filters.tipo_id)}
            onValueChange={(value) => handleFilterChange('tipo_id', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_VALUE}>Todos los tipos</SelectItem>
              {tipoOptions}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="modelo-filter" className="whitespace-nowrap">Modelo</Label>
          <Select
            value={filters.modelo_id === null ? NULL_VALUE : String(filters.modelo_id)}
            onValueChange={(value) => handleFilterChange('modelo_id', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los modelos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_VALUE}>Todos los modelos</SelectItem>
              {modeloOptions}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default ProductFilters;