import React from 'react';
import { Plus, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PresentationsTab = ({ presentations, setPresentations, tiposPresentacion, onNotImplemented }) => {

  const calculatePrice = (costo, margenPct) => {
    const costoNum = parseFloat(costo) || 0;
    const margenNum = parseFloat(margenPct) || 0;
    return (costoNum * (1 + margenNum / 100)).toFixed(2);
  };

  const calculateFinalPrice = (precio1, descuentoPct) => {
    const precioNum = parseFloat(precio1) || 0;
    const descuentoNum = parseFloat(descuentoPct) || 0;
    return (precioNum * (1 - descuentoNum / 100)).toFixed(2);
  };

  const addPresentation = () => {
    const newPresentation = {
      id: `new-${Date.now()}`,
      tipo: 'UND - Unidad',
      cantidad: '1',
      costo: '0.00',
      margen_pct: '0',
      precio1: '0.00',
      descuento_pct: '0',
      precio_final: '0.00',
      afecta_ft: false,
      afecta_inv: false
    };
    setPresentations([...presentations, newPresentation]);
  };

  const removePresentation = (id) => {
    setPresentations(presentations.filter(p => p.id !== id));
  };

  const updatePresentation = (id, field, value) => {
    setPresentations(presentations.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };
        
        if (field === 'costo' || field === 'margen_pct') {
          updated.precio1 = calculatePrice(
            field === 'costo' ? value : updated.costo,
            field === 'margen_pct' ? value : updated.margen_pct
          );
        }
        
        updated.precio_final = calculateFinalPrice(updated.precio1, updated.descuento_pct);
        
        return updated;
      }
      return p;
    }));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold">Presentaciones del Producto</h3>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={addPresentation}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar Presentación
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-32">Tipo</TableHead>
                <TableHead className="w-20 text-right">Cant.</TableHead>
                <TableHead className="w-24 text-right">Costo (RD$)</TableHead>
                <TableHead className="w-20 text-right">% Ben.</TableHead>
                <TableHead className="w-24 text-right">Precio Base (RD$)</TableHead>
                <TableHead className="w-20 text-right">% Desc.</TableHead>
                <TableHead className="w-24 text-right">Precio Final (RD$)</TableHead>
                <TableHead className="w-12 text-center">FT</TableHead>
                <TableHead className="w-12 text-center">INV</TableHead>
                <TableHead className="w-16 text-center">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presentations.map((presentation) => (
                <TableRow key={presentation.id}>
                  <TableCell>
                    <Select 
                      value={presentation.tipo} 
                      onValueChange={(value) => updatePresentation(presentation.id, 'tipo', value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposPresentacion?.map(tp => (
                           <SelectItem key={tp.id} value={tp.nombre}>{tp.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="text" 
                      value={presentation.cantidad}
                      onChange={(e) => updatePresentation(presentation.id, 'cantidad', e.target.value)}
                      className="w-full text-right text-xs"
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="text" 
                      value={presentation.costo}
                      onChange={(e) => updatePresentation(presentation.id, 'costo', e.target.value)}
                      className="w-full bg-orange-50 text-right text-xs font-semibold"
                      placeholder="0.00"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="text" 
                      value={presentation.margen_pct}
                      onChange={(e) => updatePresentation(presentation.id, 'margen_pct', e.target.value)}
                      className="w-full text-right text-xs bg-blue-50"
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="text" 
                      value={presentation.precio1}
                      onChange={(e) => updatePresentation(presentation.id, 'precio1', e.target.value)}
                      className="w-full bg-green-100 text-right text-xs font-semibold border-green-300"
                      placeholder="0.00"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="text" 
                      value={presentation.descuento_pct}
                      onChange={(e) => updatePresentation(presentation.id, 'descuento_pct', e.target.value)}
                      className="w-full text-right text-xs bg-yellow-50"
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="w-full bg-purple-100 text-right text-xs font-bold p-2 rounded border border-purple-300">
                      RD$ {presentation.precio_final}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox 
                      checked={presentation.afecta_ft}
                      onCheckedChange={(checked) => updatePresentation(presentation.id, 'afecta_ft', checked)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox 
                      checked={presentation.afecta_inv}
                      onCheckedChange={(checked) => updatePresentation(presentation.id, 'afecta_inv', checked)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    {presentations.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removePresentation(presentation.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-gray-500 space-y-1 bg-gray-50 p-3 rounded-lg">
          <p><strong>💡 Lógica de Precios:</strong></p>
          <p>• <strong>Precio Base = Costo × (1 + % Beneficio ÷ 100)</strong>. Este es el precio para inventario y POS.</p>
          <p>• <strong>Precio Final = Precio Base × (1 - % Descuento ÷ 100)</strong>. Este es el precio final solo para facturación.</p>
          <p>• <strong>FT:</strong> Afecta Facturación | <strong>INV:</strong> Afecta Inventario</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="border rounded-lg p-2 bg-gray-50 max-w-xs">
          <div className="flex items-center gap-1 mb-2">
            <ImageIcon className="w-3 h-3 text-morla-blue" />
            <Label className="text-xs font-semibold text-morla-blue">Info. Imagen</Label>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-center mb-2">
              <img  class="w-16 h-16 object-cover rounded border border-gray-200" alt="Imagen del producto" src="https://images.unsplash.com/photo-1696119302564-f292a3d79b1a" />
            </div>
            
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div>
                <Label className="text-xs text-gray-500">Formato:</Label>
                <p className="text-xs font-medium">JPEG</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Tamaño:</Label>
                <p className="text-xs font-medium">245 KB</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Dimensiones:</Label>
                <p className="text-xs font-medium">800x600</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Estado:</Label>
                <p className="text-xs font-medium text-green-600">Activa</p>
              </div>
            </div>
            
            <div className="pt-1 border-t">
              <Label className="text-xs text-gray-500">Modificado:</Label>
              <p className="text-xs font-medium">15/12/24</p>
            </div>
            
            <div className="flex flex-col gap-1 pt-1">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full h-6 text-xs"
                onClick={onNotImplemented}
              >
                <Upload className="w-3 h-3 mr-1" />
                Cambiar
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full h-6 text-xs text-red-600 hover:text-red-700"
                onClick={onNotImplemented}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationsTab;