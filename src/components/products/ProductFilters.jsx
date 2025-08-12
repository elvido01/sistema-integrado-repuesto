import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, Download, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useCatalogData } from '@/hooks/useSupabase';
import SearchableSelect from "@/components/common/SearchableSelect";

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

  // Opciones para los combobox (solo elementos activos)
  const marcaOptions = useMemo(() => (
    (marcas || [])
      .filter(m => m.activo)
      .map(m => ({ value: String(m.id), label: m.nombre }))
  ), [marcas]);

  const tipoOptions = useMemo(() => (
    (tipos || [])
      .filter(t => t.activo)
      .map(t => ({ value: String(t.id), label: t.nombre }))
  ), [tipos]);

  const modeloOptions = useMemo(() => (
    (modelos || [])
      .filter(m => m.activo)
      .map(m => ({ value: String(m.id), label: m.nombre }))
  ), [modelos]);

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
        {/* Marca */}
        <div className="flex items-center gap-2">
          <Label htmlFor="marca-filter" className="whitespace-nowrap">Marca</Label>
          <SearchableSelect
            label="Marca"
            placeholder="Todas las marcas"
            options={marcaOptions}
            value={filters.marca_id ?? ''}
            onChange={(v) => setFilters(prev => ({ ...prev, marca_id: v ?? '' }))}
            className="w-full"
          />
        </div>

        {/* Tipo */}
        <div className="flex items-center gap-2">
          <Label htmlFor="tipo-filter" className="whitespace-nowrap">Tipo</Label>
          <SearchableSelect
            label="Tipo"
            placeholder="Todos los tipos"
            options={tipoOptions}
            value={filters.tipo_id ?? ''}
            onChange={(v) => setFilters(prev => ({ ...prev, tipo_id: v ?? '' }))}
            className="w-full"
          />
        </div>

        {/* Modelo */}
        <div className="flex items-center gap-2">
          <Label htmlFor="modelo-filter" className="whitespace-nowrap">Modelo</Label>
          <SearchableSelect
            label="Modelo"
            placeholder="Todos los modelos"
            options={modeloOptions}
            value={filters.modelo_id ?? ''}
            onChange={(v) => setFilters(prev => ({ ...prev, modelo_id: v ?? '' }))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default ProductFilters;
