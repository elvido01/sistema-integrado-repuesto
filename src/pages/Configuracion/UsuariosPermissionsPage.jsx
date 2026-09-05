import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { invocarConSesion } from '@/lib/edgeInvoke';
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
import { Input } from '@/components/ui/input';
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
import { usernameDesdeEmail } from '@/lib/loginIdentity';

const FULL_ACCESS_ROLES = ['admin', 'owner'];

const isFullAccessRole = (role) => FULL_ACCESS_ROLES.includes(String(role || '').toLowerCase());

// Etiquetas de rol en español (para mostrar en la lista y la cabecera)
const ROLE_LABELS = {
    admin: 'Administrador',
    owner: 'Propietario',
    manager: 'Gerente',
    gerente: 'Gerente',
    supervisor: 'Supervisor',
    seller: 'Vendedor',
    vendedor: 'Vendedor',
};
const rolLabel = (role) => ROLE_LABELS[String(role || '').toLowerCase()] || role || '—';

// Plantillas de permisos POR DEFECTO según el rol. Son solo una sugerencia:
// el admin las aplica y SIEMPRE puede editarlas (marcar/desmarcar) antes de guardar.
const mkPerms = (keys, canEdit) => keys.map((k) => ({ module_key: k, can_view: true, can_edit: !!canEdit }));

// Módulos reservados a Administrador (no entran en plantillas de otros roles)
const BLOQUEADOS_NO_ADMIN = ['usuarios', 'config_sistema', 'perfil-empresa', 'comprobantes-fiscales', 'presupuesto-inteligente'];

const defaultPermsForRole = (role, allModules) => {
    const r = String(role || '').toLowerCase();

    // Vendedor: operación de ventas
    const vendedorEdit = ['ventas', 'recibo-ingreso', 'pedidos', 'cotizaciones', 'clientes', 'devoluciones'];
    const vendedorView = ['orden-compra', 'mercancias', 'reporte-transacciones-diarias'];

    if (r === 'seller' || r === 'vendedor') {
        return [...mkPerms(vendedorEdit, true), ...mkPerms(vendedorView, false)];
    }

    if (r === 'supervisor') {
        const supEdit = [...vendedorEdit, 'compras', 'solicitudes-compras', 'aprobaciones-compras', 'suplidores',
            'cierre-caja', 'entrada-mercancia', 'salida-mercancia', 'actualizar-ubicacion', 'vendedores',
            'marcas', 'modelos', 'tipos-producto'];
        const supView = ['pago-suplidores', 'reporte-compras', 'reporte-movimientos', 'cartera-clientes',
            'flujo-caja', 'inventario-fisico', 'reporte-transacciones-diarias', 'orden-compra', 'mercancias'];
        return [...mkPerms(supEdit, true), ...mkPerms(supView.filter((k) => !supEdit.includes(k)), false)];
    }

    if (r === 'gerente' || r === 'manager') {
        // Gerente: acceso amplio (ver+editar) a todo lo operativo/reportes/catálogo,
        // excepto configuración del sistema/usuarios (reservado a Administrador).
        return (allModules || [])
            .filter((m) => !BLOQUEADOS_NO_ADMIN.includes(m.key))
            .map((m) => ({ module_key: m.key, can_view: true, can_edit: true }));
    }

    return [];
};

const currentMonthStart = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

const UsuariosPermissionsPage = () => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userPermissions, setUserPermissions] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [salesGoal, setSalesGoal] = useState('');
    const [salesGoalLoading, setSalesGoalLoading] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            // Incluye también a los usuarios VINCULADOS a esta empresa
            // (multi-empresa, usuarios_empresas), no solo los del tenant
            let { data, error } = await supabase.rpc('get_usuarios_empresa');
            if (error) {
                // Fallback si el RPC aún no existe en esta base
                ({ data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .order('role', { ascending: true }));
            }

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
        setSalesGoal('');
        setSalesGoalLoading(true);
        try {
            const [permsRes, goalRes] = await Promise.all([
                supabase
                    .from('user_module_permissions')
                    .select('*')
                    .eq('user_id', user.id),
                supabase
                    .from('vendedor_metas_mensuales')
                    .select('meta')
                    .eq('tenant_id', user.tenant_id)
                    .eq('user_id', user.id)
                    .eq('periodo', currentMonthStart())
                    .maybeSingle(),
            ]);

            if (permsRes.error) throw permsRes.error;
            setUserPermissions(permsRes.data || []);
            if (goalRes.error) {
                console.warn('No se pudo cargar la meta del vendedor:', goalRes.error.message);
            } else {
                setSalesGoal(goalRes.data?.meta ? String(goalRes.data.meta) : '');
            }
        } catch (error) {
            console.error("Error fetching user permissions:", error);
            setUserPermissions([]);
        } finally {
            setSalesGoalLoading(false);
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

    // Aplica la plantilla de permisos del rol. merge=true conserva lo ya marcado
    // y solo AGREGA los módulos sugeridos que falten (no borra nada).
    const aplicarPlantilla = (role, { merge = true } = {}) => {
        if (!selectedUser) return;
        const tpl = defaultPermsForRole(role, MODULES);
        setUserPermissions(prev => {
            if (!merge) {
                return tpl.map(t => ({ user_id: selectedUser.id, ...t }));
            }
            const map = new Map((prev || []).map(p => [p.module_key, p]));
            tpl.forEach(t => {
                if (!map.has(t.module_key)) map.set(t.module_key, { user_id: selectedUser.id, ...t });
            });
            return Array.from(map.values());
        });
    };

    const handleRoleChange = async (newRole) => {
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: newRole } : u));
        setSelectedUser(prev => ({ ...prev, role: newRole }));
        // Si el usuario aún no tiene permisos configurados, precargar los del rol
        // (siempre editables). Si ya tiene, no se toca nada hasta que el admin
        // use el botón "Aplicar permisos sugeridos".
        if (!isFullAccessRole(newRole) && (userPermissions || []).length === 0) {
            aplicarPlantilla(newRole, { merge: false });
        }
    };

    const saveChanges = async () => {
        if (!selectedUser) return;
        setIsSaving(true);
        try {
            // 1. Update Profile Role
            //
            // >>> CERO FILAS NO ES UN ERROR <<<
            // PostgREST contesta 204 sin error cuando el UPDATE no alcanza
            // ninguna fila —porque RLS no deja ver esa fila, por ejemplo—.
            // Sin el .select() esto cantaba "Éxito" sobre un cambio que
            // nunca ocurrió: el rol de yimber de leon volvía a SUPERVISOR
            // en cuanto se recargaba. Se pide la fila de vuelta y, si no
            // viene, se dice la verdad.
            const { data: filasTocadas, error: profileError } = await supabase
                .from('profiles')
                .update({ role: selectedUser.role })
                .eq('id', selectedUser.id)
                .select('id');

            if (profileError) throw profileError;
            if (!filasTocadas || filasTocadas.length === 0) {
                throw new Error('La base no dejó cambiarle el rol a este usuario. Revisa que su perfil pertenezca a esta empresa o que tengas permiso de administrador aquí.');
            }

            // 2. Upsert Permissions
            if (!isFullAccessRole(selectedUser.role)) {
                if (userPermissions.length > 0) {
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

                const goalValue = Number(String(salesGoal || '').replace(/,/g, ''));
                if (goalValue > 0) {
                    const { error: goalError } = await supabase
                        .from('vendedor_metas_mensuales')
                        .upsert({
                            tenant_id: selectedUser.tenant_id,
                            user_id: selectedUser.id,
                            periodo: currentMonthStart(),
                            meta: goalValue,
                        }, { onConflict: 'tenant_id,user_id,periodo' });

                    if (goalError) throw goalError;
                }
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
                // El motivo real, no una frase de relleno: sin esto todos
                // los fallos se veían iguales y no se podía diagnosticar.
                description: error?.message || "No se pudieron guardar los cambios."
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        setIsSaving(true);
        try {
            await invocarConSesion('admin-management', {
                action: 'delete_user',
                targetUserId: userId
            });

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
                                                    <Shield className="w-3 h-3 mr-1" /> {rolLabel(user.role)}
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
                                        <CardDescription>
                                            Usuario: {usernameDesdeEmail(selectedUser.email)} · Rol: {rolLabel(selectedUser.role)}
                                        </CardDescription>
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
                                            <SelectItem value="gerente">Gerente (Acceso Granular)</SelectItem>
                                            <SelectItem value="supervisor">Supervisor (Acceso Granular)</SelectItem>
                                            <SelectItem value="seller">Vendedor (Acceso Granular)</SelectItem>
                                            <SelectItem value="vendedor">Vendedor Legacy</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {!isFullAccessRole(selectedUser.role) ? (
                                    <div className="grid gap-2 rounded-lg border bg-blue-50/40 p-4 sm:max-w-md">
                                        <label className="text-sm font-semibold text-gray-700">Meta de venta de este mes</label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={salesGoal}
                                            onChange={(event) => setSalesGoal(event.target.value)}
                                            placeholder={salesGoalLoading ? 'Cargando meta...' : 'Ej: 150000'}
                                            disabled={salesGoalLoading}
                                        />
                                        <p className="text-xs text-gray-500">
                                            Esta meta alimenta el inicio movil del vendedor y se compara con sus ventas facturadas por usuario.
                                        </p>
                                    </div>
                                ) : null}

                                {/* Module Permissions Checklist */}
                                {!isFullAccessRole(selectedUser.role) ? (
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <label className="text-sm font-semibold text-gray-700">Permisos por Módulo</label>
                                            <div className="flex gap-2">
                                                <Button type="button" variant="outline" size="sm"
                                                    onClick={() => aplicarPlantilla(selectedUser.role, { merge: true })}>
                                                    Aplicar permisos sugeridos ({rolLabel(selectedUser.role)})
                                                </Button>
                                                <Button type="button" variant="ghost" size="sm" className="text-gray-500"
                                                    onClick={() => setUserPermissions(prev => (prev || []).map(p => ({ ...p, can_view: false, can_edit: false })))}>
                                                    Limpiar todo
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Los permisos sugeridos son solo un punto de partida según el rol. Puedes marcar o
                                            desmarcar cualquier módulo libremente antes de <strong>Guardar Cambios</strong>.
                                        </p>
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
