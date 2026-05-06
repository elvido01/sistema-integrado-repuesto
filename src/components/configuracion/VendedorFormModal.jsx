import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

const VendedorFormModal = ({ vendedor, isOpen, onClose }) => {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        nombre: '',
        activo: true,
        comision_pct: 0,
    });

    useEffect(() => {
        if (isOpen) {
            if (vendedor) {
                setFormData({
                    nombre: vendedor.nombre || '',
                    activo: vendedor.activo ?? true,
                    comision_pct: vendedor.comision_pct ?? 0,
                });
            } else {
                setFormData({
                    nombre: '',
                    activo: true,
                    comision_pct: 0,
                });
            }
        }
    }, [vendedor, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleCheckedChange = (name, checked) => {
        setFormData((prev) => ({ ...prev, [name]: checked }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Sanitizar el porcentaje (puede venir como string desde el input)
        const pct = parseFloat(formData.comision_pct);
        const payload = {
            ...formData,
            comision_pct: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0,
        };

        let result;
        if (vendedor) {
            // Update
            result = await supabase.from('vendedores').update(payload).eq('id', vendedor.id).select();
        } else {
            // Insert
            result = await supabase.from('vendedores').insert(payload).select();
        }

        const { error } = result;

        if (error) {
            toast({
                title: 'Error',
                description: `No se pudo guardar el vendedor. ${error.message}`,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Éxito',
                description: `Vendedor ${vendedor ? 'actualizado' : 'creado'} correctamente.`,
            });
            onClose(true); // pass true to indicate success and trigger refresh
        }
        setIsSubmitting(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => onClose(false)}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{vendedor ? 'Editar Vendedor' : 'Crear Vendedor'}</DialogTitle>
                    <DialogDescription>
                        {vendedor ? 'Actualiza la información de este vendedor.' : 'Crea un nuevo vendedor en el sistema.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="nombre">Nombre Completo</Label>
                        <Input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} required placeholder="Ej. Juan Pérez" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="comision_pct">% Comisión sobre venta neta</Label>
                        <div className="relative">
                            <Input
                                id="comision_pct"
                                name="comision_pct"
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={formData.comision_pct}
                                onChange={handleChange}
                                placeholder="Ej. 1.5"
                                className="pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            Se usará como valor por defecto al calcular comisiones de este vendedor.
                        </p>
                    </div>
                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => handleCheckedChange('activo', checked)} />
                        <Label htmlFor="activo">Vendedor Activo</Label>
                    </div>

                    <DialogFooter className="pt-4">
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">Cancelar</Button>
                        </DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {vendedor ? 'Guardar Cambios' : 'Crear Vendedor'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default VendedorFormModal;
