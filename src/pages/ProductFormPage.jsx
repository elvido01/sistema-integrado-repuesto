import React, { useEffect, useState } from 'react';
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

// --- LISTAS DE OPCIONES (puedes editarlas, agregar o quitar) ---
const UBICACIONES = [
  { value: 'A-CAJA-3', label: 'A-CAJA-3' },
  { value: 'B-CAJA-1', label: 'B-CAJA-1' },
  { value: 'Sin ubicaciÃ³n', label: 'Sin ubicaciÃ³n' },
  { value: 'PRINCIPAL', label: 'PRINCIPAL' },
];
const TIPOS = [
  { value: 'EMPACADURA', label: 'Empacadura' },
  { value: 'PIEZA', label: 'Pieza' },
  { value: 'SIN_TIPO', label: 'Sin tipo' },
  { value: 'UND', label: 'UND' },
];
const MARCAS = [
  { value: 'TVS', label: 'TVS' },
  { value: 'HONDA', label: 'HONDA' },
  { value: 'GENÃ‰RICA', label: 'GENÃ‰RICA' },
  { value: 'Sin marca', label: 'Sin marca' },
];
const MODELOS = [
  { value: 'STRYKER 125', label: 'STRYKER 125' },
  { value: 'HLX125', label: 'HLX125' },
  { value: 'Sin modelo', label: 'Sin modelo' },
];
const SUPLIDORES = [
  { value: 'PROV01', label: 'Proveedor 01' },
  { value: 'GENÃ‰RICO', label: 'GenÃ©rico' },
  { value: 'Sin proveedor', label: 'Sin proveedor' },
];

// --- COMPONENTE SELECT GENÃ‰RICO ---
const SelectComponent = ({ label, value, onChange, options }) => (
  <div>
    <Label>{label}</Label>
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={`Seleccionar ${label.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt =>
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        )}
      </SelectContent>
    </Select>
  </div>
);

// --- COMPONENTE PRINCIPAL ---
const defaultForm = {
  codigo: '',
  referencia: '',
  descripcion: '',
  tipo: 'UND',
  ubicacion: 'PRINCIPAL',
  suplidor: 'GENÃ‰RICO',
  marca: 'GENÃ‰RICA',
  modelo: '',
  activo: true,
  garantia_meses: 0,
  min_stock: 0,
  max_stock: 0,
  itbis_pct: 18,
  stock: 0,
  tramo: '',
  tipo_mercancia: 'normal',
  // ...agrega aquÃ­ los demÃ¡s campos necesarios
};

const ProductFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

  const isEditing = id !== undefined;
  const product = isEditing ? products.find(p => p.id === parseInt(id)) : null;

  const [form, setForm] = useState(defaultForm);

  // Inicializar campos al crear/editar
  useEffect(() => {
    console.log('Editando en el formulario');
    console.log(product);
    console.log(product?.stock);
    console.log(calculateStock(product?.id));

    if (isEditing && product) {
      setForm({
        ...defaultForm,
        ...product,
        stock: calculateStock(product.id)
      });
    } else if (!isEditing) {
      setForm(defaultForm);
    }
  }, [isEditing, product]);

  // Si no encuentra el producto
  useEffect(() => {
    if (isEditing && !product) {
      toast({
        title: "Producto no encontrado",
        description: "El producto no existe o fue eliminado.",
        variant: "destructive",
      });
      navigate('/inventario/mercancias');
    }
  }, [isEditing, product, navigate, toast]);

  // Atajos de teclado
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleSave = () => {
    // AquÃ­ puedes conectar con tu API/backend/Supabase
    toast({
      title: "âœ… Guardado",
      description: "La informaciÃ³n de la mercancÃ­a ha sido guardada.",
    });
    navigate('/inventario/mercancias');
  };

  const handleCancel = () => {
    navigate('/inventario/mercancias');
  };

  const handleNotImplemented = () => {
    toast({
      title: "ðŸš§ FunciÃ³n no implementada",
      description: "Esta funciÃ³n aÃºn no estÃ¡ disponible.",
      duration: 3000,
    });
  };

  const handleChange = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col bg-white rounded-lg shadow-sm"
    >
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-morla-blue">
          {isEditing ? 'Editar MercancÃ­a' : 'Nueva MercancÃ­a'}
        </h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <Tabs defaultValue="basicos" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="basicos">Datos bÃ¡sicos</TabsTrigger>
            <TabsTrigger value="clasificacion">ClasificaciÃ³n</TabsTrigger>
            <TabsTrigger value="politicas">PolÃ­ticas</TabsTrigger>
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
                      <Label htmlFor="codigo">CÃ³digo (SKU)</Label>
                      <Input
                        id="codigo"
                        value={form.codigo}
                        onChange={e => handleChange('codigo', e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor="referencia">Referencia interna</Label>
                      <Input
                        id="referencia"
                        value={form.referencia}
                        onChange={e => handleChange('referencia', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="descripcion">DescripciÃ³n</Label>
                    <Textarea
                      id="descripcion"
                      rows={4}
                      value={form.descripcion}
                      onChange={e => handleChange('descripcion', e.target.value)}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="activo"
                      checked={!!form.activo}
                      onCheckedChange={checked => handleChange('activo', checked)}
                    />
                    <Label htmlFor="activo">Activo</Label>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 text-center">
                    <Label>Existencia</Label>
                    <p className="text-4xl font-bold text-morla-blue">{form.stock}</p>
                  </div>
                  <div className="border rounded-lg p-4 flex flex-col items-center justify-center h-40">
                    <img
                      className="w-24 h-24 object-cover rounded-md mb-2"
                      alt="Imagen del producto"
                      src="https://images.unsplash.com/photo-1625191182698-de65fbb19d97"
                    />
                    <Button variant="outline" size="sm" onClick={handleNotImplemented}>Cambiar Foto</Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="clasificacion">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <SelectComponent
                    label="UbicaciÃ³n"
                    value={form.ubicacion}
                    onChange={value => handleChange('ubicacion', value)}
                    options={UBICACIONES}
                  />
                  <Input
                    label="Tramo"
                    value={form.tramo}
                    onChange={e => handleChange('tramo', e.target.value)}
                    placeholder="Tramo (opcional)"
                  />
                  <SelectComponent
                    label="Tipo de Mercancia"
                    value={form.tipo}
                    onChange={value => handleChange('tipo', value)}
                    options={TIPOS}
                  />
                </div>
                <div className="space-y-4">
                  <SelectComponent
                    label="Marca"
                    value={form.marca}
                    onChange={value => handleChange('marca', value)}
                    options={MARCAS}
                  />
                  <SelectComponent
                    label="Modelo"
                    value={form.modelo}
                    onChange={value => handleChange('modelo', value)}
                    options={MODELOS}
                  />
                  <SelectComponent
                    label="Suplidor"
                    value={form.suplidor}
                    onChange={value => handleChange('suplidor', value)}
                    options={SUPLIDORES}
                  />
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="garantia">GarantÃ­a (meses)</Label>
                    <Input
                      id="garantia"
                      type="number"
                      value={form.garantia_meses}
                      onChange={e => handleChange('garantia_meses', e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleNotImplemented}
                  >ðŸ“¦ Ver Ãºltimas compras</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="politicas">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <Label>PolÃ­ticas de Stock</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="min_stock">MÃ­nima</Label>
                      <Input
                        id="min_stock"
                        type="number"
                        value={form.min_stock}
                        onChange={e => handleChange('min_stock', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="max_stock">MÃ¡xima</Label>
                      <Input
                        id="max_stock"
                        type="number"
                        value={form.max_stock}
                        onChange={e => handleChange('max_stock', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>IE â€“ % ITBIS</Label>
                    <Select
                      value={form.itbis_pct?.toString() ?? "18"}
                      onValueChange={value => handleChange('itbis_pct', Number(value))}
                    >
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
                  <Label>Tipo de mercancÃ­a</Label>
                  <RadioGroup
                    value={form.tipo_mercancia ?? "normal"}
                    onValueChange={value => handleChange('tipo_mercancia', value)}
                    className="mt-2 space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="normal" id="r1" />
                      <Label htmlFor="r1">Normal</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="servicio" id="r2" />
                      <Label htmlFor="r2">Servicio</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="serie" id="r3" />
                      <Label htmlFor="r3">Usa No. de Serie</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="vencimiento" id="r4" />
                      <Label htmlFor="r4">Usa Fecha Vencimiento</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="presentaciones">
              <PresentationsTab onNotImplemented={handleNotImplemented} />
            </TabsContent>
            <TabsContent value="componentes">
              <p className="text-center text-gray-500 p-8">FunciÃ³n de componentes/producciÃ³n no implementada.</p>
            </TabsContent>
            <TabsContent value="contabilidad">
              <p className="text-center text-gray-500 p-8">FunciÃ³n de contabilidad no implementada.</p>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="p-4 border-t bg-morla-gray-light flex justify-end gap-4">
        <Button className="btn-primary" onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" /> F10 â€“ Grabar
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          <XCircle className="w-4 h-4 mr-2" /> ESC â€“ Salir
        </Button>
      </div>
    </motion.div>
  );
};

// --- COMPONENTE DE PRESENTACIONES (igual que antes) ---
const PresentationsTab = ({ onNotImplemented }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PresentaciÃ³n</TableHead>
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
                <TableCell><Input type="number" defaultValue="0.00" className="w-24 bg-accent" /></TableCell>
                <TableCell><Input type="number" defaultValue="0" className="w-20" /></TableCell>
                <TableCell><Input type="number" defaultValue="0.00" className="w-24 bg-green-100" /></TableCell>
                <TableCell><Input type="number" defaultValue="0" className="w-20" /></TableCell>
                <TableCell><Checkbox /></TableCell>
                <TableCell><Checkbox /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Button size="sm" variant="outline" className="mt-4" onClick={onNotImplemented}>
            <Plus className="w-4 h-4 mr-2" />AÃ±adir PresentaciÃ³n
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
                  <Label className="text-xs text-gray-500">TamaÃ±o:</Label>
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

