import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessageCircle, Search, Send, Bot, UserRound, Loader2, FileText, RefreshCw, Power, PowerOff, CheckCircle2, QrCode, Smartphone, X, Wifi, WifiOff, PlusCircle, Trash2, Share2, Image as ImageIcon, PackagePlus, Mic, Square, Volume2, VolumeX, ChevronUp, ChevronDown, Clock3, CreditCard, Ban, ShoppingCart, AlertTriangle, CalendarClock, CheckCheck, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, SlidersHorizontal, MoreVertical, Edit3, Instagram, Facebook, Inbox, UserPlus, Handshake, MapPin, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { invocarConSesion } from '@/lib/edgeInvoke';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import NewManualConversationModal from '@/components/whatsapp/NewManualConversationModal';
import { Label } from '@/components/ui/label';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { useWhatsAppNotifications } from '@/contexts/WhatsAppNotificationContext';
import { usePanels } from '@/contexts/PanelContext';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { useLayout } from '@/contexts/LayoutContext';

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

const conversationStatusStyles = {
  abierta: 'bg-slate-100 text-slate-700 border-slate-200',
  nuevo: 'bg-blue-100 text-blue-800 border-blue-200',
  en_atencion: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  esperando_cliente: 'bg-amber-100 text-amber-800 border-amber-200',
  cotizando: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  cotizacion_enviada: 'bg-violet-100 text-violet-800 border-violet-200',
  cliente_interesado: 'bg-orange-100 text-orange-800 border-orange-200',
  pendiente_pago: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  listo_facturar: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  venta_cerrada: 'bg-green-100 text-green-800 border-green-200',
  venta_perdida: 'bg-red-100 text-red-800 border-red-200',
  producto_agotado: 'bg-rose-100 text-rose-800 border-rose-200',
  seguimiento_futuro: 'bg-purple-100 text-purple-800 border-purple-200',
  seguimiento: 'bg-purple-100 text-purple-800 border-purple-200',
  pendiente_revision: 'bg-amber-100 text-amber-800 border-amber-200',
  cerrado: 'bg-green-100 text-green-800 border-green-200',
  perdido: 'bg-red-100 text-red-800 border-red-200',
  cerrada: 'bg-green-100 text-green-800 border-green-200',
};

const conversationStatusLabels = {
  abierta: 'Abierta',
  nuevo: 'Nuevo',
  en_atencion: 'En atencion',
  esperando_cliente: 'Esperando cliente',
  cotizando: 'Cotizando',
  cotizacion_enviada: 'Cotizacion enviada',
  cliente_interesado: 'Interesado',
  pendiente_pago: 'Pendiente de pago',
  listo_facturar: 'Listo para facturar',
  venta_cerrada: 'Venta cerrada',
  venta_perdida: 'Venta perdida',
  producto_agotado: 'Producto agotado',
  seguimiento_futuro: 'Seguimiento futuro',
  seguimiento: 'Seguimiento',
  pendiente_revision: 'Pendiente revision',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
  cerrada: 'Cerrada',
};

const channelMeta = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  instagram: { label: 'Instagram', icon: Instagram, className: 'bg-pink-100 text-pink-800 border-pink-200' },
  facebook: { label: 'Facebook', icon: Facebook, className: 'bg-blue-100 text-blue-800 border-blue-200' },
  youtube: { label: 'YouTube', icon: MessageCircle, className: 'bg-red-100 text-red-800 border-red-200' },
};

const salesTabs = [
  { value: 'all', label: 'Todos', icon: Inbox },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'unread', label: 'No leidos', icon: CheckCircle2 },
  { value: 'instagram', label: 'Instagram', icon: Instagram },
  { value: 'facebook', label: 'Facebook', icon: Facebook },
  { value: 'followups', label: 'Seguimientos', icon: CalendarClock },
  { value: 'quotes', label: 'Cotizaciones', icon: FileText },
];

const toSalesStatus = (status) => ({
  abierta: 'nuevo',
  nuevo: 'nuevo',
  en_atencion: 'en_atencion',
  esperando_cliente: 'esperando_cliente',
  cotizando: 'cotizando',
  cotizacion_enviada: 'cotizacion_enviada',
  cliente_interesado: 'pendiente_revision',
  pendiente_pago: 'pendiente_revision',
  listo_facturar: 'cotizacion_enviada',
  seguimiento_futuro: 'seguimiento',
  producto_agotado: 'seguimiento',
  venta_perdida: 'perdido',
  cerrada: 'cerrado',
  cerrado: 'cerrado',
  perdido: 'perdido',
}[status] || 'pendiente_revision');

const lifecycleMeta = {
  nuevo: { label: 'Nuevo lead', tone: 'bg-blue-100 text-blue-800 border-blue-200' },
  abierta: { label: 'Conversacion abierta', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  pendiente_revision: { label: 'Pendiente revision', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  en_atencion: { label: 'En atencion', tone: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  esperando_cliente: { label: 'Esperando cliente', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  cotizando: { label: 'Cotizando', tone: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  cotizacion_enviada: { label: 'Cotizacion enviada', tone: 'bg-violet-100 text-violet-800 border-violet-200' },
  cliente_interesado: { label: 'Cliente interesado', tone: 'bg-orange-100 text-orange-800 border-orange-200' },
  pendiente_pago: { label: 'Pendiente de pago', tone: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  listo_facturar: { label: 'Listo para facturar', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  venta_cerrada: { label: 'Venta cerrada', tone: 'bg-green-100 text-green-800 border-green-200' },
  seguimiento: { label: 'Seguimiento', tone: 'bg-purple-100 text-purple-800 border-purple-200' },
  seguimiento_futuro: { label: 'Seguimiento', tone: 'bg-purple-100 text-purple-800 border-purple-200' },
  producto_agotado: { label: 'Producto agotado', tone: 'bg-rose-100 text-rose-800 border-rose-200' },
  venta_perdida: { label: 'Venta perdida', tone: 'bg-red-100 text-red-800 border-red-200' },
  cerrado: { label: 'Cerrado', tone: 'bg-green-100 text-green-800 border-green-200' },
  cerrada: { label: 'Cerrada', tone: 'bg-green-100 text-green-800 border-green-200' },
  perdido: { label: 'Perdido', tone: 'bg-red-100 text-red-800 border-red-200' },
};

const getConversationLifecycle = (conversation) => {
  if (!conversation) return lifecycleMeta.abierta;
  if (conversation.cotizacion_id && !['cotizacion_enviada', 'venta_cerrada', 'cerrada', 'cerrado'].includes(conversation.status)) {
    return { label: 'Cotizacion creada', tone: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
  }
  return lifecycleMeta[conversation.status] || { label: conversation.status || 'Abierta', tone: conversationStatusStyles[conversation.status] || conversationStatusStyles.abierta };
};

const followupStatuses = new Set([
  'esperando_cliente',
  'cotizacion_enviada',
  'cliente_interesado',
  'pendiente_pago',
  'producto_agotado',
  'seguimiento_futuro',
]);

const conversationStatusOptions = [
  { value: 'abierta', label: 'Abierta', icon: MessageCircle },
  { value: 'en_atencion', label: 'En atencion', icon: MessageCircle },
  { value: 'esperando_cliente', label: 'Esperando cliente', icon: Clock3 },
  { value: 'cotizando', label: 'Cotizando', icon: FileText },
  { value: 'cotizacion_enviada', label: 'Cotizacion enviada', icon: CheckCheck },
  { value: 'cliente_interesado', label: 'Cliente interesado', icon: AlertTriangle },
  { value: 'pendiente_pago', label: 'Pendiente de pago', icon: CreditCard },
  { value: 'listo_facturar', label: 'Listo para facturar', icon: ShoppingCart },
  { value: 'seguimiento_futuro', label: 'Seguimiento futuro', icon: CalendarClock },
  { value: 'producto_agotado', label: 'Producto agotado', icon: PackagePlus },
  { value: 'venta_perdida', label: 'Venta perdida', icon: Ban },
  { value: 'cerrada', label: 'Cerrada', icon: CheckCircle2 },
];

const quickReplyTemplates = [
  {
    command: '/disponible',
    label: 'Disponible',
    text: 'Si, lo tenemos disponible. ¿Desea que se lo separemos?',
  },
  {
    command: '/agotado',
    label: 'Agotado',
    text: 'Ahora mismo esta agotado. Podemos avisarle tan pronto vuelva a estar disponible.',
  },
  {
    command: '/seguimiento',
    label: 'Seguimiento',
    text: 'Hola, le escribimos para darle seguimiento a su solicitud. ¿Aun le interesa?',
  },
  {
    command: '/ubicacion',
    label: 'Ubicacion',
    text: 'Con gusto. Le compartimos nuestra ubicacion para que pueda visitarnos.',
  },
  {
    command: '/horario',
    label: 'Horario',
    text: 'Nuestro horario de atencion es de lunes a sabado. ¿En que podemos ayudarle?',
  },
];

const genericClientId = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';

const formatMoney = (value) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const minutesSince = (dateValue) => {
  if (!dateValue) return 0;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
};

const formatElapsed = (dateValue) => {
  const minutes = minutesSince(dateValue);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
};

const needsFollowup = (conversation) => {
  if (!conversation) return false;
  if (followupStatuses.has(conversation.status)) return true;
  if (conversation.cotizacion_id && !['venta_cerrada', 'cerrada'].includes(conversation.status)) {
    return minutesSince(conversation.last_assistant_message_at || conversation.last_message_at) >= 30;
  }
  return false;
};

const cleanPhone = (value) => String(value || '').replace(/\D/g, '');

const looksLikeWhatsAppLid = (value) => {
  const digits = cleanPhone(value);
  if (!digits) return false;
  return digits.length >= 13 && !digits.startsWith('1');
};

const formatDominicanPhone = (value) => {
  const digits = cleanPhone(value);
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  return value || '';
};

const normalizeWhatsAppPhone = (value) => {
  const digits = cleanPhone(value);
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
};

const normalizeLocalPhone = (value) => {
  const digits = cleanPhone(value);
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
};

const isSameCalendarDay = (a, b) => {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
};

const formatMessageDateLabel = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameCalendarDay(date, today)) return 'Hoy';
  if (isSameCalendarDay(date, yesterday)) return 'Ayer';
  return format(date, "d 'de' MMMM yyyy", { locale: es });
};

const shouldShowDateSeparator = (messages, index) => {
  if (index === 0) return true;
  const current = new Date(messages[index]?.created_at);
  const previous = new Date(messages[index - 1]?.created_at);
  if (Number.isNaN(current.getTime()) || Number.isNaN(previous.getTime())) return false;
  return !isSameCalendarDay(current, previous);
};

const getMessageText = (message) => message?.content || message?.message_text || '';

const getConversationPhone = (conv) => {
  const rawPhone = conv?.cliente_telefono || conv?.phone || conv?.customer_external_id || '';
  if (!rawPhone || looksLikeWhatsAppLid(rawPhone)) return '';
  return formatDominicanPhone(rawPhone);
};

const getConversationContactLabel = (conv) =>
  getConversationPhone(conv) || (looksLikeWhatsAppLid(conv?.phone || conv?.customer_external_id) ? 'Telefono no disponible' : conv?.phone || conv?.customer_external_id || '');

const getConversationLogo = (conv) => conv?.cliente_logo_url || conv?.logo_url || '';

const normalizeSalesConversation = (conv) => ({
  id: conv.id,
  sales_conversation_id: conv.id,
  source_table: 'sales',
  platform: conv.platform || 'whatsapp',
  contact_name: conv.customer_name,
  cliente_nombre: conv.customer_name,
  cliente_telefono: conv.customer_phone,
  cliente_logo_url: conv.customer_logo_url,
  phone: conv.customer_phone || conv.customer_external_id,
  status: conv.status || 'nuevo',
  intent: conv.intent,
  bot_enabled: conv.bot_enabled,
  cotizacion_id: conv.cotizacion_id,
  cotizacion_numero: conv.cotizacion_numero,
  cotizacion_estado: conv.cotizacion_estado,
  cotizacion_estado_comercial: conv.cotizacion_estado_comercial,
  total_cotizacion: conv.total_cotizacion,
  last_message_at: conv.last_message_at,
  last_user_message_at: conv.last_user_message_at,
  last_assistant_message_at: conv.last_agent_message_at,
  last_message_preview: conv.last_message_preview,
  lead_score: conv.lead_score ? 'warm' : 'sin_calificar',
  quote_items_count: 0,
  quote_total: 0,
  assigned_user_id: conv.assigned_to,
  customer_external_id: conv.customer_external_id,
});

const isWhatsAppConversation = (conversation) => (conversation?.platform || 'whatsapp') === 'whatsapp';

// URL del servicio del canal manual (WhatsApp Web / Baileys).
// En local apunta al servidor que corre en tu PC; en produccion al VPS.
const WA_WEB_URL = import.meta.env.VITE_WHATSAPP_WEB_URL || 'http://localhost:3899';

const WhatsAppCrmPage = () => {
  const { empresa, tenantId, user } = useAuth();
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const { setPedidoParaFacturar } = useFacturacion();
  const { sidebarOpen: mainSidebarOpen, setSidebarOpen } = useLayout();
  const { unreadByConversation, totalUnread, markConversationRead, setActiveConversationId, syncUnreadCounts, soundEnabled, toggleSound, playNotificationSound } = useWhatsAppNotifications();
  const [conversations, setConversations] = useState([]);
  const [showNewManualConv, setShowNewManualConv] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [messages, setMessages] = useState([]);
  const [quoteItems, setQuoteItems] = useState([]);
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sharingQuote, setSharingQuote] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [sendingQuoteImage, setSendingQuoteImage] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [sendingToInvoice, setSendingToInvoice] = useState(false);
  const [inboxTab, setInboxTab] = useState('all');
  const [showInboxPanel, setShowInboxPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [isStartChatOpen, setIsStartChatOpen] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [startChatForm, setStartChatForm] = useState({
    nombre: '',
    telefono: '',
    mensaje: '',
    guardarCliente: true,
  });
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [quoteSavingId, setQuoteSavingId] = useState(null);
  const [sharingImageId, setSharingImageId] = useState(null);
  // Estado del canal manual (WhatsApp Web / Baileys)
  const [waStatus, setWaStatus] = useState({ connected: false, qr: null, offline: true });
  const [showQR, setShowQR] = useState(false);
  const [createdQuote, setCreatedQuote] = useState(null);
  const [quoteImageSnapshot, setQuoteImageSnapshot] = useState(null);
  const [quoteDraftMode, setQuoteDraftMode] = useState('active');
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const selectedRef = useRef(null);
  const conversationsRef = useRef([]);
  const quoteImageRef = useRef(null);
  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const replyInputRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const optimisticMessageIdsRef = useRef(new Set());
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const scrollMessagesToBottom = useCallback((behavior = 'smooth') => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      isAtBottomRef.current = true;
      setShowNewMessagesButton(false);
    });
  }, []);

  const handleChatScroll = useCallback(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const atBottom = distanceFromBottom < 96;
    isAtBottomRef.current = atBottom;
    if (atBottom) setShowNewMessagesButton(false);
  }, []);

  useEffect(() => {
    isAtBottomRef.current = true;
    previousMessageCountRef.current = 0;
    setShowNewMessagesButton(false);
    scrollMessagesToBottom('auto');
  }, [selected?.id, scrollMessagesToBottom]);

  useEffect(() => {
    if (detailLoading) return;
    const previousCount = previousMessageCountRef.current;
    const hasNewMessage = messages.length > previousCount;
    previousMessageCountRef.current = messages.length;
    if (!messages.length) return;
    if (previousCount === 0 || isAtBottomRef.current) {
      scrollMessagesToBottom(previousCount === 0 ? 'auto' : 'smooth');
    } else if (hasNewMessage) {
      setShowNewMessagesButton(true);
    }
  }, [detailLoading, messages, scrollMessagesToBottom]);

  useEffect(() => {
    setSidebarOpen?.(false);
    setShowRightPanel(false);
  }, [setSidebarOpen]);

  const fetchConversations = useCallback(async ({ silent = false, notify = false } = {}) => {
    if (!silent) setLoading(true);
    const [{ data: whatsappData, error }, { data: salesData, error: salesError }] = await Promise.all([
      supabase
        .from('crm_whatsapp_conversations_view')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('last_message_at', { ascending: false })
        .limit(80),
      supabase
        .from('sales_conversations_view')
        .select('*')
        .eq('tenant_id', tenantId)
        .neq('platform', 'whatsapp')
        .order('last_message_at', { ascending: false })
        .limit(80),
    ]);

    if (error && salesError) {
      if (!silent) toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar Sales Hub.' });
    } else {
      const whatsappRows = (whatsappData || []).map(conv => ({ ...conv, platform: 'whatsapp', source_table: 'crm_whatsapp' }));
      const salesRows = salesError ? [] : (salesData || []).map(normalizeSalesConversation);
      const rows = [...whatsappRows, ...salesRows].sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
      setConversations(rows);
      syncUnreadCounts?.(rows);
      if (!selectedRef.current && rows?.length) setSelected(rows[0]);
    }
    if (!silent) setLoading(false);
  }, [syncUnreadCounts, toast]);

  // ── Crear conversacion manual (Instagram/Facebook/WhatsApp) ──
  // Inserta en sales_conversations + primer sales_message (rol 'user').
  const handleCreateManualConversation = async (payload) => {
    if (!tenantId) return;
    const { platform, customer_name, customer_external_id, customer_phone, first_message } = payload;
    try {
      const { data: conv, error: convErr } = await supabase
        .from('sales_conversations')
        .insert({
          tenant_id: tenantId,
          platform,
          customer_name,
          customer_external_id: customer_external_id || customer_phone || `manual-${Date.now()}`,
          customer_phone: customer_phone || null,
          external_conversation_id: `manual-${Date.now()}`,
          status: 'nuevo',
          bot_enabled: false,
          metadata: { source: 'manual_sales_hub' },
        })
        .select('*').single();
      if (convErr) throw convErr;

      const { error: msgErr } = await supabase
        .from('sales_messages')
        .insert({
          tenant_id: tenantId,
          conversation_id: conv.id,
          platform,
          sender_type: 'user',
          message_type: 'text',
          message_text: first_message,
          status: 'received',
          raw_data: { source: 'manual_sales_hub' },
        });
      if (msgErr) throw msgErr;

      toast({ title: '✓ Conversación creada', description: `${customer_name} (${platform})` });
      await fetchConversations({ silent: true });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
      throw e;
    }
  };

  // ── Registrar manualmente un mensaje entrante del cliente (canales sin API real) ──
  const handleRecordIncomingManual = async () => {
    if (!selected || isWhatsAppConversation(selected)) return;
    const text = window.prompt('Pega el mensaje del cliente:');
    if (!text || !text.trim()) return;
    try {
      const { error } = await supabase.from('sales_messages').insert({
        tenant_id: tenantId,
        conversation_id: selected.id,
        platform: selected.platform,
        sender_type: 'user',
        message_type: 'text',
        message_text: text.trim(),
        status: 'received',
        raw_data: { source: 'manual_paste' },
      });
      if (error) throw error;
      await fetchDetail(selected.id, { silent: true });
      toast({ title: '✓ Mensaje del cliente registrado' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const fetchDetail = useCallback(async (conversationId, { silent = false } = {}) => {
    if (!conversationId) return;
    if (!silent) setDetailLoading(true);
    const activeConversation = selectedRef.current;
    const loadSalesDetail = activeConversation?.source_table === 'sales' && !isWhatsAppConversation(activeConversation);
    const [{ data: msgData, error: msgError }, { data: itemData, error: itemError }] = loadSalesDetail
      ? await Promise.all([
        supabase
          .from('sales_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
        Promise.resolve({ data: [], error: null }),
      ])
      : await Promise.all([
        supabase
          .from('crm_whatsapp_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
        supabase
          .from('crm_whatsapp_quote_items')
          .select('*, productos(imagen_url, ubicacion)')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false }),
      ]);

    if (msgError || itemError) {
      if (!silent) toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la conversacion.' });
    } else {
      setMessages(loadSalesDetail ? (msgData || []).map(message => ({
        id: message.id,
        role: message.sender_type,
        content: message.message_text || `[${message.message_type || 'mensaje'}]`,
        status: message.status,
        created_at: message.created_at,
        metadata: {
          source: message.sender_type === 'agent' ? 'sales_hub' : activeConversation?.platform,
          media_url: message.media_url,
          media_type: message.message_type,
          raw_data: message.raw_data,
        },
      })) : (msgData || []));
      setQuoteItems(itemData || []);
    }
    if (!silent) setDetailLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    setActiveConversationId?.(selected?.id || null);
    fetchDetail(selected?.id);
    markConversationRead(selected?.id);
    setCreatedQuote(null);
    setQuoteImageSnapshot(null);
    setQuoteDraftMode('active');
    if (selected && !isWhatsAppConversation(selected)) setShowRightPanel(false);
  }, [selected?.id, fetchDetail, markConversationRead, setActiveConversationId]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchConversations({ silent: true, notify: true });
    }, 30000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selected?.id) return;

    const table = selected.source_table === 'sales' && !isWhatsAppConversation(selected)
      ? 'sales_messages'
      : 'crm_whatsapp_messages';
    const channel = supabase
      .channel(`sales-hub-messages-${selected.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter: `conversation_id=eq.${selected.id}`,
        },
        (payload) => {
          const incoming = payload.new;
          const normalizedMessage = table === 'sales_messages'
            ? {
              id: incoming.id,
              role: incoming.sender_type,
              content: incoming.message_text || `[${incoming.message_type || 'mensaje'}]`,
              status: incoming.status,
              created_at: incoming.created_at,
              metadata: {
                source: incoming.sender_type === 'agent' ? 'sales_hub' : selected.platform,
                media_url: incoming.media_url,
                media_type: incoming.message_type,
                raw_data: incoming.raw_data,
              },
            }
            : incoming;
          const preview = getMessageText(normalizedMessage) || '[Adjunto]';

          setMessages(prev => {
            if (prev.some(message => message.id === normalizedMessage.id)) return prev;
            const optimisticIndex = prev.findIndex(message =>
              message.metadata?.optimistic &&
              getMessageText(message) === preview &&
              (message.role === 'agent' || message.role === 'assistant') &&
              (normalizedMessage.role === 'agent' || normalizedMessage.role === 'assistant')
            );
            if (optimisticIndex >= 0) {
              const next = [...prev];
              optimisticMessageIdsRef.current.delete(next[optimisticIndex].id);
              next[optimisticIndex] = normalizedMessage;
              return next;
            }
            return [...prev, normalizedMessage];
          });
          touchConversationPreview(
            selected.id,
            preview,
            normalizedMessage.created_at,
            normalizedMessage.role === 'user' ? 'incoming' : 'outgoing'
          );
          if (typeof document === 'undefined' || (!document.hidden && document.hasFocus())) {
            markConversationRead(selected.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected?.id, fetchDetail, fetchConversations, markConversationRead]);

  // Sondea el estado del canal manual (WhatsApp Web) cada 3s para mostrar
  // el QR / estado de conexion en la pantalla.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(`${WA_WEB_URL}/status`);
        const d = await r.json();
        if (!active) return;
        setWaStatus({ connected: !!d.connected, qr: d.qr || null, offline: false });
        if (d.connected) setShowQR(false); // al conectar, cerrar el QR
      } catch {
        if (active) setWaStatus({ connected: false, qr: null, offline: true });
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const handleConnectWhatsApp = async () => {
    setShowQR(true);
    try {
      await fetch(`${WA_WEB_URL}/connect`, { method: 'POST' });
    } catch {
      toast({ variant: 'destructive', title: 'Servicio apagado', description: 'El canal de WhatsApp Web no esta corriendo. Inicia el servicio e intenta de nuevo.' });
    }
  };

  const handleLogoutWhatsApp = async () => {
    try { await fetch(`${WA_WEB_URL}/logout`, { method: 'POST' }); } catch {}
    setWaStatus(s => ({ ...s, connected: false, qr: null }));
    toast({ title: 'WhatsApp desconectado', description: 'Se cerro la sesion del canal manual.' });
  };

  const resetStartChatForm = () => {
    setStartChatForm({ nombre: '', telefono: '', mensaje: '', guardarCliente: true });
  };

  const handleStartConversation = async (event) => {
    event.preventDefault();
    if (!tenantId || startingChat) return;

    const phone = normalizeWhatsAppPhone(startChatForm.telefono);
    const localPhone = normalizeLocalPhone(phone);
    const name = startChatForm.nombre.trim();
    const firstMessage = startChatForm.mensaje.trim();

    if (phone.length < 10) {
      toast({ variant: 'destructive', title: 'Telefono invalido', description: 'Escribe un numero valido para iniciar el chat.' });
      return;
    }

    setStartingChat(true);
    try {
      let cliente = null;

      if (startChatForm.guardarCliente) {
        const { data: clientesData, error: clientesError } = await supabase
          .from('clientes')
          .select('id, nombre, telefono, logo_url')
          .limit(2000);

        if (clientesError) throw clientesError;

        cliente = (clientesData || []).find(c => normalizeLocalPhone(c.telefono) === localPhone) || null;

        if (!cliente && name) {
          const { data: newCliente, error: createClienteError } = await supabase
            .from('clientes')
            .insert({
              tenant_id: tenantId,
              nombre: name,
              telefono: formatDominicanPhone(phone),
              activo: true,
            })
            .select('id, nombre, telefono, logo_url')
            .single();

          if (createClienteError) throw createClienteError;
          cliente = newCliente;
        }
      }

      const contactName = cliente?.nombre || name || phone;
      const { data: contact, error: contactError } = await supabase
        .from('crm_whatsapp_contacts')
        .upsert({
          tenant_id: tenantId,
          cliente_id: cliente?.id || null,
          phone,
          wa_id: `${phone}@s.whatsapp.net`,
          name: contactName,
          source: 'manual_crm',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,phone' })
        .select('*')
        .single();

      if (contactError) throw contactError;

      const { data: conversation, error: conversationError } = await supabase
        .from('crm_whatsapp_conversations')
        .upsert({
          tenant_id: tenantId,
          contact_id: contact.id,
          bot_enabled: false,
          status: 'abierta',
          last_message_preview: firstMessage || 'Chat iniciado desde CRM',
        }, { onConflict: 'tenant_id,contact_id' })
        .select('*')
        .single();

      if (conversationError) throw conversationError;

      let conversationRow = null;
      const { data: viewRow } = await supabase
        .from('crm_whatsapp_conversations_view')
        .select('*')
        .eq('id', conversation.id)
        .maybeSingle();

      conversationRow = viewRow || {
        ...conversation,
        phone,
        contact_name: contactName,
        cliente_nombre: cliente?.nombre || null,
        cliente_telefono: cliente?.telefono || null,
        cliente_logo_url: cliente?.logo_url || null,
        platform: 'whatsapp',
        source_table: 'crm_whatsapp',
        quote_items_count: 0,
        quote_total: 0,
      };

      setSelected({ ...conversationRow, platform: 'whatsapp', source_table: 'crm_whatsapp' });
      setMessages([]);
      setQuoteItems([]);

      if (firstMessage) {
        if (!waStatus.connected) {
          toast({ title: 'Chat creado', description: 'Conecta WhatsApp para enviar el primer mensaje.' });
        } else {
          const r = await fetch(`${WA_WEB_URL}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: phone, text: firstMessage }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || d?.error) throw new Error(d?.error || 'No se pudo enviar por WhatsApp Web.');
          toast({ title: 'Chat iniciado', description: 'Se creo el contacto y se envio el mensaje.' });
        }
      } else {
        toast({ title: 'Chat creado', description: 'Ya puedes escribirle desde Sales Hub.' });
      }

      setIsStartChatOpen(false);
      resetStartChatForm();
      await fetchConversations();
      await fetchDetail(conversation.id, { silent: true });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo iniciar', description: error.message });
    } finally {
      setStartingChat(false);
    }
  };

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = conversations.filter(c => {
      const platform = c.platform || 'whatsapp';
      if (inboxTab === 'followups') return needsFollowup(c);
      if (inboxTab === 'quotes') return Boolean(c.cotizacion_id || c.quote_items_count > 0);
      if (inboxTab === 'unread') return Number(unreadByConversation[c.id] || c.unread_count || 0) > 0;
      if (['whatsapp', 'instagram', 'facebook'].includes(inboxTab)) return platform === inboxTab;
      return true;
    });
    const filtered = !term ? source : source.filter(c =>
      String(c.contact_name || '').toLowerCase().includes(term) ||
      String(c.cliente_nombre || '').toLowerCase().includes(term) ||
      String(c.cliente_telefono || '').includes(term) ||
      String(c.phone || '').includes(term) ||
      String(c.customer_external_id || '').includes(term) ||
      String(c.last_message_preview || '').toLowerCase().includes(term)
    );
    return [...filtered].sort((a, b) => {
      const unreadDiff = Number(unreadByConversation[b.id] || 0) - Number(unreadByConversation[a.id] || 0);
      if (unreadDiff) return unreadDiff;
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });
  }, [conversations, inboxTab, search, unreadByConversation]);

  const followupCount = useMemo(
    () => conversations.filter(c => needsFollowup(c)).length,
    [conversations]
  );

  const visibleQuickReplies = useMemo(() => {
    const value = reply.trimStart();
    if (!value.startsWith('/')) return [];
    const query = value.slice(1).toLowerCase();
    return quickReplyTemplates.filter(template =>
      template.command.slice(1).includes(query) ||
      template.label.toLowerCase().includes(query)
    );
  }, [reply]);

  const selectedItems = useMemo(() => quoteItems.filter(i => i.selected && i.producto_id), [quoteItems]);
  const quoteTotals = useMemo(
    () => selectedItems.reduce((acc, item) => {
      const importe = Number(item.cantidad || 0) * Number(item.precio_unitario || 0);
      const itbisPct = Number(item.itbis_pct || 0.18);
      const base = importe / (1 + itbisPct);
      acc.subtotal += base;
      acc.itbis += importe - base;
      acc.total += importe;
      return acc;
    }, { subtotal: 0, itbis: 0, total: 0 }),
    [selectedItems]
  );
  const selectedTotal = quoteTotals.total;

  const quoteImageData = useMemo(() => {
    const quote = quoteImageSnapshot || createdQuote || {};
    const details = quote.detalles?.length ? quote.detalles : selectedItems;
    if (!selected || !details.length) return null;
    const now = new Date();
    const due = new Date(quote.fecha_vencimiento || now);
    if (!quote.fecha_vencimiento) due.setDate(now.getDate() + 15);
    return {
      numero: quote.numero || selected.cotizacion_numero || 'PENDIENTE',
      fecha: quote.fecha_cotizacion || now.toISOString().slice(0, 10),
      vence: quote.fecha_vencimiento || due.toISOString().slice(0, 10),
      hora: format(now, 'h:mm a', { locale: es }),
      cliente: selected.cliente_nombre || selected.contact_name || selected.phone || 'Cliente Generico',
      telefono: getConversationPhone(selected) || selected.phone || 'N/A',
      subtotal: Number(quote.subtotal ?? quoteTotals.subtotal),
      descuento: Number(quote.descuento_total || 0),
      itbis: Number(quote.itbis_total ?? quoteTotals.itbis),
      total: Number(quote.total_cotizacion ?? selectedTotal),
      items: details,
    };
  }, [createdQuote, empresa?.nombre, quoteImageSnapshot, quoteTotals.itbis, quoteTotals.subtotal, selected, selectedItems, selectedTotal]);

  const handleToggleBot = async () => {
    if (!selected) return;
    const next = !selected.bot_enabled;
    const { error } = selected.source_table === 'sales' && !isWhatsAppConversation(selected)
      ? await supabase
        .from('sales_conversations')
        .update({ bot_enabled: next })
        .eq('id', selected.id)
      : await supabase
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

  const updateConversationLocal = (conversationId, patch) => {
    setSelected(prev => prev?.id === conversationId ? { ...prev, ...patch } : prev);
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, ...patch } : c));
  };

  const openRenameModal = () => {
    if (!selected) return;
    setRenameValue(selected.cliente_nombre || selected.contact_name || '');
    setShowRenameModal(true);
  };

  const handleRenameContact = async () => {
    if (!selected) return;
    const nuevoNombre = renameValue.trim();
    if (!nuevoNombre) {
      toast({ variant: 'destructive', title: 'Nombre vacio', description: 'Escribe un nombre para el contacto.' });
      return;
    }
    setSavingRename(true);
    try {
      let error;
      if (selected.source_table === 'sales' && !isWhatsAppConversation(selected)) {
        ({ error } = await supabase
          .from('sales_conversations')
          .update({ customer_name: nuevoNombre })
          .eq('id', selected.id));
      } else if (selected.contact_id) {
        ({ error } = await supabase
          .from('crm_whatsapp_contacts')
          .update({ name: nuevoNombre, updated_at: new Date().toISOString() })
          .eq('id', selected.contact_id));
      } else {
        error = { message: 'La conversacion no tiene un contacto asociado.' };
      }
      if (error) throw error;
      updateConversationLocal(selected.id, { contact_name: nuevoNombre, cliente_nombre: nuevoNombre });
      setShowRenameModal(false);
      toast({ title: 'Nombre actualizado', description: `El contacto ahora se llama "${nuevoNombre}".` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'No se pudo cambiar el nombre.' });
    } finally {
      setSavingRename(false);
    }
  };

  const handleSetConversationStatus = async (status, { conversation = selected, toastTitle } = {}) => {
    if (!conversation?.id || updatingStatus) return false;
    setUpdatingStatus(true);
    const previous = conversationsRef.current.find(c => c.id === conversation.id) || conversation;
    updateConversationLocal(conversation.id, { status });
    const { error } = conversation.source_table === 'sales' && !isWhatsAppConversation(conversation)
      ? await supabase
        .from('sales_conversations')
        .update({ status: toSalesStatus(status) })
        .eq('id', conversation.id)
      : await supabase
        .from('crm_whatsapp_conversations')
        .update({ status })
        .eq('id', conversation.id);

    if (error) {
      updateConversationLocal(conversation.id, { status: previous.status });
      toast({ variant: 'destructive', title: 'No se actualizo el estado', description: error.message });
      setUpdatingStatus(false);
      return false;
    }

    if (toastTitle) toast({ title: toastTitle });
    await fetchConversations({ silent: true });
    setUpdatingStatus(false);
    return true;
  };

  const handleSelectConversationStatus = async (status) => {
    if (status === 'cotizacion_enviada') {
      await handleMarkQuoteSent();
      return;
    }
    await handleSetConversationStatus(status);
  };

  const handleTakeConversation = async () => {
    if (!selected?.id || !user?.id) return;
    const previous = selected.assigned_user_id;
    updateConversationLocal(selected.id, { assigned_user_id: user.id });

    const updates = [];
    if (selected.source_table === 'sales' && !isWhatsAppConversation(selected)) {
      updates.push(supabase.from('sales_conversations').update({ assigned_to: user.id, status: 'en_atencion' }).eq('id', selected.id));
    } else {
      updates.push(supabase.from('crm_whatsapp_conversations').update({ assigned_user_id: user.id, status: 'en_atencion' }).eq('id', selected.id));
      updates.push(supabase.from('sales_conversations').update({ assigned_to: user.id, status: 'en_atencion' }).eq('crm_whatsapp_conversation_id', selected.id));
    }

    const results = await Promise.all(updates);
    const error = results.find(r => r.error)?.error;
    if (error) {
      updateConversationLocal(selected.id, { assigned_user_id: previous });
      toast({ variant: 'destructive', title: 'No se pudo tomar', description: error.message });
      return;
    }
    updateConversationLocal(selected.id, { assigned_user_id: user.id, status: 'en_atencion' });
    toast({ title: 'Conversacion tomada' });
  };

  const handleMarkFollowup = async () => {
    await handleSetConversationStatus('seguimiento_futuro', { toastTitle: 'Seguimiento marcado' });
  };

  const handleCreateLead = async () => {
    if (!selected?.id || !tenantId) return;
    let salesConversationId = selected.source_table === 'sales' ? selected.id : null;
    if (!salesConversationId) {
      const { data } = await supabase
        .from('sales_conversations')
        .select('id')
        .eq('crm_whatsapp_conversation_id', selected.id)
        .maybeSingle();
      salesConversationId = data?.id || null;
    }

    const { error } = await supabase.from('sales_leads').insert({
      tenant_id: tenantId,
      conversation_id: salesConversationId,
      cliente_nombre: renderConversationName(selected),
      cliente_contacto: getConversationPhone(selected) || selected.phone || selected.customer_external_id || null,
      canal: selected.platform || 'whatsapp',
      estado: 'nuevo',
      prioridad: selected.intent && selected.intent !== 'general' ? 'alta' : 'media',
      score: selected.intent && selected.intent !== 'general' ? 70 : 30,
      resumen: selected.last_message_preview || 'Lead creado manualmente desde Sales Hub',
      metadata: {
        source: 'sales_hub_manual',
        crm_whatsapp_conversation_id: selected.source_table === 'crm_whatsapp' ? selected.id : null,
      },
    });
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo crear lead', description: error.message });
      return;
    }
    toast({ title: 'Lead creado', description: 'Quedo registrado para seguimiento comercial.' });
  };

  const handleOpenQuotePanel = () => {
    if (!isWhatsAppConversation(selected)) {
      toast({ variant: 'destructive', title: 'Cotizaciones solo por WhatsApp', description: 'En beta, las cotizaciones se mantienen en el flujo de WhatsApp.' });
      return;
    }
    setShowRightPanel(true);
    if (!quoteItems.length) setIsProductSearchOpen(true);
  };

  const handleToggleInboxPanel = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && selected) {
      setSelected(null);
      setShowInboxPanel(true);
      return;
    }
    setShowInboxPanel(prev => !prev);
  };

  const handleMarkQuoteSent = async ({ silent = false, quoteId = selected?.cotizacion_id } = {}) => {
    if (!selected) return;
    const ok = await handleSetConversationStatus('cotizacion_enviada', { toastTitle: silent ? null : 'Cotizacion marcada como enviada' });
    if (ok && quoteId) {
      await supabase
        .from('cotizaciones')
        .update({ estado_comercial: 'enviada' })
        .eq('id', quoteId);
    }
  };

  const handleSendToInvoice = async (quoteId = selected?.cotizacion_id) => {
    if (!quoteId || sendingToInvoice) {
      if (!quoteId) toast({ variant: 'destructive', title: 'Falta cotizacion', description: 'Primero crea una cotizacion para enviarla a facturacion.' });
      return;
    }

    setSendingToInvoice(true);
    try {
      const { data: cotizacion, error: cotError } = await supabase
        .from('cotizaciones')
        .select('*')
        .eq('id', quoteId)
        .single();
      if (cotError) throw cotError;

      const { error: updateError } = await supabase
        .from('cotizaciones')
        .update({ estado: 'Facturando' })
        .eq('id', quoteId);
      if (updateError) throw updateError;

      await supabase
        .from('cotizaciones')
        .update({ estado_comercial: 'aceptada' })
        .eq('id', quoteId);

      await supabase
        .from('crm_whatsapp_conversations')
        .update({ status: 'listo_facturar' })
        .eq('id', selected.id);

      updateConversationLocal(selected.id, { status: 'listo_facturar' });
      setPedidoParaFacturar({ ...cotizacion, estado: 'Facturando', type: 'cotizacion' });
      openPanel('ventas');
      toast({ title: 'Lista para facturar', description: `Cotizacion #${cotizacion.numero} cargada en Ventas.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo enviar a facturacion', description: error.message });
    } finally {
      setSendingToInvoice(false);
    }
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

  const handleUpdateQuoteItem = async (item, patch) => {
    const cleanedPatch = { ...patch };
    if ('cantidad' in cleanedPatch) cleanedPatch.cantidad = Math.max(0, Number(cleanedPatch.cantidad || 0));

    setQuoteSavingId(item.id);
    setQuoteItems(prev => prev.map(i => i.id === item.id ? { ...i, ...cleanedPatch } : i));
    const { error } = await supabase
      .from('crm_whatsapp_quote_items')
      .update(cleanedPatch)
      .eq('id', item.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el item.' });
      await fetchDetail(selected?.id);
    }
    setQuoteSavingId(null);
  };

  const handleStepQuoteQuantity = (item, delta) => {
    const next = Math.max(0, Number(item.cantidad || 0) + delta);
    handleUpdateQuoteItem(item, { cantidad: next });
  };

  const handleRemoveQuoteItem = async (item) => {
    setQuoteSavingId(item.id);
    const previous = quoteItems;
    setQuoteItems(prev => prev.filter(i => i.id !== item.id));
    const { error } = await supabase
      .from('crm_whatsapp_quote_items')
      .delete()
      .eq('id', item.id);
    if (error) {
      setQuoteItems(previous);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo quitar el item.' });
    }
    setQuoteSavingId(null);
  };

  const handleSelectQuoteProduct = async (product) => {
    if (!selected || !tenantId) return;
    const price = Number(product.precio || product.precio1 || 0);
    const row = {
      tenant_id: tenantId,
      conversation_id: selected.id,
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      cantidad: 1,
      precio_unitario: price,
      itbis_pct: Number(product.itbis_pct || 0.18),
      existencia: Number(product.existencia || product.stock || 0),
      selected: true,
    };

    const { data, error } = await supabase
      .from('crm_whatsapp_quote_items')
      .insert(row)
      .select('*, productos(imagen_url, ubicacion)')
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'No se agrego', description: error.message });
      return;
    }

    setQuoteItems(prev => [data, ...prev]);
    setIsProductSearchOpen(false);
  };

  const touchConversationPreview = useCallback((conversationId, preview, createdAt, direction = 'outgoing') => {
    const patch = {
      last_message_at: createdAt,
      last_message_preview: preview,
      last_message_direction: direction,
    };
    setSelected(prev => prev?.id === conversationId ? { ...prev, ...patch } : prev);
    setConversations(prev => prev
      .map(conversation => conversation.id === conversationId ? { ...conversation, ...patch } : conversation)
      .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)));
  }, []);

  const addOptimisticOutgoingMessage = useCallback((conversation, content) => {
    const createdAt = new Date().toISOString();
    const tempId = `local-${conversation.id}-${Date.now()}`;
    optimisticMessageIdsRef.current.add(tempId);
    const message = {
      id: tempId,
      tenant_id: tenantId,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      role: 'agent',
      content,
      status: 'sending',
      created_at: createdAt,
      metadata: { source: 'web_crm', optimistic: true },
    };
    setMessages(prev => [...prev, message]);
    touchConversationPreview(conversation.id, content, createdAt, 'outgoing');
    return tempId;
  }, [tenantId, touchConversationPreview]);

  const finishOptimisticMessage = useCallback((tempId, status = 'sent') => {
    if (!tempId) return;
    setMessages(prev => prev.map(message => message.id === tempId
      ? {
        ...message,
        status,
        metadata: { ...(message.metadata || {}), optimistic: status === 'sending' },
      }
      : message));
    if (status !== 'sending') optimisticMessageIdsRef.current.delete(tempId);
  }, []);

  const removeOptimisticMessage = useCallback((tempId) => {
    if (!tempId) return;
    optimisticMessageIdsRef.current.delete(tempId);
    setMessages(prev => prev.filter(message => message.id !== tempId));
  }, []);

  const handleShareItemImage = async (item) => {
    const imageUrl = item.productos?.imagen_url;
    if (!imageUrl) return;

    setSharingImageId(item.id);
    try {
      if (navigator.share) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `${item.codigo || 'producto'}.jpg`, { type: blob.type });
        await navigator.share({
          title: item.descripcion || 'Producto',
          text: `${item.descripcion} - Codigo: ${item.codigo || 'N/A'}`,
          files: [file],
        });
      } else {
        window.open(imageUrl, '_blank');
      }
    } catch (err) {
      if (err.name !== 'AbortError') window.open(imageUrl, '_blank');
    } finally {
      setSharingImageId(null);
    }
  };

  // ── Hermes sugiere qué contestar ──────────────────────────────────────
  // Propone, no envía. El vendedor manda tal cual, la corrige o la descarta,
  // y esa decisión se guarda al lado de lo que escribió de verdad: comparar
  // las dos es lo que le enseña a Hermes.
  const [sugerencia, setSugerencia] = useState(null);
  const [pidiendoSugerencia, setPidiendoSugerencia] = useState(false);

  // Al cambiar de conversación la sugerencia vieja no sirve: era para otro.
  useEffect(() => { setSugerencia(null); }, [selected?.id]);

  const pedirSugerencia = async () => {
    if (!selected?.id || pidiendoSugerencia) return;
    setPidiendoSugerencia(true);
    try {
      const r = await invocarConSesion('hermes-sugerir', { conversation_id: selected.id });
      if (!r?.ok) throw new Error(r?.error || 'No se pudo generar la sugerencia');
      setSugerencia({ texto: r.sugerencia, messageId: r.message_id, productos: r.productos || [] });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Hermes no pudo sugerir', description: e.message });
    } finally {
      setPidiendoSugerencia(false);
    }
  };

  const marcarUso = (messageId, resultado) => {
    if (!messageId) return;
    supabase.rpc('hermes_marcar_uso', { p_message_id: messageId, p_resultado: resultado })
      .then(() => {}, () => {}); // que falle el registro no debe estorbar la venta
  };

  const usarSugerencia = (enviarYa) => {
    if (!sugerencia) return;
    const { texto, messageId } = sugerencia;
    setSugerencia(null);
    if (enviarYa) {
      marcarUso(messageId, 'usada');
      sendTextToConversation(texto);
    } else {
      // Se pone en el cuadro para que la retoque. Si al final la cambia,
      // el texto que se guarde como human_reply será el suyo, no el de Hermes.
      marcarUso(messageId, 'editada');
      setReply(texto);
      replyInputRef.current?.focus();
    }
  };

  const descartarSugerencia = () => {
    if (sugerencia?.messageId) marcarUso(sugerencia.messageId, 'descartada');
    setSugerencia(null);
  };

  const sendTextToConversation = async (content) => {
    if (!selected || !content?.trim()) return;
    const text = content.trim();
    const activeConversation = selected;
    const tempId = addOptimisticOutgoingMessage(activeConversation, text);

    try {
      if (!isWhatsAppConversation(activeConversation)) {
        const { data: queuedMessage, error } = await supabase.from('sales_messages').insert({
          tenant_id: tenantId,
          conversation_id: activeConversation.id,
          platform: activeConversation.platform,
          sender_type: 'agent',
          message_type: 'text',
          message_text: text,
          status: 'queued',
          raw_data: { source: 'sales_hub_manual_reply' },
        }).select('id').single();
        if (error) throw error;

        try {
          const dispatched = await invocarConSesion('meta-send-queued', { message_id: queuedMessage.id });
          const status = dispatched?.message?.status || (dispatched?.ok ? 'sent' : 'failed');
          finishOptimisticMessage(tempId, status);
          if (status === 'sent') {
            toast({ title: 'Mensaje enviado', description: `Respuesta enviada por ${activeConversation.platform === 'instagram' ? 'Instagram' : 'Facebook'}.` });
          } else {
            toast({ variant: 'destructive', title: 'No se envio por Meta', description: dispatched?.message?.raw_data?.dispatch_error || 'El mensaje quedo marcado como fallido.' });
          }
        } catch (dispatchError) {
          finishOptimisticMessage(tempId, 'queued');
          toast({ variant: 'destructive', title: 'Mensaje en cola', description: dispatchError?.message || 'No se pudo contactar el despachador Meta.' });
        }
        return;
      }

      if (waStatus.connected) {
        const r = await fetch(`${WA_WEB_URL}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: activeConversation.phone, text }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d?.error) throw new Error(d?.error || 'No se pudo enviar por WhatsApp Web.');
      } else {
        const { data, error } = await supabase.functions.invoke('whatsapp-crm-webhook', {
          body: { action: 'send_message', conversation_id: activeConversation.id, content: text },
        });
        if (error || data?.ok === false) throw new Error(data?.error || error?.message || 'Revise la configuracion de WhatsApp.');
      }
      finishOptimisticMessage(tempId, 'sent');
    } catch (error) {
      removeOptimisticMessage(tempId);
      throw error;
    }
  };

  const handleSend = async () => {
    if (!selected || !reply.trim() || sending) return;
    const content = reply.trim();
    setSending(true);
    setReply('');

    try {
      await sendTextToConversation(content);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se envio', description: e.message });
      setReply(content);
    } finally {
      setSending(false);
      setTimeout(() => replyInputRef.current?.focus?.(), 0);
    }
  };

  const handleApplyQuickReply = (template) => {
    setReply(template.text);
    setTimeout(() => replyInputRef.current?.focus?.(), 0);
  };

  const handleQuickAction = (action) => {
    if (action === 'product') {
      setIsProductSearchOpen(true);
      return;
    }
    if (action === 'quote') {
      handleOpenQuotePanel();
      return;
    }
    if (action === 'followup') {
      handleMarkFollowup();
      return;
    }
    if (action === 'template') {
      setReply('/');
      setTimeout(() => replyInputRef.current?.focus?.(), 0);
      return;
    }
    if (action === 'location') {
      setReply('/ubicacion');
      setTimeout(() => replyInputRef.current?.focus?.(), 0);
      return;
    }
    toast({ title: 'Accion en preparacion', description: 'Esta herramienta quedara dentro del chat sin recargar la pantalla.' });
  };

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const cleanupRecording = () => {
    mediaStreamRef.current?.getTracks?.().forEach(track => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setRecordingAudio(false);
  };

  const sendAudioBlob = async (blob) => {
    if (!selected || !blob?.size) return;
    if (!waStatus.connected) {
      toast({ variant: 'destructive', title: 'WhatsApp no conectado', description: 'El envio de audio esta disponible por el canal WhatsApp Web conectado.' });
      return;
    }

    setSendingAudio(true);
    try {
      const audioBase64 = await blobToDataUrl(blob);
      const r = await fetch(`${WA_WEB_URL}/send-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selected.phone, audioBase64, mime: blob.type || 'audio/webm' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.error) throw new Error(d?.error || 'No se pudo enviar el audio.');
      await fetchDetail(selected.id);
      await fetchConversations();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se envio el audio', description: e.message });
    } finally {
      setSendingAudio(false);
    }
  };

  const handleToggleAudioRecording = async () => {
    if (recordingAudio) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!selected || sendingAudio) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast({ variant: 'destructive', title: 'Microfono no disponible', description: 'Este navegador no permite grabar audio desde la pagina.' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        cleanupRecording();
        await sendAudioBlob(blob);
      };
      recorder.start();
      setRecordingAudio(true);
    } catch (e) {
      cleanupRecording();
      toast({ variant: 'destructive', title: 'No se pudo grabar', description: e.message || 'Revisa el permiso del microfono.' });
    }
  };

  const handleCreateQuote = async ({ shareImage = false } = {}) => {
    if (!selected || !selectedItems.length || creatingQuote) return null;
    setCreatingQuote(true);

    try {
      const manualClienteNombre = (selected.cliente_nombre || selected.contact_name || selected.phone || 'Cliente WhatsApp').trim();
      const quoteCustomer = selected.cliente_id
        ? { cliente_id: selected.cliente_id, manual_cliente_nombre: null }
        : { cliente_id: genericClientId, manual_cliente_nombre: manualClienteNombre };
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
      due.setDate(today.getDate() + 15);

      const { data: cotizacion, error: cotError } = await supabase
        .from('cotizaciones')
        .insert({
          numero,
          fecha_cotizacion: today.toISOString().slice(0, 10),
          fecha_vencimiento: due.toISOString().slice(0, 10),
          cliente_id: quoteCustomer.cliente_id,
          manual_cliente_nombre: quoteCustomer.manual_cliente_nombre,
          subtotal: totals.subtotal,
          descuento_total: 0,
          itbis_total: totals.itbis_total,
          total_cotizacion: totals.total_cotizacion,
          estado: 'Pendiente',
          notas: `Generada desde Sales Hub (${selected.phone}).`,
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

      const quoteForChat = {
        ...cotizacion,
        total_cotizacion: totals.total_cotizacion,
        subtotal: totals.subtotal,
        itbis_total: totals.itbis_total,
        detalles,
      };
      setCreatedQuote(quoteForChat);
      setQuoteDraftMode('active');
      setSelected(prev => prev ? { ...prev, status: 'cotizando', cotizacion_id: cotizacion.id } : prev);
      setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'cotizando', cotizacion_id: cotizacion.id } : c));

      if (shareImage) {
        await handleShareQuoteImage({ quoteOverride: quoteForChat });
      } else {
        toast({ title: 'Cotizacion creada', description: `Se genero la cotizacion #${cotizacion.numero}.` });
      }
      await fetchConversations();
      await fetchDetail(selected.id);
      return quoteForChat;
    } catch (error) {
      console.error('[Sales Hub] create quote', error);
      toast({ variant: 'destructive', title: 'No se pudo crear la cotizacion', description: error.message });
      return null;
    } finally {
      setCreatingQuote(false);
    }
  };

  const loadQuoteForImage = async () => {
    if (createdQuote?.detalles?.length) return createdQuote;
    if (!selected?.cotizacion_id) return null;

    const [{ data: quote, error: quoteError }, { data: details, error: detailsError }] = await Promise.all([
      supabase.from('cotizaciones').select('*').eq('id', selected.cotizacion_id).single(),
      supabase.from('cotizaciones_detalle').select('*').eq('cotizacion_id', selected.cotizacion_id),
    ]);
    if (quoteError) throw quoteError;
    if (detailsError) throw detailsError;

    const loaded = {
      ...quote,
      detalles: (details || []).map(d => ({
        ...d,
        precio_unitario: d.precio_unitario,
        itbis_pct: Number(d.importe || 0) ? Number(d.itbis_valor || 0) / Number(d.importe || 1) : 0,
      })),
    };
    setCreatedQuote(loaded);
    return loaded;
  };

  const buildQuoteSnapshot = (quote) => ({
    id: quote?.id || null,
    numero: quote?.numero || null,
    fecha_cotizacion: quote?.fecha_cotizacion || null,
    fecha_vencimiento: quote?.fecha_vencimiento || null,
    subtotal: Number(quote?.subtotal || 0),
    descuento_total: Number(quote?.descuento_total || 0),
    itbis_total: Number(quote?.itbis_total || 0),
    total_cotizacion: Number(quote?.total_cotizacion || 0),
    detalles: (quote?.detalles || []).map(d => ({
      producto_id: d.producto_id || null,
      codigo: d.codigo || null,
      descripcion: d.descripcion || '',
      cantidad: Number(d.cantidad || 1),
      precio_unitario: Number(d.precio_unitario || 0),
      itbis_valor: Number(d.itbis_valor || 0),
      importe: Number(d.importe || 0),
    })),
  });

  const loadQuoteById = async (quoteId, fallbackSnapshot = null) => {
    if (!quoteId && !fallbackSnapshot) return null;
    const [{ data: quote, error: quoteError }, { data: details, error: detailsError }] = await Promise.all([
      supabase.from('cotizaciones').select('*').eq('id', quoteId).single(),
      supabase.from('cotizaciones_detalle').select('*').eq('cotizacion_id', quoteId),
    ]);
    if (quoteError) {
      if (fallbackSnapshot) return { ...fallbackSnapshot, id: quoteId || fallbackSnapshot.id, detalles: fallbackSnapshot.detalles || [] };
      throw quoteError;
    }
    if (detailsError) throw detailsError;
    return {
      ...quote,
      detalles: details || [],
    };
  };

  const handleEditQuoteFromMessage = async (quoteId, fallbackSnapshot = null) => {
    if (!selected?.id || (!quoteId && !fallbackSnapshot) || !tenantId) return;
    try {
      const quote = await loadQuoteById(quoteId, fallbackSnapshot);
      const rows = (quote.detalles || []).map(d => ({
        tenant_id: tenantId,
        conversation_id: selected.id,
        producto_id: d.producto_id,
        codigo: d.codigo,
        descripcion: d.descripcion,
        cantidad: Number(d.cantidad || 1),
        precio_unitario: Number(d.precio_unitario || 0),
        itbis_pct: Number(d.importe || 0) ? Number(d.itbis_valor || 0) / Number(d.importe || 1) : 0.18,
        selected: true,
      }));

      const { error: deleteError } = await supabase.from('crm_whatsapp_quote_items').delete().eq('conversation_id', selected.id);
      if (deleteError) throw deleteError;
      if (rows.length) {
        const { error } = await supabase.from('crm_whatsapp_quote_items').insert(rows);
        if (error) throw error;
      }

      setQuoteDraftMode('new');
      setCreatedQuote(null);
      setShowRightPanel(true);
      await fetchDetail(selected.id);
      toast({ title: 'Cotizacion cargada', description: 'Modifica los articulos y envia una nueva cotizacion JPG.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo editar', description: error.message });
    }
  };

  const handleResendQuoteImage = async (quoteId, fallbackSnapshot = null) => {
    if (!quoteId && !fallbackSnapshot) return;
    try {
      const quote = await loadQuoteById(quoteId, fallbackSnapshot);
      const quoteForChat = {
        ...quote,
        detalles: (quote.detalles || []).map(d => ({
          ...d,
          precio_unitario: d.precio_unitario,
          itbis_pct: Number(d.importe || 0) ? Number(d.itbis_valor || 0) / Number(d.importe || 1) : 0.18,
        })),
      };
      await handleShareQuoteImage({ quoteOverride: quoteForChat });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo reenviar', description: error.message });
    }
  };

  const resetQuotePanelForNewQuote = async () => {
    if (!selected?.id) return;
    const { error } = await supabase
      .from('crm_whatsapp_quote_items')
      .delete()
      .eq('conversation_id', selected.id);
    if (error) {
      console.warn('[Sales Hub] No se pudo limpiar el borrador de cotizacion:', error.message);
      toast({ variant: 'destructive', title: 'Cotizacion enviada', description: 'La imagen se envio, pero no se pudo limpiar el panel automaticamente.' });
      return;
    }

    setQuoteItems([]);
    setCreatedQuote(null);
    setQuoteImageSnapshot(null);
    setQuoteDraftMode('new');
  };

  const waitForFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const handleShareQuoteImage = async ({ quoteOverride = null } = {}) => {
    if (!selected || sendingQuoteImage) return;
    if (!waStatus.connected) {
      toast({ variant: 'destructive', title: 'WhatsApp no conectado', description: 'La cotizacion en imagen se envia por el canal WhatsApp Web conectado.' });
      return;
    }

    setSendingQuoteImage(true);
    try {
      let quote = quoteOverride || createdQuote;
      if (!quoteOverride && !selected.cotizacion_id) {
        setSendingQuoteImage(false);
        return await handleCreateQuote({ shareImage: true });
      } else {
        quote = quoteOverride || await loadQuoteForImage();
      }
      if (!quote && !selectedItems.length) throw new Error('No hay cotizacion ni articulos para enviar.');
      setQuoteImageSnapshot(quote || null);

      await waitForFrame();
      if (!quoteImageRef.current) throw new Error('La imagen de cotizacion aun no esta lista.');

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(quoteImageRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.95);
      const quoteNumber = quote?.numero || quoteImageData?.numero || '';
      const r = await fetch(`${WA_WEB_URL}/send-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selected.phone,
          imageBase64,
          mime: 'image/jpeg',
          caption: quoteNumber ? `Cotizacion #${quoteNumber}` : 'Cotizacion',
          metadata: {
            message_kind: 'quote_image',
            quote_id: quote?.id || selected.cotizacion_id || null,
            quote_number: quoteNumber || null,
            quote_snapshot: buildQuoteSnapshot(quote || quoteImageData),
          },
        }),
      });
      const responseText = await r.text();
      let d = {};
      try {
        d = responseText ? JSON.parse(responseText) : {};
      } catch {
        d = {};
      }
      if (!r.ok || d?.error) {
        const fallback = r.status === 404
          ? 'El servicio WhatsApp no tiene activo /send-image. Reinicia whatsapp-web-service y vuelve a intentarlo.'
          : r.status === 413
            ? 'La imagen de la cotizacion es muy pesada para enviarla.'
            : `No se pudo enviar la cotizacion como imagen. Codigo HTTP ${r.status}.`;
        throw new Error(d?.error || fallback);
      }
      await handleMarkQuoteSent({ silent: true, quoteId: quote?.id || selected.cotizacion_id });
      await resetQuotePanelForNewQuote();
      await fetchDetail(selected.id);
      await fetchConversations();
      toast({ title: 'Cotizacion enviada', description: 'Se creo y compartio automaticamente como JPG en el chat.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se envio la imagen', description: error.message });
    } finally {
      setSendingQuoteImage(false);
    }
  };

  const buildQuoteMessage = (quote = createdQuote) => {
    const quoteNumber = quote?.numero || selected?.cotizacion_numero || selected?.cotizacion_id || '';
    const items = (quote?.detalles?.length ? quote.detalles : selectedItems).slice(0, 12);
    const lines = [
      `Cotizacion #${quoteNumber}`,
      empresa?.nombre ? `${empresa.nombre}` : null,
      '',
      ...items.map((item, index) => {
        const qty = Number(item.cantidad || 0);
        const price = Number(item.precio_unitario || 0);
        const total = Number(item.importe ?? qty * price);
        return `${index + 1}. ${item.descripcion}\n   Cant: ${qty} x ${formatMoney(price)} = ${formatMoney(total)}`;
      }),
    ].filter(line => line !== null);

    if ((quote?.detalles?.length || selectedItems.length) > 12) {
      lines.push(`...y ${(quote?.detalles?.length || selectedItems.length) - 12} articulo(s) mas.`);
    }

    lines.push('', `Total: ${formatMoney(quote?.total_cotizacion || selectedTotal)}`);
    lines.push('Quedo atento para confirmar disponibilidad y despacho.');
    return lines.join('\n');
  };

  const buildQuoteImageText = (quote = quoteImageData) => {
    if (!quote) return '';
    const W = 36;
    const fmt = (n) => Number(n || 0).toFixed(2);
    const center = (s) => {
      const text = String(s || '').slice(0, W);
      const pad = Math.max(0, Math.floor((W - text.length) / 2));
      return ' '.repeat(pad) + text;
    };
    const labelVal = (label, value) => {
      const left = String(label || '');
      const right = String(value || '');
      return left + ' '.repeat(Math.max(1, W - left.length - right.length)) + right;
    };
    const date = new Date(`${quote.fecha}T12:00:00`);
    const due = new Date(`${quote.vence}T12:00:00`);
    const fechaStr = Number.isNaN(date.getTime()) ? quote.fecha : date.toLocaleDateString('es-DO');
    const venceStr = Number.isNaN(due.getTime()) ? quote.vence : due.toLocaleDateString('es-DO');
    const rawNumero = String(quote.numero || '').trim();
    const numero = rawNumero
      ? (rawNumero.toUpperCase().startsWith('CT-') ? rawNumero : `CT-${rawNumero.padStart(6, '0')}`)
      : 'CT-N/A';
    const sep = '-'.repeat(W);
    const sep2 = '='.repeat(W);
    const CANT_W = 8;
    const PRECIO_W = 7;
    const ITBIS_W = 7;
    const MONTO_W = W - CANT_W - PRECIO_W - ITBIS_W;
    const columnsHeader = 'CANT'.padEnd(CANT_W) + 'PRECIO'.padStart(PRECIO_W) + 'ITBIS'.padStart(ITBIS_W) + 'MONTO'.padStart(MONTO_W);

    let text = '';
    text += center(empresa?.nombre || 'REPUESTOS MORLA') + '\n';
    if (empresa?.direccion) text += center(empresa.direccion) + '\n';
    if (empresa?.telefono) text += center(empresa.telefono) + '\n';
    text += '\n' + center('COTIZACION') + '\n';
    text += labelVal(`Numero  : ${numero}`, quote.hora || '') + '\n';
    text += `Fecha   : ${fechaStr}\n`;
    text += `Vence   : ${venceStr}\n`;
    text += `Cliente : ${quote.cliente || 'CLIENTE GENERICO'}\n`;
    text += `Tel.    : ${quote.telefono || 'N/A'}\n\n`;
    text += sep + '\n';
    text += 'Descripcion de la Mercancia\n';
    text += sep + '\n';
    text += columnsHeader + '\n';
    text += sep + '\n\n';

    quote.items.forEach((item) => {
      const qty = Number(item.cantidad || 0);
      const price = Number(item.precio_unitario || item.precio || 0);
      const importe = Number(item.importe ?? qty * price);
      const itbis = Number(item.itbis_valor ?? Math.max(0, importe - (importe / (1 + Number(item.itbis_pct || 0.18)))));
      text += `${String(item.descripcion || '').toUpperCase()}\n`;
      text += `${`${qty} UND`.padEnd(CANT_W)}${fmt(price).padStart(PRECIO_W)}${fmt(itbis).padStart(ITBIS_W)}${fmt(importe).padStart(MONTO_W)}\n`;
    });

    text += '\n';
    text += labelVal('              Sub-Total :', fmt(quote.subtotal)) + '\n';
    text += labelVal('       Descuento en Items:', fmt(quote.descuento)) + '\n';
    text += labelVal('Valores en         ITBIS :', fmt(quote.itbis)) + '\n';
    text += 'DOP    ' + '='.repeat(W - 7) + '\n';
    text += labelVal('                  TOTAL :', fmt(quote.total)) + '\n';
    text += sep2 + '\n\n';
    text += center('*** COTIZACION NO AFECTA INVENTARIO ***') + '\n';
    return text;
  };

  const handleShareQuote = async () => {
    if (!selected || sharingQuote) return;
    setSharingQuote(true);
    try {
      await sendTextToConversation(buildQuoteMessage());
      await handleMarkQuoteSent({ silent: true });
      toast({ title: 'Cotizacion compartida', description: 'Se envio en la conversacion abierta.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo compartir', description: error.message });
    } finally {
      setSharingQuote(false);
    }
  };

  const renderConversationName = (conv) => conv.cliente_nombre || conv.contact_name || getConversationContactLabel(conv);
  const renderConversationInitial = (conv) => renderConversationName(conv).trim().charAt(0).toUpperCase() || '?';
  const renderConversationAvatar = (conv, className, unreadCount = 0) => {
    const logo = getConversationLogo(conv);
    const ringClass = unreadCount ? 'ring-2 ring-emerald-500 border-emerald-300' : 'border-slate-200';
    if (logo) {
      return (
        <div className={`${className} overflow-hidden border bg-white ${ringClass}`}>
          <img src={logo} alt={renderConversationName(conv)} className="h-full w-full object-cover" />
        </div>
      );
    }
    return (
      <div className={`${className} border flex items-center justify-center font-black ${
        unreadCount
          ? 'bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500'
          : 'bg-sky-100 text-sky-700 border-sky-200'
      }`}>
        {renderConversationInitial(conv)}
      </div>
    );
  };
  const formatConversationTime = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return format(date, 'h:mm a', { locale: es }).replace('AM', 'a. m.').replace('PM', 'p. m.');
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
    return format(date, 'd/M/yyyy', { locale: es });
  };
  const selectedPlatform = selected?.platform || 'whatsapp';
  const selectedChannelMeta = channelMeta[selectedPlatform] || channelMeta.whatsapp;
  const SelectedChannelIcon = selectedChannelMeta.icon;
  const selectedLifecycle = getConversationLifecycle(selected);

  return (
    <>
      <Helmet>
        <title>Sales Hub - {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <div className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#efeae2]">
        <div className={`h-full min-h-0 w-full min-w-0 grid grid-cols-1 ${showInboxPanel ? 'lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(380px,420px)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)]'}`}>
          {showInboxPanel && (
          <aside className={`min-h-0 min-w-0 bg-white border-r border-slate-200 flex-col overflow-hidden ${selected ? 'hidden lg:flex' : 'flex'}`}>
            <div className="p-3 2xl:p-4 border-b bg-white">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl 2xl:text-2xl font-black text-slate-900">Sales Hub</h1>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setIsStartChatOpen(true)} title="Iniciar chat">
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (soundEnabled) {
                        playNotificationSound?.({ force: true });
                      } else {
                        toggleSound();
                      }
                    }}
                    title={soundEnabled ? 'Probar sonido de mensajes' : 'Encender sonido de mensajes'}
                    className={soundEnabled ? 'text-emerald-600' : 'text-slate-400'}
                  >
                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowNewManualConv(true)} title="Nueva conversación manual (Instagram/Facebook/WhatsApp)">
                    <PlusCircle className="h-4 w-4 text-violet-600" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={fetchConversations} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Canal manual: estado y conexion por QR (tu WhatsApp) */}
              <button
                type="button"
                onClick={waStatus.connected ? handleLogoutWhatsApp : handleConnectWhatsApp}
                disabled={waStatus.offline}
                className={`w-full mb-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                  waStatus.connected
                    ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                    : waStatus.offline
                      ? 'border-slate-200 bg-slate-50 opacity-70 cursor-not-allowed'
                      : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                }`}
                title={waStatus.offline ? 'El servicio del canal manual no esta corriendo' : ''}
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  {waStatus.connected
                    ? <><Wifi className="h-4 w-4 text-emerald-600" /> Mi WhatsApp conectado</>
                    : waStatus.offline
                      ? <><WifiOff className="h-4 w-4 text-slate-400" /> Servicio apagado</>
                      : <><QrCode className="h-4 w-4 text-amber-600" /> Conectar mi WhatsApp</>}
                </span>
                <span className="text-[11px] text-slate-500">
                  {waStatus.connected ? 'Desconectar' : waStatus.offline ? '' : 'QR'}
                </span>
              </button>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="h-10 rounded-full border-0 bg-slate-100 pl-9 shadow-none focus-visible:ring-1 focus-visible:ring-emerald-500" placeholder="Buscar un chat o iniciar uno nuevo" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="mt-3 grid grid-cols-2 2xl:grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
                {salesTabs.map(tab => {
                  const TabIcon = tab.icon;
                  const count = tab.value === 'followups'
                    ? followupCount
                    : tab.value === 'unread'
                      ? totalUnread
                      : null;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setInboxTab(tab.value)}
                      className={`h-8 min-w-0 rounded px-1 text-[11px] font-bold inline-flex items-center justify-center gap-1 ${inboxTab === tab.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      title={tab.label}
                    >
                      <TabIcon className="h-3.5 w-3.5" />
                      <span className="truncate">{tab.label}</span>
                      {count ? <span>({count})</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {loading ? (
                <div className="p-3 space-y-3">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 rounded-lg px-1 py-2">
                      <div className="h-11 w-11 shrink-0 rounded-full bg-slate-100 animate-pulse" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
                        <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
                        <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length ? (
                filteredConversations.map(conv => {
                  const unreadCount = unreadByConversation[conv.id] || 0;
                  const platform = conv.platform || 'whatsapp';
                  const meta = channelMeta[platform] || channelMeta.whatsapp;
                  const ChannelIcon = meta.icon;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setSelected(conv);
                        markConversationRead(conv.id);
                      }}
                      className={`w-full min-w-0 text-left px-3 2xl:px-4 py-3 transition-colors hover:bg-[#f5f6f6] ${selected?.id === conv.id ? 'bg-[#f0f2f5]' : unreadCount ? 'bg-white' : 'bg-white'}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {renderConversationAvatar(conv, 'relative h-11 w-11 2xl:h-12 2xl:w-12 shrink-0 rounded-full text-sm', unreadCount)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`truncate text-sm ${unreadCount ? 'font-black text-slate-950' : 'font-semibold text-slate-900'}`}>
                              {renderConversationName(conv)}
                            </p>
                            <span className={`shrink-0 text-[11px] ${unreadCount ? 'font-black text-emerald-600' : 'text-slate-500'}`}>
                              {formatConversationTime(conv.last_message_at)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className={`min-w-0 truncate text-xs ${unreadCount ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                              {conv.last_message_preview || getConversationContactLabel(conv) || 'Sin mensajes'}
                            </p>
                            <div className="flex shrink-0 items-center gap-1">
                              {!soundEnabled && <VolumeX className="h-3.5 w-3.5 text-slate-400" />}
                              {unreadCount > 0 && (
                                <span className="min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center bg-emerald-500 text-white shadow-sm">
                                  {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                              <Badge className={`border text-[10px] ${meta.className}`}>
                                <ChannelIcon className="h-3 w-3 mr-1" />
                                {meta.label}
                              </Badge>
                              <Badge className={`border text-[10px] ${conversationStatusStyles[conv.status] || conversationStatusStyles.abierta}`}>
                                {conversationStatusLabels[conv.status] || conv.status}
                              </Badge>
                              {conv.quote_items_count > 0 && (
                                <span className="truncate text-[11px] text-slate-500">{conv.quote_items_count} item(s)</span>
                              )}
                            </div>
                            {needsFollowup(conv) && (
                              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-700">
                                <Clock3 className="h-3 w-3" />
                                {formatElapsed(conv.last_assistant_message_at || conv.last_message_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No hay conversaciones.</p>
                  <p className="mt-1 text-xs text-slate-500">Inicia un chat o cambia el filtro activo.</p>
                </div>
              )}
            </div>
          </aside>
          )}

          <main className={`min-h-0 min-w-0 overflow-hidden bg-[#efeae2] flex-col ${selected ? 'flex' : 'hidden lg:flex'}`}>
            {!selected ? (
              <div className="h-full flex items-center justify-center text-slate-500">Selecciona una conversacion.</div>
            ) : (
              <>
                <div className="min-h-16 px-3 2xl:px-4 py-2 border-b border-slate-200 bg-white flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex flex-1 items-center gap-3">
                    {renderConversationAvatar(selected, 'h-10 w-10 2xl:h-11 2xl:w-11 rounded-full shrink-0 text-sm')}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h2 className="max-w-full truncate font-semibold text-slate-950">{renderConversationName(selected)}</h2>
                        <button
                          type="button"
                          onClick={openRenameModal}
                          title="Editar nombre del contacto"
                          className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <Badge className={`shrink-0 border ${selectedChannelMeta.className}`} title={`Canal: ${selectedChannelMeta.label}`}>
                          <SelectedChannelIcon className="h-3 w-3 mr-1" />
                          {selectedChannelMeta.label}
                        </Badge>
                        <Badge className={`shrink-0 border ${selectedLifecycle.tone}`} title="Estado del ciclo comercial">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {selectedLifecycle.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {[getConversationContactLabel(selected) || 'Sin contacto directo', selected.intent || 'intencion general']
                          .filter(Boolean)
                          .join(' - ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 xl:shrink-0 2xl:gap-2">
                    <Button variant="outline" size="sm" className="h-9 px-2 2xl:h-10 2xl:px-3" onClick={handleTakeConversation} title="Tomar conversacion">
                      <Handshake className="h-4 w-4 2xl:mr-2" />
                      <span className="hidden 2xl:inline">Tomar</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 px-2 2xl:h-10 2xl:px-3" onClick={handleMarkFollowup} title="Marcar seguimiento">
                      <CalendarClock className="h-4 w-4 2xl:mr-2" />
                      <span className="hidden 2xl:inline">Seguimiento</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 px-2 2xl:h-10 2xl:px-3" onClick={handleCreateLead} title="Crear lead">
                      <UserPlus className="h-4 w-4 2xl:mr-2" />
                      <span className="hidden 2xl:inline">Lead</span>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 rounded-full px-2 gap-1.5 bg-white 2xl:h-10 2xl:px-4 2xl:gap-2" title="Etiquetar chat">
                          <SlidersHorizontal className="h-4 w-4" />
                          <span className="hidden lg:inline">Etiquetar</span>
                          <span className="hidden 2xl:inline"> chat</span>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {conversationStatusOptions.map(option => {
                          const StatusIcon = option.icon;
                          const active = selected.status === option.value;
                          return (
                            <DropdownMenuItem
                              key={option.value}
                              disabled={updatingStatus || (option.value === 'cotizacion_enviada' && !selected.cotizacion_id)}
                              onClick={() => handleSelectConversationStatus(option.value)}
                              className={active ? 'bg-emerald-50 text-emerald-800 font-semibold' : ''}
                            >
                              <StatusIcon className="h-4 w-4 mr-2" />
                              {option.label}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 2xl:h-10 2xl:w-10"
                      onClick={handleToggleInboxPanel}
                      title={showInboxPanel ? 'Cerrar bandeja izquierda' : 'Abrir bandeja izquierda'}
                    >
                      {showInboxPanel ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 2xl:h-10 2xl:w-10"
                      onClick={() => setShowRightPanel(prev => !prev)}
                      title={showRightPanel ? 'Cerrar panel derecho' : 'Abrir panel derecho'}
                    >
                      {showRightPanel ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 px-2 2xl:h-10 2xl:px-3" onClick={handleToggleBot} title={`Bot ${selected.bot_enabled ? 'ON' : 'OFF'}`}>
                      {selected.bot_enabled ? <Power className="h-4 w-4 2xl:mr-2 text-emerald-600" /> : <PowerOff className="h-4 w-4 2xl:mr-2 text-red-600" />}
                      <span className="hidden 2xl:inline">Bot {selected.bot_enabled ? 'ON' : 'OFF'}</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 px-2 2xl:h-10 2xl:px-3" onClick={handleOpenQuotePanel} disabled={!isWhatsAppConversation(selected)} title="Cotizacion">
                      <FileText className="h-4 w-4 2xl:mr-2" />
                      <span className="hidden 2xl:inline">Cotizacion</span>
                    </Button>
                  </div>
                </div>

                <div className={`min-h-0 min-w-0 flex-1 grid grid-cols-1 ${showRightPanel ? 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] 2xl:grid-cols-[minmax(0,1fr)_380px]' : 'xl:grid-cols-[minmax(0,1fr)]'}`}>
                  <section className={`min-h-0 min-w-0 flex flex-col ${showRightPanel ? 'xl:border-r' : ''}`}>
                    <div
                      ref={chatScrollRef}
                      onScroll={handleChatScroll}
                      className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 2xl:p-6"
                      style={{
                        backgroundColor: '#efeae2',
                        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(134, 113, 92, 0.13) 1px, transparent 0)',
                        backgroundSize: '22px 22px',
                      }}
                    >
                      {detailLoading ? (
                        <div className="h-40 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                        </div>
                      ) : (
                        <div className="relative min-w-0 space-y-3">
                          {messages.map((message, index) => {
                            const mine = message.role === 'assistant' || message.role === 'agent';
                            const messageSource = message.metadata?.source;
                            const sourceLabel = message.role === 'assistant'
                              ? 'Bot'
                              : messageSource === 'web_crm'
                                ? 'CRM'
                                : messageSource === 'mobile_or_whatsapp'
                                  ? 'Celular'
                                  : message.role;
                            const quoteMessageId = message.metadata?.quote_id;
                            const quoteSnapshot = message.metadata?.quote_snapshot;
                            const isQuoteMessage = message.metadata?.message_kind === 'quote_image' && quoteMessageId;
                            const showDate = shouldShowDateSeparator(messages, index);
                            return (
                              <React.Fragment key={message.id}>
                                {showDate && (
                                  <div className="sticky top-2 z-10 flex justify-center">
                                    <span className="rounded-md bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                                      {formatMessageDateLabel(message.created_at)}
                                    </span>
                                  </div>
                                )}
                                <div className={`flex animate-in fade-in slide-in-from-bottom-1 duration-200 ${mine ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[86%] sm:max-w-[78%] 2xl:max-w-[70%] min-w-0 rounded-lg px-3 py-2 shadow-sm break-words [overflow-wrap:anywhere] ${mine ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-sm' : 'bg-white text-slate-900 rounded-tl-sm'}`}>
                                  <div className="flex min-w-0 items-start justify-between gap-2 mb-1">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1 opacity-80">
                                      {message.role === 'assistant'
                                        ? <Bot className="h-3 w-3" />
                                        : messageSource === 'mobile_or_whatsapp'
                                          ? <Smartphone className="h-3 w-3" />
                                          : <UserRound className="h-3 w-3" />}
                                      <span className="text-[10px] uppercase font-bold">{sourceLabel}</span>
                                    </div>
                                    {isQuoteMessage && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-slate-500 hover:bg-black/5">
                                            <MoreVertical className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align={mine ? 'end' : 'start'} className="w-56">
                                          <DropdownMenuItem onClick={() => handleEditQuoteFromMessage(quoteMessageId, quoteSnapshot)}>
                                            <Edit3 className="h-4 w-4 mr-2" />
                                            Editar como nueva
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleResendQuoteImage(quoteMessageId, quoteSnapshot)}>
                                            <Share2 className="h-4 w-4 mr-2" />
                                            Reenviar JPG
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleSendToInvoice(quoteMessageId)}>
                                            <ShoppingCart className="h-4 w-4 mr-2" />
                                            Enviar a facturacion
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => window.open(message.metadata?.media_url, '_blank')}>
                                            <ImageIcon className="h-4 w-4 mr-2" />
                                            Ver imagen
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                  {message.metadata?.media_url && (
                                    <div className="mb-1">
                                      {(message.metadata.media_type === 'image' || message.metadata.media_type === 'sticker') ? (
                                        <a href={message.metadata.media_url} target="_blank" rel="noreferrer">
                                          <img src={message.metadata.media_url} alt="adjunto" className="rounded-md max-w-full max-h-72 object-contain" />
                                        </a>
                                      ) : message.metadata.media_type === 'audio' ? (
                                        <div className="flex min-w-0 items-center gap-2 rounded-full bg-white/70 px-2 py-1">
                                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                            <Mic className="h-4 w-4" />
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-bold text-slate-600">Nota de voz</p>
                                            <audio controls src={message.metadata.media_url} className="h-8 max-w-full" />
                                          </div>
                                        </div>
                                      ) : message.metadata.media_type === 'video' ? (
                                        <video controls src={message.metadata.media_url} className="rounded max-w-full max-h-64" />
                                      ) : (
                                        <a href={message.metadata.media_url} target="_blank" rel="noreferrer" className="underline text-xs inline-flex items-center gap-1">
                                          <FileText className="h-3 w-3" /> Descargar archivo
                                        </a>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                                    <span>{format(new Date(message.created_at), 'h:mm a', { locale: es }).replace('AM', 'a. m.').replace('PM', 'p. m.')}</span>
                                    {mine && <span className="opacity-75">{message.status}</span>}
                                  </div>
                                  </div>
                                </div>
                              </React.Fragment>
                            );
                          })}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                      {showNewMessagesButton && (
                        <div className="sticky bottom-2 z-20 flex justify-center">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 rounded-full bg-emerald-500 px-3 text-xs font-bold text-white shadow-md hover:bg-emerald-600"
                            onClick={() => scrollMessagesToBottom('smooth')}
                          >
                            Nuevos mensajes
                            <ChevronDown className="ml-1 h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="px-3 sm:px-4 py-3 border-t bg-[#f0f2f5]">
                      {/* Hermes sugiere. NO envía: propone, y el vendedor manda,
                          corrige o descarta. Esa decisión es la que enseña. */}
                      {sugerencia && (
                        <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                            <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Hermes sugiere</span>
                            {!!sugerencia.productos?.length && (
                              <span className="text-[11px] text-violet-500">
                                · {sugerencia.productos.length} pieza{sugerencia.productos.length > 1 ? 's' : ''} encontrada{sugerencia.productos.length > 1 ? 's' : ''}
                              </span>
                            )}
                            <button type="button" className="ml-auto text-slate-400 hover:text-slate-600"
                              onClick={() => descartarSugerencia()} title="Descartar">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{sugerencia.texto}</p>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700"
                              onClick={() => usarSugerencia(true)}>
                              Enviar así
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => usarSugerencia(false)}>
                              Editar antes
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="flex min-w-0 items-end gap-2">
                        <Button
                          variant="ghost" size="icon"
                          className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full text-violet-500 hover:bg-violet-50"
                          title="Pedirle a Hermes que sugiera la respuesta"
                          onClick={pedirSugerencia}
                          disabled={pidiendoSugerencia}
                        >
                          {pidiendoSugerencia
                            ? <Loader2 className="h-5 w-5 animate-spin" />
                            : <Sparkles className="h-6 w-6" />}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full text-slate-500 hover:bg-white" title="Acciones rapidas">
                              <PlusCircle className="h-6 w-6" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-60">
                            <DropdownMenuItem onClick={() => handleQuickAction('product')}>
                              <PackagePlus className="h-4 w-4 mr-2" />
                              Enviar producto
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleQuickAction('quote')}>
                              <FileText className="h-4 w-4 mr-2" />
                              Crear cotizacion
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleQuickAction('image')}>
                              <ImageIcon className="h-4 w-4 mr-2" />
                              Enviar imagen
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleQuickAction('location')}>
                              <MapPin className="h-4 w-4 mr-2" />
                              Enviar ubicacion
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleQuickAction('followup')}>
                              <CalendarClock className="h-4 w-4 mr-2" />
                              Programar seguimiento
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleQuickAction('template')}>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Usar plantilla
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="relative min-w-0 flex-1">
                          {visibleQuickReplies.length > 0 && (
                            <div className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-56 overflow-y-auto rounded-lg border bg-white p-1 shadow-lg">
                              {visibleQuickReplies.map(template => (
                                <button
                                  key={template.command}
                                  type="button"
                                  className="flex w-full min-w-0 items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
                                  onClick={() => handleApplyQuickReply(template)}
                                >
                                  <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-black text-emerald-700">
                                    {template.command}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-xs font-bold text-slate-800">{template.label}</span>
                                    <span className="block truncate text-xs text-slate-500">{template.text}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          <Textarea
                            ref={replyInputRef}
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder={isWhatsAppConversation(selected) ? 'Escribe un mensaje' : 'Guardar seguimiento interno'}
                            className="min-h-[42px] max-h-28 min-w-0 resize-none rounded-2xl border-0 bg-white px-4 py-2 shadow-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                              }
                            }}
                          />
                        </div>
                        <Button className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full self-end bg-emerald-500 hover:bg-emerald-600 shadow-sm" onClick={handleSend} disabled={!reply.trim() || sending}>
                          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </Button>
                        <Button
                          variant={recordingAudio ? 'destructive' : 'outline'}
                          className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full self-end bg-white shadow-sm"
                          onClick={handleToggleAudioRecording}
                          disabled={!selected || sendingAudio || !isWhatsAppConversation(selected)}
                          title={recordingAudio ? 'Detener y enviar audio' : 'Grabar nota de voz'}
                        >
                          {sendingAudio ? <Loader2 className="h-5 w-5 animate-spin" /> : recordingAudio ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                        {selected && !isWhatsAppConversation(selected) && (
                          <Button
                            variant="outline"
                            className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full self-end bg-white shadow-sm"
                            onClick={handleRecordIncomingManual}
                            title="Pegar mensaje del cliente (registro manual)"
                          >
                            <UserPlus className="h-5 w-5 text-violet-600" />
                          </Button>
                        )}
                      </div>
                      {recordingAudio && (
                        <p className="mt-2 text-xs font-semibold text-red-600">Grabando nota de voz...</p>
                      )}
                      {sending && (
                        <p className="mt-2 text-xs font-semibold text-slate-500">Enviando...</p>
                      )}
                    </div>
                  </section>

                  {showRightPanel && (
                  <aside className="min-h-0 min-w-0 flex flex-col bg-white overflow-hidden">
                    <div className="p-3 border-b bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-700" />
                            Cotizacion WhatsApp
                          </h3>
                          <p className="text-xs text-slate-500">{selectedItems.length} de {quoteItems.length} articulo(s) seleccionados</p>
                        </div>
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowRightPanel(false)} title="Cerrar panel derecho">
                          <PanelRightClose className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3 bg-white">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8"
                        onClick={() => setIsProductSearchOpen(true)}
                      >
                        <PlusCircle className="h-4 w-4 mr-1" />
                        Agregar producto
                      </Button>
                      {quoteItems.length ? quoteItems.map(item => (
                        <div key={item.id} className={`border rounded-lg overflow-hidden bg-white ${item.selected ? 'border-blue-200 shadow-sm' : 'border-slate-200 opacity-70'}`}>
                          <div className="p-3">
                            <div className="flex items-start gap-2">
                              <Checkbox className="mt-1" checked={item.selected} onCheckedChange={() => handleToggleItem(item)} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                                      <span className="truncate">{item.codigo || 'SIN CODIGO'}</span>
                                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Ex: {Number(item.existencia || 0).toLocaleString('en-US')}</span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-900 leading-tight line-clamp-2">{item.descripcion}</p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {item.productos?.imagen_url ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-700"
                                        onClick={() => handleShareItemImage(item)}
                                        disabled={sharingImageId === item.id}
                                        title="Compartir imagen"
                                      >
                                        {sharingImageId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                                      </Button>
                                    ) : (
                                      <span className="h-7 w-7 inline-flex items-center justify-center text-slate-300" title="Sin imagen">
                                        <ImageIcon className="h-3.5 w-3.5" />
                                      </span>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => handleRemoveQuoteItem(item)}
                                      disabled={quoteSavingId === item.id}
                                      title="Quitar item"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-[78px_1fr] gap-2 items-end">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">Cant.</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={item.cantidad ?? 0}
                                      onChange={(e) => handleUpdateQuoteItem(item, { cantidad: e.target.value })}
                                      className="h-8 text-right pl-10 pr-6 text-sm"
                                    />
                                    <div className="absolute right-1 top-1 bottom-1 flex flex-col">
                                      <button
                                        type="button"
                                        onClick={() => handleStepQuoteQuantity(item, 1)}
                                        className="h-3.5 w-4 flex items-center justify-center rounded-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                        title="Aumentar cantidad"
                                      >
                                        <ChevronUp className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleStepQuoteQuantity(item, -1)}
                                        className="h-3.5 w-4 flex items-center justify-center rounded-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                        title="Disminuir cantidad"
                                      >
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="relative min-w-0">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">Precio</span>
                                    <p className="h-8 flex items-center justify-end rounded-md bg-slate-50 pl-12 pr-2 text-sm font-semibold text-slate-800 border border-slate-100">
                                      {formatMoney(item.precio_unitario)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-sm text-slate-500 px-6">
                          <PackagePlus className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                          <p className="font-semibold text-slate-700">Todavia no hay articulos</p>
                          <p className="mt-1">Agrega productos manualmente o espera a que el bot detecte piezas en la conversacion.</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => setIsProductSearchOpen(true)}
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Buscar producto
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="p-3 border-t bg-slate-50">
                      <div className="space-y-1.5 mb-3 text-sm">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Subtotal</span>
                          <span>{formatMoney(quoteTotals.subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span>ITBIS</span>
                          <span>{formatMoney(quoteTotals.itbis)}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="font-bold text-slate-700">Total seleccionado</span>
                          <strong className="text-lg text-slate-900">{formatMoney(selectedTotal)}</strong>
                        </div>
                      </div>
                      <Button
                        className="w-full mb-2"
                        onClick={() => handleCreateQuote({ shareImage: true })}
                        disabled={!selectedItems.length || creatingQuote || sendingQuoteImage}
                      >
                        {(creatingQuote || sendingQuoteImage) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-2" />}
                        {selected.cotizacion_id || quoteDraftMode === 'new' ? 'Crear nueva cotizacion JPG' : 'Crear y enviar cotizacion JPG'}
                      </Button>
                    </div>
                    </>
                  </aside>
                  )}

                  {false && !mainSidebarOpen && (
                  <aside className="min-h-0 flex flex-col bg-white border-l-2 border-slate-300 shadow-[-6px_0_12px_-12px_rgba(15,23,42,0.9)]">
                    <div className="px-2 py-2 border-b bg-slate-100">
                      <div className="flex items-start gap-1.5">
                        <div>
                          <h3 className="text-[11px] font-black text-slate-900 flex items-center gap-1">
                            <SlidersHorizontal className="h-3 w-3 text-slate-700" />
                            Comercial
                          </h3>
                          <p className="text-[10px] text-slate-500 truncate max-w-[145px]">{conversationStatusLabels[selected.status] || selected.status}</p>
                        </div>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2 bg-white">
                      <div className="grid grid-cols-1 gap-1">
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px]" onClick={() => handleSetConversationStatus('en_atencion')} disabled={updatingStatus}>
                          <MessageCircle className="h-3.5 w-3.5 mr-1" /> Atender
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px]" onClick={() => handleSetConversationStatus('esperando_cliente')} disabled={updatingStatus}>
                          <Clock3 className="h-3.5 w-3.5 mr-1" /> Espera
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px]" onClick={() => handleMarkQuoteSent()} disabled={updatingStatus || !selected.cotizacion_id}>
                          <CheckCheck className="h-3.5 w-3.5 mr-1" /> Enviada
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px]" onClick={() => handleSetConversationStatus('cliente_interesado')} disabled={updatingStatus}>
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Interesado
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px]" onClick={() => handleSetConversationStatus('pendiente_pago')} disabled={updatingStatus}>
                          <CreditCard className="h-3.5 w-3.5 mr-1" /> Pago
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px]" onClick={() => handleSetConversationStatus('seguimiento_futuro')} disabled={updatingStatus}>
                          <CalendarClock className="h-3.5 w-3.5 mr-1" /> Seguir
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px]" onClick={() => handleSetConversationStatus('producto_agotado')} disabled={updatingStatus}>
                          <PackagePlus className="h-3.5 w-3.5 mr-1" /> Agotado
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 justify-start px-2 text-[11px] text-red-700 hover:text-red-800" onClick={() => handleSetConversationStatus('venta_perdida')} disabled={updatingStatus}>
                          <Ban className="h-3.5 w-3.5 mr-1" /> Perdida
                        </Button>
                      </div>
                      <div className="pt-2 border-t space-y-1.5">
                        <p className="text-[9px] font-bold uppercase text-slate-500">Rapidos</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start h-auto py-1 px-1.5 text-left whitespace-normal text-[11px] leading-tight"
                          onClick={() => setReply('Hola, seguimos atentos por aqui. Desea que le separe los productos de la cotizacion?')}
                        >
                          Seguimiento de cotizacion
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start h-auto py-1 px-1.5 text-left whitespace-normal text-[11px] leading-tight"
                          onClick={() => setReply('Perfecto, tenemos esos productos disponibles. Desea pasar a retirarlos o prefiere que le preparemos la factura?')}
                        >
                          Confirmar retiro o factura
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start h-auto py-1 px-1.5 text-left whitespace-normal text-[11px] leading-tight"
                          onClick={() => setReply('Hola, le escribimos para confirmar si todavia necesita la pieza cotizada. La disponibilidad puede variar durante el dia.')}
                        >
                          Cotizacion sin respuesta
                        </Button>
                      </div>
                    </div>
                    <div className="p-2 border-t bg-slate-50">
                      {(selected.cotizacion_id || createdQuote) && (
                        <Button variant="outline" size="sm" className="w-full h-7 mb-1 text-[11px]" onClick={handleShareQuote} disabled={sharingQuote}>
                          {sharingQuote ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1" />}
                          Compartir
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="w-full h-7 text-[11px]" onClick={handleSendToInvoice} disabled={!selected.cotizacion_id || sendingToInvoice}>
                        {sendingToInvoice ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5 mr-1" />}
                        Facturar
                      </Button>
                    </div>
                  </aside>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-900 flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-emerald-600" /> Conectar mi WhatsApp
              </h3>
              <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            {waStatus.connected ? (
              <div className="py-8">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
                <p className="font-bold text-slate-900">Conectado correctamente</p>
              </div>
            ) : waStatus.qr ? (
              <>
                <img src={waStatus.qr} alt="QR de WhatsApp" className="w-56 h-56 mx-auto" />
                <p className="text-sm text-slate-600 mt-4">
                  En tu celular: <strong>WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo</strong> y escanea este codigo.
                </p>
              </>
            ) : (
              <div className="py-10">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Generando codigo QR...</p>
                <p className="text-[11px] text-slate-400 mt-1">Si tarda, verifica que el servicio del canal manual este corriendo.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {quoteImageData && (
        <div className="fixed top-0 bg-white p-0 pointer-events-none" style={{ left: -10000 }} aria-hidden="true">
          <div
            ref={quoteImageRef}
            className="bg-white text-slate-950"
            style={{
              width: 360,
              padding: '14px 12px',
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.25,
              fontWeight: 700,
              whiteSpace: 'pre-wrap',
            }}
          >
            {buildQuoteImageText()}
          </div>
        </div>
      )}

      <Dialog open={isStartChatOpen} onOpenChange={(open) => {
        setIsStartChatOpen(open);
        if (!open) resetStartChatForm();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar chat</DialogTitle>
            <DialogDescription>Crear una conversacion de WhatsApp desde Sales Hub.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStartConversation} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-chat-phone">Telefono</Label>
              <Input
                id="start-chat-phone"
                value={startChatForm.telefono}
                onChange={(event) => setStartChatForm(prev => ({ ...prev, telefono: event.target.value }))}
                placeholder="+1 (849) 000-0000"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-chat-name">Nombre</Label>
              <Input
                id="start-chat-name"
                value={startChatForm.nombre}
                onChange={(event) => setStartChatForm(prev => ({ ...prev, nombre: event.target.value }))}
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-chat-message">Mensaje</Label>
              <Textarea
                id="start-chat-message"
                value={startChatForm.mensaje}
                onChange={(event) => setStartChatForm(prev => ({ ...prev, mensaje: event.target.value }))}
                placeholder="Escribe el primer mensaje"
                className="min-h-24"
              />
            </div>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              <Checkbox
                checked={startChatForm.guardarCliente}
                onCheckedChange={(checked) => setStartChatForm(prev => ({ ...prev, guardarCliente: checked === true }))}
              />
              Guardar como cliente
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsStartChatOpen(false)} disabled={startingChat}>
                Cancelar
              </Button>
              <Button type="submit" disabled={startingChat}>
                {startingChat ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Crear chat
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ProductSearchModal
        isOpen={isProductSearchOpen}
        onClose={() => setIsProductSearchOpen(false)}
        onSelectProduct={handleSelectQuoteProduct}
        sessionKey={selected?.id || null}
      />

      <NewManualConversationModal
        open={showNewManualConv}
        onClose={() => setShowNewManualConv(false)}
        onCreate={handleCreateManualConversation}
      />

      <Dialog open={showRenameModal} onOpenChange={(v) => { if (!v) setShowRenameModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar nombre del contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-600">Nombre</Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Nombre del cliente"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !savingRename && renameValue.trim()) handleRenameContact(); }}
            />
            <p className="text-[10px] text-slate-400 italic">
              Este nombre se guarda en el contacto del CRM y reemplaza el que WhatsApp trae por defecto.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowRenameModal(false)}>Cancelar</Button>
            <Button
              onClick={handleRenameContact}
              disabled={savingRename || !renameValue.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {savingRename ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WhatsAppCrmPage;
