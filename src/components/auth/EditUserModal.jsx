import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserCog, Eye, EyeOff } from 'lucide-react';

const EditUserModal = ({ isOpen, onClose, user, onUserUpdated }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: ''
    });

    useEffect(() => {
        if (user) {
            setFormData({
                email: user.email || '',
                password: '',
                fullName: user.full_name || ''
            });
        }
    }, [user]);

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const updates = {};
            if (formData.email !== user.email && formData.email) updates.email = formData.email;
            if (formData.password) updates.password = formData.password;
            if (formData.fullName !== user.full_name && formData.fullName) updates.full_name = formData.fullName;

            if (Object.keys(updates).length === 0) {
                toast({ title: "Sin cambios", description: "No se detectaron cambios para actualizar." });
                onClose();
                return;
            }

            // Call the admin-management edge function
            const { data, error } = await supabase.functions.invoke('admin-management', {
                body: {
                    action: 'update_user',
                    targetUserId: user.id,
                    updates
                }
            });

            if (error) {
                console.error("Invoke Error Context:", error);
                let errorMsg = error.message;

                if (error.context) {
                    if (error.context.json) {
                        errorMsg = error.context.json.error || error.context.json.message || errorMsg;
                    } else if (error.context.text) {
                        try {
                            const parsed = JSON.parse(error.context.text);
                            errorMsg = parsed.error || parsed.message || errorMsg;
                        } catch (e) {
                            // If text is not JSON, it might be the raw error message
                            if (error.context.text.length < 200) {
                                errorMsg = error.context.text;
                            }
                        }
                    }
                }

                throw new Error(errorMsg);
            }

            toast({
                title: "Usuario Actualizado",
                description: "Los cambios se han guardado correctamente.",
            });

            if (onUserUpdated) onUserUpdated();
            onClose();
        } catch (error) {
            console.error("Error updating user:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "No se pudo actualizar el usuario.",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center">
                        <UserCog className="w-5 h-5 mr-2 text-morla-blue" />
                        Editar Usuario
                    </DialogTitle>
                    <DialogDescription>
                        Modifica el correo o la contraseña del usuario. Deja la contraseña en blanco para no cambiarla.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="fullName">Nombre Completo</Label>
                        <Input
                            id="fullName"
                            value={formData.fullName}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Correo Electrónico</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Nueva Contraseña (opcional)</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Mínimo 6 caracteres"
                                value={formData.password}
                                onChange={handleChange}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default EditUserModal;
