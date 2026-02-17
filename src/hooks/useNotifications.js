import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
    fetchUnreadCount,
    fetchRecent,
    markAsRead,
    subscribeRealtime,
} from '@/services/notificationsService';

export const useNotifications = (userId) => {
    const { toast } = useToast();
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [panelOpen, setPanelOpen] = useState(false);
    const channelRef = useRef(null);

    // Fetch unread count
    const refreshCount = useCallback(async () => {
        if (!userId) return;
        try {
            const count = await fetchUnreadCount(userId);
            setUnreadCount(count);
        } catch (err) {
            console.error('[Notifications] Error fetching count:', err);
        }
    }, [userId]);

    // Fetch recent notifications
    const refreshList = useCallback(async () => {
        if (!userId) return;
        try {
            const list = await fetchRecent(userId, 15);
            setNotifications(list);
        } catch (err) {
            console.error('[Notifications] Error fetching list:', err);
        }
    }, [userId]);

    // Mark all visible unread as read
    const markAllAsRead = useCallback(async () => {
        const unreadIds = notifications
            .filter((n) => !n.visto_at)
            .map((n) => n.id);
        if (unreadIds.length === 0) return;

        try {
            await markAsRead(unreadIds);
            setUnreadCount(0);
            setNotifications((prev) =>
                prev.map((n) => (unreadIds.includes(n.id) ? { ...n, visto_at: new Date().toISOString() } : n))
            );
        } catch (err) {
            console.error('[Notifications] Error marking as read:', err);
        }
    }, [notifications]);

    // Toggle panel — when opening, mark as read
    const togglePanel = useCallback(() => {
        setPanelOpen((prev) => {
            const opening = !prev;
            if (opening) {
                refreshList();
                // Small delay so the panel renders before marking as read
                setTimeout(() => markAllAsRead(), 300);
            }
            return opening;
        });
    }, [refreshList, markAllAsRead]);

    // Initial load
    useEffect(() => {
        refreshCount();
        refreshList();
    }, [refreshCount, refreshList]);

    // Realtime subscription
    useEffect(() => {
        if (!userId) return;

        channelRef.current = subscribeRealtime(userId, (newNotif) => {
            // Increment counter
            setUnreadCount((c) => c + 1);
            // Prepend to list
            setNotifications((prev) => [newNotif, ...prev].slice(0, 15));
            // Show toast
            toast({
                title: newNotif.titulo || 'Nueva notificación',
                description: newNotif.mensaje || '',
            });
        });

        return () => {
            if (channelRef.current) {
                channelRef.current.unsubscribe();
            }
        };
    }, [userId, toast]);

    return {
        unreadCount,
        notifications,
        panelOpen,
        togglePanel,
        setPanelOpen,
        refreshCount,
        refreshList,
    };
};
