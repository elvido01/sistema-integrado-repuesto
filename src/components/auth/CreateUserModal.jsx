import React, { useState, useEffect } from 'react';
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
import { toLoginEmail, isUsernameValido } from '@/lib/loginIdentity';

const CreateUserModal = ({ isOpen, onClose, onUserCreated }) => {
    const { toast } = useToast();
    const { tenantId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        fullName: '',
        role: 'seller'
    });

    // Al abrir el modal, dejar los campos vacíos (evita que el navegador deje
    // pegado el usuario/clave del admin de un autocompletado anterior).
    useEffect(() => {
        if (isOpen) {
            setFormData({ username: '', password: '', fullName: '', role: 'seller' });
            setShowPassword(false);
        }
    }, [isOpen]);

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
            const usuario = (formData.username || '').trim().toLowerCase();
            if (!usuario || !formData.password || !formData.fullName) {
                throw new Error("Por favor completa todos los campos.");
            }
            // El usuario puede ser un nombre de usuario o un correo real (con @)
            if (!usuario.includes('@') && !isUsernameValido(usuario)) {
                throw new Error("El usuario debe tener al menos 3 caracteres y solo letras, números, punto, guion o guion bajo (sin espacios).");
            }

            if (formData.password.length < 6) {
                throw new Error("La contraseña debe tener al menos 6 caracteres.");
            }

            // Email de login: si trae '@' es correo real; si no, se deriva del usuario
            const loginEmail = toLoginEmail(usuario);

            // Create user via Edge Function (uses service_role → auto-confirms email)
            const { data, error } = await supabase.functions.invoke('admin-management', {
                body: {
                    action: 'create_user',
                    targetUserId: 'new', // placeholder, not used for create
                    updates: {
                        email: loginEmail,
                        password: formData.password,
                        full_name: formData.fullName,
                        role: formData.role,
                        tenant_id: tenantId
                    }
                }
            });

            if (error) {
                let errorMsg = error.message;
                // error.context es la Response HTTP: el cuerpo trae el mensaje real
                try {
                    const body = await error.context?.json?.();
                    errorMsg = body?.error || body?.message || errorMsg;
                } catch { /* cuerpo no-JSON */ }
                if (/already.*registered|already exists|duplicate/i.test(errorMsg || '')) {
                    errorMsg = `El usuario «${usuario}» ya existe. Elige otro nombre de usuario.`;
                }
                throw new Error(errorMsg);
            }

            toast({
                title: data?.linked ? "Usuario Vinculado" : "Usuario Creado",
                description: data?.linked
                    ? data.message
                    : `Cuenta creada. ${usuario.includes('@') ? usuario : `Usuario: ${usuario}`}. Ya puede iniciar sesión.`,
            });

            if (onUserCreated) onUserCreated(data?.user);
            onClose();
            // Reset form
            setFormData({ username: '', password: '', fullName: '', role: 'seller' });

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
                <form onSubmit={handleSubmit} className="space-y-4 py-4" autoComplete="off">
                    {/* Trampa anti-autocompletado: el navegador rellena estos campos ocultos en vez de los reales */}
                    <input type="text" name="fakeusernameremembered" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" />
                    <input type="password" name="fakepasswordremembered" autoComplete="new-password" className="hidden" tabIndex={-1} aria-hidden="true" />
                    <div className="space-y-2">
                        <Label htmlFor="fullName">Nombre Completo</Label>
                        <Input
                            id="fullName"
                            placeholder="Ej: Juan Pérez"
                            value={formData.fullName}
                            onChange={handleChange}
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="username">Usuario</Label>
                        <Input
                            id="username"
                            name="nuevo-usuario-colaborador"
                            type="text"
                            autoCapitalize="none"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="ej: rafa (sin espacios)"
                            value={formData.username}
                            onChange={handleChange}
                            required
                        />
                        <p className="text-[11px] text-gray-500">
                            El colaborador entrará con este usuario y la contraseña, sin necesidad de correo.
                            También puedes escribir un correo real (con @) si lo prefieres.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Contraseña Temporal</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                name="nueva-clave-colaborador"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
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
                                <SelectItem value="gerente">Gerente</SelectItem>
                                <SelectItem value="supervisor">Supervisor</SelectItem>
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
