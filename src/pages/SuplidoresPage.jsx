import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, PlusCircle, Search, Loader2 } from 'lucide-react';
import SuplidorFormModal from '@/components/catalogo/SuplidorFormModal';

const SuplidoresPage = () => {
    const { toast } = useToast();
    const [suplidores, setSuplidores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSuplidor, setSelectedSuplidor] = useState(null);

    const fetchSuplidores = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('proveedores')
            .select('*')
            .order('nombre', { ascending: true });
        if (error) {
            toast({
                title: 'Error',
                description: 'No se pudieron cargar los suplidores.',
                variant: 'destructive',
            });
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
        return suplidores.filter((s) =>
            s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.rnc?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [suplidores, searchTerm]);

    const handleNotImplemented = () => {
        toast({
            title: '🚧 Función no implementada',
            description:
                'Esta función estará disponible próximamente. ¡Puedes solicitarla en tu próximo prompt! 🚀',
            duration: 3000,
        });
    };

    const handleEdit = (suplidor) => {
        setSelectedSuplidor(suplidor);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setSelectedSuplidor(null);
        setIsModalOpen(true);
    };

    const handleModalClose = (dataChanged) => {
        setIsModalOpen(false);
        setSelectedSuplidor(null);
        if (dataChanged) {
            fetchSuplidores();
        }
    };

    return (
        <>
            <Helmet>
                <title>Suplidores - Repuestos Morla</title>
            </Helmet>
            <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-morla-blue">Gestión de Suplidores</h1>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar suplidor..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 w-64"
                            />
                        </div>
                        <Button onClick={handleCreate}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Crear Suplidor
                        </Button>
                    </div>
                </div>

                <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
                    <div className="h-full overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-gray-100">
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>RNC</TableHead>
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
                                ) : filteredSuplidores.length > 0 ? (
                                    filteredSuplidores.map((suplidor) => (
                                        <TableRow key={suplidor.id}>
                                            <TableCell className="font-medium">{suplidor.nombre}</TableCell>
                                            <TableCell>{suplidor.rnc}</TableCell>
                                            <TableCell>{suplidor.telefono}</TableCell>
                                            <TableCell>{suplidor.email}</TableCell>
                                            <TableCell>{suplidor.activo ? 'Activo' : 'Inactivo'}</TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEdit(suplidor)}>
                                                            Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={handleNotImplemented} className="text-destructive">
                                                            Eliminar
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan="6" className="text-center text-gray-500 py-8">
                                            No se encontraron suplidores.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
            <SuplidorFormModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                suplidor={selectedSuplidor}
            />
        </>
    );
};

export default SuplidoresPage;
