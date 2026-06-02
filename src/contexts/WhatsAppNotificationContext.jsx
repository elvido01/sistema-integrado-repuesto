import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const WhatsAppNotificationContext = createContext(null);

const storageKeyFor = (userId) => `whatsapp-crm-unread:${userId || 'anon'}`;
const soundStorageKeyFor = (userId) => `whatsapp-crm-sound:${userId || 'anon'}`;

export const WhatsAppNotificationProvider = ({ children }) => {
  const { user, tenantId } = useAuth();
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef(null);
  const activeConversationIdRef = useRef(null);
  const windowFocusedRef = useRef(typeof document === 'undefined' ? true : document.hasFocus());
  const notifiedMessageIdsRef = useRef(new Set());
  const audioUnlockedRef = useRef(false);
  const totalUnread = useMemo(
    () => Object.values(unreadByConversation).reduce((sum, count) => sum + Number(count || 0), 0),
    [unreadByConversation]
  );

  useEffect(() => {
    if (!user?.id) {
      setUnreadByConversation({});
      setSoundEnabled(true);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKeyFor(user.id));
      setUnreadByConversation(saved ? JSON.parse(saved) : {});
      const savedSound = localStorage.getItem(soundStorageKeyFor(user.id));
      setSoundEnabled(savedSound === null ? true : savedSound === 'true');
    } catch {
      setUnreadByConversation({});
      setSoundEnabled(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(storageKeyFor(user.id), JSON.stringify(unreadByConversation));
  }, [unreadByConversation, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(soundStorageKeyFor(user.id), String(soundEnabled));
  }, [soundEnabled, user?.id]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = totalUnread > 0 ? `(${totalUnread}) Motoflow CRM` : 'Motoflow CRM';
  }, [totalUnread]);

  const setActiveConversationId = useCallback((conversationId) => {
    activeConversationIdRef.current = conversationId || null;
  }, []);

  const syncUnreadCounts = useCallback((conversations = []) => {
    setUnreadByConversation(prev => {
      const next = { ...prev };
      conversations.forEach(conv => {
        if (!conv?.id || typeof conv.unread_count === 'undefined') return;
        const count = Number(conv.unread_count || 0);
        if (count > 0) next[conv.id] = Math.max(Number(next[conv.id] || 0), count);
        else delete next[conv.id];
      });
      return next;
    });
  }, []);

  const markConversationRead = useCallback((conversationId) => {
    if (!conversationId) return;
    setUnreadByConversation(prev => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    supabase
      .from('crm_whatsapp_conversations')
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq('id', conversationId)
      .then(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadByConversation({});
  }, []);

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      return audioContextRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleFocus = () => { windowFocusedRef.current = true; };
    const handleBlur = () => { windowFocusedRef.current = false; };
    const handleVisibilityChange = () => {
      windowFocusedRef.current = !document.hidden && document.hasFocus();
    };
    const unlockAudio = async () => {
      if (audioUnlockedRef.current) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') await ctx.resume();
        audioUnlockedRef.current = true;
      } catch {}
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [getAudioContext]);

  const playNotificationSound = useCallback(async ({ force = false } = {}) => {
    if ((!soundEnabled && !force) || typeof window === 'undefined') return false;
    try {
      const ctx = getAudioContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();

      const playTone = (frequency, start, duration, peak = 0.12) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.02);
      };

      playTone(740, 0, 0.13, 0.1);
      playTone(980, 0.11, 0.18, 0.12);
      return true;
    } catch {
      return false;
    }
  }, [getAudioContext, soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      if (next) {
        playNotificationSound({ force: true });
      }
      return next;
    });
  }, [playNotificationSound]);

  useEffect(() => {
    if (!tenantId) return undefined;

    const whatsappChannel = supabase
      .channel(`whatsapp-global-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crm_whatsapp_messages',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const message = payload.new || {};
          if (message.role !== 'user' || !message.conversation_id) return;
          if (message.id && notifiedMessageIdsRef.current.has(message.id)) return;
          if (message.id) notifiedMessageIdsRef.current.add(message.id);

          const isActiveAndFocused = activeConversationIdRef.current === message.conversation_id && windowFocusedRef.current;
          if (isActiveAndFocused) {
            markConversationRead(message.conversation_id);
            return;
          }

          setUnreadByConversation(prev => ({
            ...prev,
            [message.conversation_id]: (prev[message.conversation_id] || 0) + 1,
          }));
          playNotificationSound();
        }
      )
      .subscribe();

    const salesChannel = supabase
      .channel(`sales-hub-global-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sales_messages',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const message = payload.new || {};
          if (message.sender_type !== 'user' || !message.conversation_id) return;
          if ((message.platform || 'whatsapp') === 'whatsapp') return;
          if (message.id && notifiedMessageIdsRef.current.has(message.id)) return;
          if (message.id) notifiedMessageIdsRef.current.add(message.id);

          const isActiveAndFocused = activeConversationIdRef.current === message.conversation_id && windowFocusedRef.current;
          if (isActiveAndFocused) {
            markConversationRead(message.conversation_id);
            return;
          }

          setUnreadByConversation(prev => ({
            ...prev,
            [message.conversation_id]: (prev[message.conversation_id] || 0) + 1,
          }));
          playNotificationSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(whatsappChannel);
      supabase.removeChannel(salesChannel);
    };
  }, [markConversationRead, playNotificationSound, tenantId]);

  const value = useMemo(() => ({
    unreadByConversation,
    totalUnread,
    soundEnabled,
    markConversationRead,
    markAllRead,
    setActiveConversationId,
    syncUnreadCounts,
    toggleSound,
    playNotificationSound,
  }), [unreadByConversation, totalUnread, soundEnabled, markConversationRead, markAllRead, setActiveConversationId, syncUnreadCounts, toggleSound, playNotificationSound]);

  return (
    <WhatsAppNotificationContext.Provider value={value}>
      {children}
    </WhatsAppNotificationContext.Provider>
  );
};

export const useWhatsAppNotifications = () => {
  const context = useContext(WhatsAppNotificationContext);
  if (!context) {
    return {
      unreadByConversation: {},
      totalUnread: 0,
      soundEnabled: true,
      markConversationRead: () => {},
      markAllRead: () => {},
      setActiveConversationId: () => {},
      syncUnreadCounts: () => {},
      toggleSound: () => {},
      playNotificationSound: () => false,
    };
  }
  return context;
};
