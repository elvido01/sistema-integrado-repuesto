import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const ProductTableFooter = ({ pagination, setPagination }) => {
  if (!pagination || pagination.total === 0) {
    return null;
  }

  const { page, limit, total } = pagination;
  const totalPages = Math.ceil(total / limit);

  const [inputPage, setInputPage] = useState(page ? page.toString() : '1');

  useEffect(() => {
    if (page) {
      setInputPage(page.toString());
    }
  }, [page]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between p-4 border-t">
      <div className="text-sm text-muted-foreground">
        Mostrando {from}-{to} de {total} resultados
      </div>
      <div className="flex items-center space-x-2">
        <span className="text-sm mr-2">Filas por página:</span>
        <Select
          value={limit.toString()}
          onValueChange={(value) => setPagination(prev => ({ ...prev, limit: Number(value), page: 1 }))}
        >
          <SelectTrigger className="w-[70px] h-8">
            <SelectValue placeholder={limit} />
          </SelectTrigger>
          <SelectContent>
            {[15, 30, 50, 100].map(val => (
              <SelectItem key={val} value={String(val)}>{val}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center space-x-2 mx-4 text-sm">
          <span>Página</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={inputPage}
            onChange={(e) => setInputPage(e.target.value)}
            onBlur={() => {
              let val = parseInt(inputPage);
              if (isNaN(val) || val < 1) val = 1;
              if (val > totalPages) val = totalPages;
              handlePageChange(val);
              setInputPage(val.toString());
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="w-16 h-8 text-center px-1 hide-spinner"
          />
          <span>de {totalPages}</span>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
};

export default ProductTableFooter;