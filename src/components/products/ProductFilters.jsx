// ProductFilters.jsx — filtros tipo input texto (ILIKE en BD), igual que ProductSearchModal.
import React, { useRef, useEffect, useCallback } from 'react';
import { Search, Download, Upload, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ProductFilters = ({
  searchTerm,
  setSearchTerm,
  filters,
  setFilters,
  limit,
  setLimit,
  onExport,
  onFileUpload,
}) => {
  const searchInputRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Helper para mostrar el botón "X" que limpia el input
  const FilterInput = ({ placeholder, value, onChange }) => (
    <div className="relative flex-1">
      <Input
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="pr-7"
      />
      {value && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={`Limpiar ${placeholder}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

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

      {/* Filtros tipo input (texto libre, ILIKE en BD). Orden: Modelo, Marca, Tipo. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterInput
          placeholder="Modelo"
          value={filters.modelo}
          onChange={(v) => setFilters((prev) => ({ ...prev, modelo: v }))}
        />
        <FilterInput
          placeholder="Marca"
          value={filters.marca}
          onChange={(v) => setFilters((prev) => ({ ...prev, marca: v }))}
        />
        <FilterInput
          placeholder="Tipo"
          value={filters.tipo}
          onChange={(v) => setFilters((prev) => ({ ...prev, tipo: v }))}
        />
      </div>
    </div>
  );
};

export default ProductFilters;

