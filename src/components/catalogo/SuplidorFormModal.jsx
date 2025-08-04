import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

const SuplidorFormModal = ({ suplidor, isOpen, onClose }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nombre: '',
    rnc: '',
    telefono: '',
    email: '',
    activo: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (suplidor) {
      setFormData({
        nombre: suplidor.nombre || '',
        rnc: suplidor.rnc || '',
        telefono: suplidor.telefono || '',
        email: suplidor.email || '',
        activo: suplidor.activo ?? true,
      });
    } else {
      setFormData({
        nombre: '',
        rnc: '',
        telefono: '',
        email: '',
        activo: true,
      });
    }
  }, [suplidor, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckedChange = (checked) => {
    setFormData((prev) => ({ ...prev, activo: checked }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    let result;
    if (suplidor) {
      result = await supabase
        .from('proveedores')
        .update(formData)
        .eq('id', suplidor.id)
        .select();
    } else {
      result = await supabase.from('proveedores').insert(formData).select();
    }

    const { data, error } = result;

    if (error) {
      toast({
        title: 'Error',
        description: `No se pudo guardar el suplidor. ${error.message}`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Éxito',
        description: `Suplidor ${suplidor ? 'actualizado' : 'creado'} correctamente.`,
      });
      onClose(true);
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{suplidor ? 'Editar Suplidor' : 'Crear Suplidor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="nombre" className="text-right">
              Nombre
            </Label>
            <Input
              id="nombre"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              className="col-span-3"
              required
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rnc" className="text-right">
              RNC
            </Label>
            <Input
              id="rnc"
              name="rnc"
              value={formData.rnc}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="telefono" className="text-right">
              Teléfono
            </Label>
            <Input
              id="telefono"
              name="telefono"
              value={formData.telefono}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="activo" className="text-right">
              Activo
            </Label>
            <Checkbox
              id="activo"
              checked={formData.activo}
              onCheckedChange={handleCheckedChange}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {suplidor ? 'Guardar Cambios' : 'Crear Suplidor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SuplidorFormModal;
