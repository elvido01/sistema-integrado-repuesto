import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const SuplidorSearchModal = ({ isOpen, onClose, onSelectSuplidor }) => {
    const { toast } = useToast();
    const [suplidores, setSuplidores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchSuplidores = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase.from('proveedores').select('*').eq('activo', true);

            if (searchTerm) {
                query = query.or(`nombre.ilike.%${searchTerm}%,rnc.ilike.%${searchTerm}%`);
            }

            query = query.order('nombre', { ascending: true }).limit(50);

            const { data, error } = await query;
            if (error) throw error;
            setSuplidores(data);
        } catch (error) {
            console.error("Error fetching suppliers:", error);
            toast({
                variant: 'destructive',
                title: 'Error al buscar suplidores',
                description: error.message,
            });
        } finally {
            setLoading(false);
        }
    }, [toast, searchTerm]);

    useEffect(() => {
        if (isOpen) {
            const handler = setTimeout(() => {
                fetchSuplidores();
            }, 300); // Debounce
            return () => clearTimeout(handler);
        } else {
            setSearchTerm(''); // Clear search on close
        }
    }, [isOpen, searchTerm, fetchSuplidores]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Buscar Suplidor</DialogTitle>
                </DialogHeader>
                <div className="p-4 border-b">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Buscar por nombre o RNC..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-white z-10">
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>RNC</TableHead>
                                <TableHead>Dirección</TableHead>
                                <TableHead>Teléfono</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan="4" className="text-center h-24">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : suplidores.length > 0 ? (
                                suplidores.map((suplidor) => (
                                    <TableRow
                                        key={suplidor.id}
                                        onClick={() => onSelectSuplidor(suplidor)}
                                        className="cursor-pointer hover:bg-muted/50"
                                    >
                                        <TableCell className="font-medium uppercase">{suplidor.nombre}</TableCell>
                                        <TableCell>{suplidor.rnc}</TableCell>
                                        <TableCell className="truncate max-w-xs">{suplidor.direccion}</TableCell>
                                        <TableCell>{suplidor.telefono}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan="4" className="text-center h-24 text-muted-foreground">
                                        No se encontraron suplidores.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SuplidorSearchModal;
