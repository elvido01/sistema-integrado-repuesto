import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, PlusCircle, Search, Loader2 } from 'lucide-react';
import ClienteFormModal from '@/components/catalogo/ClienteFormModal';

const ClientesPage = () => {
    const { toast } = useToast();
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCliente, setSelectedCliente] = useState(null);

    const fetchClientes = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('clientes').select('*').order('nombre', { ascending: true });
        if (error) {
            toast({ title: 'Error', description: 'No se pudieron cargar los clientes.', variant: 'destructive' });
        } else {
            setClientes(data);
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchClientes();
    }, [fetchClientes]);

    const filteredClientes = useMemo(() => {
        if (!searchTerm) return clientes;
        return clientes.filter(c =>
            c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.rnc && c.rnc.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (c.telefono && c.telefono.includes(searchTerm))
        );
    }, [clientes, searchTerm]);

    const handleEdit = (cliente) => {
        setSelectedCliente(cliente);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setSelectedCliente(null);
        setIsModalOpen(true);
    };

    const handleModalClose = (dataChanged) => {
        setIsModalOpen(false);
        setSelectedCliente(null);
        if (dataChanged) {
            fetchClientes();
        }
    };
    
    const handleDelete = async (clienteId) => {
        const { error } = await supabase.from('clientes').delete().eq('id', clienteId);
        if (error) {
            toast({
                title: "Error al eliminar",
                description: `No se pudo eliminar el cliente. ${error.message}`,
                variant: "destructive",
            });
        } else {
            toast({
                title: "Cliente eliminado",
                description: "El cliente ha sido eliminado correctamente.",
            });
            fetchClientes();
        }
    };

    return (
        <>
            <Helmet>
                <title>Clientes - Repuestos Morla</title>
            </Helmet>
            <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-morla-blue">Gestión de Clientes</h1>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-64" />
                        </div>
                        <Button onClick={handleCreate}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Crear Cliente
                        </Button>
                    </div>
                </div>

                <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
                    <div className="h-full overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-gray-100">
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>RNC/Cédula</TableHead>
                                    <TableHead>Teléfono</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan="6" className="text-center">
                                            <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredClientes.length > 0 ? (
                                    filteredClientes.map(cliente => (
                                        <TableRow key={cliente.id}>
                                            <TableCell className="font-medium">{cliente.nombre}</TableCell>
                                            <TableCell>{cliente.rnc}</TableCell>
                                            <TableCell>{cliente.telefono}</TableCell>
                                            <TableCell>{cliente.email}</TableCell>
                                            <TableCell>{cliente.activo ? 'Activo' : 'Inactivo'}</TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEdit(cliente)}>Editar</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDelete(cliente.id)} className="text-destructive">Eliminar</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan="6" className="text-center text-gray-500 py-8">
                                            No se encontraron clientes.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
            <ClienteFormModal isOpen={isModalOpen} onClose={handleModalClose} cliente={selectedCliente} />
        </>
    );
};

export default ClientesPage;