import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, ClipboardList, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/SupabaseAuthContext';

import { useSolicitudes } from '@/hooks/useSolicitudes';
import SolicitudForm from '@/components/solicitudes/SolicitudForm';
import SolicitudesTable from '@/components/solicitudes/SolicitudesTable';
import { useToast } from '@/components/ui/use-toast';

const SolicitudesPage = () => {
    const { user, profile , empresa} = useAuth();
    const { toast } = useToast();
    const {
        solicitudes, loading, filtroEstado, setFiltroEstado,
        crear, cerrar, marcarComoSolicitado, marcarAvisado, eliminar, actualizar, enviarAPedido
    } = useSolicitudes();

    // Piezas que ya llegaron y falta avisarle al cliente (seguimiento de llegadas)
    const llegadasPendientes = solicitudes.filter(
        (s) => s.estado === 'notificada' && s.available_at && !s.customer_notified_at
    ).length;
    
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
                    {/* Toolbar */}
                    <div className="px-4 py-2.5 border-b bg-gray-50/60 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Filter className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-[11px] font-bold text-gray-500 uppercase">Estado:</span>
                                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                                    <SelectTrigger className="h-7 w-[140px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="todas" className="text-xs">Todas</SelectItem>
                                        <SelectItem value="abierta" className="text-xs">Abiertas</SelectItem>
                                        <SelectItem value="solicitado" className="text-xs">Solicitadas</SelectItem>
                                        <SelectItem value="llegadas" className="text-xs">📦 Llegaron (avisar cliente)</SelectItem>
                                        <SelectItem value="cerrada" className="text-xs">Cerradas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {llegadasPendientes > 0 && filtroEstado !== 'llegadas' && (
                                <Button
                                    size="sm"
                                    className="h-7 text-[11px] font-bold uppercase bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                                    onClick={() => setFiltroEstado('llegadas')}
                                    title="Piezas que llegaron y falta avisarle al cliente"
                                >
                                    📦 Llegaron {llegadasPendientes} — avisar cliente
                                </Button>
                            )}
                        </div>
                        <span className="text-[11px] text-gray-400">
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
