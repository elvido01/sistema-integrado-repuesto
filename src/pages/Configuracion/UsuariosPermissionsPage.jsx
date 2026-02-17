import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { MODULES } from '@/lib/permissionsHelper';
import { Shield, User, Check, X, Save, RefreshCw, UserPlus, Edit } from 'lucide-react';
import CreateUserModal from '@/components/auth/CreateUserModal';
import EditUserModal from '@/components/auth/EditUserModal';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

const UsuariosPermissionsPage = () => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userPermissions, setUserPermissions] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('role', { ascending: true });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error("Error fetching users:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudieron cargar los usuarios."
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSelectUser = async (user) => {
        setSelectedUser(user);
        try {
            const { data, error } = await supabase
                .from('user_module_permissions')
                .select('*')
                .eq('user_id', user.id);

            if (error) throw error;
            setUserPermissions(data || []);
        } catch (error) {
            console.error("Error fetching user permissions:", error);
            setUserPermissions([]);
        }
    };

    const togglePermission = (moduleKey, field) => {
        setUserPermissions(prev => {
            const existing = prev.find(p => p.module_key === moduleKey);
            if (existing) {
                return prev.map(p => p.module_key === moduleKey ? { ...p, [field]: !p[field] } : p);
            } else {
                return [...prev, { user_id: selectedUser.id, module_key: moduleKey, can_view: field === 'can_view', can_edit: field === 'can_edit' }];
            }
        });
    };

    const handleRoleChange = async (newRole) => {
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: newRole } : u));
        setSelectedUser(prev => ({ ...prev, role: newRole }));
    };

    const saveChanges = async () => {
        if (!selectedUser) return;
        setIsSaving(true);
        try {
            // 1. Update Profile Role
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ role: selectedUser.role })
                .eq('id', selectedUser.id);

            if (profileError) throw profileError;

            // 2. Upsert Permissions
            if (selectedUser.role === 'seller') {
                const { error: permsError } = await supabase
                    .from('user_module_permissions')
                    .upsert(
                        userPermissions.map(p => ({
                            user_id: selectedUser.id,
                            module_key: p.module_key,
                            can_view: p.can_view,
                            can_edit: p.can_edit
                        })),
                        { onConflict: 'user_id,module_key' }
                    );

                if (permsError) throw permsError;
            }

            toast({
                title: "Éxito",
                description: "Usuario y permisos actualizados correctamente."
            });
            fetchUsers();
        } catch (error) {
            console.error("Error saving user changes:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudieron guardar los cambios."
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        setIsSaving(true);
        try {
            const { data, error } = await supabase.functions.invoke('admin-management', {
                body: {
                    action: 'delete_user',
                    targetUserId: userId
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
                title: "Usuario Eliminado",
                description: "El usuario ha sido eliminado correctamente."
            });
            setSelectedUser(null);
            fetchUsers();
        } catch (error) {
            console.error("Error deleting user:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "No se pudo eliminar el usuario."
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Usuarios y Permisos</h1>
                    <p className="text-gray-500">Gestiona roles y acceso a módulos para cada usuario.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setIsCreateModalOpen(true)} className="bg-morla-blue">
                        <UserPlus className="w-4 h-4 mr-2" /> Nuevo Usuario
                    </Button>
                    <Button onClick={fetchUsers} variant="outline" size="icon">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <CreateUserModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onUserCreated={fetchUsers}
            />

            <EditUserModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                user={selectedUser}
                onUserUpdated={fetchUsers}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-morla-blue">
                {/* User List */}
                <Card className="lg:col-span-1 border-none shadow-md overflow-hidden">
                    <CardHeader className="bg-morla-blue/5 border-b">
                        <CardTitle className="text-sm font-semibold flex items-center">
                            <User className="w-4 h-4 mr-2" /> Usuarios Registrados
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[500px]">
                            <Table>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow
                                            key={user.id}
                                            className={`cursor-pointer hover:bg-morla-blue/5 ${selectedUser?.id === user.id ? 'bg-morla-blue/10' : ''}`}
                                            onClick={() => handleSelectUser(user)}
                                        >
                                            <TableCell className="py-4">
                                                <div className="font-medium text-gray-900">{user.full_name || user.email || 'Usuario'}</div>
                                                <div className="text-xs text-gray-500 uppercase flex items-center mt-1">
                                                    <Shield className="w-3 h-3 mr-1" /> {user.role}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {users.length === 0 && !loading && (
                                        <TableRow>
                                            <TableCell className="text-center py-8 text-gray-500">No hay usuarios.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Permissions Editor */}
                <Card className="lg:col-span-2 border-none shadow-md overflow-hidden">
                    {selectedUser ? (
                        <>
                            <CardHeader className="bg-morla-blue/5 border-b">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg">{selectedUser.full_name || 'Configurar Usuario'}</CardTitle>
                                        <CardDescription>{selectedUser.email}</CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" onClick={() => setIsEditModalOpen(true)}>
                                            <Edit className="w-4 h-4 mr-2" /> Editar Acceso
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            onClick={() => {
                                                if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario ${selectedUser.full_name || selectedUser.email}? Esta acción no se puede deshacer.`)) {
                                                    handleDeleteUser(selectedUser.id);
                                                }
                                            }}
                                            disabled={isSaving}
                                        >
                                            <X className="w-4 h-4 mr-2" /> Eliminar Usuario
                                        </Button>
                                        <Button onClick={saveChanges} disabled={isSaving}>
                                            <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                {/* Role Selector */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700">Rol del Usuario</label>
                                    <Select value={selectedUser.role} onValueChange={handleRoleChange}>
                                        <SelectTrigger className="w-full sm:w-[240px]">
                                            <SelectValue placeholder="Seleccionar rol" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">Administrador (Acceso Total)</SelectItem>
                                            <SelectItem value="seller">Vendedor (Acceso Granular)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Module Permissions Checklist */}
                                {selectedUser.role === 'seller' ? (
                                    <div className="space-y-4">
                                        <label className="text-sm font-semibold text-gray-700">Permisos por Módulo</label>
                                        <div className="border rounded-lg overflow-hidden">
                                            <Table>
                                                <TableHeader className="bg-gray-50">
                                                    <TableRow>
                                                        <TableHead className="w-[300px]">Módulo</TableHead>
                                                        <TableHead className="text-center">Ver</TableHead>
                                                        <TableHead className="text-center">Editar</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {MODULES.map((module) => {
                                                        const perm = userPermissions.find(p => p.module_key === module.key) || { can_view: false, can_edit: false };
                                                        return (
                                                            <TableRow key={module.key}>
                                                                <TableCell className="font-medium">{module.label}</TableCell>
                                                                <TableCell className="text-center">
                                                                    <Checkbox
                                                                        checked={perm.can_view}
                                                                        onCheckedChange={() => togglePermission(module.key, 'can_view')}
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    <Checkbox
                                                                        checked={perm.can_edit}
                                                                        onCheckedChange={() => togglePermission(module.key, 'can_edit')}
                                                                    />
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-blue-50 text-blue-700 p-4 rounded-lg flex items-start">
                                        <Shield className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                        <p className="text-sm">
                                            Los <strong>Administradores</strong> tienen acceso total a todos los módulos y acciones del sistema.
                                            No es necesario configurar permisos individuales.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-20 text-center space-y-4">
                            <div className="bg-gray-100 p-6 rounded-full">
                                <User className="w-12 h-12 text-gray-400" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-gray-900">Selecciona un usuario</h3>
                                <p className="text-sm text-gray-500 max-w-[280px]">
                                    Elige un usuario de la lista de la izquierda para configurar su rol y sus permisos de acceso.
                                </p>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default UsuariosPermissionsPage;
