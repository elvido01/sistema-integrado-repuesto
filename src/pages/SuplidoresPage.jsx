import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MoreHorizontal, PlusCircle, Search, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const emptyForm = { nombre: '', rnc: '', telefono: '', email: '', activo: true, dias_credito: 0, vende_a_credito: false };

const SuplidoresPage = () => {
  const { empresa } = useAuth();
    const { toast } = useToast();
    const [suplidores, setSuplidores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const fetchSuplidores = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('proveedores').select('*').order('nombre', { ascending: true });
        if (error) {
            toast({ title: 'Error', description: 'No se pudieron cargar los suplidores.', variant: 'destructive' });
        } else {
            setSuplidores(data);
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchSuplidores();
    }, [fetchSuplidores]);

    const filteredSuplidores = useMemo(() => {
        if (!searchTerm) return suplidores;
        return suplidores.filter(s =>
            s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.rnc?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [suplidores, searchTerm]);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setModalOpen(true);
    };

    const openEdit = (suplidor) => {
        setEditingId(suplidor.id);
        setForm({
            nombre: suplidor.nombre || '',
            rnc: suplidor.rnc || '',
            telefono: suplidor.telefono || '',
            email: suplidor.email || '',
            activo: suplidor.activo ?? true,
            dias_credito: suplidor.dias_credito || 0,
            vende_a_credito: suplidor.vende_a_credito ?? false,
        });
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.nombre.trim()) {
            toast({ title: 'Error', description: 'El nombre es obligatorio.', variant: 'destructive' });
            return;
        }
        setSaving(true);
        const payload = { ...form, nombre: form.nombre.trim(), dias_credito: parseInt(form.dias_credito) || 0 };

        let error;
        if (editingId) {
            ({ error } = await supabase.from('proveedores').update(payload).eq('id', editingId));
        } else {
            ({ error } = await supabase.from('proveedores').insert(payload));
        }

        if (error) {
            let msg = error.message;
            if (msg.includes('duplicate') || msg.includes('unique')) msg = 'Ya existe un suplidor con esos datos.';
            toast({ title: 'Error al guardar', description: msg, variant: 'destructive' });
        } else {
            toast({ title: editingId ? 'Suplidor actualizado' : 'Suplidor creado', description: `${form.nombre} guardado correctamente.` });
            setModalOpen(false);
            fetchSuplidores();
        }
        setSaving(false);
    };

    const handleDelete = async (suplidor) => {
        if (!window.confirm(`¿Eliminar el suplidor "${suplidor.nombre}"?`)) return;
        const { error } = await supabase.from('proveedores').delete().eq('id', suplidor.id);
        if (error) {
            toast({ title: 'Error', description: 'No se pudo eliminar. Puede tener registros asociados.', variant: 'destructive' });
        } else {
            toast({ title: 'Eliminado', description: `${suplidor.nombre} fue eliminado.` });
            fetchSuplidores();
        }
    };

    return (
        <>
            <Helmet>
                <title>Suplidores — {empresa?.nombre || 'Sistema'}</title>
            </Helmet>
            <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
                <div className="bg-morla-blue p-4 rounded-lg shadow-sm border flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-white">Gestión de Suplidores</h1>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                            <Input placeholder="Buscar suplidor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-64 bg-white text-black" />
                        </div>
                        <Button onClick={openCreate} variant="secondary">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Crear Suplidor
                        </Button>
                    </div>
                </div>

                <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
                    <div className="h-full overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-blue-50">
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>RNC</TableHead>
                                    <TableHead>Teléfono</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Crédito</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan="7" className="text-center">
                                            <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredSuplidores.length > 0 ? (
                                    filteredSuplidores.map(suplidor => (
                                        <TableRow key={suplidor.id}>
                                            <TableCell className="font-medium">{suplidor.nombre}</TableCell>
                                            <TableCell>{suplidor.rnc}</TableCell>
                                            <TableCell>{suplidor.telefono}</TableCell>
                                            <TableCell>{suplidor.email}</TableCell>
                                            <TableCell>{suplidor.vende_a_credito ? `${suplidor.dias_credito} días` : 'No'}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${suplidor.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {suplidor.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => openEdit(suplidor)}>
                                                            <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDelete(suplidor)} className="text-destructive">
                                                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan="7" className="text-center text-gray-500 py-8">
                                            No se encontraron suplidores.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            {/* Modal Crear/Editar Suplidor */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Editar Suplidor' : 'Crear Nuevo Suplidor'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="nombre">Nombre *</Label>
                            <Input id="nombre" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del suplidor" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="rnc">RNC / Cédula</Label>
                                <Input id="rnc" value={form.rnc} onChange={e => setForm(f => ({ ...f, rnc: e.target.value }))} placeholder="000-00000-0" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="telefono">Teléfono</Label>
                                <Input id="telefono" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="809-000-0000" />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@ejemplo.com" />
                        </div>
                        <div className="flex items-center justify-between border rounded-lg p-3">
                            <div>
                                <Label>Vende a crédito</Label>
                                <p className="text-sm text-gray-500">Permite compras a crédito con este suplidor</p>
                            </div>
                            <Switch checked={form.vende_a_credito} onCheckedChange={v => setForm(f => ({ ...f, vende_a_credito: v }))} />
                        </div>
                        {form.vende_a_credito && (
                            <div className="grid gap-2">
                                <Label htmlFor="dias_credito">Días de crédito</Label>
                                <Input id="dias_credito" type="number" value={form.dias_credito} onChange={e => setForm(f => ({ ...f, dias_credito: e.target.value }))} placeholder="30" />
                            </div>
                        )}
                        <div className="flex items-center justify-between border rounded-lg p-3">
                            <div>
                                <Label>Activo</Label>
                                <p className="text-sm text-gray-500">Suplidor disponible para nuevas compras</p>
                            </div>
                            <Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingId ? 'Guardar Cambios' : 'Crear Suplidor'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default SuplidoresPage;