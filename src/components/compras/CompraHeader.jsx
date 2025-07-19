import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const CompraHeader = ({ compra, setCompra, proveedores, almacenes }) => {
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 border rounded-b-lg">
      <div className="space-y-3">
        <h2 className="font-bold text-morla-blue border-b pb-1">Detalles de la Compra</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="numero">NÚMERO</Label>
            <Input id="numero" value={compra.numero} onChange={e => setCompra({...compra, numero: e.target.value})} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fecha">FECHA</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !compra.fecha && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {compra.fecha ? format(compra.fecha, "PPP") : <span>Seleccione fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={compra.fecha}
                  onSelect={date => setCompra({...compra, fecha: date})}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="ncf">NCF</Label>
            <Input id="ncf" value={compra.ncf} onChange={e => setCompra({...compra, ncf: e.target.value})} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="referencia">Referencia</Label>
            <Input id="referencia" value={compra.referencia} onChange={e => setCompra({...compra, referencia: e.target.value})} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Tipo de Bienes o Servicios</Label>
            <Select value={compra.tipo_bienes_servicios} onValueChange={v => setCompra({...compra, tipo_bienes_servicios: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="09">09 - Compras y Gastos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Sub-Tipo</Label>
            <Select value={compra.sub_tipo} onValueChange={v => setCompra({...compra, sub_tipo: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Compra de Merc">Compra de Merc</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-bold text-morla-blue border-b pb-1">Datos del Suplidor</h2>
        <div className="space-y-1">
          <Label>Suplidor*</Label>
          <Select onValueChange={v => setCompra({...compra, suplidor_id: v})}>
            <SelectTrigger><SelectValue placeholder="Seleccione un suplidor" /></SelectTrigger>
            <SelectContent>
              {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Registrar en Almac...*</Label>
          <Select onValueChange={v => setCompra({...compra, almacen_id: v})}>
            <SelectTrigger><SelectValue placeholder="Seleccione un almacén" /></SelectTrigger>
            <SelectContent>
              {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.codigo} - {a.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default CompraHeader;