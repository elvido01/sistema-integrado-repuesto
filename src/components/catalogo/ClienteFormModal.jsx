import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';

const ClienteFormModal = ({ cliente, isOpen, onClose }) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    // Personal Info
    nombre: '',
    rnc: '',
    telefono: '',
    email: '',
    direccion: '',
    activo: true,
    // Credit Info
    autorizar_credito: false,
    limite_credito: 0,
    dias_credito: 0,
    tipo_ncf: '02', // Consumidor Final
  });

  useEffect(() => {
    if (isOpen) {
      if (cliente) {
        setFormData({
          nombre: cliente.nombre || '',
          rnc: cliente.rnc || '',
          telefono: cliente.telefono || '',
          email: cliente.email || '',
          direccion: cliente.direccion || '',
          activo: cliente.activo ?? true,
          autorizar_credito: cliente.autorizar_credito ?? false,
          limite_credito: cliente.limite_credito || 0,
          dias_credito: cliente.dias_credito || 0,
          tipo_ncf: cliente.tipo_ncf || '02',
        });
      } else {
        // Reset for new client
        setFormData({
          nombre: '',
          rnc: '',
          telefono: '',
          email: '',
          direccion: '',
          activo: true,
          autorizar_credito: false,
          limite_credito: 0,
          dias_credito: 0,
          tipo_ncf: '02',
        });
      }
    }
  }, [cliente, isOpen]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? parseFloat(value) || 0 : value;
    setFormData((prev) => ({ ...prev, [name]: parsedValue }));
  };

  const handleCheckedChange = (name, checked) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const dataToSubmit = {
        ...formData,
        limite_credito: formData.autorizar_credito ? formData.limite_credito : 0,
        dias_credito: formData.autorizar_credito ? formData.dias_credito : 0,
    };

    let result;
    if (cliente) {
      // Update
      result = await supabase.from('clientes').update(dataToSubmit).eq('id', cliente.id).select();
    } else {
      // Insert
      result = await supabase.from('clientes').insert(dataToSubmit).select();
    }

    const { error } = result;

    if (error) {
      toast({
        title: 'Error',
        description: `No se pudo guardar el cliente. ${error.message}`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Éxito',
        description: `Cliente ${cliente ? 'actualizado' : 'creado'} correctamente.`,
      });
      onClose(true); // pass true to indicate success and trigger refresh
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cliente ? 'Editar Cliente' : 'Crear Cliente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="personal">Información Personal</TabsTrigger>
              <TabsTrigger value="credito">Crédito y Facturación</TabsTrigger>
            </TabsList>
            <TabsContent value="personal" className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre/Razón Social</Label>
                  <Input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rnc">RNC/Cédula</Label>
                  <Input id="rnc" name="rnc" value={formData.rnc} onChange={handleChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Textarea id="direccion" name="direccion" value={formData.direccion} onChange={handleChange} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input id="telefono" name="telefono" value={formData.telefono} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => handleCheckedChange('activo', checked)} />
                <Label htmlFor="activo">Cliente Activo</Label>
              </div>
            </TabsContent>
            <TabsContent value="credito" className="py-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="autorizar_credito" checked={formData.autorizar_credito} onCheckedChange={(checked) => handleCheckedChange('autorizar_credito', checked)} />
                <Label htmlFor="autorizar_credito">Autorizar Crédito</Label>
              </div>
              {formData.autorizar_credito && (
                <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-gray-50">
                  <div className="space-y-2">
                    <Label htmlFor="dias_credito">Días de Crédito</Label>
                    <Input id="dias_credito" name="dias_credito" type="number" value={formData.dias_credito} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="limite_credito">Límite de Crédito</Label>
                    <Input id="limite_credito" name="limite_credito" type="number" value={formData.limite_credito} onChange={handleChange} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="tipo_ncf">Tipo NCF (Comprobante Fiscal)</Label>
                <Select name="tipo_ncf" value={formData.tipo_ncf} onValueChange={(value) => handleSelectChange('tipo_ncf', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un tipo de NCF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">01 - Crédito Fiscal</SelectItem>
                    <SelectItem value="02">02 - Factura de Consumo</SelectItem>
                    <SelectItem value="14">14 - Régimen Especial</SelectItem>
                    <SelectItem value="15">15 - Gubernamental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {cliente ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ClienteFormModal;