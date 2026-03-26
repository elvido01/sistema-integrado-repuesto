import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
    fetchSolicitudes,
    createSolicitud,
    cerrarSolicitud,
    marcarSolicitado,
    eliminarSolicitud,
    updateSolicitud,
    enviarSolicitudAPedido
} from '@/services/solicitudesService';

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
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las solicitudes.' });
        } finally {
            setLoading(false);
        }
    }, [filtroEstado, toast]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const crear = useCallback(async (payload) => {
        try {
            await createSolicitud(payload);
            toast({ title: 'Éxito', description: 'Solicitud registrada correctamente.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo crear la solicitud.' });
            throw err;
        }
    }, [refetch, toast]);

    const actualizar = useCallback(async (id, payload) => {
        try {
            await updateSolicitud(id, payload);
            toast({ title: 'Éxito', description: 'Solicitud actualizada correctamente.' });
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
            toast({ title: 'Enviado a Pedidos', description: 'Se generó un pedido listo para la facturación.' });
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
        eliminar,
        actualizar,
        enviarAPedido,
        refetch,
    };
};
