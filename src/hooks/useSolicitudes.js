import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
    fetchSolicitudes,
    createSolicitud,
    cerrarSolicitud,
    marcarSolicitado,
    marcarClienteAvisado,
    eliminarSolicitud,
    updateSolicitud,
    enviarSolicitudAPedido
} from '@/services/solicitudesService';

const buildCreateMessage = (result) => {
    const rows = result?.results || [];
    if (!rows.length) return 'Solicitud registrada correctamente.';

    const purchaseOk = rows.filter((row) => row.purchase?.ok).length;
    const missingSupplier = rows.filter((row) => row.purchase?.missing_supplier).length;
    const skipped = rows.filter((row) => row.purchase?.skipped || row.purchase?.reason === 'producto_libre').length;
    const duplicated = rows.filter((row) => row.duplicate).length;

    return [
        duplicated ? 'Solicitud existente actualizada.' : 'Solicitud registrada correctamente.',
        purchaseOk ? `${purchaseOk} producto(s) enviado(s) a orden de compra.` : null,
        missingSupplier ? `${missingSupplier} producto(s) sin suplidor asignado.` : null,
        skipped ? `${skipped} producto(s) libre(s) sin orden de compra.` : null,
    ].filter(Boolean).join(' ');
};

export const useSolicitudes = () => {
    const { toast } = useToast();
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroEstado, setFiltroEstado] = useState('todas');

    const refetch = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchSolicitudes(filtroEstado);
            setSolicitudes(data);
        } catch (err) {
            console.error('[useSolicitudes] fetchSolicitudes error:', err);
            setSolicitudes([]);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: err?.message || 'No se pudieron cargar las solicitudes.',
            });
        } finally {
            setLoading(false);
        }
    }, [filtroEstado, toast]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const crear = useCallback(async (payload) => {
        try {
            const result = await createSolicitud(payload);
            toast({ title: 'Exito', description: buildCreateMessage(result) });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo crear la solicitud.' });
            throw err;
        }
    }, [refetch, toast]);

    const actualizar = useCallback(async (id, payload) => {
        try {
            await updateSolicitud(id, payload);
            toast({ title: 'Exito', description: 'Solicitud actualizada correctamente.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo actualizar la solicitud.' });
            throw err;
        }
    }, [refetch, toast]);

    const cerrar = useCallback(async (id) => {
        try {
            await cerrarSolicitud(id);
            toast({ title: 'Solicitud cerrada', description: 'La solicitud ha sido marcada como cerrada.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo cerrar la solicitud.' });
        }
    }, [refetch, toast]);

    const marcarComoSolicitado = useCallback(async (id) => {
        try {
            await marcarSolicitado(id);
            toast({ title: 'Solicitud marcada', description: 'Producto marcado como solicitado al suplidor.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo marcar la solicitud.' });
        }
    }, [refetch, toast]);

    const marcarAvisado = useCallback(async (id) => {
        try {
            await marcarClienteAvisado(id);
            toast({ title: 'Cliente avisado', description: 'Marcado: ya le avisaste al cliente que llegó su pieza.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo marcar como avisado.' });
        }
    }, [refetch, toast]);

    const eliminar = useCallback(async (id) => {
        try {
            await eliminarSolicitud(id);
            toast({ title: 'Solicitud eliminada', description: 'La solicitud fue borrada.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo borrar la solicitud.' });
        }
    }, [refetch, toast]);

    const enviarAPedido = useCallback(async (solicitud, userId) => {
        try {
            await enviarSolicitudAPedido(solicitud, userId);
            toast({ title: 'Enviado a Pedidos', description: 'Se genero un pedido listo para la facturacion.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo enviar a pedidos.' });
        }
    }, [refetch, toast]);

    return {
        solicitudes,
        loading,
        filtroEstado,
        setFiltroEstado,
        crear,
        cerrar,
        marcarComoSolicitado,
        marcarAvisado,
        eliminar,
        actualizar,
        enviarAPedido,
        refetch,
    };
};
