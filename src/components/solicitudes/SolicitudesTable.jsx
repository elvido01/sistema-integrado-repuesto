import React from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const estadoConfig = {
    abierta: { label: 'Abierta', className: 'bg-red-100 text-red-700 border-red-200' },
    notificada: { label: 'Notificada', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    cerrada: { label: 'Cerrada', className: 'bg-green-100 text-green-700 border-green-200' },
};

const SolicitudesTable = ({ solicitudes, loading, onCerrar }) => {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-sm">Cargando solicitudes...</span>
            </div>
        );
    }

    if (!solicitudes || solicitudes.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <p className="text-sm font-semibold">No hay solicitudes registradas.</p>
            </div>
        );
    }

    const getClienteNombre = (sol) => {
        if (sol.clientes?.nombre) return sol.clientes.nombre;
        if (sol.cliente_nombre) return `${sol.cliente_nombre}${sol.cliente_telefono ? ` (${sol.cliente_telefono})` : ''}`;
        return '—';
    };

    const getProductoNombre = (sol) => {
        if (sol.productos) return `${sol.productos.codigo} — ${sol.productos.descripcion}`;
        if (sol.producto_texto) return sol.producto_texto;
        return '—';
    };

    return (
        <ScrollArea className="border rounded-lg shadow-sm bg-white">
            <Table>
                <TableHeader className="bg-gray-50/80">
                    <TableRow className="h-9">
                        <TableHead className="text-[11px] uppercase font-bold text-gray-500 w-[180px]">Cliente</TableHead>
                        <TableHead className="text-[11px] uppercase font-bold text-gray-500">Producto</TableHead>
                        <TableHead className="text-[11px] uppercase font-bold text-gray-500 w-[70px] text-center">Cant.</TableHead>
                        <TableHead className="text-[11px] uppercase font-bold text-gray-500 w-[100px] text-center">Estado</TableHead>
                        <TableHead className="text-[11px] uppercase font-bold text-gray-500 w-[120px]">Fecha</TableHead>
                        <TableHead className="text-[11px] uppercase font-bold text-gray-500 w-[80px] text-center">Acción</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {solicitudes.map((sol) => {
                        const est = estadoConfig[sol.estado] || estadoConfig.abierta;
                        return (
                            <TableRow key={sol.id} className="h-9 hover:bg-gray-50/60 transition-colors">
                                <TableCell className="py-1 px-2 text-xs font-medium">{getClienteNombre(sol)}</TableCell>
                                <TableCell className="py-1 px-2 text-xs">{getProductoNombre(sol)}</TableCell>
                                <TableCell className="py-1 px-2 text-xs text-center">{sol.cantidad_solicitada ?? '—'}</TableCell>
                                <TableCell className="py-1 px-2 text-center">
                                    <Badge variant="outline" className={`text-[10px] ${est.className}`}>
                                        {est.label}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-1 px-2 text-xs text-gray-500">
                                    {new Date(sol.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </TableCell>
                                <TableCell className="py-1 px-2 text-center">
                                    {sol.estado !== 'cerrada' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-green-600 hover:text-green-800 hover:bg-green-50"
                                            onClick={() => onCerrar(sol.id)}
                                            title="Cerrar solicitud"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </ScrollArea>
    );
};

export default SolicitudesTable;
