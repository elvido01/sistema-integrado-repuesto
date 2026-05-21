import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessageCircle, Search, Send, Bot, UserRound, Loader2, FileText, UserPlus, RefreshCw, Power, PowerOff, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { usePanels } from '@/contexts/PanelContext';

const scoreStyles = {
  hot: 'bg-red-100 text-red-800 border-red-200',
  warm: 'bg-amber-100 text-amber-800 border-amber-200',
  cold: 'bg-slate-100 text-slate-700 border-slate-200',
  sin_calificar: 'bg-gray-100 text-gray-600 border-gray-200',
};

const scoreLabels = {
  hot: 'Caliente',
  warm: 'Tibio',
  cold: 'Frio',
  sin_calificar: 'Sin calificar',
};

const genericClientId = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';

const WhatsAppCrmPage = () => {
  const { empresa } = useAuth();
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [quoteItems, setQuoteItems] = useState([]);
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_whatsapp_conversations_view')
      .select('*')
      .order('last_message_at', { ascending: false })
      .limit(80);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar WhatsApp CRM.' });
    } else {
      setConversations(data || []);
      if (!selected && data?.length) setSelected(data[0]);
    }
    setLoading(false);
  }, [selected, toast]);

  const fetchDetail = useCallback(async (conversationId) => {
    if (!conversationId) return;
    setDetailLoading(true);
    const [{ data: msgData, error: msgError }, { data: itemData, error: itemError }] = await Promise.all([
      supabase
        .from('crm_whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
      supabase
        .from('crm_whatsapp_quote_items')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false }),
    ]);

    if (msgError || itemError) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la conversacion.' });
    } else {
      setMessages(msgData || []);
      setQuoteItems(itemData || []);
    }
    setDetailLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    fetchDetail(selected?.id);
  }, [selected?.id, fetchDetail]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter(c =>
      String(c.contact_name || '').toLowerCase().includes(term) ||
      String(c.cliente_nombre || '').toLowerCase().includes(term) ||
      String(c.phone || '').includes(term) ||
      String(c.last_message_preview || '').toLowerCase().includes(term)
    );
  }, [conversations, search]);

  const selectedItems = useMemo(() => quoteItems.filter(i => i.selected && i.producto_id), [quoteItems]);
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio_unitario || 0), 0),
    [selectedItems]
  );

  const handleToggleBot = async () => {
    if (!selected) return;
    const next = !selected.bot_enabled;
    const { error } = await supabase
      .from('crm_whatsapp_conversations')
      .update({ bot_enabled: next })
      .eq('id', selected.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cambiar el estado del bot.' });
      return;
    }
    const updated = { ...selected, bot_enabled: next };
    setSelected(updated);
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, bot_enabled: next } : c));
  };

  const handleToggleItem = async (item) => {
    const next = !item.selected;
    setQuoteItems(prev => prev.map(i => i.id === item.id ? { ...i, selected: next } : i));
    const { error } = await supabase
      .from('crm_whatsapp_quote_items')
      .update({ selected: next })
      .eq('id', item.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el item.' });
      setQuoteItems(prev => prev.map(i => i.id === item.id ? { ...i, selected: item.selected } : i));
    }
  };

  const handleSend = async () => {
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    const content = reply.trim();
    setReply('');

    const { data, error } = await supabase.functions.invoke('whatsapp-crm-webhook', {
      body: { action: 'send_message', conversation_id: selected.id, content },
    });

    if (error || data?.ok === false) {
      toast({ variant: 'destructive', title: 'No se envio', description: data?.error || error?.message || 'Revise la configuracion de WhatsApp.' });
      setReply(content);
    } else {
      await fetchDetail(selected.id);
      await fetchConversations();
    }
    setSending(false);
  };

  const ensureCliente = async () => {
    if (selected?.cliente_id) return selected.cliente_id;

    const { data: cliente, error } = await supabase
      .from('clientes')
      .insert({
        nombre: selected?.contact_name || `WhatsApp ${selected?.phone}`,
        telefono: selected?.phone,
        activo: true,
      })
      .select('id')
      .single();
    if (error) throw error;

    await supabase
      .from('crm_whatsapp_contacts')
      .update({ cliente_id: cliente.id })
      .eq('id', selected.contact_id);

    return cliente.id;
  };

  const handleCreateQuote = async () => {
    if (!selected || !selectedItems.length || creatingQuote) return;
    setCreatingQuote(true);

    try {
      const clienteId = await ensureCliente();
      const totals = selectedItems.reduce((acc, item) => {
        const importe = Number(item.cantidad || 0) * Number(item.precio_unitario || 0);
        const itbisPct = Number(item.itbis_pct || 0.18);
        const base = importe / (1 + itbisPct);
        acc.subtotal += base;
        acc.itbis_total += importe - base;
        acc.total_cotizacion += importe;
        return acc;
      }, { subtotal: 0, itbis_total: 0, total_cotizacion: 0 });

      const { data: numero, error: numeroError } = await supabase.rpc('get_next_cotizacion_numero');
      if (numeroError) throw numeroError;

      const today = new Date();
      const due = new Date();
      due.setDate(today.getDate() + 7);

      const { data: cotizacion, error: cotError } = await supabase
        .from('cotizaciones')
        .insert({
          numero,
          fecha_cotizacion: today.toISOString().slice(0, 10),
          fecha_vencimiento: due.toISOString().slice(0, 10),
          cliente_id: clienteId || genericClientId,
          subtotal: totals.subtotal,
          descuento_total: 0,
          itbis_total: totals.itbis_total,
          total_cotizacion: totals.total_cotizacion,
          estado: 'Pendiente',
          notas: `Generada desde WhatsApp CRM (${selected.phone}).`,
        })
        .select('id, numero')
        .single();
      if (cotError) throw cotError;

      const detalles = selectedItems.map(item => {
        const importe = Number(item.cantidad || 0) * Number(item.precio_unitario || 0);
        const itbisPct = Number(item.itbis_pct || 0.18);
        const base = importe / (1 + itbisPct);
        return {
          cotizacion_id: cotizacion.id,
          producto_id: item.producto_id,
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: Number(item.cantidad || 1),
          unidad: 'UND',
          precio_unitario: Number(item.precio_unitario || 0),
          descuento_pct: 0,
          descuento_valor: 0,
          itbis_valor: importe - base,
          importe,
        };
      });

      const { error: detailError } = await supabase.from('cotizaciones_detalle').insert(detalles);
      if (detailError) throw detailError;

      await supabase
        .from('crm_whatsapp_conversations')
        .update({ status: 'cotizando', cotizacion_id: cotizacion.id })
        .eq('id', selected.id);

      toast({ title: 'Cotizacion creada', description: `Se genero la cotizacion #${cotizacion.numero}.` });
      await fetchConversations();
      await fetchDetail(selected.id);
      openPanel('cotizaciones');
    } catch (error) {
      console.error('[WhatsApp CRM] create quote', error);
      toast({ variant: 'destructive', title: 'No se pudo crear la cotizacion', description: error.message });
    } finally {
      setCreatingQuote(false);
    }
  };

  const renderConversationName = (conv) => conv.cliente_nombre || conv.contact_name || conv.phone;

  return (
    <>
      <Helmet>
        <title>WhatsApp CRM - {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <div className="h-full min-h-0 bg-slate-50 p-3">
        <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3">
          <aside className="min-h-0 bg-white border rounded-lg flex flex-col">
            <div className="p-3 border-b">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  <h1 className="text-lg font-black text-slate-900">WhatsApp CRM</h1>
                </div>
                <Button variant="ghost" size="icon" onClick={fetchConversations} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-8" placeholder="Buscar cliente, telefono o mensaje" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="h-40 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                </div>
              ) : filteredConversations.length ? (
                filteredConversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelected(conv)}
                    className={`w-full text-left p-3 border-b hover:bg-slate-50 ${selected?.id === conv.id ? 'bg-emerald-50' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate">{renderConversationName(conv)}</p>
                        <p className="text-xs text-slate-500">{conv.phone}</p>
                      </div>
                      <Badge className={`shrink-0 border ${scoreStyles[conv.lead_score] || scoreStyles.sin_calificar}`}>
                        {scoreLabels[conv.lead_score] || conv.lead_score}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 line-clamp-2">{conv.last_message_preview || 'Sin mensajes'}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{conv.quote_items_count ? `${conv.quote_items_count} item(s) sugeridos` : 'Sin items'}</span>
                      <span>{conv.last_message_at ? format(new Date(conv.last_message_at), 'dd/MM HH:mm', { locale: es }) : ''}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-6 text-sm text-slate-500 text-center">No hay conversaciones.</div>
              )}
            </div>
          </aside>

          <main className="min-h-0 bg-white border rounded-lg flex flex-col">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-slate-500">Selecciona una conversacion.</div>
            ) : (
              <>
                <div className="p-3 border-b flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-slate-900 truncate">{renderConversationName(selected)}</h2>
                      {selected.cotizacion_id && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Cotizada</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">{selected.phone} {selected.intent ? `- ${selected.intent}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleToggleBot}>
                      {selected.bot_enabled ? <Power className="h-4 w-4 mr-2 text-emerald-600" /> : <PowerOff className="h-4 w-4 mr-2 text-red-600" />}
                      Bot {selected.bot_enabled ? 'ON' : 'OFF'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCreateQuote} disabled={!selectedItems.length || creatingQuote}>
                      {creatingQuote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                      Crear cotizacion
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 grid grid-cols-1 xl:grid-cols-[1fr_360px]">
                  <section className="min-h-0 flex flex-col border-r">
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 bg-slate-50">
                      {detailLoading ? (
                        <div className="h-40 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {messages.map(message => {
                            const mine = message.role === 'assistant' || message.role === 'agent';
                            return (
                              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[78%] rounded-lg border px-3 py-2 ${mine ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-900 border-slate-200'}`}>
                                  <div className="flex items-center gap-1 mb-1 opacity-80">
                                    {message.role === 'assistant' ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                                    <span className="text-[10px] uppercase font-bold">{message.role}</span>
                                    <span className="text-[10px]">{format(new Date(message.created_at), 'dd/MM HH:mm', { locale: es })}</span>
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                  {mine && <p className="text-[10px] mt-1 opacity-75">{message.status}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-3 border-t bg-white">
                      <div className="flex gap-2">
                        <Textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Responder por WhatsApp..."
                          className="min-h-[44px] max-h-28"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
                        />
                        <Button className="self-end" onClick={handleSend} disabled={!reply.trim() || sending}>
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </section>

                  <aside className="min-h-0 flex flex-col bg-white">
                    <div className="p-3 border-b">
                      <h3 className="text-sm font-black text-slate-900">Items para cotizar</h3>
                      <p className="text-xs text-slate-500">Selecciona lo detectado en la conversacion.</p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                      {quoteItems.length ? quoteItems.map(item => (
                        <div key={item.id} className="border rounded-lg p-3">
                          <div className="flex gap-2">
                            <Checkbox checked={item.selected} onCheckedChange={() => handleToggleItem(item)} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-mono text-slate-500">{item.codigo || 'SIN CODIGO'}</p>
                              <p className="text-sm font-bold text-slate-900 leading-tight">{item.descripcion}</p>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <span>Existencia: <strong>{Number(item.existencia || 0).toLocaleString('en-US')}</strong></span>
                                <span>Precio: <strong>RD$ {Number(item.precio_unitario || 0).toFixed(2)}</strong></span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="py-10 text-center text-sm text-slate-500">
                          <UserPlus className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                          Los productos detectados apareceran aqui.
                        </div>
                      )}
                    </div>
                    <div className="p-3 border-t bg-slate-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Total seleccionado</span>
                        <strong className="text-lg text-slate-900">RD$ {selectedTotal.toFixed(2)}</strong>
                      </div>
                      <Button className="w-full" onClick={handleCreateQuote} disabled={!selectedItems.length || creatingQuote}>
                        {creatingQuote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                        Crear cotizacion
                      </Button>
                    </div>
                  </aside>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
};

export default WhatsAppCrmPage;
