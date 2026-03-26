import React from 'react';
import { CheckCircle, Loader2, ShoppingCart, Trash2, Send } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const estadoConfig = {
    abierta: { label: 'Abierta', className: 'bg-red-100 text-red-700 border-red-200' },
    notificada: { label: 'Notificada', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    solicitado: { label: 'Solicitado', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    cerrada: { label: 'Cerrada', className: 'bg-green-100 text-green-700 border-green-200' },
};

const SolicitudesTable = ({ solicitudes, loading, onCerrar, onMarcarSolicitado, onEliminar, onEdit, onEnviarPedido }) => {
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
        let text = '—';
        if (sol.productos) {
            text = `${sol.productos.codigo} — ${sol.productos.descripcion}`;
        } else if (sol.producto_texto) {
            text = sol.producto_texto;
        }

        if (sol.notas) {
            text += ` — ${sol.notas}`;
        }
        return text;
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
                        <TableHead className="text-[11px] uppercase font-bold text-gray-500 w-[130px] text-center">Acción</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {solicitudes.map((sol) => {
                        const est = estadoConfig[sol.estado] || estadoConfig.abierta;
                        return (
                            <TableRow 
                                key={sol.id} 
                                className="h-9 hover:bg-gray-50/60 transition-colors cursor-pointer"
                                onDoubleClick={() => onEdit && onEdit(sol)}
                                title="Doble clic para editar"
                            >
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
                                    <div className="flex items-center justify-center gap-1">
                                        {sol.estado === 'abierta' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                                onClick={(e) => { e.stopPropagation(); onMarcarSolicitado(sol.id); }}
                                                title="Marcar como 'Solicitado al suplidor' (Detiene recordatorio)"
                                            >
                                                <ShoppingCart className="w-4 h-4" />
                                            </Button>
                                        )}
                                        {sol.estado === 'notificada' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                                                onClick={(e) => { e.stopPropagation(); onEnviarPedido(sol); }}
                                                title="Enviar a Pedidos (Facturación)"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                        {sol.estado !== 'cerrada' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-green-600 hover:text-green-800 hover:bg-green-50"
                                                onClick={(e) => { e.stopPropagation(); onCerrar(sol.id); }}
                                                title="Finalizar (Marcar Cerrada)"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={(e) => { e.stopPropagation(); onEliminar(sol.id); }}
                                            title="Eliminar solicitud"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
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
