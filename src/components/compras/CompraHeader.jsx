import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const CompraHeader = ({ compra, setCompra, proveedores, almacenes, onOpenSuplidorSearch }) => {
  const selectedProveedor = proveedores.find(p => p.id === compra.suplidor_id);

  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 border rounded-b-lg bg-gray-50/50">
      {/* Box: Detalles de la Compra */}
      <div className="border rounded shadow-sm bg-white overflow-hidden">
        <div className="bg-gray-200 px-3 py-1 border-b">
          <h2 className="text-xs font-bold text-gray-700 uppercase">Detalles de la Compra</h2>
        </div>
        <div className="p-3 space-y-2">
          {/* Row 1: Numero and Fecha */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="numero" className="text-[11px] font-bold w-16 shrink-0">NUMERO</Label>
              <Input
                id="numero"
                value={compra.numero}
                className="h-7 text-xs bg-gray-50 font-mono"
                onChange={e => setCompra({ ...compra, numero: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="fecha" className="text-[11px] font-bold w-12 shrink-0">FECHA</Label>
              <Input
                type="date"
                id="fecha"
                value={compra.fecha ? format(compra.fecha, 'yyyy-MM-dd') : ''}
                className="h-7 text-xs"
                onChange={e => setCompra({ ...compra, fecha: e.target.value ? new Date(e.target.value) : null })}
              />
            </div>
          </div>

          {/* Row 2: NCF and Referencia */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="ncf" className="text-[11px] font-bold w-16 shrink-0">NCF</Label>
              <Input
                id="ncf"
                value={compra.ncf}
                className="h-7 text-xs"
                onChange={e => setCompra({ ...compra, ncf: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="referencia" className="text-[11px] font-bold w-12 shrink-0">Referencia</Label>
              <Input
                id="referencia"
                value={compra.referencia}
                className="h-7 text-xs"
                onChange={e => setCompra({ ...compra, referencia: e.target.value })}
              />
            </div>
          </div>

          {/* Row 3: Tipo and Sub-Tipo */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Label className="text-[11px] font-bold w-16 shrink-0 leading-tight">Tipo de Bienes o Servicios</Label>
              <Select value={compra.tipo_bienes_servicios} onValueChange={v => setCompra({ ...compra, tipo_bienes_servicios: v })}>
                <SelectTrigger className="h-7 text-[11px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="09">09 - Compras y Gastos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Label className="text-[11px] font-bold w-12 shrink-0">Sub-Tipo</Label>
              <Select value={compra.sub_tipo} onValueChange={v => setCompra({ ...compra, sub_tipo: v })}>
                <SelectTrigger className="h-7 text-[11px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Compra de Merc">Compra de Merc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Box: Datos de Suplidor + Almacen */}
      <div className="space-y-4">
        <div className="border rounded shadow-sm bg-white overflow-hidden">
          <div className="bg-gray-200 px-3 py-1 border-b">
            <h2 className="text-xs font-bold text-gray-700 uppercase">Datos de Suplidor</h2>
          </div>
          <div className="p-3 space-y-2">
            {/* Suplidor selection with RNC */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-[11px] font-bold w-16 shrink-0">Suplidor</Label>
                <div className="flex gap-1 flex-1">
                  <Input
                    value={compra.suplidor_id || ""}
                    className="h-7 text-xs bg-white text-center font-bold"
                    placeholder="F3 Búscar"
                    onKeyDown={(e) => e.key === 'F3' && onOpenSuplidorSearch()}
                    readOnly
                    onClick={onOpenSuplidorSearch}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-8 shrink-0"
                    onClick={onOpenSuplidorSearch}
                    type="button"
                  >
                    <Search className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-[11px] font-bold w-12 shrink-0">RNC</Label>
                <Input value={selectedProveedor?.rnc || ''} className="h-7 text-xs bg-gray-50" readOnly />
              </div>
            </div>

            {/* Nombre */}
            <div className="flex items-center gap-2">
              <Label className="text-[11px] font-bold w-16 shrink-0">Nombre</Label>
              <Input value={selectedProveedor?.nombre || ''} className="h-7 text-xs bg-gray-50" readOnly />
            </div>

            {/* Dirección */}
            <div className="flex items-center gap-2">
              <Label className="text-[11px] font-bold w-16 shrink-0">Direccion</Label>
              <Input value={selectedProveedor?.direccion || ''} className="h-7 text-xs bg-gray-50" readOnly />
            </div>

            {/* Row with Telefonos and Almacén */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-[11px] font-bold w-16 shrink-0">Telefonos</Label>
                <Input value={`${selectedProveedor?.telefono || ''}, ${selectedProveedor?.celular || ''}`} className="h-7 text-xs bg-gray-50" readOnly />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-[11px] font-bold text-gray-600 shrink-0">Almacen</Label>
                <Select value={compra.almacen_id?.toString() || ""} onValueChange={v => setCompra({ ...compra, almacen_id: v })}>
                  <SelectTrigger className="h-7 text-xs bg-white shadow-none">
                    <SelectValue placeholder="..." />
                  </SelectTrigger>
                  <SelectContent>
                    {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.codigo} - {a.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompraHeader;