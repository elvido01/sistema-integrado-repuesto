import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, PlusCircle, Search, Loader2 } from 'lucide-react';
import VendedorFormModal from '@/components/configuracion/VendedorFormModal';

const VendedoresPage = () => {
    const { toast } = useToast();
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVendedor, setEditingVendedor] = useState(null);

    const fetchVendedores = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('vendedores').select('*').order('nombre', { ascending: true });
        if (error) {
            toast({ title: 'Error', description: 'No se pudieron cargar los vendedores.', variant: 'destructive' });
        } else {
            setVendedores(data);
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchVendedores();
    }, [fetchVendedores]);

    const filteredVendedores = useMemo(() => {
        if (!searchTerm) return vendedores;
        return vendedores.filter(v =>
            v.nombre.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [vendedores, searchTerm]);

    const handleCreate = () => {
        setEditingVendedor(null);
        setIsModalOpen(true);
    };

    const handleEdit = (vendedor) => {
        setEditingVendedor(vendedor);
        setIsModalOpen(true);
    };

    const handleToggleActive = async (vendedor) => {
        const { error } = await supabase
            .from('vendedores')
            .update({ activo: !vendedor.activo })
            .eq('id', vendedor.id);

        if (error) {
            toast({ title: 'Error', description: 'No se pudo actualizar el estado.', variant: 'destructive' });
        } else {
            toast({ title: 'Éxito', description: `Vendedor ${!vendedor.activo ? 'activado' : 'desactivado'} correctamente.` });
            fetchVendedores();
        }
    };

    const handleModalClose = (success) => {
        setIsModalOpen(false);
        setEditingVendedor(null);
        if (success) fetchVendedores();
    };

    return (
        <>
            <Helmet>
                <title>Vendedores - Repuestos Morla</title>
            </Helmet>
            <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-morla-blue">Gestión de Vendedores</h1>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar vendedor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-64" />
                        </div>
                        <Button onClick={handleCreate}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Crear Vendedor
                        </Button>
                    </div>
                </div>

                <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
                    <div className="h-full overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-gray-100">
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan="3" className="text-center">
                                            <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredVendedores.length > 0 ? (
                                    filteredVendedores.map(vendedor => (
                                        <TableRow key={vendedor.id}>
                                            <TableCell className="font-medium">{vendedor.nombre}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${vendedor.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {vendedor.activo ? 'Activo' : 'Inactivo'}
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
                                                        <DropdownMenuItem onClick={() => handleEdit(vendedor)}>Editar</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleToggleActive(vendedor)}>
                                                            {vendedor.activo ? 'Desactivar' : 'Activar'}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan="3" className="text-center text-gray-500 py-8">
                                            No se encontraron vendedores.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
            <VendedorFormModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                vendedor={editingVendedor}
            />
        </>
    );
};

export default VendedoresPage;
