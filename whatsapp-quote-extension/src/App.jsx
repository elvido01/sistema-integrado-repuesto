import React, { useEffect, useMemo, useRef, useState } from 'react';
import { castigarPrestamo, closeCobroGestiones, createOutOfStockRequests, createQuote, getAvailableProductNotifications, getClienteFicha, getClientesMorosos, getCobroGestiones, getEmpresasUsuarioExtension, getRobadoClienteIds, getOmniConversations, getOutOfStockRequest, getStoredSession, getVendors, insertCobroGestion, linkOmniConversationQuote, logConversationEvent, marcarEnvioCobranza, markNotificationsRead, markOutOfStockCustomerNotified, searchCustomers, searchProducts, sendOmniReply, setClienteTelefono, setCobranzaSeguimiento, setEmpresaActivaExtension, signInWithPassword, signOut, updateOmniConversationStatus } from './services/apiClient.js';
import { attachFileToWhatsApp, getCurrentChat, getWhatsAppDraftText, openWhatsAppChatViaInternalLink, openWhatsAppChatViaSearch, pasteTextIntoWhatsApp } from './utils/whatsappDom.js';
import { buildFichaPdf, downloadPdf } from './utils/fichaPdf.js';
import ChannelRail from './components/omni/ChannelRail.jsx';
import OmniInbox from './components/omni/OmniInbox.jsx';
import QuickOutOfStockForm from './components/out-of-stock/QuickOutOfStockForm.jsx';
import { CHANNEL_TYPES, getChannelCounts, getInitialChannel } from './channels/channelRegistry.js';
import { getDefaultOmniFlags, OMNI_BETA_VERSION, readSafeMode, writeSafeMode } from './core/omniConfig.js';

const money = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2
});

// Monto sin simbolo (para el texto del recordatorio: "1,606.94")
const plainAmount = new Intl.NumberFormat('es-DO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const DEFAULT_COBRO_TEMPLATE =
  'Hola {NOMBRE}. El estado de su cuenta en {EMPRESA} es el siguiente: ' +
  '{PAGOS}, MONTO ATRASADO: {MONTO} - ' +
  'Favor pagar a mas tardar entre las proximas 48 horas y evitar cargos ' +
  'adicionales, este es un mensaje automatico del sistema. Gracias.';
const DEFAULT_FINANCIERA_COBRO_TEMPLATE =
  'Hola {NOMBRE}. El estado de su cuenta en {EMPRESA} es el siguiente: ' +
  '{PAGOS}, MONTO ATRASADO: {MONTO} - ' +
  'Favor pagar a mas tardar entre las proximas 48 horas y evitar cargos ' +
  'adicionales, este es un mensaje automatico del sistema. Gracias.';

function buildCobroMessage(estado) {
  const isFinancieraCobro = ['financiera', 'gestion_cobro'].includes(estado?.tipo_cobranza);
  const fallbackTemplate = isFinancieraCobro
    ? DEFAULT_FINANCIERA_COBRO_TEMPLATE
    : DEFAULT_COBRO_TEMPLATE;
  const plantilla = isFinancieraCobro
    ? fallbackTemplate
    : ((estado?.plantilla && estado.plantilla.trim()) || fallbackTemplate);
  const facturas = (estado?.facturas || []).map((f) => f.numero).join(', ');
  const pagosVencidos = Number(estado?.cuotas_atrasadas ?? 0);
  const pagosTexto = `${pagosVencidos} ${pagosVencidos === 1 ? 'pago vencido' : 'pagos vencidos'}`;
  const map = {
    '{NOMBRE}': estado?.cliente_nombre || '',
    '{EMPRESA}': estado?.empresa_nombre || 'la empresa',
    '{N}': String(pagosVencidos),
    '{PAGOS}': pagosTexto,
    '{FACTURAS}': facturas,
    '{MONTO}': plainAmount.format(Number(estado?.total_atrasado) || 0)
  };
  return plantilla.replace(/\{NOMBRE\}|\{EMPRESA\}|\{N\}|\{PAGOS\}|\{FACTURAS\}|\{MONTO\}/g, (token) => map[token] ?? token);
}

function buildCobroMessageFor(cliente, empresaNombre, plantilla) {
  return buildCobroMessage({
    plantilla,
    empresa_nombre: empresaNombre,
    tipo_cobranza: cliente.tipo_cobranza,
    cliente_nombre: cliente.cliente_nombre,
    cuotas_atrasadas: cliente.cuotas_atrasadas,
    total_atrasado: cliente.total_atrasado,
    facturas: cliente.facturas
  });
}

function buildAvailableProductMessage(solicitud) {
  const name = solicitud?.clientes?.nombre
    || solicitud?.cliente_nombre
    || solicitud?.customer_name_snapshot
    || 'cliente';
  const productName = solicitud?.productos?.descripcion
    || solicitud?.producto_texto
    || 'el producto que solicitaste';
  const price = Number(solicitud?.productos?.precio ?? solicitud?.productos?.precio1 ?? 0);
  const priceText = price > 0 ? `, con precio de ${money.format(price)}` : '';

  return `Hola, ${name}. Ya tenemos disponible ${productName}${priceText}. Deseas que te lo reservemos?`;
}

function getSolicitudPhone(solicitud) {
  return solicitud?.phone_normalized
    || solicitud?.clientes?.telefono
    || solicitud?.cliente_telefono
    || '';
}

const PENDING_COBRO_KEY = 'motoflow_pending_cobro';
const PENDING_BUSCADOR_KEY = 'motoflow_pending_buscador';
const MOTOFLOW_APP_URL = import.meta.env.VITE_MOTOFLOW_APP_URL || '';
const OMNI_FLAGS = getDefaultOmniFlags();

const COBRO_ESTADOS = [
  { key: 'ir_a_buscar', label: 'Ir a buscar' },
  { key: 'cliente_vendra', label: 'Cliente vendra' }
];

const GESTION_COBRO_TABS = [
  { key: 'todos', label: 'Todos los atrasados' },
  { key: 'recordatorio_pago', label: 'Recordatorio 3 dias' },
  // "Promesas de pago" se retiro del menu a pedido del usuario (2026-07-03):
  // las promesas se siguen viendo en cada caso y en "Promesas vencidas".
  { key: 'promesas_vencidas', label: 'Promesas vencidas' },
  { key: 'pagaron_siguen', label: 'Pagaron y siguen atrasados' },
  { key: 'mandados_buscar', label: 'Mandados a buscar' },
  { key: 'robados', label: 'Robados' },
  { key: 'sin_respuesta', label: 'Sin respuesta' },
  { key: 'criticos', label: 'Casos criticos' },
  { key: 'reenviar', label: 'Para reenviar' }
];

// Normaliza un telefono dominicano al formato de wa.me (1 + 10 digitos).
function normalizePhone(raw, options = {}) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = '1' + digits;
  if (options.e164) return digits ? `+${digits}` : '';
  return digits;
}

function normalizePhoneE164(raw) {
  return normalizePhone(raw, { e164: true });
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function looseText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isSameLooseName(a, b) {
  const left = looseText(a);
  const right = looseText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function formatDateDo(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
}

function getOmniConversationName(conversation) {
  return conversation?.customer_name
    || conversation?.cliente_nombre
    || conversation?.customer_phone
    || conversation?.customer_external_id
    || 'Cliente Omni';
}

function getOmniPlatformLabel(platform) {
  const labels = {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    unified: 'Bandeja integrada',
    followups: 'Seguimientos'
  };
  return labels[platform] || platform || 'Canal social';
}

function splitPrestamoNumero(value) {
  const raw = String(value || '-').trim();
  const match = /^(PT-\d+)-(.+)$/.exec(raw);
  return match ? [match[1], match[2]] : [raw];
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function getGestionUltimoPagoFecha(cliente) {
  return firstPresent(
    cliente.ultimo_pago_fecha,
    cliente.ult_pago_fecha,
    cliente.fecha_ultimo_pago,
    cliente.ultimo_pago?.fecha,
    cliente.ultimo_pago
  );
}

function getGestionUltimoPagoMonto(cliente) {
  return firstPresent(
    cliente.ultimo_pago_monto,
    cliente.ult_pago_monto,
    cliente.monto_ultimo_pago,
    cliente.ultimo_pago?.monto,
    cliente.ultimo_pago?.total_pagado
  );
}

// Estilo del pill de estado: ROBADO va en negro con letras blancas (igual
// que el badge de la web) para que resalte del resto.
const estadoPillStyle = (estado) => (
  estado === 'Robado'
    ? { background: '#1e293b', color: '#ffffff', borderColor: '#0f172a' }
    : undefined
);

function getGestionEstado(cliente) {
  const today = new Date().toISOString().slice(0, 10);
  const pagos = Number(cliente.pagos_vencidos_equivalentes ?? cliente.cuotas_atrasadas ?? 0);
  const promesa = cliente.seg_fecha || cliente.fecha_promesa;

  if (cliente.es_robado) return 'Robado';
  if (cliente.recordatorio_pago) return 'Recordatorio 3 dias';
  if (cliente.estado_cobro) return cliente.estado_cobro;
  if (cliente.seg_estado === 'ir_a_buscar' || cliente.fisica_estado === 'mandado_buscar') return 'Mandado a buscar';
  if (promesa && promesa < today) return 'Promesa vencida';
  if (promesa && promesa === today) return 'Promesa para hoy';
  if (promesa) return 'Promesa futura';
  if (cliente.tiene_respuesta || cliente.respuesta_tipo) return 'Respondio';
  return pagos >= 2 ? 'Moroso' : 'Seguimiento';
}

function getGestionPrioridad(cliente) {
  const monto = Number(cliente.total_atrasado || 0);
  const dias = Number(cliente.dias_mas_vencido || 0);

  if (cliente.prioridad) return cliente.prioridad;
  if (dias >= 31 || monto >= 15000) return 'Alta';
  if (dias >= 16 || monto >= 6000) return 'Media';
  return 'Baja';
}

const STORAGE_PREFIX = 'motoflow_quote_draft:';
const LAST_QUOTE_PREFIX = 'motoflow_quote_last_sent:';
const META_PREFIX = 'motoflow_quote_meta:';
const HISTORY_PREFIX = 'motoflow_quote_history:';
const ADVANCED_LIMIT = 35;
const GENERIC_CLIENT_ID = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';
const STATUS_OPTIONS = [
  { key: 'cotizado', label: 'Cotizado' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'pendiente_pago', label: 'Pendiente pago' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'perdido', label: 'Perdido' }
];

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeLine(product) {
  const price = normalizeNumber(product.precio ?? product.precio_venta ?? product.precio1, 0);
  const taxPct = normalizeNumber(product.itbis_pct, 0.18);

  return {
    lineId: `${product.id || product.codigo || Date.now()}-${Date.now()}`,
    productId: product.id,
    codigo: product.codigo || '',
    descripcion: product.descripcion || product.nombre || 'Producto',
    precio: price,
    cantidad: 1,
    itbisPct: taxPct,
    existencia: normalizeNumber(product.existencia, 0),
    imagenUrl: product.imagen_url || ''
  };
}

function getStorageKey(chat) {
  return `${STORAGE_PREFIX}${chat.id || 'sin-chat'}`;
}

function getLastQuoteStorageKey(chat) {
  return `${LAST_QUOTE_PREFIX}${chat.id || 'sin-chat'}`;
}

function getMetaStorageKey(chat) {
  return `${META_PREFIX}${chat.id || 'sin-chat'}`;
}

function getHistoryStorageKey(chat) {
  return `${HISTORY_PREFIX}${chat.id || 'sin-chat'}`;
}

function readLastQuote(chat) {
  try {
    const saved = window.localStorage.getItem(getLastQuoteStorageKey(chat));
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function readMeta(chat) {
  try {
    const saved = window.localStorage.getItem(getMetaStorageKey(chat));
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function readHistory(chat) {
  try {
    const saved = window.localStorage.getItem(getHistoryStorageKey(chat));
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function writeHistory(chat, nextHistory) {
  window.localStorage.setItem(getHistoryStorageKey(chat), JSON.stringify(nextHistory.slice(0, 8)));
}

function formatQuoteMessage(chat, lines, totals) {
  const rows = lines
    .map((line) => {
      const qty = normalizeNumber(line.cantidad, 1);
      return `${line.descripcion}  ${qty} x ${money.format(line.precio)}`;
    })
    .join('\n');

  return [
    'Hola, esta es tu cotizacion:',
    '',
    rows,
    '',
    `Total: ${money.format(totals.total)}`,
    '',
    'Quedo atento para confirmar disponibilidad y entrega.'
  ].join('\n');
}

function serializeLines(lines) {
  return lines.map((line) => ({
    product_id: line.productId || null,
    codigo: line.codigo || '',
    descripcion: line.descripcion,
    cantidad: normalizeNumber(line.cantidad, 1),
    precio: normalizeNumber(line.precio, 0),
    itbis_pct: normalizeNumber(line.itbisPct, 0.18),
    existencia: normalizeNumber(line.existencia, 0)
  }));
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState('cotizar'); // 'cotizar' | 'cobranza' | 'omni'
  const [safeMode, setSafeMode] = useState(() => readSafeMode());
  const [activeChannel, setActiveChannel] = useState(() => getInitialChannel());
  const [chat, setChat] = useState(() => getCurrentChat());
  const [omniQuoteConversation, setOmniQuoteConversation] = useState(null);
  const [omniSelectedConversation, setOmniSelectedConversation] = useState(null);
  const activeQuoteChat = omniQuoteConversation
    ? { id: `omni:${omniQuoteConversation.id}`, name: getOmniConversationName(omniQuoteConversation) }
    : chat;
  const [lines, setLines] = useState([]);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState(() => getStoredSession());
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [empresasUsuario, setEmpresasUsuario] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [empresaPending, setEmpresaPending] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedSearch, setAdvancedSearch] = useState('');
  const [advancedMarca, setAdvancedMarca] = useState('');
  const [advancedModelo, setAdvancedModelo] = useState('');
  const [advancedIncludeZero, setAdvancedIncludeZero] = useState(true);
  const [advancedProducts, setAdvancedProducts] = useState([]);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [pastingQuote, setPastingQuote] = useState(false);
  const [sendingToMotoflow, setSendingToMotoflow] = useState(false);
  const [outOfStockOpen, setOutOfStockOpen] = useState(false);
  const [outOfStockSaving, setOutOfStockSaving] = useState(false);
  const [lastQuote, setLastQuote] = useState(() => readLastQuote(activeQuoteChat));
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [internalNote, setInternalNote] = useState(() => readMeta(activeQuoteChat).internalNote || '');
  const [quoteStatus, setQuoteStatus] = useState(() => readMeta(activeQuoteChat).quoteStatus || 'cotizado');
  const [quoteHistory, setQuoteHistory] = useState(() => readHistory(activeQuoteChat));
  const [motoflowDetailsOpen, setMotoflowDetailsOpen] = useState(false);
  const [morosos, setMorosos] = useState(null);   // { empresa_nombre, plantilla, clientes: [] }
  const [morososLoading, setMorososLoading] = useState(false);
  const [cobroMsg, setCobroMsg] = useState('');
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableProductsLoading, setAvailableProductsLoading] = useState(false);
  const [omniConversationsPreview, setOmniConversationsPreview] = useState([]);
  const [cobroFilter, setCobroFilter] = useState('');
  const [cobroView, setCobroView] = useState('todos');
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [selectedCobroCase, setSelectedCobroCase] = useState(null);
  const [summaryCobroCase, setSummaryCobroCase] = useState(null);
  const [caseDetailTab, setCaseDetailTab] = useState('gestion');
  const [casePromiseDate, setCasePromiseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [casePromiseAmount, setCasePromiseAmount] = useState('');
  const [caseNote, setCaseNote] = useState('');
  const [caseVisitResult, setCaseVisitResult] = useState('pendiente');
  const [caseSaving, setCaseSaving] = useState(false);
  const [sendingId, setSendingId] = useState(null);  // cliente_id que se esta enviando
  const phoneFocusRef = useRef('');                  // telefono al entrar al campo (para detectar cambios)

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = getCurrentChat();
      setChat((prev) => (prev.id === next.id && prev.name === next.name ? prev : next));
    }, 900);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session?.access_token || empresaPending) return;
    let alive = true;

    getEmpresasUsuarioExtension()
      .then((payload) => {
        if (!alive) return;
        const empresas = payload?.empresas || [];
        setEmpresasUsuario(empresas);
        const active = empresas.find((empresa) => empresa.activa) || empresas[0];
        setSelectedTenantId(active?.tenant_id || payload?.tenant_activo || '');
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [session?.access_token, empresaPending]);

  // Encoge WhatsApp Web mientras el panel esta abierto, para ver la
  // conversacion completa al lado (no tapada por el panel).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('mf-panel-open', !collapsed && !safeMode);
    return () => root.classList.remove('mf-panel-open');
  }, [collapsed, safeMode]);

  // Al abrir el chat de un cliente desde la lista de cobranza, WhatsApp
  // recarga la pagina; aqui recuperamos el mensaje pendiente y lo pegamos.
  useEffect(() => {
    let raw;
    try {
      raw = window.localStorage.getItem(PENDING_COBRO_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      window.localStorage.removeItem(PENDING_COBRO_KEY);
      return;
    }

    if (!pending?.text || (Date.now() - (pending.ts || 0)) > 90000) {
      window.localStorage.removeItem(PENDING_COBRO_KEY);
      return;
    }

    setMode('cobranza');
    loadMorosos(); // recarga la lista para que no quede vacia tras abrir el chat
    let attempts = 0;
    let cancelled = false;

    const tryPaste = async () => {
      if (cancelled) return;
      attempts += 1;
      const ok = await pasteTextIntoWhatsApp(pending.text);
      if (ok) {
        window.localStorage.removeItem(PENDING_COBRO_KEY);
        setCobroMsg('Recordatorio pegado en el chat. Revisa y presiona Enter para enviar.');
      } else if (attempts < 25) {
        window.setTimeout(tryPaste, 700);
      } else {
        window.localStorage.removeItem(PENDING_COBRO_KEY);
      }
    };

    const timer = window.setTimeout(tryPaste, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Al abrir el chat del buscador, regenera el PDF de la ficha y lo adjunta.
  // El File no sobrevive la recarga, por eso guardamos los DATOS y aqui
  // reconstruimos el PDF. Si no se puede adjuntar, lo descarga (respaldo).
  useEffect(() => {
    let raw;
    try {
      raw = window.localStorage.getItem(PENDING_BUSCADOR_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      window.localStorage.removeItem(PENDING_BUSCADOR_KEY);
      return;
    }

    if (!pending?.data || (Date.now() - (pending.ts || 0)) > 90000) {
      window.localStorage.removeItem(PENDING_BUSCADOR_KEY);
      return;
    }

    setMode('cobranza');
    loadMorosos();

    let file;
    try {
      file = buildFichaPdf(pending.data);
    } catch {
      window.localStorage.removeItem(PENDING_BUSCADOR_KEY);
      return;
    }

    let attempts = 0;
    let cancelled = false;

    const tryAttach = async () => {
      if (cancelled) return;
      attempts += 1;
      const ok = await attachFileToWhatsApp(file);
      if (ok) {
        window.localStorage.removeItem(PENDING_BUSCADOR_KEY);
        setCobroMsg('PDF adjuntado al chat del buscador. Revisa y presiona Enviar.');
      } else if (attempts < 25) {
        window.setTimeout(tryAttach, 700);
      } else {
        window.localStorage.removeItem(PENDING_BUSCADOR_KEY);
        downloadPdf(file);
        setCobroMsg('No pude adjuntar el PDF automaticamente. Lo descargue: arrastralo al chat del buscador.');
      }
    };

    const timer = window.setTimeout(tryAttach, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(getStorageKey(activeQuoteChat));
      const meta = readMeta(activeQuoteChat);
      setLines(saved ? JSON.parse(saved) : []);
      setLastQuote(readLastQuote(activeQuoteChat));
      setQuoteHistory(readHistory(activeQuoteChat));
      setInternalNote(meta.internalNote || '');
      setQuoteStatus(meta.quoteStatus || 'cotizado');
    } catch {
      setLines([]);
      setLastQuote(null);
      setQuoteHistory([]);
      setInternalNote('');
      setQuoteStatus('cotizado');
    }
  }, [activeQuoteChat.id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(getStorageKey(activeQuoteChat), JSON.stringify(lines));
    } catch {
      // localStorage can be blocked in unusual browser profiles.
    }
  }, [activeQuoteChat.id, lines]);

  useEffect(() => {
    try {
      window.localStorage.setItem(getMetaStorageKey(activeQuoteChat), JSON.stringify({ internalNote, quoteStatus }));
    } catch {
      // localStorage can be blocked in unusual browser profiles.
    }
  }, [activeQuoteChat.id, internalNote, quoteStatus]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setProducts([]);
      return;
    }

    let active = true;
    setLoading(true);
    searchProducts(term)
      .then((items) => {
        if (active) setProducts(items);
      })
      .catch((error) => {
        if (active) {
          setNotice(error.message || 'No se pudo buscar productos.');
          setProducts([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, session?.access_token]);

  useEffect(() => {
    if (!advancedOpen || !session) return;

    let active = true;
    setAdvancedLoading(true);
    searchProducts({
      query: advancedSearch.trim(),
      marca: advancedMarca.trim(),
      modelo: advancedModelo.trim(),
      includeZeroStock: advancedIncludeZero,
      limit: ADVANCED_LIMIT,
      offset: 0
    })
      .then((items) => {
        if (active) setAdvancedProducts(items);
      })
      .catch((error) => {
        if (active) {
          setNotice(error.message || 'No se pudo buscar productos.');
          setAdvancedProducts([]);
        }
      })
      .finally(() => {
        if (active) setAdvancedLoading(false);
      });

    return () => {
      active = false;
    };
  }, [advancedOpen, advancedSearch, advancedMarca, advancedModelo, advancedIncludeZero, session?.access_token]);

  useEffect(() => {
    if (!session) return;

    getVendors()
      .then((items) => setVendors(items || []))
      .catch(() => setVendors([]));
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || empresaPending) {
      setOmniConversationsPreview([]);
      return;
    }

    let active = true;
    getOmniConversations({ channel: CHANNEL_TYPES.UNIFIED, limit: 200 })
      .then((rows) => {
        if (active) setOmniConversationsPreview(rows || []);
      })
      .catch(() => {
        if (active) setOmniConversationsPreview([]);
      });

    return () => {
      active = false;
    };
  }, [session?.access_token, empresaPending]);

  useEffect(() => {
    if (!session?.access_token || empresaPending) {
      setAvailableProducts([]);
      return;
    }

    loadAvailableProductNotifications();
    const timer = window.setInterval(loadAvailableProductNotifications, 60000);
    return () => window.clearInterval(timer);
  }, [session?.access_token, empresaPending]);

  useEffect(() => {
    const name = omniQuoteConversation
      ? getOmniConversationName(omniQuoteConversation)
      : chat.name;
    const phone = omniQuoteConversation?.customer_phone || '';
    if (!name) return;

    setCustomerQuery((current) => current || name);
    if (phone || /[\d+() -]{7,}/.test(name)) {
      setCustomerPhone((current) => current || phone || name);
    }
  }, [chat.name, omniQuoteConversation?.id]);

  useEffect(() => {
    if (!session || selectedCustomer) {
      setCustomerResults([]);
      return;
    }

    const term = customerQuery.trim();
    if (term.length < 2) {
      setCustomerResults([]);
      return;
    }

    let active = true;
    searchCustomers(term)
      .then((items) => {
        if (active) setCustomerResults(items || []);
      })
      .catch(() => {
        if (active) setCustomerResults([]);
      });

    return () => {
      active = false;
    };
  }, [customerQuery, selectedCustomer?.id, session?.access_token]);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const qty = normalizeNumber(line.cantidad, 1);
        const total = qty * normalizeNumber(line.precio, 0);
        const taxPct = normalizeNumber(line.itbisPct, 0);
        const base = taxPct > 0 ? total / (1 + taxPct) : total;
        const tax = total - base;
        acc.subtotal += base;
        acc.tax += tax;
        acc.total += total;
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 }
    );
  }, [lines]);

  const totalQty = lines.reduce((sum, line) => sum + normalizeNumber(line.cantidad, 0), 0);

  function addProduct(product) {
    const line = makeLine(product);
    setLines((current) => [...current, line]);
    safeLogEvent('product_added', { items: serializeLines([line]), quote_total: totals.total + line.cantidad * line.precio });
    setQuery('');
    setProducts([]);
    setAdvancedOpen(false);
    setNotice('');
  }

  function updateLine(lineId, patch) {
    setLines((current) =>
      current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line))
    );
  }

  function removeLine(lineId) {
    const removed = lines.find((line) => line.lineId === lineId);
    setLines((current) => current.filter((line) => line.lineId !== lineId));
    if (removed) {
      safeLogEvent('product_removed', { items: serializeLines([removed]) });
    }
  }

  function safeLogEvent(eventType, overrides = {}) {
    if (!session?.access_token) return;

    logConversationEvent({
      event_type: eventType,
      chat_id: activeQuoteChat.id,
      chat_name: activeQuoteChat.name,
      cliente_id: selectedCustomer?.id || null,
      vendedor_id: selectedVendorId || null,
      customer_name: selectedCustomer?.nombre || customerQuery || activeQuoteChat.name || null,
      customer_phone: customerPhone || selectedCustomer?.telefono || null,
      status: quoteStatus,
      note: internalNote,
      quote_total: totals.total,
      items: serializeLines(lines),
      ...overrides,
      metadata: {
        selected_customer: selectedCustomer
          ? { id: selectedCustomer.id, nombre: selectedCustomer.nombre, telefono: selectedCustomer.telefono || null }
          : null,
        omni_conversation_id: omniQuoteConversation?.id || null,
        omni_platform: omniQuoteConversation?.platform || null,
        source: omniQuoteConversation ? 'motoflow_omni_extension' : 'whatsapp_web_extension',
        ...overrides.metadata
      }
    }).catch((error) => {
      // Registro de analitica best-effort: si falla no debe molestar al usuario
      console.debug('[Motoflow WhatsApp] No se pudo guardar evento:', error.message);
    });
  }

  function handleStatusChange(statusKey) {
    setQuoteStatus(statusKey);
    const label = STATUS_OPTIONS.find((item) => item.key === statusKey)?.label || statusKey;
    safeLogEvent('status_changed', { status: statusKey, metadata: { status_label: label } });
  }

  function handleInternalNoteBlur() {
    if (!internalNote.trim()) return;
    safeLogEvent('internal_note_saved', { note: internalNote.trim() });
  }

  function restoreLastQuote() {
    if (!lastQuote?.lines?.length) return;

    setLines(
      lastQuote.lines.map((line) => ({
        ...line,
        lineId: `${line.productId || line.codigo || 'line'}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      }))
    );
    safeLogEvent('quote_restored', { quote_total: lastQuote.total || 0, items: serializeLines(lastQuote.lines) });
    setNotice('Ultima cotizacion recuperada. Puedes agregar, quitar o cambiar cantidades.');
  }

  function restoreHistoryQuote(historyItem) {
    if (!historyItem?.lines?.length) return;

    setLines(
      historyItem.lines.map((line) => ({
        ...line,
        lineId: `${line.productId || line.codigo || 'line'}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      }))
    );
    safeLogEvent('quote_restored', { quote_total: historyItem.total || 0, items: serializeLines(historyItem.lines), metadata: { restored_from_history: true } });
    setNotice(`Cotizacion recuperada del historial: ${money.format(historyItem.total || 0)}.`);
  }

  function rememberQuote(snapshot) {
    const historyItem = {
      ...snapshot,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      status: quoteStatus,
      note: internalNote
    };
    const nextHistory = [historyItem, ...quoteHistory].slice(0, 8);

    window.localStorage.setItem(getLastQuoteStorageKey(activeQuoteChat), JSON.stringify(snapshot));
    writeHistory(activeQuoteChat, nextHistory);
    setLastQuote(snapshot);
    setQuoteHistory(nextHistory);
  }

  async function handlePasteQuote() {
    if (pastingQuote) return;

    if (!lines.length) {
      setNotice('Agrega al menos un producto antes de crear la cotizacion.');
      return;
    }

    setPastingQuote(true);
    try {
      const text = formatQuoteMessage(activeQuoteChat, lines, totals);

      if (omniQuoteConversation) {
        await sendOmniReply({ conversation: omniQuoteConversation, text });
        const quoteSnapshot = {
          sentAt: new Date().toISOString(),
          lines,
          total: totals.total,
          channel: omniQuoteConversation.platform,
          sales_conversation_id: omniQuoteConversation.id
        };
        rememberQuote(quoteSnapshot);
        safeLogEvent('omni_quote_registered', {
          quote_total: totals.total,
          items: serializeLines(lines),
          metadata: {
            message_registered_as_queued: true,
            sales_conversation_id: omniQuoteConversation.id,
            platform: omniQuoteConversation.platform
          }
        });
        setLines([]);
        setProducts([]);
        setQuery('');
        setAdvancedOpen(false);
        setNotice('Cotizacion registrada en la conversacion Omni. Pendiente envio oficial del canal.');
        return;
      }

      const ok = await pasteTextIntoWhatsApp(text);
      if (ok) {
        const quoteSnapshot = {
          sentAt: new Date().toISOString(),
          lines,
          total: totals.total
        };
        rememberQuote(quoteSnapshot);
        safeLogEvent('quote_pasted', {
          quote_total: totals.total,
          items: serializeLines(lines),
          metadata: { message_ready_for_manual_send: true }
        });
        setLines([]);
        setProducts([]);
        setQuery('');
        setAdvancedOpen(false);
        setCollapsed(true);
        setNotice('');
      } else {
        setNotice('No encontre el cuadro de mensaje de WhatsApp.');
      }
    } finally {
      window.setTimeout(() => setPastingQuote(false), 900);
    }
  }

  async function handleSendToMotoflow() {
    if (sendingToMotoflow) return;

    if (!lines.length) {
      setNotice('Recupera o prepara una cotizacion antes de mandarla a facturar.');
      return;
    }

    setSendingToMotoflow(true);
    try {
      const today = new Date();
      const vencimiento = new Date(today);
      vencimiento.setDate(vencimiento.getDate() + 7);
      const toDate = (date) => date.toISOString().slice(0, 10);

      const detalles = lines.map((line) => {
        const cantidad = normalizeNumber(line.cantidad, 1);
        const precio = normalizeNumber(line.precio, 0);
        const itbisPct = normalizeNumber(line.itbisPct, 0.18);
        const importe = cantidad * precio;
        const base = itbisPct > 0 ? importe / (1 + itbisPct) : importe;
        const itbis = importe - base;

        return {
          producto_id: line.productId,
          codigo: line.codigo || '',
          descripcion: line.descripcion,
          cantidad,
          unidad: 'UND',
          precio_unitario: precio,
          descuento_pct: 0,
          descuento_valor: 0,
          itbis_valor: itbis,
          importe
        };
      });

      const cotizacion = await createQuote({
        fecha_cotizacion: toDate(today),
        fecha_vencimiento: toDate(vencimiento),
        cliente_id: selectedCustomer?.id || GENERIC_CLIENT_ID,
        manual_cliente_nombre: selectedCustomer?.id ? null : (customerQuery.trim() || activeQuoteChat.name || 'Cliente WhatsApp'),
        vendedor_id: selectedVendorId || null,
        subtotal: totals.subtotal,
        descuento_total: 0,
        itbis_total: totals.tax,
        total_cotizacion: totals.total,
        notas: [
          omniQuoteConversation ? 'Cotizacion creada desde MotoFlow Omni Extension' : 'Cotizacion confirmada desde WhatsApp Web',
          activeQuoteChat.name ? `Chat: ${activeQuoteChat.name}` : null,
          omniQuoteConversation?.platform ? `Canal: ${omniQuoteConversation.platform}` : null,
          omniQuoteConversation?.id ? `Sales conversation: ${omniQuoteConversation.id}` : null,
          customerPhone ? `Telefono: ${customerPhone}` : null,
          quoteStatus ? `Estado: ${STATUS_OPTIONS.find((item) => item.key === quoteStatus)?.label || quoteStatus}` : null,
          internalNote.trim() ? `Nota interna: ${internalNote.trim()}` : null
        ].filter(Boolean).join(' | '),
        detalles
      });

      if (omniQuoteConversation?.id && cotizacion?.id) {
        await linkOmniConversationQuote({
          conversationId: omniQuoteConversation.id,
          cotizacionId: cotizacion.id
        }).catch(() => null);
      }

      safeLogEvent('quote_sent_to_invoice', {
        cotizacion_id: cotizacion.id,
        quote_total: totals.total,
        items: serializeLines(lines),
        metadata: {
          cotizacion_numero: cotizacion.numero,
          sales_conversation_id: omniQuoteConversation?.id || null,
          platform: omniQuoteConversation?.platform || null
        }
      });
      setNotice(`Lista para facturar en Motoflow: cotizacion ${cotizacion.numero}.`);
    } catch (error) {
      setNotice(error.message || 'No se pudo mandar a facturar en Motoflow.');
    } finally {
      setSendingToMotoflow(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setNotice('');

    try {
      const nextSession = await signInWithPassword(loginEmail.trim(), loginPassword);
      setSession(nextSession);
      setLoginPassword('');

      let empresas = [];
      let tenantActivo = '';
      try {
        const payload = await getEmpresasUsuarioExtension();
        empresas = payload?.empresas || [];
        tenantActivo = payload?.tenant_activo || '';
      } catch {
        empresas = [];
      }

      setEmpresasUsuario(empresas);

      if (empresas.length > 1) {
        const active = empresas.find((empresa) => empresa.activa) || empresas[0];
        setSelectedTenantId(active?.tenant_id || tenantActivo || '');
        setEmpresaPending(true);
        setNotice('Selecciona la empresa con la que quieres trabajar.');
        return;
      }

      if (empresas.length === 1) {
        await setEmpresaActivaExtension(empresas[0].tenant_id).catch(() => {});
        setSelectedTenantId(empresas[0].tenant_id);
      }

      setEmpresaPending(false);
      setNotice('Conectado a Motoflow. Ya puedes buscar productos.');
    } catch (error) {
      setNotice(error.message || 'No se pudo iniciar sesion.');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleEmpresaActivaSubmit(event) {
    event.preventDefault();
    setLoginLoading(true);
    setNotice('');

    try {
      const result = await setEmpresaActivaExtension(selectedTenantId);
      setEmpresaPending(false);
      setMorosos(null);
      setProducts([]);
      setQuery('');
      setNotice(`Conectado a ${result?.empresa_nombre || 'la empresa'}.`);
    } catch (error) {
      setNotice(error.message || 'No se pudo seleccionar la empresa.');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    signOut();
    setSession(null);
    setEmpresaPending(false);
    setEmpresasUsuario([]);
    setSelectedTenantId('');
    setProducts([]);
    setQuery('');
    setNotice('Sesion cerrada en la extension.');
  }

  function handleSelectCustomer(customer) {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.nombre || '');
    setCustomerPhone(customer.telefono || customerPhone);
    setCustomerResults([]);
  }

  function clearSelectedCustomer() {
    setSelectedCustomer(null);
    setCustomerResults([]);
  }

  function handleGoCobranza() {
    setMode('cobranza');
    loadMorosos();
  }

  async function loadMorosos() {
    setMorososLoading(true);
    setCobroMsg('');
    try {
      const data = await getClientesMorosos();
      // Sellar es_robado leyendo cobro_gestiones directo: funciona aunque el
      // RPC desplegado aun no devuelva el campo (independencia de despliegue).
      if (data?.clientes?.length) {
        try {
          const robadoIds = await getRobadoClienteIds();
          data.clientes = data.clientes.map((c) => (
            robadoIds.has(c.cliente_id) ? { ...c, es_robado: true } : c
          ));
        } catch {
          // sin permisos/tabla: se queda con lo que diga el RPC
        }
      }
      setMorosos(data);
      if (!data?.clientes?.length) {
        setCobroMsg(data?.tipo_cobranza === 'financiera'
          ? 'No hay clientes con prestamos atrasados. Todo al dia.'
          : 'No hay clientes con facturas vencidas. Todo al dia.');
      }
    } catch (error) {
      setCobroMsg(error.message || 'No se pudo cargar la lista de cobranza.');
      setMorosos(null);
    } finally {
      setMorososLoading(false);
    }
  }

  async function loadAvailableProductNotifications() {
    if (!session?.access_token || empresaPending) return;
    setAvailableProductsLoading(true);
    try {
      const rows = await getAvailableProductNotifications({ limit: 8 });
      setAvailableProducts(rows || []);
    } catch (error) {
      console.debug('[Motoflow Omni] No se pudieron cargar productos disponibles:', error.message);
    } finally {
      setAvailableProductsLoading(false);
    }
  }

  async function handlePrepareAvailableProduct(notification) {
    if (!notification?.solicitud_id) {
      setNotice('La notificacion no tiene solicitud vinculada.');
      return;
    }

    try {
      const solicitud = await getOutOfStockRequest(notification.solicitud_id);
      if (!solicitud) {
        setNotice('No pude cargar la solicitud vinculada.');
        return;
      }

      const text = buildAvailableProductMessage(solicitud);
      const phone = normalizePhone(getSolicitudPhone(solicitud));
      if (!phone) {
        await navigator.clipboard.writeText(text).catch(() => null);
        setNotice('El contacto no tiene telefono. Copie el mensaje al portapapeles.');
        return;
      }

      const ok = await openChatAndPasteWithoutReload({
        phone,
        text,
        expectedName: solicitud.clientes?.nombre || solicitud.cliente_nombre || solicitud.customer_name_snapshot || ''
      });

      if (ok) {
        await markNotificationsRead([notification.id]).catch(() => null);
        setAvailableProducts((current) => current.filter((item) => item.id !== notification.id));
        setNotice('Mensaje preparado en WhatsApp. Revisa, edita y envia manualmente.');
      } else {
        await navigator.clipboard.writeText(text).catch(() => null);
        setNotice('No pude pegar en WhatsApp. Copie el mensaje al portapapeles.');
      }
    } catch (error) {
      setNotice(error.message || 'No se pudo preparar el mensaje.');
    }
  }

  async function handleMarkAvailableNotified(notification) {
    if (!notification?.solicitud_id) return;
    try {
      await markOutOfStockCustomerNotified(notification.solicitud_id);
      await markNotificationsRead([notification.id]).catch(() => null);
      setAvailableProducts((current) => current.filter((item) => item.id !== notification.id));
      setNotice('Cliente marcado como avisado.');
    } catch (error) {
      setNotice(error.message || 'No se pudo marcar como avisado.');
    }
  }

  // Guarda el seguimiento de un cliente en la BD
  function saveSeg(cliente) {
    return setCobranzaSeguimiento({
      clienteId: cliente.cliente_id,
      estado: cliente.seg_estado || 'pendiente',
      fecha: cliente.seg_fecha || null,
      nota: cliente.seg_nota || null
    }).catch((error) => {
      console.warn('[Motoflow] No se pudo guardar seguimiento:', error.message);
      setCobroMsg(`No se pudo guardar el seguimiento: ${error.message || 'error'}`);
    });
  }

  // Telefono editable: actualiza en pantalla y guarda en clientes.telefono
  function updatePhoneLocal(clienteId, telefono) {
    setMorosos((current) => {
      if (!current) return current;
      return {
        ...current,
        clientes: current.clientes.map((c) =>
          c.cliente_id === clienteId ? { ...c, cliente_telefono: telefono } : c
        )
      };
    });
  }

  async function savePhone(cliente) {
    try {
      await setClienteTelefono({
        clienteId: cliente.cliente_id,
        telefono: (cliente.cliente_telefono || '').trim() || null
      });
      setCobroMsg(`Telefono de ${cliente.cliente_nombre} actualizado.`);
    } catch (error) {
      console.warn('[Motoflow] No se pudo guardar telefono:', error.message);
      setCobroMsg(`No se pudo guardar el telefono: ${error.message || 'error'}`);
    }
  }

  // Solo actualiza en pantalla (sin guardar todavia) — para escribir la nota
  function updateSegLocal(clienteId, patch) {
    setMorosos((current) => {
      if (!current) return current;
      return {
        ...current,
        clientes: current.clientes.map((c) =>
          c.cliente_id === clienteId ? { ...c, ...patch } : c
        )
      };
    });
  }

  // Actualiza en pantalla y guarda (para botones de estado y la fecha)
  function handleSegChange(clienteId, patch) {
    setMorosos((current) => {
      if (!current) return current;
      const clientes = current.clientes.map((c) =>
        c.cliente_id === clienteId ? { ...c, ...patch } : c
      );
      const updated = clientes.find((c) => c.cliente_id === clienteId);
      if (updated) saveSeg(updated);
      return { ...current, clientes };
    });
  }

  function toggleSegEstado(cliente, estadoKey) {
    const next = cliente.seg_estado === estadoKey ? 'pendiente' : estadoKey;
    const patch = { seg_estado: next };
    if (next !== 'cliente_vendra') patch.seg_fecha = null;
    handleSegChange(cliente.cliente_id, patch);
  }

  // "Guardar" cuando el cliente prometio venir: guarda y lo pospone (sale
  // de la lista hasta el dia de la fecha prometida)
  async function handleGuardarSeguimiento(cliente) {
    await saveSeg(cliente);
    const fecha = cliente.seg_fecha;
    const hoy = new Date().toISOString().slice(0, 10);
    if (fecha && fecha > hoy) {
      setMorosos((current) =>
        current
          ? { ...current, clientes: current.clientes.filter((c) => c.cliente_id !== cliente.cliente_id) }
          : current
      );
      setCobroMsg(`${cliente.cliente_nombre} pospuesto. Reaparecera el ${fecha}.`);
    } else {
      setCobroMsg('Indica una fecha futura para posponer al cliente.');
    }
  }

  // Chats ya verificados en esta sesión: teléfono → nombre del chat aceptado.
  // Permite reenvíos al mismo cliente aunque el nombre del contacto en
  // WhatsApp no sea igual al del sistema.
  const verifiedChatsRef = useRef(new Map());

  // ¿El chat abierto corresponde al destinatario? SOLO por igualdad estricta
  // de nombre, por dígitos del teléfono, o por chat ya verificado. OJO: la
  // comparación por contención (isSameLooseName) daba falsos positivos —
  // "Yerlin Flota Caminero Motors" contiene "Caminero Motors" y el mensaje
  // se pegaba en el chat equivocado.
  function chatMatchesTarget(chatName, expectedName, phoneDigits) {
    if (!chatName) return false;
    const nameA = looseText(chatName);
    if (expectedName && nameA && nameA === looseText(expectedName)) return true;
    const headerDigits = String(chatName).replace(/\D/g, '');
    const target = String(phoneDigits || '').replace(/\D/g, '');
    if (target && headerDigits.length >= 7
      && headerDigits.replace(/^1/, '') === target.replace(/^1/, '')) return true;
    const cached = target ? verifiedChatsRef.current.get(target) : null;
    return Boolean(cached && nameA === looseText(cached));
  }

  // Abre el chat SIN recargar usando el buscador de WhatsApp (por DOM).
  // El pushState('/send?...') de antes NO funcionaba: WhatsApp solo procesa
  // /send al cargar la página, por eso los mensajes dejaron de pegarse.
  // Devuelve { ok, reason } — reason dice por qué falló (diagnóstico).
  async function openChatWithoutReload({ phone, expectedName }) {
    const digits = String(phone || '').replace(/\D/g, '');
    const before = getCurrentChat();

    // ¿Ya estamos en el chat correcto? (reenvíos al mismo cliente)
    if (chatMatchesTarget(before.name, expectedName, digits)) return { ok: true };

    // Consultas en orden: número completo, número local (sin el 1 de RD/US),
    // y por último el nombre del cliente tal como está en el sistema.
    const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : '';
    const queries = [digits, local, String(expectedName || '').trim()].filter(Boolean);

    let lastReason = 'sin_telefono';
    for (const q of queries) {
      const result = await openWhatsAppChatViaSearch(q);
      if (!result?.ok) {
        lastReason = result?.reason || 'desconocido';
        continue;
      }

      const now = getCurrentChat();
      // Verificación estricta: nombre o dígitos coinciden.
      if (chatMatchesTarget(now.name, expectedName, digits)) {
        if (digits && now.name) verifiedChatsRef.current.set(digits, now.name);
        return { ok: true };
      }
      // Si buscamos por el NÚMERO exacto y el chat cambió, aceptamos: el
      // header puede mostrar el nombre del contacto guardado en el teléfono,
      // distinto al nombre registrado en el sistema. Se recuerda el chat
      // verificado para reenvíos futuros a este mismo número.
      if (/^\d+$/.test(q) && now.name && now.name !== before.name) {
        if (digits) verifiedChatsRef.current.set(digits, now.name);
        return { ok: true };
      }
      // Abrió un chat que no es el del cliente (búsqueda por nombre ambigua):
      // NO pegar aquí; probar la siguiente consulta.
      lastReason = 'chat_equivocado';
    }

    return { ok: false, reason: lastReason };
  }

  async function openChatAndPasteWithoutReload({ phone, text, expectedName }) {
    const opened = await openChatWithoutReload({ phone, expectedName });
    if (!opened.ok) return opened;

    const needle = looseText(text).slice(0, 30);
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const draft = looseText(getWhatsAppDraftText());
      if (needle && draft.includes(needle)) return { ok: true };

      const pasted = await pasteTextIntoWhatsApp(text);
      if (pasted) return { ok: true };
      await sleep(500);
    }

    return { ok: false, reason: 'no_pego' };
  }

  async function openChatAndAttachWithoutReload({ phone, file, expectedName }) {
    const opened = await openChatWithoutReload({ phone, expectedName });
    if (!opened.ok) return false;

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const attached = await attachFileToWhatsApp(file);
      if (attached) return true;
      await sleep(500);
    }

    return false;
  }

  async function handleEnviarMsj(cliente) {
    if (sendingId) return;
    const phone = normalizePhone(cliente.cliente_telefono);
    const text = buildCobroMessageFor(cliente, morosos?.empresa_nombre, morosos?.plantilla);

    if (!phone) {
      try {
        await navigator.clipboard.writeText(text);
        await marcarEnvioCobranza(cliente.cliente_id).catch(() => {});
        setCobroMsg(`${cliente.cliente_nombre} no tiene telefono. Mensaje copiado al portapapeles.`);
      } catch {
        setCobroMsg(`${cliente.cliente_nombre} no tiene telefono registrado.`);
      }
      return;
    }

    setSendingId(cliente.cliente_id);
    // Registrar el envio (para la lista "Para reenviar" si no paga)
    await marcarEnvioCobranza(cliente.cliente_id).catch(() => {});
    // Historial: registrar SIEMPRE el mensaje_enviado en cobro_gestiones
    // (todas las empresas: prestamos y facturas). Ademas, para los casos de
    // "Recordatorio 3 dias" esta gestion es la que saca la cuota de esa lista.
    await insertCobroGestion({
      cliente_id: cliente.cliente_id,
      prestamo_id: cliente.prestamo_id || null,
      ...buildMensajeCobroGestion(cliente)
    }).catch(() => {});
    safeLogEvent('cobro_reminder_pasted', {
      cliente_id: cliente.cliente_id,
      customer_name: cliente.cliente_nombre,
      customer_phone: cliente.cliente_telefono,
      metadata: {
        cuotas_atrasadas: cliente.cuotas_atrasadas,
        total_atrasado: cliente.total_atrasado,
        facturas: (cliente.facturas || []).map((f) => f.numero),
        via: 'lista_morosos'
      }
    });

    try {
      try {
        window.localStorage.setItem(PENDING_COBRO_KEY, JSON.stringify({ text, ts: Date.now() }));
      } catch {}

      const result = await openChatAndPasteWithoutReload({
        phone,
        text,
        expectedName: cliente.cliente_nombre
      });

      if (result.ok) {
        try {
          window.localStorage.removeItem(PENDING_COBRO_KEY);
        } catch {}
        // Reglas internas: al enviar, el caso sale de su lista SIN recargar.
        // - Recordatorio 3 dias: se quita la tarjeta (ya quedo registrada la
        //   gestion mensaje_enviado con la cuota).
        // - Para reenviar: por_reenviar pasa a false (ultimo_envio = ahora).
        const sameCase = (c) => (
          cliente.case_id && c.case_id
            ? String(c.case_id) === String(cliente.case_id)
            : c.cliente_id === cliente.cliente_id
        );
        const nowIso = new Date().toISOString();
        setMorosos((current) => {
          if (!current?.clientes) return current;
          return {
            ...current,
            clientes: current.clientes
              .filter((c) => !(cliente.recordatorio_pago && c.recordatorio_pago && sameCase(c)))
              .map((c) => (c.cliente_id === cliente.cliente_id
                ? { ...c, por_reenviar: false, ultimo_envio: nowIso }
                : c))
          };
        });
        // Cerrar las ventanas (Caso de cobro + Gestion de Cobro) para dejar el
        // chat visible con el mensaje pegado, listo para presionar Enter.
        setSelectedCobroCase(null);
        setDebtModalOpen(false);
        setCobroMsg('Recordatorio pegado en el chat. Revisa y presiona Enter para enviar.');
      } else {
        // El buscador no pudo abrir el chat (numero sin conversacion previa,
        // o fallo del DOM — 'reason' dice cual). Único camino: /send con
        // recarga. Dejamos el mensaje en PENDING_COBRO_KEY para que el efecto
        // de restauración lo pegue automáticamente al volver a cargar.
        const linkOpened = openWhatsAppChatViaInternalLink(phone, text);
        if (linkOpened) {
          setCobroMsg(`Abriendo con recarga (motivo: ${result.reason || 'desconocido'}); el mensaje se pegará solo…`);
        } else {
          try {
            window.localStorage.removeItem(PENDING_COBRO_KEY);
          } catch {}
          await navigator.clipboard.writeText(text).catch(() => {});
          setCobroMsg(`No pude abrir el chat (motivo: ${result.reason || 'desconocido'}). Mensaje copiado; ábrelo manualmente.`);
        }
      }
    } finally {
      setSendingId(null);
    }
  }

  // "Ir a buscar": manda el PDF con la ficha del cliente al WhatsApp del
  // encargado de localizar a la gente (sin la parte de credito/facturacion).
  async function handleEnviarBuscador(cliente) {
    if (sendingId) return;
    setSendingId(cliente.cliente_id);
    try {
      const ficha = await getClienteFicha(cliente.cliente_id);
      const phone = normalizePhone(ficha?.buscador_telefono);
      if (!phone) {
        setCobroMsg('Configura el "Telefono del buscador" en Configuracion del Sistema.');
        setSendingId(null);
        return;
      }

      const data = {
        empresa_nombre: ficha.empresa_nombre,
        cliente: ficha.cliente,
        deuda: {
          total: cliente.total_atrasado,
          cuotas: cliente.cuotas_atrasadas,
          facturas: (cliente.facturas || []).map((f) => f.numero)
        }
      };

      safeLogEvent('cobro_ficha_buscador', {
        cliente_id: cliente.cliente_id,
        customer_name: cliente.cliente_nombre,
        metadata: { buscador_phone: phone, via: 'lista_morosos' }
      });

      const file = buildFichaPdf(data);
      const ok = await openChatAndAttachWithoutReload({
        phone,
        file,
        expectedName: ficha?.buscador_nombre || ''
      });

      if (ok) {
        setCobroMsg('PDF adjuntado al chat del buscador. Revisa y presiona Enviar.');
      } else {
        downloadPdf(file);
        setCobroMsg('No pude abrir el chat sin recargar. Descargue el PDF: arrastralo al chat del buscador.');
      }
    } catch (error) {
      setCobroMsg(`No se pudo preparar el envio al buscador: ${error.message || 'error'}`);
    } finally {
      setSendingId(null);
    }
  }

  function openCobroCase(cliente) {
    setSelectedCobroCase(cliente);
    setCaseDetailTab('gestion');
    setCasePromiseDate(new Date().toISOString().slice(0, 10));
    setCasePromiseAmount('');
    setCaseNote('');
    setCaseVisitResult('pendiente');

    // Cargar el historial REAL de gestiones desde la BD. Antes el timeline
    // solo mostraba las gestiones agregadas en esta sesion (en memoria) y el
    // caso siempre aparecia "Sin gestiones registradas" al reabrirlo.
    getCobroGestiones(cliente.cliente_id)
      .then((rows) => {
        // es_robado se deriva del historial real (no depende del RPC).
        const esRobado = (rows || []).some((g) => g.tipo === 'robado' && g.estado !== 'cerrada');
        setSelectedCobroCase((current) => (
          current && current.cliente_id === cliente.cliente_id
            ? { ...current, gestiones: rows || [], es_robado: esRobado }
            : current
        ));
      })
      .catch(() => {});
  }

  function appendGestionToCase(gestion) {
    if (!gestion) return;
    setSelectedCobroCase((current) => {
      if (!current) return current;
      return {
        ...current,
        gestiones: [gestion, ...(current.gestiones || [])],
        tiene_respuesta: current.tiene_respuesta || ['llamada', 'respuesta_cliente'].includes(gestion.tipo),
        tiene_promesa: current.tiene_promesa || gestion.tipo === 'promesa_pago',
        tiene_gestion_fisica: current.tiene_gestion_fisica || ['mandado_buscar', 'visita'].includes(gestion.tipo),
        seg_fecha: gestion.fecha_promesa || current.seg_fecha,
        monto_promesa: gestion.monto_promesa || current.monto_promesa
      };
    });
  }

  async function saveCaseGestion(payload, successMessage) {
    if (!selectedCobroCase?.cliente_id || caseSaving) return false;
    setCaseSaving(true);
    setCobroMsg('');

    try {
      const row = await insertCobroGestion({
        cliente_id: selectedCobroCase.cliente_id,
        prestamo_id: selectedCobroCase.prestamo_id || selectedCobroCase.case_id || null,
        ...payload
      });
      appendGestionToCase(row || payload);

      // Empresas de FACTURAS (repuestos): su lista lee el estado desde
      // cobranza_seguimiento (no desde cobro_gestiones). Sincronizar para que
      // la promesa / mandado a buscar registrados en el caso se reflejen
      // tambien en la lista y sus contadores.
      const esFacturas = !['financiera', 'gestion_cobro'].includes(morosos?.tipo_cobranza);
      if (esFacturas && payload.tipo === 'promesa_pago') {
        await setCobranzaSeguimiento({
          clienteId: selectedCobroCase.cliente_id,
          estado: 'cliente_vendra',
          fecha: payload.fecha_promesa || null,
          nota: payload.nota || null
        }).catch(() => {});
      } else if (esFacturas && payload.tipo === 'mandado_buscar') {
        await setCobranzaSeguimiento({
          clienteId: selectedCobroCase.cliente_id,
          estado: 'ir_a_buscar',
          nota: payload.nota || null
        }).catch(() => {});
      }

      setCobroMsg(successMessage);
      await loadMorosos();
      return true;
    } catch (error) {
      setCobroMsg(error.message || 'No se pudo guardar la gestion.');
      return false;
    } finally {
      setCaseSaving(false);
    }
  }

  function buildMensajeCobroGestion(cliente) {
    return {
      tipo: 'mensaje_enviado',
      estado: 'enviado',
      canal: 'whatsapp',
      nota: `Recordatorio enviado desde Gestion de Cobro para ${cliente.prestamo_numero || (cliente.facturas || [])[0]?.numero || 'la cuenta'}.`,
      metadata: {
        origen: cliente.recordatorio_pago ? 'recordatorio_pago_extension' : 'gestion_credito_extension',
        recordatorio_pago: Boolean(cliente.recordatorio_pago),
        recordatorio_cuota_id: cliente.recordatorio_cuota_id || null,
        recordatorio_fecha_vencimiento: cliente.recordatorio_fecha_vencimiento || null,
        dias_atraso: cliente.dias_mas_vencido || 0
      }
    };
  }

  async function registrarMensajeCobro(cliente, successMessage = 'Mensaje registrado.') {
    if (!cliente?.cliente_id) return false;
    setCobroMsg('');

    try {
      const row = await insertCobroGestion({
        cliente_id: cliente.cliente_id,
        prestamo_id: cliente.prestamo_id || cliente.case_id || null,
        ...buildMensajeCobroGestion(cliente)
      });

      if (selectedCobroCase?.cliente_id === cliente.cliente_id) {
        appendGestionToCase(row || buildMensajeCobroGestion(cliente));
      }

      setCobroMsg(successMessage);
      await loadMorosos();
      return true;
    } catch (error) {
      setCobroMsg(error.message || 'No se pudo guardar el mensaje enviado.');
      return false;
    }
  }

  async function handleCaseEnviarWhatsapp(cliente) {
    // handleEnviarMsj ya registra la gestion mensaje_enviado para TODOS los
    // envios (evita duplicarla aqui).
    await handleEnviarMsj(cliente);
  }

  async function handleCaseMandarABuscar() {
    const fecha = casePromiseDate || new Date().toISOString().slice(0, 10);
    const saved = await saveCaseGestion({
      tipo: 'mandado_buscar',
      estado: 'mandado_buscar',
      resultado: 'pendiente',
      nota: caseNote || `Cliente fue mandado a buscar dia ${formatDateDo(fecha)}.`,
      metadata: { fecha_busqueda: fecha, origen: 'gestion_credito_extension' }
    }, 'Cliente marcado para buscar fisicamente.');
    if (saved) setCaseNote('');
  }

  // ROBADO: estado manual (poner/quitar). Ningun pago lo cierra: el cliente
  // paga bajo acuerdo flexible y el caso queda en gestion para seguimiento.
  async function handleCaseMarcarRobado() {
    const clienteId = selectedCobroCase?.cliente_id;
    const saved = await saveCaseGestion({
      tipo: 'robado',
      estado: 'activo',
      nota: caseNote || 'Moto robada: acuerdo de cobro flexible.',
      metadata: { origen: 'gestion_credito_extension' }
    }, 'Cliente marcado como ROBADO.');
    if (saved) {
      setCaseNote('');
      setSelectedCobroCase((c) => (c && c.cliente_id === clienteId ? { ...c, es_robado: true, estado_cobro: 'Robado' } : c));
    }
  }

  async function handleCaseQuitarRobado() {
    if (!selectedCobroCase?.cliente_id || caseSaving) return;
    setCaseSaving(true);
    try {
      await closeCobroGestiones({ clienteId: selectedCobroCase.cliente_id, tipo: 'robado' });
      setSelectedCobroCase((c) => (c ? { ...c, es_robado: false, estado_cobro: null } : c));
      setCobroMsg('Estado ROBADO retirado.');
      await loadMorosos();
    } catch (error) {
      setCobroMsg(error.message || 'No se pudo quitar el estado ROBADO.');
    } finally {
      setCaseSaving(false);
    }
  }

  async function handleCaseRegistrarVisita() {
    const saved = await saveCaseGestion({
      tipo: 'visita',
      estado: caseVisitResult === 'resuelto' ? 'cerrada' : 'pendiente',
      resultado: caseVisitResult,
      nota: caseNote || null
    }, 'Visita registrada.');
    if (saved) setCaseNote('');
  }

  async function handleCaseRegistrarLlamada() {
    const nota = caseNote.trim();
    if (!nota || nota.toLowerCase() === 'llamada:') {
      setCobroMsg('Escribe una nota de llamada antes de guardar.');
      return;
    }
    const montoPromesa = Number(String(casePromiseAmount).replace(/,/g, '')) || null;
    const saved = await saveCaseGestion({
      tipo: 'llamada',
      estado: 'registrada',
      canal: 'telefono',
      resultado: 'respondio',
      nota,
      metadata: {
        fecha_llamada: casePromiseDate || new Date().toISOString().slice(0, 10),
        monto_promesa: montoPromesa
      }
    }, 'Llamada registrada.');
    if (saved) {
      setCaseNote('');
      setCaseDetailTab('gestion');
    }
  }

  async function handleCaseRegistrarPromesa() {
    if (!casePromiseDate) {
      setCobroMsg('Fecha requerida para registrar promesa.');
      return;
    }
    const montoPromesa = Number(String(casePromiseAmount).replace(/,/g, '')) || null;
    const saved = await saveCaseGestion({
      tipo: 'promesa_pago',
      estado: 'pendiente',
      canal: 'whatsapp',
      fecha_promesa: casePromiseDate,
      monto_promesa: montoPromesa,
      nota: caseNote || null,
      metadata: { origen: caseDetailTab === 'mensajes' ? 'whatsapp' : 'extension' }
    }, 'Promesa registrada.');
    if (saved) {
      setCasePromiseAmount('');
      setCaseNote('');
      setCaseDetailTab('gestion');
    }
  }

  async function handleCaseCastigarCuenta() {
    if (!selectedCobroCase?.prestamo_id) return;
    const motivo = window.prompt('Motivo para castigar la cuenta:', 'incobrable');
    if (!motivo) return;
    const password = window.prompt('Clave del creador si aplica. Deja vacio si tienes autorizacion:') || null;

    setCaseSaving(true);
    try {
      await castigarPrestamo({
        prestamoId: selectedCobroCase.prestamo_id,
        motivo,
        password
      });
      setCobroMsg(`${selectedCobroCase.prestamo_numero || 'Prestamo'} paso a Cuentas Incobrables.`);
      setSelectedCobroCase(null);
      await loadMorosos();
    } catch (error) {
      setCobroMsg(error.message || 'No se pudo castigar la cuenta.');
    } finally {
      setCaseSaving(false);
    }
  }

  function handleCaseVerResumen(cliente) {
    if (!cliente) return;
    setSummaryCobroCase(cliente);
  }

  function handleCaseAbrirCrm(cliente) {
    if (!cliente?.cliente_id) return;
    if (!MOTOFLOW_APP_URL) {
      return;
    }

    const url = new URL(MOTOFLOW_APP_URL);
    url.searchParams.set('mf_panel', 'recibo-pago');
    url.searchParams.set('clienteId', cliente.cliente_id);
    url.searchParams.set('requestedAt', String(Date.now()));
    if (cliente.prestamo_id || cliente.case_id) url.searchParams.set('prestamoId', cliente.prestamo_id || cliente.case_id);
    if (cliente.cliente_codigo) url.searchParams.set('clienteCodigo', cliente.cliente_codigo);
    if (cliente.cliente_nombre) url.searchParams.set('clienteNombre', cliente.cliente_nombre);
    if (cliente.cliente_rnc) url.searchParams.set('clienteRnc', cliente.cliente_rnc);
    if (cliente.cliente_direccion) url.searchParams.set('clienteDireccion', cliente.cliente_direccion);
    if (cliente.cliente_telefono) url.searchParams.set('clienteTelefono', cliente.cliente_telefono);

    window.open(url.toString(), 'motoflow_cliente');
    setCobroMsg('Abriendo cliente en Recibo de Pago.');
  }

  function handleRestoreWhatsApp() {
    writeSafeMode(true);
    setSafeMode(true);
    setCollapsed(true);
  }

  function handleReactivateOmni() {
    writeSafeMode(false);
    setSafeMode(false);
    setCollapsed(false);
  }

  function handleSelectOmniChannel(channel) {
    setActiveChannel(channel);
    if (channel === CHANNEL_TYPES.WHATSAPP) {
      setOmniQuoteConversation(null);
      setOmniSelectedConversation(null);
      setMode('cotizar');
      return;
    }
    if (channel === CHANNEL_TYPES.FOLLOWUPS) {
      setOmniQuoteConversation(null);
      setOmniSelectedConversation(null);
      handleGoCobranza();
      return;
    }
    setOmniQuoteConversation(null);
    setMode('omni');
  }

  function handleOmniQuoteConversation(conversation) {
    if (!conversation?.id) return;
    setOmniQuoteConversation(conversation);
    setActiveChannel(conversation.platform || CHANNEL_TYPES.UNIFIED);
    setMode('cotizar');
    setCustomerQuery(getOmniConversationName(conversation));
    setCustomerPhone(conversation.customer_phone || conversation.phone || '');
    setSelectedCustomer(null);
    setNotice('Cotizando desde conversacion Omni.');
  }

  async function handleMarkOmniAttended() {
    const conversation = omniSelectedConversation || omniQuoteConversation;
    if (!conversation?.id) return;
    handleOmniQuickStatus('cerrado', 'Conversacion marcada como atendida.');
  }

  async function handleOmniQuickStatus(status, successMessage) {
    const conversation = omniSelectedConversation || omniQuoteConversation;
    if (!conversation?.id) return;
    try {
      const saved = await updateOmniConversationStatus({
        conversationId: conversation.id,
        status
      });
      const next = saved || { ...conversation, status };
      setOmniSelectedConversation((current) => current?.id === conversation.id ? { ...current, ...next } : current);
      setOmniQuoteConversation((current) => current?.id === conversation.id ? { ...current, ...next } : current);
      setOmniConversationsPreview((current) => current.map((item) => (
        item.id === conversation.id ? { ...item, ...next } : item
      )));
      setNotice(successMessage || 'Conversacion actualizada.');
    } catch (error) {
      setNotice(error.message || 'No se pudo actualizar la conversacion.');
    }
  }

  function handleAssociateOmniCustomer() {
    const conversation = omniSelectedConversation || omniQuoteConversation;
    if (!conversation) return;
    setMode('cotizar');
    setMotoflowDetailsOpen(true);
    setCustomerQuery(getOmniConversationName(conversation));
    setCustomerPhone(conversation.customer_phone || conversation.phone || '');
    setSelectedCustomer(null);
    setNotice('Busca y selecciona el cliente de Motoflow para asociar esta conversacion.');
  }

  function handleCreateOmniCustomer() {
    const conversation = omniSelectedConversation || omniQuoteConversation;
    if (!conversation || !MOTOFLOW_APP_URL) {
      setNotice('Abre Motoflow para crear el cliente y luego asocialo desde esta conversacion.');
      return;
    }
    const url = new URL(MOTOFLOW_APP_URL);
    url.searchParams.set('mf_panel', 'clientes');
    url.searchParams.set('crear', '1');
    url.searchParams.set('nombre', getOmniConversationName(conversation));
    if (conversation.customer_phone || conversation.phone) {
      url.searchParams.set('telefono', conversation.customer_phone || conversation.phone);
    }
    window.open(url.toString(), 'motoflow_cliente');
  }

  function getOutOfStockContext() {
    const conversation = commercialConversation;
    if (conversation) {
      const channel = conversation.platform || activeChannel || CHANNEL_TYPES.UNIFIED;
      const phone = conversation.customer_phone || conversation.phone || '';
      return {
        channel,
        channelLabel: getOmniPlatformLabel(channel),
        customerName: getOmniConversationName(conversation),
        phone,
        conversationId: conversation.id || conversation.external_conversation_id || '',
        externalContactId: conversation.customer_external_id || conversation.external_contact_id || phone || conversation.id || '',
        customerId: conversation.cliente_id || conversation.customer_id || null
      };
    }

    const liveChat = getCurrentChat();
    const chatName = liveChat.name || chat.name || '';
    const phone = customerPhone || (/\d{7,}/.test(chatName) ? chatName : '');
    return {
      channel: 'whatsapp',
      channelLabel: 'WhatsApp',
      customerName: selectedCustomer?.nombre || customerQuery || chatName || '',
      phone,
      conversationId: liveChat.id || chat.id || '',
      externalContactId: normalizePhone(phone) || liveChat.id || chat.id || '',
      customerId: selectedCustomer?.id || null
    };
  }

  function handleOpenOutOfStock() {
    const context = getOutOfStockContext();
    if (!context?.customerName && !context?.phone && !context?.conversationId) {
      setNotice('Selecciona una conversacion para registrar una solicitud.');
      return;
    }
    setOutOfStockOpen(true);
  }

  async function handleSubmitOutOfStock(formData) {
    if (outOfStockSaving) return;

    const context = getOutOfStockContext();
    const phone = formData.phone || context.phone || '';
    const payload = {
      created_from: 'motoflow_omni',
      source_channel: context.channel || 'whatsapp',
      source_conversation_id: context.conversationId || null,
      external_contact_id: context.externalContactId || null,
      customer_name: formData.customerName || context.customerName || 'Cliente',
      phone,
      phone_normalized: normalizePhoneE164(phone) || null,
      cliente_id: selectedCustomer?.id || context.customerId || null,
      notes: formData.notes || null,
      duplicate_action: 'increase',
      products: formData.lines
    };

    setOutOfStockSaving(true);
    try {
      const result = await createOutOfStockRequests(payload);
      const rows = result?.results || [];
      const purchaseOk = rows.filter((row) => row.purchase?.ok).length;
      const freeOrSkipped = rows.filter((row) => row.purchase?.skipped || row.purchase?.reason === 'producto_libre').length;
      const missingSupplier = rows.filter((row) => row.purchase?.missing_supplier).length;

      safeLogEvent('out_of_stock_request_created', {
        customer_name: payload.customer_name,
        customer_phone: payload.phone,
        metadata: {
          source_channel: payload.source_channel,
          source_conversation_id: payload.source_conversation_id,
          lines: payload.products.length,
          purchase_ok: purchaseOk,
          free_or_skipped: freeOrSkipped,
          missing_supplier: missingSupplier
        }
      });

      setNotice([
        `${rows.length || payload.products.length} solicitud(es) registrada(s).`,
        purchaseOk ? `${purchaseOk} enviada(s) a compras.` : null,
        missingSupplier ? `${missingSupplier} sin suplidor.` : null,
        freeOrSkipped ? `${freeOrSkipped} libre(s) sin orden.` : null
      ].filter(Boolean).join(' '));
      setOutOfStockOpen(false);
    } catch (error) {
      setNotice(error.message || 'No se pudo registrar la solicitud. Abre el modulo web como fallback.');
    } finally {
      setOutOfStockSaving(false);
    }
  }

  const omniCounts = getChannelCounts({ morosos, omniConversations: omniConversationsPreview });
  const isSocialChannelActive = [
    CHANNEL_TYPES.UNIFIED,
    CHANNEL_TYPES.INSTAGRAM,
    CHANNEL_TYPES.FACEBOOK
  ].includes(activeChannel);
  const isOmniInboxActive = session && !empresaPending && isSocialChannelActive;
  const commercialConversation = omniQuoteConversation || (isSocialChannelActive ? omniSelectedConversation : null);
  const panelChatLabel = commercialConversation
    ? `${getOmniConversationName(commercialConversation)} · ${getOmniPlatformLabel(commercialConversation.platform || activeChannel)}`
    : (chat.name || 'Chat actual');
  const outOfStockContext = getOutOfStockContext();
  const canOpenOutOfStock = Boolean(
    session
    && !empresaPending
    && (outOfStockContext.customerName || outOfStockContext.phone || outOfStockContext.conversationId)
  );

  if (collapsed) {
    return (
      <button className="mf-floating-button" type="button" onClick={safeMode ? handleReactivateOmni : () => setCollapsed(false)}>
        {safeMode ? 'Activar Omni' : 'Cotizar'}
      </button>
    );
  }

  return (
    <>
      {session && !empresaPending && (
        <div className="mf-omni-left-dock">
          <ChannelRail
            activeChannel={activeChannel}
            counts={omniCounts}
            flags={OMNI_FLAGS}
            onSelect={handleSelectOmniChannel}
          />
        </div>
      )}

      {isOmniInboxActive && (
        <div id="motoflow-omni-workspace" className="mf-omni-workspace" aria-label="MotoFlow Omni social workspace">
          <OmniInbox
            channel={activeChannel}
            onQuoteConversation={handleOmniQuoteConversation}
            onConversationsChange={setOmniConversationsPreview}
            onSelectedConversationChange={setOmniSelectedConversation}
          />
        </div>
      )}

      <aside className="mf-panel" aria-label="MotoFlow Omni Beta">
      <header className="mf-header">
        <div>
          <p className="mf-kicker">Motoflow <span className="mf-beta-badge">BETA</span></p>
          <h2>MotoFlow Omni</h2>
          <p className="mf-chat">{panelChatLabel}</p>
          <div className="mf-header-actions">
            {session && !empresaPending && (
              <>
                <span>Conectado</span>
                <button className="mf-logout-button" type="button" onClick={handleLogout}>Salir</button>
              </>
            )}
            <button className="mf-icon-button" type="button" onClick={() => setCollapsed(true)} title="Colapsar">
              x
            </button>
          </div>
        </div>
        <button className="mf-icon-button" type="button" onClick={() => setCollapsed(true)} title="Colapsar">
          ×
        </button>
      </header>

      {session && !empresaPending && (
        <section className="mf-omni-status">
          <span className="mf-omni-version">{OMNI_BETA_VERSION}</span>
          <button className="mf-safe-button" type="button" onClick={handleRestoreWhatsApp} title="Desmontar temporalmente MotoFlow Omni">
            Restaurar WhatsApp
          </button>
        </section>
      )}

      {session && !empresaPending && (availableProducts.length > 0 || availableProductsLoading) && (
        <section className="mf-available-products">
          <header>
            <strong>Productos disponibles</strong>
            <button type="button" onClick={loadAvailableProductNotifications} disabled={availableProductsLoading}>
              {availableProductsLoading ? '...' : 'Actualizar'}
            </button>
          </header>
          {availableProducts.slice(0, 3).map((notification) => (
            <article key={notification.id}>
              <span>
                <b>{notification.titulo || 'Producto disponible'}</b>
                <small>{notification.mensaje || 'Solicitud pendiente de aviso'}</small>
              </span>
              <div>
                <button type="button" onClick={() => handlePrepareAvailableProduct(notification)}>Mensaje</button>
                <button type="button" onClick={() => handleMarkAvailableNotified(notification)}>Avisado</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {session && !empresaPending && (
        <nav className="mf-tabs">
          <button
            className={`mf-tab-quote${mode === 'cotizar' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setMode('cotizar')}
          >
            Cotizar
          </button>
          <button
            className={`mf-tab-cobro${mode === 'cobranza' ? ' is-active' : ''}`}
            type="button"
            onClick={handleGoCobranza}
          >
            Ver deuda
          </button>
          <button
            className="mf-tab-stock"
            type="button"
            onClick={handleOpenOutOfStock}
            disabled={!canOpenOutOfStock}
            title={canOpenOutOfStock ? 'Registrar producto agotado' : 'Selecciona una conversacion para registrar una solicitud.'}
          >
            Producto agotado
          </button>
        </nav>
      )}

      {(!session || empresaPending) && (
        <form className="mf-login" onSubmit={empresaPending ? handleEmpresaActivaSubmit : handleLogin}>
          <strong>Conectar con Motoflow</strong>
          {empresaPending ? (
            <>
              <p>Selecciona la empresa con la que quieres trabajar.</p>
              <select
                value={selectedTenantId}
                onChange={(event) => setSelectedTenantId(event.target.value)}
                required
              >
                {empresasUsuario.map((empresa) => (
                  <option key={empresa.tenant_id} value={empresa.tenant_id}>
                    {empresa.nombre}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <p>Usa el mismo correo y clave del CRM para habilitar la busqueda.</p>
              <input
                autoComplete="email"
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="Correo"
                required
              />
              <input
                autoComplete="current-password"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Clave"
                required
              />
            </>
          )}
          <button type="submit" disabled={loginLoading}>
            {loginLoading ? 'Conectando...' : empresaPending ? 'Entrar a esta empresa' : 'Conectar'}
          </button>
        </form>
      )}

      <QuickOutOfStockForm
        isOpen={outOfStockOpen}
        context={outOfStockContext}
        selectedCustomer={selectedCustomer}
        onClose={() => setOutOfStockOpen(false)}
        onSearchProducts={searchProducts}
        onSubmit={handleSubmitOutOfStock}
        saving={outOfStockSaving}
      />

      {session && !empresaPending && isSocialChannelActive && mode === 'omni' && (
        <section className="mf-social-commercial">
          {commercialConversation ? (
            <>
              <header className="mf-social-commercial-head">
                <span className="mf-social-avatar">{getOmniConversationName(commercialConversation).charAt(0).toUpperCase() || '?'}</span>
                <div>
                  <strong>{getOmniConversationName(commercialConversation)}</strong>
                  <small>{getOmniPlatformLabel(commercialConversation.platform || activeChannel)} · {commercialConversation.status || 'nuevo'}</small>
                </div>
              </header>
              <div className="mf-social-link-state">
                <span>Cliente Motoflow</span>
                <b>{commercialConversation.cliente_id || commercialConversation.customer_id ? 'Asociado' : 'Sin asociar'}</b>
              </div>
              <div className="mf-social-commercial-actions">
                <button type="button" onClick={handleAssociateOmniCustomer}>Asociar cliente</button>
                <button type="button" onClick={handleCreateOmniCustomer}>Crear cliente</button>
                <button type="button" onClick={() => handleOmniQuoteConversation(commercialConversation)}>Cotizar</button>
                <button type="button" disabled={!commercialConversation.cliente_id && !commercialConversation.customer_id} onClick={handleGoCobranza}>Ver deuda</button>
                <button type="button" onClick={handleOpenOutOfStock}>Producto agotado</button>
                <button type="button" onClick={() => handleOmniQuickStatus('seguimiento', 'Conversacion marcada para seguimiento.')}>Crear seguimiento</button>
                <button type="button" onClick={() => setNotice('Historial comercial disponible al asociar el cliente de Motoflow.')}>Ver historial</button>
                <button type="button" onClick={handleMarkOmniAttended}>Marcar atendido</button>
              </div>
            </>
          ) : (
            <div className="mf-social-empty-commercial">
              <strong>Selecciona una conversacion</strong>
              <p>El panel comercial mostrara cliente, cotizacion, deuda y seguimiento.</p>
            </div>
          )}
          {notice && <p className="mf-notice">{notice}</p>}
        </section>
      )}

      {session && !empresaPending && mode === 'cotizar' && (
        <section className="mf-motoflow-box">
          <button className="mf-motoflow-toggle" type="button" onClick={() => setMotoflowDetailsOpen((open) => !open)}>
            <span>
              Datos Motoflow
              <small>
                {selectedCustomer?.nombre || customerQuery || activeQuoteChat.name || 'Cliente sin asignar'} · {STATUS_OPTIONS.find((item) => item.key === quoteStatus)?.label || 'Cotizado'}
              </small>
            </span>
            <b>{motoflowDetailsOpen ? 'Ocultar' : 'Editar'}</b>
          </button>

          {motoflowDetailsOpen && (
            <>
              <div className="mf-customer-box">
                <label htmlFor="mf-customer-search">Cliente para Motoflow</label>
                <div className="mf-customer-row">
                  <input
                    id="mf-customer-search"
                    value={customerQuery}
                    onChange={(event) => {
                      setCustomerQuery(event.target.value);
                      setSelectedCustomer(null);
                    }}
                    placeholder="Nombre, telefono, RNC..."
                  />
                  {selectedCustomer && (
                    <button type="button" onClick={clearSelectedCustomer} title="Cambiar cliente">
                      x
                    </button>
                  )}
                </div>
                {customerResults.length > 0 && (
                  <div className="mf-customer-results">
                    {customerResults.map((customer) => (
                      <button key={customer.id} type="button" onClick={() => handleSelectCustomer(customer)}>
                        <strong>{customer.nombre}</strong>
                        <small>{customer.telefono || customer.rnc || customer.codigo || 'Cliente registrado'}</small>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mf-customer-grid">
                  <input
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="Telefono"
                  />
                  <select value={selectedVendorId} onChange={(event) => setSelectedVendorId(event.target.value)}>
                    <option value="">Vendedor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>{vendor.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mf-workflow-box">
                <label>Estado rapido</label>
                <div className="mf-status-grid">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status.key}
                      className={quoteStatus === status.key ? 'is-active' : ''}
                      type="button"
                      onClick={() => handleStatusChange(status.key)}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                  onBlur={handleInternalNoteBlur}
                  placeholder="Nota interna para Motoflow..."
                  rows="2"
                />
              </div>
            </>
          )}
        </section>
      )}

      {session && !empresaPending && mode === 'cobranza' && (() => {
        const clientes = morosos?.clientes || [];
        const filtro = cobroFilter.trim().toLowerCase();
        const today = new Date().toISOString().slice(0, 10);
        const tabMatch = (cliente, tabKey) => {
          if (tabKey === 'recordatorio_pago') return Boolean(cliente.recordatorio_pago);
          if (cliente.recordatorio_pago) return false;
          if (tabKey === 'robados') return Boolean(cliente.es_robado);
          // ROBADO es exclusivo: vive SOLO en su pestana (acuerdo de pago).
          if (cliente.es_robado) return false;
          if (tabKey === 'todos') return true;
          if (tabKey === 'promesas') return Boolean(cliente.tiene_promesa || cliente.seg_fecha);
          if (tabKey === 'promesas_vencidas') return Boolean(cliente.promesa_vencida || (cliente.seg_fecha && cliente.seg_fecha < today));
          if (tabKey === 'pagaron_siguen') return Number(cliente.pagos15_count || 0) > 0;
          if (tabKey === 'mandados_buscar') return Boolean(cliente.tiene_gestion_fisica || cliente.seg_estado === 'ir_a_buscar' || cliente.estado_cobro === 'Mandado a buscar');
          if (tabKey === 'sin_respuesta') return !cliente.tiene_promesa && !cliente.seg_fecha && !cliente.tiene_respuesta;
          if (tabKey === 'criticos') return Boolean(cliente.caso_critico || (cliente.prioridad === 'Alta' && (cliente.dias_mas_vencido >= 31 || !cliente.tiene_promesa)));
          if (tabKey === 'reenviar') return Boolean(cliente.por_reenviar);
          return true;
        };
        const tabCounts = Object.fromEntries(
          GESTION_COBRO_TABS.map((tab) => [tab.key, clientes.filter((cliente) => tabMatch(cliente, tab.key)).length])
        );
        const quickTabs = ['recordatorio_pago', 'reenviar'];
        const isQuickCobroList = quickTabs.includes(cobroView);
        const quickClientes = isQuickCobroList
          ? clientes.filter((cliente) => tabMatch(cliente, cobroView))
          : [];

        return (
          <section className="mf-cobranza mf-cobranza-menu-only">
            <div className="mf-cobranza-tabs" aria-label="Menu principal de deuda">
              <div className="mf-cobranza-tabs-scroll">
                {GESTION_COBRO_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`${cobroView === tab.key ? 'is-active' : ''}${tab.key === 'reenviar' ? ' mf-tab-reenviar' : ''}`}
                    onClick={() => {
                      setCobroView(tab.key);
                      setDebtModalOpen(!quickTabs.includes(tab.key));
                    }}
                  >
                    {tab.label} ({tabCounts[tab.key] || 0})
                  </button>
                ))}
              </div>
            </div>
            {cobroMsg && <p className="mf-cobro-msg">{cobroMsg}</p>}
            {morososLoading && <p className="mf-muted">Cargando datos de gestion...</p>}
            {isQuickCobroList && !morososLoading && (
              <div className="mf-quick-send-list" aria-label={`Lista rapida ${cobroView}`}>
                {quickClientes.length ? quickClientes.map((cliente) => (
                  <article className="mf-quick-send-row" key={cliente.case_id || cliente.prestamo_id || cliente.cliente_id}>
                    <button
                      type="button"
                      className="mf-quick-send-main"
                      onClick={() => openCobroCase(cliente)}
                      title="Ver caso"
                    >
                      <strong>{cliente.cliente_nombre || 'Cliente'}</strong>
                      <small>
                        {cliente.cliente_telefono || 'Sin telefono'} · {cliente.prestamo_numero || (cliente.facturas || [])[0]?.numero || '-'}
                      </small>
                    </button>
                    <span className="mf-quick-send-amount">
                      {money.format(Number(cliente.total_atrasado) || 0)}
                    </span>
                    <button
                      type="button"
                      className="mf-quick-send-button"
                      onClick={() => handleCaseEnviarWhatsapp(cliente)}
                      disabled={sendingId === cliente.cliente_id}
                    >
                      {sendingId === cliente.cliente_id ? '...' : 'Enviar'}
                    </button>
                  </article>
                )) : (
                  <p className="mf-quick-empty">
                    {cobroView === 'reenviar'
                      ? 'No hay clientes pendientes para reenviar.'
                      : 'No hay recordatorios pendientes.'}
                  </p>
                )}
              </div>
            )}
          </section>
        );

        let visibles = clientes.filter((cliente) => tabMatch(cliente, cobroView));
        if (filtro) {
          visibles = visibles.filter((c) =>
            (c.cliente_nombre || '').toLowerCase().includes(filtro) ||
            (c.cliente_telefono || '').toLowerCase().includes(filtro));
        }
        const isGestionCobro = morosos?.tipo_cobranza === 'gestion_cobro';
        const isFinancieraCobro = morosos?.tipo_cobranza === 'financiera' || isGestionCobro;
        const usaAccionesWhatsAppCobro = !isFinancieraCobro;
        const deudaLabel = isFinancieraCobro ? 'prestamo(s)' : 'factura(s)';
        const cuentaLabel = isFinancieraCobro ? 'pagos vencidos' : 'cuota(s)';

        return (
          <section className="mf-cobranza">
            <div className="mf-cobranza-head">
              <input
                className="mf-cobranza-filter"
                value={cobroFilter}
                onChange={(event) => setCobroFilter(event.target.value)}
                placeholder="Buscar cliente..."
              />
              <button type="button" onClick={loadMorosos} disabled={morososLoading} title="Actualizar">
                ...
              </button>
            </div>

            {clientes.length > 0 && (
              <div className="mf-cobranza-tabs" aria-label="Filtros Gestion de Cobro">
                <div className="mf-cobranza-tabs-scroll">
                  {GESTION_COBRO_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`${cobroView === tab.key ? 'is-active' : ''}${tab.key === 'reenviar' ? ' mf-tab-reenviar' : ''}`}
                      onClick={() => setCobroView(tab.key)}
                    >
                      {tab.label} ({tabCounts[tab.key] || 0})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cobroMsg && <p className="mf-cobro-msg">{cobroMsg}</p>}
            {morososLoading && !clientes.length && <p className="mf-muted">Cargando lista de cobranza...</p>}

            <div className="mf-cobranza-list">
              {visibles.map((cliente) => (
                <article className="mf-cob-card" key={cliente.case_id || cliente.prestamo_id || cliente.cliente_id}>
                  <header className="mf-cob-card-head">
                    <strong>{cliente.cliente_nombre}</strong>
                    <span className="mf-cob-head-badges">
                      {cliente.por_reenviar && <span className="mf-cob-badge is-reenviar">Reenviar</span>}
                      <span className={`mf-cob-badge${cliente.dias_mas_vencido >= 30 ? ' is-red' : ''}`}>
                        {cliente.dias_mas_vencido}d
                      </span>
                    </span>
                  </header>

                  <div className="mf-cob-card-info">
                    <input
                      className="mf-cob-phone"
                      type="tel"
                      value={cliente.cliente_telefono || ''}
                      onChange={(event) => updatePhoneLocal(cliente.cliente_id, event.target.value)}
                      onFocus={(event) => { phoneFocusRef.current = event.target.value; }}
                      onBlur={(event) => { if (event.target.value !== phoneFocusRef.current) savePhone(cliente); }}
                      placeholder="Agregar telefono"
                    />
                    <b>{money.format(cliente.total_atrasado)}</b>
                  </div>
                  <div className="mf-cob-card-facts">
                    {cliente.cuotas_atrasadas} {cuentaLabel}: {(cliente.facturas || []).map((f) => f.numero).join(', ') || deudaLabel}
                  </div>

                  {usaAccionesWhatsAppCobro && (
                    <>
                  <div className="mf-cob-seg">
                    {COBRO_ESTADOS.map((est) => (
                      <button
                        key={est.key}
                        type="button"
                        className={cliente.seg_estado === est.key ? 'is-active' : ''}
                        onClick={() => toggleSegEstado(cliente, est.key)}
                      >
                        {est.label}
                      </button>
                    ))}
                  </div>

                  {cliente.seg_estado === 'cliente_vendra' && (
                    <input
                      type="date"
                      className="mf-cob-date"
                      value={cliente.seg_fecha || ''}
                      onChange={(event) => handleSegChange(cliente.cliente_id, { seg_fecha: event.target.value || null })}
                    />
                  )}

                  <input
                    className="mf-cob-nota"
                    value={cliente.seg_nota || ''}
                    onChange={(event) => updateSegLocal(cliente.cliente_id, { seg_nota: event.target.value })}
                    onBlur={() => saveSeg(cliente)}
                    placeholder="Nota interna..."
                  />

                  {cliente.seg_estado === 'cliente_vendra' ? (
                    <button
                      className="mf-cob-send mf-cob-save"
                      type="button"
                      onClick={() => handleGuardarSeguimiento(cliente)}
                    >
                      Guardar
                    </button>
                  ) : cliente.seg_estado === 'ir_a_buscar' ? (
                    <button
                      className="mf-cob-send mf-cob-buscar"
                      type="button"
                      onClick={() => handleEnviarBuscador(cliente)}
                      disabled={sendingId === cliente.cliente_id}
                    >
                      {sendingId === cliente.cliente_id ? 'Abriendo chat...' : '📄 Enviar al buscador'}
                    </button>
                  ) : (
                    <button
                      className="mf-cob-send"
                      type="button"
                      onClick={() => handleEnviarMsj(cliente)}
                      disabled={sendingId === cliente.cliente_id}
                    >
                      {sendingId === cliente.cliente_id ? 'Abriendo chat...' : 'Enviar msj'}
                    </button>
                  )}
                    </>
                  )}
                </article>
              ))}

              {!morososLoading && clientes.length > 0 && visibles.length === 0 && (
                <p className="mf-muted">
                  {cobroView === 'reenviar'
                    ? 'No hay clientes para reenviar (los que recibieron mensaje ya pagaron, o aun no les has enviado).'
                    : `Ningun cliente coincide con "${cobroFilter}".`}
                </p>
              )}
            </div>
          </section>
        );
      })()}

      {mode === 'cotizar' && (
      <>
      <section className="mf-search">
        <label htmlFor="mf-product-search">Buscar producto</label>
        <input
          id="mf-product-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Codigo, descripcion..."
          disabled={!session}
        />
        {!session && <p className="mf-muted">Conecta tu usuario del CRM para buscar productos.</p>}
        {loading && <p className="mf-muted">Buscando...</p>}
        {!loading && query.trim().length >= 2 && session && products.length === 0 && (
          <p className="mf-muted">Sin resultados para "{query.trim()}".</p>
        )}
        {products.length > 0 && (
          <div className="mf-results">
            {products.map((product) => (
              <button key={product.id || product.codigo} type="button" onClick={() => addProduct(product)}>
                <span>
                  <strong>{product.codigo || 'SIN CODIGO'}</strong>
                  <small>{product.descripcion || product.nombre}</small>
                </span>
                <span>
                  <strong>{money.format(normalizeNumber(product.precio ?? product.precio_venta ?? product.precio1, 0))}</strong>
                  <small>Exist. {normalizeNumber(product.existencia, 0)}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        <button className="mf-advanced-button" type="button" onClick={() => setAdvancedOpen(true)} disabled={!session}>
          Abrir busqueda avanzada
        </button>
      </section>

      <section className="mf-items">
        {lines.length === 0 ? (
          <div className="mf-empty">
            <strong>Todavia no hay articulos.</strong>
            <p>{omniQuoteConversation ? 'Agrega productos para cotizar esta conversacion Omni.' : 'Agrega productos manualmente desde el buscador para preparar la cotizacion sin salir de WhatsApp.'}</p>
            {lastQuote?.lines?.length > 0 && (
              <button className="mf-restore-button" type="button" onClick={restoreLastQuote}>
                Recuperar ultima cotizacion ({lastQuote.lines.length})
              </button>
            )}
            {quoteHistory.length > 0 && (
              <div className="mf-history-list">
                <strong>Historial del chat</strong>
                {quoteHistory.slice(0, 4).map((item) => (
                  <button key={item.id || item.sentAt} type="button" onClick={() => restoreHistoryQuote(item)}>
                    <span>{new Date(item.sentAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{item.lines?.length || 0} art.</span>
                    <b>{money.format(item.total || 0)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          lines.map((line) => (
            <article className="mf-line" key={line.lineId}>
              <div className="mf-line-main">
                <strong>{line.descripcion}</strong>
                <small>{line.codigo || 'Sin codigo'} · Exist. {line.existencia}</small>
              </div>
              <div className="mf-line-controls">
                <input
                  aria-label="Cantidad"
                  min="1"
                  type="number"
                  value={line.cantidad}
                  onChange={(event) => updateLine(line.lineId, { cantidad: normalizeNumber(event.target.value, 1) })}
                />
                <input
                  aria-label="Precio"
                  min="0"
                  step="0.01"
                  type="number"
                  value={line.precio}
                  onChange={(event) => updateLine(line.lineId, { precio: normalizeNumber(event.target.value, 0) })}
                />
                <button type="button" onClick={() => removeLine(line.lineId)} title="Eliminar">
                  ×
                </button>
              </div>
              <footer>{money.format(line.cantidad * line.precio)}</footer>
            </article>
          ))
        )}
      </section>

      <footer className="mf-footer">
        <dl>
          <div><dt>Subtotal</dt><dd>{money.format(totals.subtotal)}</dd></div>
          <div><dt>ITBIS</dt><dd>{money.format(totals.tax)}</dd></div>
          <div><dt>Total seleccionado</dt><dd>{money.format(totals.total)}</dd></div>
        </dl>
        {notice && <p className="mf-notice">{notice}</p>}
        <button className="mf-secondary" type="button" onClick={handleSendToMotoflow} disabled={sendingToMotoflow || !lines.length}>
          {sendingToMotoflow ? 'Enviando a Motoflow...' : 'Mandar a facturar en Motoflow'}
        </button>
        <button className="mf-primary" type="button" onClick={handlePasteQuote} disabled={pastingQuote}>
          {pastingQuote
            ? (omniQuoteConversation ? 'Registrando cotizacion...' : 'Pegando cotizacion...')
            : (omniQuoteConversation ? 'Crear y registrar cotizacion' : 'Crear y pegar cotizacion')}
        </button>
      </footer>
      </>
      )}

      {advancedOpen && (
        <div className="mf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Buscar producto">
          <div className="mf-product-modal">
            <header className="mf-modal-header">
              <h3>Buscar producto</h3>
              <button type="button" onClick={() => setAdvancedOpen(false)} title="Cerrar">×</button>
            </header>

            <section className="mf-modal-filters">
              <input
                autoFocus
                value={advancedSearch}
                onChange={(event) => setAdvancedSearch(event.target.value)}
                placeholder="Buscar por codigo, ref, descripcion..."
              />
              <input
                value={advancedModelo}
                onChange={(event) => setAdvancedModelo(event.target.value)}
                placeholder="Modelo"
              />
              <input
                value={advancedMarca}
                onChange={(event) => setAdvancedMarca(event.target.value)}
                placeholder="Marca"
              />
              <label>
                <input
                  type="checkbox"
                  checked={advancedIncludeZero}
                  onChange={(event) => setAdvancedIncludeZero(event.target.checked)}
                />
                Incluir existencias en cero
              </label>
            </section>

            <section className="mf-product-table-wrap">
              <table className="mf-product-table">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Referencia</th>
                    <th>Descripcion</th>
                    <th>Ubicacion</th>
                    <th>Exist.</th>
                    <th>Precio+Imp</th>
                    <th>Marca</th>
                  </tr>
                </thead>
                <tbody>
                  {advancedLoading && (
                    <tr>
                      <td colSpan="7" className="mf-table-state">Buscando productos...</td>
                    </tr>
                  )}
                  {!advancedLoading && advancedProducts.length === 0 && (
                    <tr>
                      <td colSpan="7" className="mf-table-state">No se encontraron productos.</td>
                    </tr>
                  )}
                  {!advancedLoading && advancedProducts.map((product) => {
                    const price = normalizeNumber(product.precio ?? product.precio_venta ?? product.precio1, 0);
                    const taxPct = normalizeNumber(product.itbis_pct, 0.18);
                    const stock = normalizeNumber(product.existencia, 0);

                    return (
                      <tr key={product.id || product.codigo} onDoubleClick={() => addProduct(product)}>
                        <td><button type="button" onClick={() => addProduct(product)}>{product.codigo || '-'}</button></td>
                        <td>{product.referencia || '-'}</td>
                        <td>{product.descripcion || product.nombre}</td>
                        <td>{product.ubicacion || '-'}</td>
                        <td className={stock > 0 ? 'mf-stock-ok' : 'mf-stock-zero'}>{stock}</td>
                        <td className="mf-price">{money.format(price)}</td>
                        <td>{product.marca_nombre || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <footer className="mf-modal-footer">
              <span>Doble clic o toca el codigo para agregar.</span>
              <button type="button" onClick={() => setAdvancedOpen(false)}>Cerrar</button>
            </footer>
          </div>
        </div>
      )}

      {debtModalOpen && (() => {
        const clientes = morosos?.clientes || [];
        const today = new Date().toISOString().slice(0, 10);
        const matchTab = (cliente, tabKey) => {
          if (tabKey === 'recordatorio_pago') return Boolean(cliente.recordatorio_pago);
          if (cliente.recordatorio_pago) return false;
          if (tabKey === 'robados') return Boolean(cliente.es_robado);
          // ROBADO es exclusivo: vive SOLO en su pestana (acuerdo de pago).
          if (cliente.es_robado) return false;
          if (tabKey === 'todos') return true;
          if (tabKey === 'promesas') return Boolean(cliente.tiene_promesa || cliente.seg_fecha);
          if (tabKey === 'promesas_vencidas') return Boolean(cliente.promesa_vencida || (cliente.seg_fecha && cliente.seg_fecha < today));
          if (tabKey === 'pagaron_siguen') return Number(cliente.pagos15_count || 0) > 0;
          if (tabKey === 'mandados_buscar') return Boolean(cliente.tiene_gestion_fisica || cliente.seg_estado === 'ir_a_buscar' || cliente.estado_cobro === 'Mandado a buscar');
          if (tabKey === 'sin_respuesta') return !cliente.tiene_promesa && !cliente.seg_fecha && !cliente.tiene_respuesta;
          if (tabKey === 'criticos') return Boolean(cliente.caso_critico || (cliente.prioridad === 'Alta' && (cliente.dias_mas_vencido >= 31 || !cliente.tiene_promesa)));
          if (tabKey === 'reenviar') return Boolean(cliente.por_reenviar);
          return true;
        };
        const tabCounts = Object.fromEntries(
          GESTION_COBRO_TABS.map((tab) => [tab.key, clientes.filter((cliente) => matchTab(cliente, tab.key)).length])
        );
        const filtro = cobroFilter.trim().toLowerCase();
        const rows = clientes
          .filter((cliente) => matchTab(cliente, cobroView))
          .filter((cliente) => {
            if (!filtro) return true;
            return [
              cliente.cliente_nombre,
              cliente.cliente_telefono,
              cliente.cliente_codigo,
              cliente.cliente_rnc,
              cliente.prestamo_numero,
              ...(cliente.facturas || []).map((item) => item.numero)
            ].filter(Boolean).join(' ').toLowerCase().includes(filtro);
          });

        return (
          <div className="mf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Gestion de Cobro">
            <div className="mf-product-modal mf-gestion-modal">
              <header className="mf-modal-header">
                <h3>Gestion de Cobro</h3>
                <button type="button" onClick={() => setDebtModalOpen(false)} title="Cerrar">×</button>
              </header>

              <section className="mf-gestion-modal-menu">
                {GESTION_COBRO_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`${cobroView === tab.key ? 'is-active' : ''}${tab.key === 'reenviar' ? ' mf-tab-reenviar' : ''}`}
                    onClick={() => setCobroView(tab.key)}
                  >
                    {tab.label} ({tabCounts[tab.key] || 0})
                  </button>
                ))}
              </section>

              <section className="mf-gestion-modal-filters">
                <input
                  autoFocus
                  value={cobroFilter}
                  onChange={(event) => setCobroFilter(event.target.value)}
                  placeholder="Buscar cliente, telefono, cedula o prestamo..."
                />
                <button type="button" onClick={loadMorosos} disabled={morososLoading}>
                  {morososLoading ? 'Actualizando...' : 'Actualizar'}
                </button>
              </section>

              <section className="mf-product-table-wrap">
                <table className="mf-product-table mf-gestion-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Prestamo / Motor</th>
                      <th>Dias atraso</th>
                      <th>Vencido</th>
                      <th>Ult. pago</th>
                      <th>Ult. respuesta</th>
                      <th>Promesa de pago</th>
                      <th>Estado</th>
                      <th>Prioridad</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {morososLoading && (
                      <tr>
                        <td colSpan="10" className="mf-table-state">Cargando gestion de cobro...</td>
                      </tr>
                    )}
                    {!morososLoading && rows.length === 0 && (
                      <tr>
                        <td colSpan="10" className="mf-table-state">No hay casos para este filtro.</td>
                      </tr>
                    )}
                    {!morososLoading && rows.map((cliente) => {
                      const loanNumber = cliente.prestamo_numero || (cliente.facturas || [])[0]?.numero || '-';
                      const loanParts = splitPrestamoNumero(loanNumber);
                      const ultimoPagoFecha = getGestionUltimoPagoFecha(cliente);
                      const ultimoPagoMonto = Number(getGestionUltimoPagoMonto(cliente) || 0);
                      const estadoCobro = getGestionEstado(cliente);
                      const prioridad = getGestionPrioridad(cliente);
                      return (
                        <tr key={cliente.case_id || cliente.prestamo_id || cliente.cliente_id}>
                          <td>
                            <strong>{cliente.cliente_nombre || 'Cliente'}</strong>
                            <small>{cliente.cliente_telefono || '-'}</small>
                          </td>
                          <td>
                            <button type="button" className="mf-loan-stack">
                              {loanParts.map((part) => <span key={part}>{part}</span>)}
                            </button>
                            <small>financiamiento</small>
                          </td>
                          <td>
                            <b className="mf-days">{cliente.dias_mas_vencido || 0} dias</b>
                            <small>{cliente.bucket || '-'}</small>
                          </td>
                          <td className="mf-price">{money.format(Number(cliente.total_atrasado) || 0)}</td>
                          <td>
                            <span>{formatDateDo(ultimoPagoFecha)}</span>
                            {ultimoPagoMonto > 0 && <small className="mf-last-payment-amount">{money.format(ultimoPagoMonto)}</small>}
                          </td>
                          <td>
                            <span>{cliente.tiene_respuesta ? 'Respondio' : 'Sin respuesta'}</span>
                            <small>{cliente.seg_nota || '-'}</small>
                          </td>
                          <td>
                            <span>{cliente.seg_fecha ? formatDateDo(cliente.seg_fecha) : '-'}</span>
                            {Number(cliente.monto_promesa || 0) > 0 && <small>{money.format(cliente.monto_promesa)}</small>}
                          </td>
                          <td><span className="mf-gestion-pill" style={estadoPillStyle(estadoCobro)}>{estadoCobro}</span></td>
                          <td><span className={`mf-gestion-pill ${prioridad === 'Alta' ? 'is-high' : ''}`}>{prioridad}</span></td>
                          <td>
                            <button className="mf-case-button" type="button" onClick={() => openCobroCase(cliente)}>
                              Ver caso
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              <footer className="mf-modal-footer">
                <span>{rows.length} caso(s) mostrados</span>
                <button type="button" onClick={() => setDebtModalOpen(false)}>Cerrar</button>
              </footer>
            </div>
          </div>
        );
      })()}

      {selectedCobroCase && (() => {
        const cliente = selectedCobroCase;
        const loanNumber = cliente.prestamo_numero || (cliente.facturas || [])[0]?.numero || '-';
        const ultimoPagoFecha = getGestionUltimoPagoFecha(cliente);
        const ultimoPagoMonto = Number(getGestionUltimoPagoMonto(cliente) || 0);
        const estadoCobro = getGestionEstado(cliente);
        const pagosVencidos = Number(cliente.pagos_vencidos_equivalentes ?? cliente.cuotas_atrasadas ?? 0);
        const montoVencido = Number(cliente.total_atrasado || 0);
        const diasAtraso = Number(cliente.dias_mas_vencido || 0);
        const fechaPromesa = cliente.seg_fecha || cliente.fecha_promesa;
        const montoPromesa = Number(cliente.monto_promesa || cliente.monto_prometido || 0);
        const telefono = cliente.cliente_telefono || '-';
        const cedula = cliente.cliente_rnc || cliente.rnc || cliente.cliente_codigo || '-';
        const garantia = cliente.garantia || cliente.motor || '-';
        const pago15 = Number(cliente.pagos15_count || 0) > 0 ? 'Si' : 'No';
        const todayInputValue = new Date().toISOString().slice(0, 10);
        const timeline = cliente.gestiones || [];
        const pagos = cliente.pagos15 || [];

        return (
          <div className="mf-modal-backdrop mf-case-backdrop" role="dialog" aria-modal="true" aria-label="Caso de cobro">
            <div className="mf-case-modal">
              <header className="mf-case-header">
                <h3>Caso de cobro</h3>
                <div className="mf-case-header-actions">
                  <button type="button" className="mf-danger-outline" onClick={handleCaseCastigarCuenta} disabled={caseSaving}>Castigar cuenta</button>
                  <button type="button" onClick={() => handleCaseVerResumen(cliente)}>Ver resumen</button>
                  {MOTOFLOW_APP_URL && <button type="button" onClick={() => handleCaseAbrirCrm(cliente)}>Abrir en CRM</button>}
                  <span className="mf-client-active">Cliente activo</span>
                  <button type="button" className="mf-case-close" onClick={() => setSelectedCobroCase(null)} title="Cerrar">x</button>
                </div>
              </header>

              <section className="mf-case-identity">
                <div className="mf-case-avatar" />
                <div>
                  <strong>{cliente.cliente_nombre || 'Cliente'}</strong>
                  <span>{telefono}</span>
                  <span>Cedula: {cedula}</span>
                </div>
              </section>

              <section className="mf-case-summary-grid">
                <article className="mf-case-box">
                  <h4>Resumen del prestamo</h4>
                  <div className="mf-case-facts">
                    <span>Prestamo: <b>{loanNumber}</b></span>
                    <span>Monto vencido: <b className="mf-danger-text">{money.format(montoVencido)}</b></span>
                    <span>Dias de atraso: <b className="mf-days">{diasAtraso} dias</b></span>
                    <span>Pagos vencidos: <b>{pagosVencidos}</b></span>
                    <span>Ultimo pago: <b>{formatDateDo(ultimoPagoFecha)}</b></span>
                    <span>Motor/Garantia: <b>{garantia}</b></span>
                    <span>Pago ult. 15 dias: <b>{pago15}</b></span>
                    {ultimoPagoMonto > 0 && <span>Ult. monto: <b className="mf-last-payment-amount">{money.format(ultimoPagoMonto)}</b></span>}
                  </div>
                </article>

                <article className="mf-case-box">
                  <h4>Promesa de pago actual</h4>
                  <div className="mf-case-facts">
                    <span>Fecha prometida: <b>{fechaPromesa ? formatDateDo(fechaPromesa) : '-'}</b></span>
                    <span>Monto prometido: <b>{montoPromesa > 0 ? money.format(montoPromesa) : '-'}</b></span>
                    <span>Estado: <b className="mf-gestion-pill" style={estadoPillStyle(estadoCobro)}>{estadoCobro}</b></span>
                  </div>
                </article>
              </section>

              <nav className="mf-case-tabs">
                {['gestion', 'pagos', 'mensajes', 'visitas', 'notas'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={caseDetailTab === tab ? 'is-active' : ''}
                    onClick={() => {
                      setCaseDetailTab(tab);
                      if (tab === 'notas' && !caseNote.trim()) setCaseNote('');
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </nav>

              <section className="mf-case-detail-body">
                {caseDetailTab === 'gestion' && (
                  timeline.length ? (
                    <div className="mf-case-timeline">
                      {timeline.map((gestion, index) => (
                        <article key={gestion.id || `${gestion.tipo}-${index}`}>
                          <strong>{String(gestion.tipo || 'Gestion').replaceAll('_', ' ')}</strong>
                          <span>{formatDateDo(gestion.created_at || gestion.fecha_promesa)}</span>
                          {gestion.fecha_promesa && <small>Promesa: {formatDateDo(gestion.fecha_promesa)} {Number(gestion.monto_promesa || 0) > 0 ? money.format(gestion.monto_promesa) : ''}</small>}
                          {gestion.metadata?.fecha_busqueda && <small>Busqueda: {formatDateDo(gestion.metadata.fecha_busqueda)}</small>}
                          {gestion.metadata?.fecha_llamada && <small>Llamada: {formatDateDo(gestion.metadata.fecha_llamada)}</small>}
                          {gestion.nota && <p>{gestion.nota}</p>}
                          {gestion.resultado && <small>Resultado: {gestion.resultado}</small>}
                        </article>
                      ))}
                    </div>
                  ) : <div className="mf-case-empty">Sin gestiones registradas.</div>
                )}

                {caseDetailTab === 'pagos' && (
                  pagos.length ? (
                    <div className="mf-case-payments">
                      {pagos.map((pago, index) => (
                        <div key={pago.id || `${pago.fecha}-${index}`}>
                          <span>{formatDateDo(pago.fecha)}</span>
                          <b className="mf-last-payment-amount">{money.format(Number(pago.total_pagado || pago.monto || 0))}</b>
                        </div>
                      ))}
                    </div>
                  ) : <div className="mf-case-empty">Sin pagos en los ultimos 15 dias.</div>
                )}

                {caseDetailTab === 'mensajes' && (
                  <textarea
                    value={caseNote}
                    onChange={(event) => setCaseNote(event.target.value)}
                    placeholder="Nota o respuesta del cliente..."
                    rows="4"
                  />
                )}

                {caseDetailTab === 'visitas' && (
                  <div className="mf-case-form-grid">
                    <select value={caseVisitResult} onChange={(event) => setCaseVisitResult(event.target.value)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="no_estaba">No estaba</option>
                      <option value="prometio_pagar">Prometio pagar</option>
                      <option value="direccion_incorrecta">Direccion incorrecta</option>
                      <option value="resuelto">Resuelto</option>
                    </select>
                    <textarea
                      value={caseNote}
                      onChange={(event) => setCaseNote(event.target.value)}
                      placeholder="Nota de visita..."
                      rows="3"
                    />
                    <button type="button" onClick={handleCaseRegistrarVisita} disabled={caseSaving}>Registrar visita</button>
                  </div>
                )}

                {caseDetailTab === 'notas' && (
                  <div className="mf-case-form-grid">
                    <textarea
                      value={caseNote}
                      onChange={(event) => setCaseNote(event.target.value)}
                      placeholder="Nota interna..."
                      rows="4"
                    />
                    <button type="button" onClick={() => saveCaseGestion({ tipo: 'nota', estado: 'registrada', nota: caseNote }, 'Nota registrada.')} disabled={caseSaving || !caseNote.trim()}>Guardar nota</button>
                    {caseNote.trim().toLowerCase().startsWith('llamada:') && (
                      <button type="button" onClick={handleCaseRegistrarLlamada} disabled={caseSaving}>Registrar nota llamada</button>
                    )}
                  </div>
                )}
              </section>

              <section className="mf-case-actions">
                <h4>Acciones rapidas</h4>
                <div className="mf-case-action-row">
                  <button type="button" onClick={() => handleCaseEnviarWhatsapp(cliente)} disabled={caseSaving}>Enviar WhatsApp</button>
                  <button type="button" onClick={() => { setCaseDetailTab('notas'); setCaseNote((current) => current.trim() || 'Llamada: '); }}>Registrar llamada</button>
                  <button type="button" onClick={() => setCaseDetailTab('visitas')}>Registrar visita</button>
                  <button type="button" onClick={handleCaseMandarABuscar} disabled={caseSaving}>Mandar a buscar</button>
                  {selectedCobroCase?.es_robado ? (
                    <button
                      type="button"
                      onClick={handleCaseQuitarRobado}
                      disabled={caseSaving}
                      style={{ background: '#1e293b', color: '#fff', borderColor: '#0f172a' }}
                    >
                      Quitar ROBADO
                    </button>
                  ) : (
                    <button type="button" onClick={handleCaseMarcarRobado} disabled={caseSaving}>Marcar ROBADO</button>
                  )}
                  <input type="date" value={casePromiseDate || todayInputValue} onChange={(event) => setCasePromiseDate(event.target.value)} />
                  <input type="text" value={casePromiseAmount} onChange={(event) => setCasePromiseAmount(event.target.value)} placeholder="Monto" />
                </div>
                <button type="button" className="mf-promise-button" onClick={handleCaseRegistrarPromesa} disabled={caseSaving}>
                  {caseSaving ? 'Guardando...' : 'Registrar promesa'}
                </button>
              </section>
            </div>
          </div>
        );
      })()}

      {summaryCobroCase && (() => {
        const cliente = summaryCobroCase;
        const loanNumber = cliente.prestamo_numero || (cliente.facturas || [])[0]?.numero || '-';
        const ultimoPagoFecha = getGestionUltimoPagoFecha(cliente);
        const ultimoPagoMonto = Number(getGestionUltimoPagoMonto(cliente) || 0);
        const estadoCobro = getGestionEstado(cliente);
        const prioridad = getGestionPrioridad(cliente);
        const pagosVencidos = Number(cliente.pagos_vencidos_equivalentes ?? cliente.cuotas_atrasadas ?? 0);
        const montoVencido = Number(cliente.total_atrasado || 0);
        const diasAtraso = Number(cliente.dias_mas_vencido || 0);
        const fechaPromesa = cliente.seg_fecha || cliente.fecha_promesa;
        const montoPromesa = Number(cliente.monto_promesa || cliente.monto_prometido || 0);
        const telefono = cliente.cliente_telefono || '-';
        const cedula = cliente.cliente_rnc || cliente.rnc || cliente.cliente_codigo || '-';
        const pago15 = Number(cliente.pagos15_count || 0) > 0 ? 'Si' : 'No';

        return (
          <div className="mf-modal-backdrop mf-summary-backdrop" role="dialog" aria-modal="true" aria-label="Resumen del cliente">
            <div className="mf-readonly-summary">
              <header className="mf-readonly-header">
                <div>
                  <p>Resumen del cliente</p>
                  <h3>{cliente.cliente_nombre || 'Cliente'}</h3>
                </div>
                <button type="button" onClick={() => setSummaryCobroCase(null)} title="Cerrar">x</button>
              </header>

              <section className="mf-readonly-badges">
                <span className="mf-gestion-pill" style={estadoPillStyle(estadoCobro)}>{estadoCobro}</span>
                <span className={`mf-gestion-pill ${prioridad === 'Alta' ? 'is-high' : ''}`}>{prioridad}</span>
                <span className="mf-client-active">Cliente activo</span>
              </section>

              <section className="mf-readonly-grid">
                <article>
                  <strong>Contacto</strong>
                  <span>Telefono: <b>{telefono}</b></span>
                  <span>Cedula/Codigo: <b>{cedula}</b></span>
                </article>
                <article>
                  <strong>Prestamo</strong>
                  <span>Numero: <b>{loanNumber}</b></span>
                  <span>Pagos vencidos: <b>{pagosVencidos}</b></span>
                </article>
                <article>
                  <strong>Deuda</strong>
                  <span>Monto vencido: <b className="mf-danger-text">{money.format(montoVencido)}</b></span>
                  <span>Dias atraso: <b className="mf-days">{diasAtraso} dias</b></span>
                </article>
                <article>
                  <strong>Ultimo pago</strong>
                  <span>Fecha: <b>{formatDateDo(ultimoPagoFecha)}</b></span>
                  <span>Monto: <b className="mf-last-payment-amount">{ultimoPagoMonto > 0 ? money.format(ultimoPagoMonto) : '-'}</b></span>
                  <span>Pago ult. 15 dias: <b>{pago15}</b></span>
                </article>
                <article>
                  <strong>Promesa actual</strong>
                  <span>Fecha: <b>{fechaPromesa ? formatDateDo(fechaPromesa) : '-'}</b></span>
                  <span>Monto: <b>{montoPromesa > 0 ? money.format(montoPromesa) : '-'}</b></span>
                </article>
                <article>
                  <strong>Respuesta</strong>
                  <span>Ultima respuesta: <b>{cliente.tiene_respuesta ? 'Respondio' : 'Sin respuesta'}</b></span>
                  <span>Nota: <b>{cliente.seg_nota || '-'}</b></span>
                </article>
              </section>

              <footer className="mf-readonly-footer">
                {MOTOFLOW_APP_URL && (
                  <button type="button" onClick={() => handleCaseAbrirCrm(cliente)}>Abrir en CRM</button>
                )}
                <button type="button" onClick={() => setSummaryCobroCase(null)}>Cerrar</button>
              </footer>
            </div>
          </div>
        );
      })()}
      </aside>
    </>
  );
}
