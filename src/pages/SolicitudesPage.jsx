import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, ClipboardList, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/SupabaseAuthContext';

import { useSolicitudes } from '@/hooks/useSolicitudes';
import SolicitudForm from '@/components/solicitudes/SolicitudForm';
import SolicitudesTable from '@/components/solicitudes/SolicitudesTable';

const SolicitudesPage = () => {
    const { user } = useAuth();
    const { solicitudes, loading, filtroEstado, setFiltroEstado, crear, cerrar } = useSolicitudes();
    const [isFormOpen, setIsFormOpen] = useState(false);

    return (
        <div className="bg-gray-100 min-h-screen pb-8">
            <Helmet>
                <title>Solicitudes por Producto Agotado - REPUESTOS MORLA</title>
            </Helmet>

            {/* Blue Header Bar */}
            <div className="bg-morla-blue shadow-md mb-4 border-b-2 border-morla-blue/20">
                <div className="container mx-auto px-4 h-11 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                        <ClipboardList className="w-5 h-5" />
                        <h1 className="font-black tracking-[0.15em] italic uppercase text-base drop-shadow-sm">
                            Solicitudes por Producto Agotado
                        </h1>
                    </div>
                    <Button
                        size="sm"
                        className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-7 text-[10px] font-bold uppercase transition-all"
                        onClick={() => setIsFormOpen(true)}
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
                                        <SelectItem value="notificada" className="text-xs">Notificadas</SelectItem>
                                        <SelectItem value="cerrada" className="text-xs">Cerradas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
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
                        />
                    </div>
                </motion.div>
            </div>

            {/* Form Modal */}
            <SolicitudForm
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={crear}
                userId={user?.id}
            />
        </div>
    );
};

export default SolicitudesPage;
