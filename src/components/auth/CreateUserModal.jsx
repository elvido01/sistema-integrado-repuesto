import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { Loader2, UserPlus, Eye, EyeOff } from 'lucide-react';

const CreateUserModal = ({ isOpen, onClose, onUserCreated }) => {
    const { toast } = useToast();
    const { tenantId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        role: 'seller'
    });

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleRoleChange = (value) => {
        setFormData(prev => ({ ...prev, role: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Validate inputs
            if (!formData.email || !formData.password || !formData.fullName) {
                throw new Error("Por favor completa todos los campos.");
            }

            if (formData.password.length < 6) {
                throw new Error("La contraseña debe tener al menos 6 caracteres.");
            }

            // Create user via Edge Function (uses service_role → auto-confirms email)
            const { data, error } = await supabase.functions.invoke('admin-management', {
                body: {
                    action: 'create_user',
                    targetUserId: 'new', // placeholder, not used for create
                    updates: {
                        email: formData.email,
                        password: formData.password,
                        full_name: formData.fullName,
                        role: formData.role,
                        tenant_id: tenantId
                    }
                }
            });

            if (error) {
                let errorMsg = error.message;
                if (error.context?.json?.error) {
                    errorMsg = error.context.json.error;
                }
                throw new Error(errorMsg);
            }

            toast({
                title: "Usuario Creado",
                description: `Se ha creado la cuenta para ${formData.email}. Ya puede iniciar sesión.`,
            });

            if (onUserCreated) onUserCreated(data?.user);
            onClose();
            // Reset form
            setFormData({ email: '', password: '', fullName: '', role: 'seller' });

        } catch (error) {
            console.error("Error creating user:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "No se pudo crear el usuario.",
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
                        <UserPlus className="w-5 h-5 mr-2 text-morla-blue" />
                        Crear Nuevo Usuario
                    </DialogTitle>
                    <DialogDescription>
                        Ingresa los detalles para la nueva cuenta de acceso al sistema.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="fullName">Nombre Completo</Label>
                        <Input
                            id="fullName"
                            placeholder="Ej: Juan Pérez"
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
                            placeholder="juan@motoflow.app"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Contraseña Temporal</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Mínimo 6 caracteres"
                                value={formData.password}
                                onChange={handleChange}
                                required
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                onClick={() => setShowPassword(prev => !prev)}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="role">Rol Inicial</Label>
                        <Select value={formData.role} onValueChange={handleRoleChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar rol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">Administrador</SelectItem>
                                <SelectItem value="seller">Vendedor</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear Usuario
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateUserModal;
