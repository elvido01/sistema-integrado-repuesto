import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Search, FileText } from 'lucide-react';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

const SalidaDetalles = ({
  currentDetalle, setCurrentDetalle, detalles, addDetalle, removeDetalle, updateDetalle, setIsSearchModalOpen,
  isFacturaMode = false, facturaItems = [], onToggleItem, onToggleAll, onQtyChange
}) => {

  const handleInputChange = (field, value) => {
    const newDetalle = { ...currentDetalle, [field]: value };
    if (field === 'cantidad' || field === 'costo_unitario') {
      newDetalle.importe = (parseFloat(newDetalle.cantidad) || 0) * (parseFloat(newDetalle.costo_unitario) || 0);
    }
    setCurrentDetalle(newDetalle);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDetalle();
    }
  };

  // Modo factura: tabla con checkboxes
  if (isFacturaMode) {
    const allSelected = facturaItems.length > 0 && facturaItems.every(i => i.selected);
    const someSelected = facturaItems.some(i => i.selected);

    return (
      <div className="mt-4 flex-grow flex flex-col">
        {/* Header informativo */}
        {facturaItems.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-t-lg">
            <FileText className="h-4 w-4 text-morla-blue" />
            <span className="text-sm font-medium text-morla-blue">
              Seleccione los productos a dar salida ({facturaItems.filter(i => i.selected).length} de {facturaItems.length} seleccionados)
            </span>
          </div>
        )}

        <div className="flex-grow overflow-y-auto border-x border-b rounded-b-lg">
          <Table>
            <TableHeader className="sticky top-0 bg-gray-50 z-10">
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => onToggleAll?.(!!checked)}
                    disabled={facturaItems.length === 0}
                    aria-label="Seleccionar todos"
                  />
                </TableHead>
                <TableHead className="w-[150px]">CÓDIGO</TableHead>
                <TableHead>DESCRIPCIÓN</TableHead>
                <TableHead className="text-center w-[100px]">CANT. FACT.</TableHead>
                <TableHead className="text-center w-[110px]">CANT. SALIDA</TableHead>
                <TableHead className="w-[90px]">UND</TableHead>
                <TableHead className="text-right w-[110px]">COSTO</TableHead>
                <TableHead className="text-right w-[130px]">IMPORTE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturaItems.map(item => {
                const importe = item.selected ? (item.cantidad * item.costo_unitario) : 0;
                return (
                  <TableRow key={item.id} className={item.selected ? '' : 'opacity-50 bg-gray-50'}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => onToggleItem?.(item.id)}
                        aria-label={`Seleccionar ${item.codigo}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                    <TableCell className="text-sm">{item.descripcion}</TableCell>
                    <TableCell className="text-center text-sm text-gray-500 font-medium">{item.cantidad_factura}</TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min={0}
                        max={item.cantidad_factura}
                        value={item.cantidad}
                        onChange={e => onQtyChange?.(item.id, e.target.value)}
                        disabled={!item.selected}
                        className="h-8 text-center w-20 mx-auto font-bold"
                      />
                    </TableCell>
                    <TableCell className="text-sm">{item.unidad}</TableCell>
                    <TableCell className="text-right text-sm">{item.costo_unitario.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{importe.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
              {facturaItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 text-gray-300" />
                      <span>Busque una factura para cargar sus productos.</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Modo normal: entrada manual de productos
  return (
    <div className="mt-4 flex-grow flex flex-col">
      <div className="grid grid-cols-[150px_1fr_90px_90px_110px_130px_40px] gap-2 items-end p-2 bg-gray-200 rounded-t-lg">
        <div className="relative flex items-center">
          <Input
            id="codigo-producto"
            placeholder="Código (F3)"
            value={currentDetalle.codigo}
            onChange={e => handleInputChange('codigo', e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (currentDetalle.codigo && !currentDetalle.producto_id) {
                addDetalle();
              }
            }}
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 absolute right-0" onClick={() => setIsSearchModalOpen(true)}>
            <Search className="h-4 w-4 text-gray-400" />
          </Button>
        </div>
        <Input placeholder="Descripción" value={currentDetalle.descripcion} readOnly disabled className="bg-gray-100" />
        <Input id="cantidad-producto" type="number" placeholder="Cant." className="text-right" value={currentDetalle.cantidad} onChange={e => handleInputChange('cantidad', e.target.value)} onKeyDown={handleKeyDown} />
        <Select value={currentDetalle.unidad} onValueChange={v => handleInputChange('unidad', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="UND">UND</SelectItem>
            <SelectItem value="CAJA">CAJA</SelectItem>
            <SelectItem value="PAQUETE">PAQUETE</SelectItem>
          </SelectContent>
        </Select>
        <Input type="text" inputMode="decimal" placeholder="Costo" className="text-right" value={fmtMontoInput(currentDetalle.costo_unitario)} onChange={e => handleInputChange('costo_unitario', parseMontoInput(e.target.value))} onKeyDown={handleKeyDown} />
        <Input className="text-right bg-gray-100" placeholder="Importe" value={currentDetalle.importe.toFixed(2)} readOnly disabled />
        <Button size="sm" onClick={addDetalle}>Ok</Button>
      </div>

      <div className="flex-grow overflow-y-auto border-x border-b rounded-b-lg">
        <Table>
          <TableHeader className="sticky top-0 bg-gray-50 z-10">
            <TableRow>
              <TableHead className="w-[150px]">CÓDIGO</TableHead>
              <TableHead>DESCRIPCIÓN</TableHead>
              <TableHead className="text-right w-[90px]">CANT.</TableHead>
              <TableHead className="w-[90px]">UND</TableHead>
              <TableHead className="text-right w-[110px]">COSTO</TableHead>
              <TableHead className="text-right w-[130px]">IMPORTE</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detalles.map(d => (
              <TableRow key={d.id}>
                <TableCell>{d.codigo}</TableCell>
                <TableCell>{d.descripcion}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    value={d.cantidad}
                    onChange={e => updateDetalle(d.id, 'cantidad', e.target.value)}
                    className="h-8 text-right"
                  />
                </TableCell>
                <TableCell>
                  <Select value={d.unidad} onValueChange={v => updateDetalle(d.id, 'unidad', v)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UND">UND</SelectItem>
                      <SelectItem value="CAJA">CAJA</SelectItem>
                      <SelectItem value="PAQUETE">PAQUETE</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="text" inputMode="decimal"
                    value={fmtMontoInput(d.costo_unitario)}
                    onChange={e => updateDetalle(d.id, 'costo_unitario', parseMontoInput(e.target.value))}
                    className="h-8 text-right"
                  />
                </TableCell>
                <TableCell className="text-right font-bold">{Number(d.importe).toFixed(2)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeDetalle(d.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {detalles.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Añada productos a la salida.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SalidaDetalles;