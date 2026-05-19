// ============================================================
// AiCeoChat.jsx — Chat conversacional con el AI CEO
// ============================================================
// Sesiones persistidas en ai_chat_sessions / ai_chat_messages.
// Backend: edge function motoflow-ai-chat.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Brain, Loader2, Plus, MessageSquare, Sparkles, User as UserIcon } from 'lucide-react';

const SUGGESTED_PROMPTS = [
    '¿Cuál es el mayor riesgo del negocio ahora mismo?',
    '¿Qué productos debo dejar de comprar?',
    '¿Qué clientes debo revisar esta semana?',
    '¿Qué decisiones debo tomar hoy?',
    'Dame mi resumen ejecutivo del día',
    '¿Qué puedo hacer para mejorar el margen?',
];

export default function AiCeoChat() {
    const { tenantId, user } = useAuth();
    const { toast } = useToast();
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const bottomRef = useRef(null);

    // Cargar lista de sesiones
    const cargarSesiones = useCallback(async () => {
        if (!tenantId) return;
        const { data } = await supabase
            .from('ai_chat_sessions')
            .select('id, title, created_at, updated_at')
            .eq('tenant_id', tenantId)
            .eq('archived', false)
            .order('updated_at', { ascending: false })
            .limit(30);
        setSessions(data || []);
    }, [tenantId]);

    // Cargar mensajes de la sesión activa
    const cargarMensajes = useCallback(async () => {
        if (!activeSessionId) { setMessages([]); return; }
        setLoadingHistory(true);
        const { data } = await supabase
            .from('ai_chat_messages')
            .select('id, role, content, created_at, cost_usd')
            .eq('session_id', activeSessionId)
            .order('created_at', { ascending: true });
        setMessages(data || []);
        setLoadingHistory(false);
    }, [activeSessionId]);

    useEffect(() => { cargarSesiones(); }, [cargarSesiones]);
    useEffect(() => { cargarMensajes(); }, [cargarMensajes]);

    useEffect(() => {
        // Scroll al fondo cuando llegan nuevos mensajes
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, sending]);

    const enviar = async (text) => {
        const message = (text || input || '').trim();
        if (!message || sending) return;
        setSending(true);

        // Push mensaje user optimisticamente
        const tempUserMsg = { id: 'temp-' + Date.now(), role: 'user', content: message, created_at: new Date().toISOString() };
        setMessages((prev) => [...prev, tempUserMsg]);
        setInput('');

        try {
            const { data, error } = await supabase.functions.invoke('motoflow-ai-chat', {
                body: { message, session_id: activeSessionId },
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || 'falla agente');

            // Si era sesión nueva, guardar el ID y refrescar lista
            if (!activeSessionId && data.session_id) {
                setActiveSessionId(data.session_id);
                await cargarSesiones();
            }

            // Recargar mensajes (incluye el temp + respuesta del LLM)
            await cargarMensajes();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
            setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        } finally {
            setSending(false);
        }
    };

    const nuevaSession = () => {
        setActiveSessionId(null);
        setMessages([]);
        setInput('');
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviar();
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex h-[calc(100vh-300px)] min-h-[500px]">
            {/* Sidebar de sesiones */}
            <div className="w-56 border-r border-slate-200 flex flex-col bg-slate-50">
                <div className="p-2 border-b border-slate-200">
                    <Button
                        size="sm"
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white h-9"
                        onClick={nuevaSession}
                    >
                        <Plus className="h-4 w-4 mr-1" /> Nueva conversación
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-1">
                    {sessions.length === 0 ? (
                        <div className="p-3 text-[11px] text-slate-400 italic text-center">
                            Sin conversaciones aún.
                        </div>
                    ) : (
                        sessions.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSessionId(s.id)}
                                className={`w-full text-left px-2 py-2 rounded text-xs mb-0.5 truncate flex items-start gap-1.5 ${
                                    activeSessionId === s.id
                                        ? 'bg-violet-100 text-violet-900 font-semibold'
                                        : 'hover:bg-slate-100 text-slate-700'
                                }`}
                            >
                                <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                <span className="truncate">{s.title || 'Sin título'}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Conversación */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                    <div className="bg-gradient-to-br from-violet-500 to-blue-600 text-white p-1.5 rounded">
                        <Brain className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">Asesor Ejecutivo IA</h3>
                        <p className="text-[10px] text-slate-500">Pregúntame lo que necesites sobre tu negocio</p>
                    </div>
                </div>

                {/* Mensajes */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/30">
                    {loadingHistory ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-6 space-y-3">
                            <Sparkles className="h-8 w-8 mx-auto text-violet-400" />
                            <p className="text-sm text-slate-600 font-medium">¿Sobre qué necesitas asesoría?</p>
                            <p className="text-[11px] text-slate-400">El asesor responde con datos reales del negocio en tiempo real.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4 max-w-2xl mx-auto">
                                {SUGGESTED_PROMPTS.map((p, i) => (
                                    <button
                                        key={i}
                                        onClick={() => enviar(p)}
                                        className="text-left text-xs px-3 py-2 bg-white border border-slate-200 rounded hover:bg-violet-50 hover:border-violet-300 transition-colors"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {m.role === 'assistant' && (
                                    <div className="flex-shrink-0 bg-gradient-to-br from-violet-500 to-blue-600 text-white p-1.5 rounded-full self-start">
                                        <Brain className="h-3.5 w-3.5" />
                                    </div>
                                )}
                                <div
                                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                                        m.role === 'user'
                                            ? 'bg-violet-600 text-white'
                                            : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                                    }`}
                                >
                                    {m.content}
                                    {m.cost_usd != null && (
                                        <div className="text-[9px] opacity-50 mt-1 text-right">
                                            ${Number(m.cost_usd).toFixed(4)}
                                        </div>
                                    )}
                                </div>
                                {m.role === 'user' && (
                                    <div className="flex-shrink-0 bg-slate-300 p-1.5 rounded-full self-start">
                                        <UserIcon className="h-3.5 w-3.5 text-slate-700" />
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {sending && (
                        <div className="flex gap-2 justify-start">
                            <div className="bg-gradient-to-br from-violet-500 to-blue-600 text-white p-1.5 rounded-full">
                                <Brain className="h-3.5 w-3.5" />
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-slate-200 bg-white">
                    <div className="flex gap-2 items-end">
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Pregúntale al asesor… (Enter para enviar, Shift+Enter para nueva línea)"
                            className="flex-1 h-14 text-sm resize-none"
                            disabled={sending}
                            maxLength={1000}
                        />
                        <Button
                            className="bg-violet-600 hover:bg-violet-700 text-white h-14 px-4"
                            onClick={() => enviar()}
                            disabled={sending || !input.trim()}
                        >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 italic">
                        💡 El asesor consulta el estado real del negocio. No ejecuta acciones — solo recomienda.
                    </div>
                </div>
            </div>
        </div>
    );
}
