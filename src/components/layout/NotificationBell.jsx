import React, { useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { usePanels } from '@/contexts/PanelContext';

const NotificationBell = () => {
    const { user } = useAuth();
    const { unreadCount, notifications, panelOpen, togglePanel, setPanelOpen } = useNotifications(user?.id);
    const { openPanel } = usePanels();

    // Navigate to the relevant module on double-click
    const handleDoubleClick = (notif) => {
        if (notif.tipo === 'credito_vencido' && notif.cliente_id) {
            openPanel('recibo-ingreso', { clienteId: notif.cliente_id });
            setPanelOpen(false);
        } else if (notif.tipo === 'resumen_diario' || notif.tipo === 'stock_disponible') {
            openPanel('solicitudes');
            setPanelOpen(false);
        } else if (notif.tipo === 'resumen_ai_ceo') {
            openPanel('ai-ceo');
            setPanelOpen(false);
        }
    };
    const panelRef = useRef(null);

    // Close panel on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (panelOpen && panelRef.current && !panelRef.current.contains(e.target)) {
                setPanelOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [panelOpen, setPanelOpen]);

    const formatTime = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Ahora';
        if (diffMin < 60) return `hace ${diffMin}m`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return `hace ${diffHrs}h`;
        return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
    };

    return (
        <div className="relative" ref={panelRef}>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 relative"
                onClick={togglePanel}
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <motion.span
                        key={unreadCount}
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-red-500 rounded-full shadow-sm"
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </motion.span>
                )}
            </Button>

            <AnimatePresence>
                {panelOpen && (
                    <>
                        {/* Backdrop to help focus and close */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/10 z-[100]"
                            onClick={() => setPanelOpen(false)}
                        />
                        
                        <motion.div
                            initial={{ opacity: 0, y: -20, x: '-50%', scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
                            exit={{ opacity: 0, y: -20, x: '-50%', scale: 0.95 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="fixed top-20 left-1/2 w-[90%] max-w-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[101] overflow-hidden"
                        >
                            {/* Panel Header */}
                            <div className="px-4 py-3 border-b dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider text-center flex-1">
                                    Notificaciones
                                </span>
                                {unreadCount > 0 && (
                                    <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold ml-2">
                                        {unreadCount}
                                    </span>
                                )}
                            </div>

                            {/* Notification List */}
                            <ScrollArea className="max-h-[60vh]">
                                {notifications.length === 0 ? (
                                    <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm italic">
                                        Sin notificaciones nuevas
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {notifications.map((n) => (
                                            <div
                                                key={n.id}
                                                onDoubleClick={() => handleDoubleClick(n)}
                                                title={
                                                    n.tipo === 'credito_vencido' ? 'Doble clic para abrir Recibo de Ingreso'
                                                    : n.tipo === 'resumen_ai_ceo' ? 'Doble clic para abrir MORLA AI CEO'
                                                    : 'Doble clic para ir al módulo'
                                                }
                                                className={`px-4 py-3.5 hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer select-none ${
                                                    !n.visto_at
                                                        ? (n.tipo === 'credito_vencido'
                                                            ? 'bg-red-50/40 dark:bg-red-900/10 border-l-4 border-l-red-500'
                                                            : n.tipo === 'resumen_ai_ceo'
                                                            ? 'bg-violet-50/40 dark:bg-violet-900/10 border-l-4 border-l-violet-500'
                                                            : 'bg-blue-50/30 dark:bg-blue-900/10 border-l-4 border-l-morla-blue')
                                                        : 'pl-[19px]'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight mb-1">{n.titulo}</p>
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed font-medium">{n.mensaje}</p>
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap mt-0.5 font-bold uppercase">{formatTime(n.created_at)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                            
                            {/* Footer / Close Button */}
                            <div className="p-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-center">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-700 dark:text-gray-400 h-7"
                                    onClick={() => setPanelOpen(false)}
                                >
                                    Cerrar Panel
                                </Button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationBell;
