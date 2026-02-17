import { supabase } from '@/lib/customSupabaseClient';

/**
 * Count unread notifications for a user.
 */
export async function fetchUnreadCount(userId) {
    const { count, error } = await supabase
        .from('notificaciones')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('visto_at', null);

    if (error) throw error;
    return count || 0;
}

/**
 * Fetch recent notifications for a user.
 */
export async function fetchRecent(userId, limit = 10) {
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/**
 * Mark notifications as read.
 */
export async function markAsRead(ids) {
    if (!ids || ids.length === 0) return;

    const { error } = await supabase
        .from('notificaciones')
        .update({ visto_at: new Date().toISOString() })
        .in('id', ids);

    if (error) throw error;
}

/**
 * Subscribe to realtime INSERT events on notificaciones.
 * Returns the channel so the caller can unsubscribe.
 */
export function subscribeRealtime(userId, onInsert) {
    const channel = supabase
        .channel('notificaciones-realtime')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notificaciones',
                filter: `user_id=eq.${userId}`,
            },
            (payload) => {
                onInsert(payload.new);
            }
        )
        .subscribe();

    return channel;
}
