import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, XCircle, Plus, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { products, calculateStock } from '@/data/mockData';

const ProductFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

  const isEditing = id !== undefined;
  const product = isEditing ? products.find(p => p.id === parseInt(id)) : {};
  const stock = isEditing ? calculateStock(product.id) : 0;

  const handleSave = () => {
    toast({
      title: "✅ Guardado",
      description: "La información de la mercancía ha sido guardada.",
    });
    navigate('/inventario/mercancias');
  };

  const handleCancel = () => {
    navigate('/inventario/mercancias');
  };

  const handleNotImplemented = () => {
    toast({
      title: "🚧 Función no implementada",
      description: `Esta función aún no está disponible. ¡Puedes solicitarla en tu próximo prompt! 🚀`,
      duration: 3000,
    });
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F10') {
        event.preventDefault();
        handleSave();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col bg-white rounded-lg shadow-sm"
    >
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-morla-blue">
          {isEditing ? 'Editar Mercancía' : 'Nueva Mercancía'}
        </h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <Tabs defaultValue="basicos" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="basicos">Datos básicos</TabsTrigger>
            <TabsTrigger value="clasificacion">Clasificación</TabsTrigger>
            <TabsTrigger value="politicas">Políticas</TabsTrigger>
            <TabsTrigger value="presentaciones">Presentaciones</TabsTrigger>
            <TabsTrigger value="componentes">Componentes</TabsTrigger>
            <TabsTrigger value="contabilidad">Contabilidad</TabsTrigger>
          </TabsList>

          <div className="mt-4 p-4 border rounded-lg">
            <TabsContent value="basicos">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="codigo">Código (SKU)</Label>
                      <Input id="codigo" defaultValue={product?.codigo} autoFocus />
                    </div>
                    <div>
                      <Label htmlFor="referencia">Referencia interna</Label>
                      <Input id="referencia" defaultValue={product?.referencia} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="descripcion">Descripción</Label>
                    <Textarea id="descripcion" rows={4} defaultValue={product?.descripcion} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="activo" defaultChecked={product?.activo ?? true} />
                    <Label htmlFor="activo">Activo</Label>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 text-center">
                    <Label>Existencia</Label>
                    <p className="text-4xl font-bold text-morla-blue">{stock}</p>
                  </div>
                  <div className="border rounded-lg p-4 flex flex-col items-center justify-center h-40">
                    <img  class="w-24 h-24 object-cover rounded-md mb-2" alt="Imagen del producto" src="https://images.unsplash.com/photo-1625191182698-de65fbb19d97" />
                    <Button variant="outline" size="sm" onClick={handleNotImplemented}>Cambiar Foto</Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="clasificacion">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <SelectComponent label="Almacén" />
                  <SelectComponent label="Tramo" />
                  <SelectComponent label="Tipo" />
                </div>
                <div className="space-y-4">
                  <SelectComponent label="Marca" />
                  <SelectComponent label="Modelo" />
                  <SelectComponent label="Suplidor" />
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="garantia">Garantía (meses)</Label>
                    <Input id="garantia" type="number" defaultValue={product?.garantia_meses} />
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleNotImplemented}>📦 Ver últimas compras</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="politicas">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <Label>Políticas de Stock</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="min_stock">Mínima</Label>
                      <Input id="min_stock" type="number" defaultValue={product?.min_stock} />
                    </div>
                    <div>
                      <Label htmlFor="max_stock">Máxima</Label>
                      <Input id="max_stock" type="number" defaultValue={product?.max_stock} />
                    </div>
                  </div>
                  <div>
                    <Label>IE – % ITBIS</Label>
                    <Select defaultValue={product?.itbis_pct?.toString() ?? "18"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="16">16%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>Tipo de mercancía</Label>
                  <RadioGroup defaultValue="normal" className="mt-2 space-y-2">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="normal" id="r1" /><Label htmlFor="r1">Normal</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="servicio" id="r2" /><Label htmlFor="r2">Servicio</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="serie" id="r3" /><Label htmlFor="r3">Usa No. de Serie</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="vencimiento" id="r4" /><Label htmlFor="r4">Usa Fecha Vencimiento</Label></div>
                  </RadioGroup>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="presentaciones">
              <PresentationsTab onNotImplemented={handleNotImplemented} />
            </TabsContent>
            <TabsContent value="componentes">
              <p className="text-center text-gray-500 p-8">Función de componentes/producción no implementada.</p>
            </TabsContent>
            <TabsContent value="contabilidad">
              <p className="text-center text-gray-500 p-8">Función de contabilidad no implementada.</p>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="p-4 border-t bg-morla-gray-light flex justify-end gap-4">
        <Button className="btn-primary" onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" /> F10 – Grabar
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          <XCircle className="w-4 h-4 mr-2" /> ESC – Salir
        </Button>
      </div>
    </motion.div>
  );
};

const SelectComponent = ({ label }) => (
  <div>
    <Label>{label}</Label>
    <Select>
      <SelectTrigger><SelectValue placeholder={`Seleccionar ${label.toLowerCase()}`} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="opcion1">Opción 1</SelectItem>
        <SelectItem value="opcion2">Opción 2</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

const PresentationsTab = ({ onNotImplemented }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Presentación</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>COSTO</TableHead>
                <TableHead>%Ben.</TableHead>
                <TableHead>PRECIO 1</TableHead>
                <TableHead>%Desc.</TableHead>
                <TableHead>FT</TableHead>
                <TableHead>INV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Select defaultValue="UND">
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UND">UND</SelectItem>
                      <SelectItem value="PAR">PAR</SelectItem>
                      <SelectItem value="KIT">KIT</SelectItem>
                      <SelectItem value="SET">SET</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input type="number" defaultValue="1" className="w-20" /></TableCell>
                <TableCell><Input type="number" defaultValue="0.00" className="w-24 bg-orange-100" /></TableCell>
                <TableCell><Input type="number" defaultValue="0" className="w-20" /></TableCell>
                <TableCell><Input type="number" defaultValue="0.00" className="w-24 bg-green-100" /></TableCell>
                <TableCell><Input type="number" defaultValue="0" className="w-20" /></TableCell>
                <TableCell><Checkbox /></TableCell>
                <TableCell><Checkbox /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Button size="sm" variant="outline" className="mt-4" onClick={onNotImplemented}>
            <Plus className="w-4 h-4 mr-2" />Añadir Presentación
          </Button>
        </div>

        <div className="space-y-2">
          <div className="border rounded-lg p-2 bg-gray-50">
            <div className="flex items-center gap-1 mb-2">
              <ImageIcon className="w-3 h-3 text-morla-blue" />
              <Label className="text-xs font-semibold text-morla-blue">Info. Imagen</Label>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-center mb-2">
                <img 
                  className="w-16 h-16 object-cover rounded border border-gray-200" 
                  alt="Imagen del producto" 
                  src="https://images.unsplash.com/photo-1625191182698-de65fbb19d97" 
                />
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
    </div>
  );
};

export default ProductFormPage;