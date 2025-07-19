import React, { useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';

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
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Label htmlFor="marca-filter" className="whitespace-nowrap">Marca</Label>
          <Input
            id="marca-filter"
            placeholder="Filtrar por marca..."
            value={filters.marca_id || ''}
            onChange={(e) => setFilters(prev => ({...prev, marca_id: e.target.value}))}
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Label htmlFor="tipo-filter" className="whitespace-nowrap">Tipo</Label>
          <Input
            id="tipo-filter"
            placeholder="Filtrar por tipo..."
            value={filters.tipo_id || ''}
            onChange={(e) => setFilters(prev => ({...prev, tipo_id: e.target.value}))}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductFilters;