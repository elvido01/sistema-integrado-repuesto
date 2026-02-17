// ProductFilters.jsx — limpio
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, Download, Upload } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useCatalogData } from '@/hooks/useSupabase';
import SearchableSelect from '@/components/common/SearchableSelect.jsx';

const ProductFilters = ({
  searchTerm,
  setSearchTerm,
  filters,
  setFilters,
  limit,
  setLimit,
  onExport,
  onFileUpload,
  onUpdateLocation, // (no se usa aquí; ok si lo necesitas después)
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleImportClick = () => fileInputRef.current?.click();

  const marcaOptions = useMemo(() => {
    const map = new Map((marcas ?? []).filter(Boolean).map(m => [m.id, { value: m.id, label: m.nombre ?? String(m.id) }]));
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [marcas]);
  const tipoOptions = useMemo(() => {
    const map = new Map((tipos ?? []).filter(Boolean).map(t => [t.id, { value: t.id, label: t.nombre ?? String(t.id) }]));
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [tipos]);
  const modeloOptions = useMemo(() => {
    const map = new Map((modelos ?? []).filter(Boolean).map(m => [m.id, { value: m.id, label: m.nombre ?? String(m.id) }]));
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [modelos]);

  return (
    <div className="p-4 border-b space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar por código, referencia, descripción o ubicación... (F3)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={limit === 5000 ? 'all' : String(limit)}
            onValueChange={(val) => setLimit(val === 'all' ? 5000 : Number(val))}
          >
            <SelectTrigger className="w-[180px] h-10 border-morla-blue font-semibold text-morla-blue">
              <SelectValue placeholder="Registros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 Registros</SelectItem>
              <SelectItem value="100">100 Registros</SelectItem>
              <SelectItem value="500">500 Registros</SelectItem>
              <SelectItem value="1000">1,000 Registros</SelectItem>
              <SelectItem value="all">Todos los Registros</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={onExport}>
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
          <Button variant="outline" onClick={handleImportClick}>
            <Upload className="w-4 h-4 mr-2" /> Importar
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={(e) => onFileUpload?.(e)}
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
            onChange={(v) => setFilters((prev) => ({ ...prev, marca_id: v ?? '' }))}
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
            onChange={(v) => setFilters((prev) => ({ ...prev, tipo_id: v ?? '' }))}
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
            onChange={(v) => setFilters((prev) => ({ ...prev, modelo_id: v ?? '' }))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default ProductFilters;

