import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, ClipboardList, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';

import { useSolicitudes } from '@/hooks/useSolicitudes';
import SolicitudForm from '@/components/solicitudes/SolicitudForm';
import SolicitudesTable from '@/components/solicitudes/SolicitudesTable';
import { useToast } from '@/components/ui/use-toast';

const SolicitudesPage = () => {
    const { user, profile , empresa} = useAuth();
    const { toast } = useToast();
    const {
        solicitudes, loading, filtroEstado, setFiltroEstado, llegadasCount,
        crear, cerrar, marcarComoSolicitado, marcarAvisado, eliminar, actualizar, enviarAPedido
    } = useSolicitudes();

    // Pestañas de estado (cuadros en la barra)
    const estadoTabs = [
        { value: 'todas', label: 'Todas' },
        { value: 'abierta', label: 'Abiertas' },
        { value: 'solicitado', label: 'Solicitadas' },
        { value: 'llegadas', label: '📦 Llegaron', llegada: true },
        { value: 'cerrada', label: 'Cerradas' },
    ];
    
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [solicitudEditando, setSolicitudEditando] = useState(null);

    // Recordatorio diario a las 9:00 AM
    useEffect(() => {
        if (loading || solicitudes.length === 0) return;

        const checkDailyReminder = () => {
            const now = new Date();
            // Mostrar después de las 9:00 AM
            if (now.getHours() >= 9) {
                const alreadyNotified = sessionStorage.getItem('solicitudes_reminder_shown');
                if (!alreadyNotified) {
                    const abiertas = solicitudes.filter(s => s.estado === 'abierta');
                    if (abiertas.length > 0) {
                        toast({
                            title: '🔔 Recordatorio de Suplidores',
                            description: `Tienes ${abiertas.length} producto(s) por investigar/solicitar.`,
                            duration: 10000,
                        });
                        sessionStorage.setItem('solicitudes_reminder_shown', 'true');
                    }
                }
            }
        };

        checkDailyReminder();
        // Revisar cada minuto en caso de que dejen la pestaña abierta
        const interval = setInterval(checkDailyReminder, 60000);
        return () => clearInterval(interval);
    }, [solicitudes, loading, toast]);

    const handleEdit = (solicitud) => {
        setSolicitudEditando(solicitud);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setSolicitudEditando(null);
    };

    return (
        <div className="bg-gray-100 min-h-screen pb-8">
            <Helmet>
                <title>Solicitudes por Producto Agotado — {empresa?.nombre || 'Sistema'}</title>
            </Helmet>

            {/* Blue Header Bar */}
            <div className="bg-morla-blue shadow-md mb-4 border-b-2 border-morla-blue/20">
                <div className="container mx-auto px-4 h-11 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                        <ClipboardList className="w-5 h-5" />
                        <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">
                            SOLICITUDES POR PRODUCTO AGOTADO
                        </h1>
                    </div>
                    <Button
                        size="sm"
                        className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-7 text-[10px] font-bold uppercase transition-all"
                        onClick={() => {
                            setSolicitudEditando(null);
                            setIsFormOpen(true);
                        }}
                    >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Nueva Solicitud
                    </Button>
                </div>
            </div>

            <div className="container mx-auto px-4">
                {/* Summary + Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg shadow-lg border overflow-hidden"
                >
                    {/* Toolbar — estados como pestañas/cuadros */}
                    <div className="px-4 py-2.5 border-b bg-gray-50/60 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <Filter className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[11px] font-bold text-gray-500 uppercase mr-1">Estado:</span>
                            {estadoTabs.map((t) => {
                                const active = filtroEstado === t.value;
                                const base = 'inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-bold uppercase border transition-all';
                                const cls = t.llegada
                                    ? (active
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                        : `bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 ${llegadasCount > 0 ? 'animate-pulse' : ''}`)
                                    : (active
                                        ? 'bg-morla-blue text-white border-morla-blue shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100');
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setFiltroEstado(t.value)}
                                        className={`${base} ${cls}`}
                                        title={t.llegada ? 'Piezas que llegaron y falta avisarle al cliente' : undefined}
                                    >
                                        {t.label}
                                        {t.llegada && llegadasCount > 0 && (
                                            <span className={`min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold ${active ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'}`}>
                                                {llegadasCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">
                            {solicitudes.length} registro{solicitudes.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Table */}
                    <div className="p-2">
                        <SolicitudesTable
                            solicitudes={solicitudes}
                            loading={loading}
                            onCerrar={cerrar}
                            onMarcarSolicitado={marcarComoSolicitado}
                            onMarcarAvisado={marcarAvisado}
                            onEliminar={eliminar}
                            onEdit={handleEdit}
                            onEnviarPedido={(sol) => enviarAPedido(sol, profile?.id)}
                        />
                    </div>
                </motion.div>
            </div>

            {/* Form Modal */}
            <SolicitudForm
                isOpen={isFormOpen}
                onClose={handleCloseForm}
                onSave={crear}
                onUpdate={actualizar}
                solicitudEditando={solicitudEditando}
                userId={user?.id}
            />
        </div>
    );
};

export default SolicitudesPage;
