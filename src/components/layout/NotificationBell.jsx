import React, { useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNotifications } from '@/hooks/useNotifications';

const NotificationBell = () => {
    const { user } = useAuth();
    const { unreadCount, notifications, panelOpen, togglePanel, setPanelOpen } = useNotifications(user?.id);
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
                    <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden"
                    >
                        {/* Panel Header */}
                        <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 uppercase">Notificaciones</span>
                            {unreadCount > 0 && (
                                <span className="text-[10px] text-red-500 font-semibold">{unreadCount} nueva{unreadCount > 1 ? 's' : ''}</span>
                            )}
                        </div>

                        {/* Notification List */}
                        <ScrollArea className="max-h-72">
                            {notifications.length === 0 ? (
                                <div className="py-8 text-center text-gray-400 text-xs">Sin notificaciones</div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {notifications.map((n) => (
                                        <div
                                            key={n.id}
                                            className={`px-3 py-2.5 hover:bg-gray-50/80 transition-colors ${!n.visto_at ? 'bg-blue-50/40 border-l-2 border-l-blue-400' : ''}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-gray-800 truncate">{n.titulo}</p>
                                                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.mensaje}</p>
                                                </div>
                                                <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">{formatTime(n.created_at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationBell;
