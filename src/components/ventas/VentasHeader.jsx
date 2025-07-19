import React from 'react';
import { Search, Calendar as CalendarIcon, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

const VentasHeader = ({
  cliente,
  date,
  setDate,
  onClienteSearch,
  onSelectCliente,
  onClearCliente,
  vendedores = [],
  selectedVendedor,
  onVendedorChange,
  almacenes = [],
  selectedAlmacen,
  onAlmacenChange,
  nextFacturaNumero,
  loadingNumero,
}) => {
  return (
    <div className="grid grid-cols-12 gap-2">
      {/* Datos del Cliente */}
      <div className="col-span-7 border border-gray-400 rounded p-2 pt-4 relative bg-gray-200">
        <p className="absolute -top-2.5 left-2 bg-gray-200 px-1 font-semibold text-gray-600">
          Datos de Cliente
        </p>
        <div className="grid grid-cols-6 gap-x-2 gap-y-1 items-center">
          <Label htmlFor="cliente" className="col-span-1">
            Cliente <span className="text-morla-blue font-bold">[F3]</span>
          </Label>
          <div className="col-span-3 relative">
            <Input
              id="cliente"
              className="h-6 text-xs pr-14"
              value={cliente?.nombre || ''}
              readOnly
              placeholder="<- Seleccione o facture a Cliente Genérico"
            />
            <div className="absolute right-0 top-0 flex items-center h-6">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClienteSearch}
              >
                <Search className="text-gray-400 w-4 h-4" />
              </Button>
              {cliente && cliente.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onClearCliente}
                >
                  <X className="text-red-400 w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <Label htmlFor="rnc" className="col-span-1 text-right">
            RNC
          </Label>
          <div className="col-span-1 bg-white border border-gray-300 rounded px-2 py-0.5 h-6">
            {cliente?.rnc || '000000000'}
          </div>
          <Label className="col-span-1">Nombre</Label>
          <div className="col-span-5 bg-white border border-gray-300 rounded px-2 py-0.5 h-6">
            {cliente?.nombre}
          </div>
          <Label className="col-span-1">Dirección</Label>
          <div className="col-span-5 bg-white border border-gray-300 rounded px-2 py-0.5 h-6">
            {cliente?.direccion || 'N/A'}
          </div>
          <Label className="col-span-1">Teléfonos</Label>
          <div className="col-span-5 bg-white border border-gray-300 rounded px-2 py-0.5 h-6">
            {cliente?.telefono || 'N/A'}
          </div>
        </div>
      </div>

      {/* Detalles de la Factura */}
      <div className="col-span-5 border border-gray-400 rounded p-2 pt-4 relative bg-gray-200">
        <p className="absolute -top-2.5 left-2 bg-gray-200 px-1 font-semibold text-gray-600">
          Detalles de la Factura
        </p>
        <div className="grid grid-cols-5 gap-x-2 gap-y-1 items-center">
          <Label className="col-span-1">NUMERO</Label>
          <div className="col-span-1 bg-white border border-gray-300 rounded px-2 py-0.5 h-6 text-center font-bold flex items-center justify-center">
            {loadingNumero ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              nextFacturaNumero
            )}
          </div>

          <Label className="col-span-1 text-right">FECHA</Label>
          <div className="col-span-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full h-6 text-xs justify-start font-normal">
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {date ? format(date, 'dd/MM/yyyy') : <span>Fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <Label className="col-span-1">Tipo NCF</Label>
          <Select value={cliente?.tipo_ncf || '02'}>
            <SelectTrigger className="h-6 text-xs col-span-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="01">01 - Crédito Fiscal</SelectItem>
              <SelectItem value="02">02 - Factura de Consumo</SelectItem>
              <SelectItem value="14">14 - Régimen Especial</SelectItem>
              <SelectItem value="15">15 - Gubernamental</SelectItem>
            </SelectContent>
          </Select>

          <Label className="col-span-1">NCF</Label>
          <div className="col-span-4 bg-white border border-gray-300 rounded px-2 py-0.5 h-6">
            B02...
          </div>

          <Label className="col-span-1">Vendedor</Label>
          <Select value={selectedVendedor} onValueChange={onVendedorChange}>
            <SelectTrigger className="h-6 text-xs col-span-4">
              <SelectValue placeholder="Seleccione..." />
            </SelectTrigger>
            <SelectContent>
              {vendedores.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nombre_completo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="col-span-1">Almacén</Label>
          <Select value={selectedAlmacen} onValueChange={onAlmacenChange}>
            <SelectTrigger className="h-6 text-xs col-span-4">
              <SelectValue placeholder="Seleccione..." />
            </SelectTrigger>
            <SelectContent>
              {almacenes.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default VentasHeader;
