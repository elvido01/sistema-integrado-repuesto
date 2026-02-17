import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
    fetchSolicitudes,
    createSolicitud,
    cerrarSolicitud,
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

    const cerrar = useCallback(async (id) => {
        try {
            await cerrarSolicitud(id);
            toast({ title: 'Solicitud cerrada', description: 'La solicitud ha sido marcada como cerrada.' });
            await refetch();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo cerrar la solicitud.' });
        }
    }, [refetch, toast]);

    return {
        solicitudes,
        loading,
        filtroEstado,
        setFiltroEstado,
        crear,
        cerrar,
        refetch,
    };
};
