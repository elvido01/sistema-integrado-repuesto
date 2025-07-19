import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ProductTableFooter = ({ pagination, setPagination }) => {
  if (!pagination || pagination.total === 0) {
    return null;
  }

  const { page, limit, total } = pagination;
  const totalPages = Math.ceil(total / limit);

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

        <span className="mx-4 text-sm">Página {page} de {totalPages}</span>
        
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