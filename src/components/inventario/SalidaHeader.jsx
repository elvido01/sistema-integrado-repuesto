import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

const SalidaHeader = ({ salida, setSalida, almacenes, onBuscarFactura, isSearchingFactura, facturaInfo, ultimaCompraNumero }) => {
  const [facturaNumero, setFacturaNumero] = useState('');

  useEffect(() => {
    if (ultimaCompraNumero && !facturaNumero) {
      setFacturaNumero(ultimaCompraNumero);
    }
  }, [ultimaCompraNumero]);

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 border-x border-b rounded-b-lg">
      <div className="space-y-3">
        <h2 className="font-bold text-morla-blue border-b pb-1">Detalles de la Salida</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="numero">NÚMERO</Label>
            <Input id="numero" value={salida.numero} readOnly disabled className="bg-gray-100" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fecha">FECHA</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !salida.fecha && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {salida.fecha ? format(salida.fecha, "dd/MM/yyyy") : <span>Seleccione fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={salida.fecha}
                  onSelect={date => setSalida({...salida, fecha: date})}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="space-y-1">
            <Label htmlFor="referencia">Documento Referencia</Label>
            <Input id="referencia" value={salida.referencia} onChange={e => setSalida({...salida, referencia: e.target.value})} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
            <Label>Concepto</Label>
            <Select value={salida.concepto} onValueChange={v => setSalida({...salida, concepto: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AJUSTE DE SALIDA">AJUSTE DE SALIDA</SelectItem>
                <SelectItem value="MERCANCIA DAÑADA">MERCANCIA DAÑADA</SelectItem>
                <SelectItem value="DEVOLUCION A SUPLIDOR">DEVOLUCION A SUPLIDOR</SelectItem>
                <SelectItem value="USO INTERNO">USO INTERNO</SelectItem>
                <SelectItem value="SALIDA POR FACTURA">SALIDA POR COMPRA</SelectItem>
              </SelectContent>
            </Select>
        </div>
        <div className="space-y-1">
          <Label>Almacén*</Label>
          <Select value={salida.almacen_id} onValueChange={v => setSalida({...salida, almacen_id: v})}>
            <SelectTrigger><SelectValue placeholder="Seleccione un almacén" /></SelectTrigger>
            <SelectContent>
              {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.codigo} - {a.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {salida.concepto === 'SALIDA POR FACTURA' && (
          <div className="space-y-1">
            <Label className="font-bold text-morla-blue">Buscar Compra #</Label>
            <div className="flex items-center gap-2">
              <Input
                id="factura-numero-input"
                placeholder="Ej: OC-0005"
                value={facturaNumero}
                onChange={e => setFacturaNumero(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onBuscarFactura?.(facturaNumero);
                  }
                }}
                className="flex-grow border-blue-400 focus:ring-blue-500"
              />
              <Button
                size="icon"
                onClick={() => onBuscarFactura?.(facturaNumero)}
                disabled={isSearchingFactura || !facturaNumero}
                className="bg-morla-blue hover:bg-morla-blue/90 h-9 w-9"
              >
                {isSearchingFactura ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {facturaInfo && (
              <p className="text-xs text-green-700 font-medium mt-1">
                ✅ Factura #{facturaInfo.numero} — {facturaInfo.clienteNombre || 'Sin cliente'} — Total: {Number(facturaInfo.total).toFixed(2)}
              </p>
            )}
          </div>
        )}
        <div className="space-y-1">
            <Label htmlFor="notas">Notas / Comentarios</Label>
            <Textarea id="notas" value={salida.notas} onChange={e => setSalida({...salida, notas: e.target.value})} />
        </div>
      </div>
    </div>
  );
};

export default SalidaHeader;