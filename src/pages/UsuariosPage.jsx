import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { supabase } from '../lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Loader2, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Switch } from "@/components/ui/switch";

const roles = ["Administrador", "Supervisor", "Vendedor"];

const UsuariosPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues: { rol: 'Vendedor' }
  });

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, setValue: setValueEdit, formState: { errors: errorsEdit } } = useForm();

  useEffect(() => {
    if (user) {
      const fetchUserRole = async () => {
        const { data, error } = await supabase
          .from('perfiles')
          .select('rol')
          .eq('id', user.id)
          .single();
        
        if (data) {
          setCurrentUserRole(data.rol);
        } else {
          console.error("Error fetching user role:", error?.message);
        }
      };
      fetchUserRole();
    }
  }, [user]);

  const fetchUsuarios = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_usuarios_panel');
      if (error) throw error;
      setUsuarios(data ?? []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar usuarios', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);
  
  const onNewUserSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: JSON.stringify(formData),
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast({ title: "Éxito", description: "Usuario creado correctamente." });
      reset({ nombre_completo: '', email: '', password: '', rol: 'Vendedor' });
      fetchUsuarios();
      setIsNewUserDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error al crear usuario", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = async (row) => {
    setSelectedUser(row);
    try {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre_completo, rol, activo')
        .eq('id', row.id)
        .single();

      const nombreUsado = perfil?.nombre_completo ?? row.display_name ?? '';
      const rolUsado = perfil?.rol ?? row.rol ?? 'Vendedor';
      const activoUsado = (perfil?.activo ?? row.activo ?? true);

      resetEdit({
        nombre_completo: nombreUsado,
        rol: rolUsado,
        activo: activoUsado,
        password: ''
      });
      // asegurar que el Select apunte al valor correcto
      setValueEdit('rol', rolUsado);
    } catch (_) {
      // fallback si algo falla: usar los datos de la fila
      const rolUsado = row.rol ?? 'Vendedor';
      resetEdit({
        nombre_completo: row.display_name ?? '',
        rol: rolUsado,
        activo: row.activo ?? true,
        password: ''
      });
      setValueEdit('rol', rolUsado);
    }
    setIsEditDialogOpen(true);
  };

  const onEditUserSubmit = async (formData) => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const { error: profileError } = await supabase
        .from('perfiles')
        .update({
          nombre_completo: formData.nombre_completo,
          rol: formData.rol,
          activo: formData.activo
        })
        .eq('id', selectedUser.id);
      
      if (profileError) throw profileError;

      if (currentUserRole === 'Administrador' && formData.password) {
        const { data, error: functionError } = await supabase.functions.invoke('update-user-password', {
          body: JSON.stringify({ userId: selectedUser.id, password: formData.password }),
        });

        if (functionError) throw functionError;
        if (data.error) throw new Error(data.error);
      }
      
      toast({ title: "Éxito", description: "Usuario actualizado correctamente." });
      fetchUsuarios();
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error al actualizar usuario", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (user) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ activo: false })
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast({ title: "Usuario Desactivado", description: "El usuario ha sido marcado como inactivo." });
      fetchUsuarios();
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error al desactivar usuario", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Gestión de Usuarios - Repuestos Morla</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full"
      >
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h1>
            <Dialog open={isNewUserDialogOpen} onOpenChange={setIsNewUserDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Usuario
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onNewUserSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="nombre_completo_new">Nombre Completo</Label>
                    <Input id="nombre_completo_new" {...register("nombre_completo", { required: "El nombre es requerido" })} />
                    {errors.nombre_completo && <p className="text-red-500 text-xs mt-1">{errors.nombre_completo.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="email_new">Correo Electrónico</Label>
                    <Input id="email_new" type="email" {...register("email", { required: "El email es requerido" })} />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="password_new">Contraseña</Label>
                    <Input id="password_new" type="password" {...register("password", { required: "La contraseña es requerida", minLength: { value: 6, message: "Mínimo 6 caracteres" } })} />
                    {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                  </div>
                  <div>
                    <Label>Rol</Label>
                    <Select onValueChange={(value) => setValue('rol', value)} defaultValue="Vendedor">
                       <SelectTrigger><SelectValue placeholder="Seleccione un rol" /></SelectTrigger>
                      <SelectContent>
                        {roles.map(rol => <SelectItem key={rol} value={rol}>{rol}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear Usuario
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre Completo</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan="5" className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                ) : usuarios.length === 0 ? (
                  <TableRow><TableCell colSpan="5" className="text-center text-muted-foreground py-8">No se encontraron usuarios.</TableCell></TableRow>
                ) : (
          usuarios.map(user => (
                    <TableRow key={user.id}>
            <TableCell>{user.display_name || 'N/A'}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.rol}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {user.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditClick(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteClick(user)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </motion.div>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Usuario</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitEdit(onEditUserSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="nombre_completo_edit">Nombre Completo</Label>
              <Input id="nombre_completo_edit" {...registerEdit("nombre_completo", { required: "El nombre es requerido" })} />
              {errorsEdit.nombre_completo && <p className="text-red-500 text-xs mt-1">{errorsEdit.nombre_completo.message}</p>}
            </div>
             <div>
              <Label>Rol</Label>
              <Select onValueChange={(value) => setValueEdit('rol', value)} defaultValue={selectedUser?.rol}>
                <SelectTrigger><SelectValue placeholder="Seleccione un rol" /></SelectTrigger>
                <SelectContent>
                  {roles.map(rol => <SelectItem key={rol} value={rol}>{rol}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {currentUserRole === 'Administrador' && (
              <div>
                <Label htmlFor="password_edit">Nueva Contraseña</Label>
                <Input 
                  id="password_edit" 
                  type="password" 
                  {...registerEdit("password", { 
                    minLength: { value: 6, message: "La contraseña debe tener al menos 6 caracteres" } 
                  })}
                  placeholder="Dejar en blanco para no cambiar"
                />
                {errorsEdit.password && <p className="text-red-500 text-xs mt-1">{errorsEdit.password.message}</p>}
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Switch 
                id="activo_edit" 
                defaultChecked={selectedUser?.activo}
                onCheckedChange={(checked) => setValueEdit('activo', checked)}
              />
              <Label htmlFor="activo_edit">Activo</Label>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Delete User Alert Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará al usuario como inactivo. No se podrá acceder al sistema. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UsuariosPage;