import React, { useEffect, useMemo, useState } from 'react';
import { createQuote, getStoredSession, getVendors, logConversationEvent, searchCustomers, searchProducts, signInWithPassword, signOut } from './services/apiClient.js';
import { getCurrentChat, pasteTextIntoWhatsApp } from './utils/whatsappDom.js';

const money = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2
});

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
  const [chat, setChat] = useState(() => getCurrentChat());
  const [lines, setLines] = useState([]);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState(() => getStoredSession());
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedSearch, setAdvancedSearch] = useState('');
  const [advancedMarca, setAdvancedMarca] = useState('');
  const [advancedModelo, setAdvancedModelo] = useState('');
  const [advancedIncludeZero, setAdvancedIncludeZero] = useState(true);
  const [advancedProducts, setAdvancedProducts] = useState([]);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [pastingQuote, setPastingQuote] = useState(false);
  const [sendingToMotoflow, setSendingToMotoflow] = useState(false);
  const [lastQuote, setLastQuote] = useState(() => readLastQuote(chat));
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [internalNote, setInternalNote] = useState(() => readMeta(chat).internalNote || '');
  const [quoteStatus, setQuoteStatus] = useState(() => readMeta(chat).quoteStatus || 'cotizado');
  const [quoteHistory, setQuoteHistory] = useState(() => readHistory(chat));
  const [motoflowDetailsOpen, setMotoflowDetailsOpen] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = getCurrentChat();
      setChat((prev) => (prev.id === next.id && prev.name === next.name ? prev : next));
    }, 900);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(getStorageKey(chat));
      const meta = readMeta(chat);
      setLines(saved ? JSON.parse(saved) : []);
      setLastQuote(readLastQuote(chat));
      setQuoteHistory(readHistory(chat));
      setInternalNote(meta.internalNote || '');
      setQuoteStatus(meta.quoteStatus || 'cotizado');
    } catch {
      setLines([]);
      setLastQuote(null);
      setQuoteHistory([]);
      setInternalNote('');
      setQuoteStatus('cotizado');
    }
  }, [chat.id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(getStorageKey(chat), JSON.stringify(lines));
    } catch {
      // localStorage can be blocked in unusual browser profiles.
    }
  }, [chat.id, lines]);

  useEffect(() => {
    try {
      window.localStorage.setItem(getMetaStorageKey(chat), JSON.stringify({ internalNote, quoteStatus }));
    } catch {
      // localStorage can be blocked in unusual browser profiles.
    }
  }, [chat.id, internalNote, quoteStatus]);

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
    if (!chat.name) return;

    setCustomerQuery((current) => current || chat.name);
    if (/[\d+() -]{7,}/.test(chat.name)) {
      setCustomerPhone((current) => current || chat.name);
    }
  }, [chat.name]);

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
      chat_id: chat.id,
      chat_name: chat.name,
      cliente_id: selectedCustomer?.id || null,
      vendedor_id: selectedVendorId || null,
      customer_name: selectedCustomer?.nombre || customerQuery || chat.name || null,
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
        ...overrides.metadata
      }
    }).catch((error) => {
      console.warn('[Motoflow WhatsApp] No se pudo guardar evento:', error.message);
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

    window.localStorage.setItem(getLastQuoteStorageKey(chat), JSON.stringify(snapshot));
    writeHistory(chat, nextHistory);
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
      const text = formatQuoteMessage(chat, lines, totals);
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
        manual_cliente_nombre: selectedCustomer?.id ? null : (customerQuery.trim() || chat.name || 'Cliente WhatsApp'),
        vendedor_id: selectedVendorId || null,
        subtotal: totals.subtotal,
        descuento_total: 0,
        itbis_total: totals.tax,
        total_cotizacion: totals.total,
        notas: [
          'Cotizacion confirmada desde WhatsApp Web',
          chat.name ? `Chat: ${chat.name}` : null,
          customerPhone ? `Telefono: ${customerPhone}` : null,
          quoteStatus ? `Estado: ${STATUS_OPTIONS.find((item) => item.key === quoteStatus)?.label || quoteStatus}` : null,
          internalNote.trim() ? `Nota interna: ${internalNote.trim()}` : null
        ].filter(Boolean).join(' | '),
        detalles
      });

      safeLogEvent('quote_sent_to_invoice', {
        cotizacion_id: cotizacion.id,
        quote_total: totals.total,
        items: serializeLines(lines),
        metadata: { cotizacion_numero: cotizacion.numero }
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
      setNotice('Conectado a Motoflow. Ya puedes buscar productos.');
    } catch (error) {
      setNotice(error.message || 'No se pudo iniciar sesion.');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    signOut();
    setSession(null);
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

  if (collapsed) {
    return (
      <button className="mf-floating-button" type="button" onClick={() => setCollapsed(false)}>
        Cotizar
      </button>
    );
  }

  return (
    <aside className="mf-panel" aria-label="Cotizacion WhatsApp">
      <header className="mf-header">
        <div>
          <p className="mf-kicker">Motoflow</p>
          <h2>Cotizacion WhatsApp</h2>
          <p className="mf-chat">{chat.name || 'Chat actual'}</p>
          <div className="mf-header-actions">
            {session && (
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

      {!session && (
        <form className="mf-login" onSubmit={handleLogin}>
          <strong>Conectar con Motoflow</strong>
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
          <button type="submit" disabled={loginLoading}>
            {loginLoading ? 'Conectando...' : 'Conectar'}
          </button>
        </form>
      )}

      {session && (
        <section className="mf-motoflow-box">
          <button className="mf-motoflow-toggle" type="button" onClick={() => setMotoflowDetailsOpen((open) => !open)}>
            <span>
              Datos Motoflow
              <small>
                {selectedCustomer?.nombre || customerQuery || chat.name || 'Cliente sin asignar'} · {STATUS_OPTIONS.find((item) => item.key === quoteStatus)?.label || 'Cotizado'}
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
            <p>Agrega productos manualmente desde el buscador para preparar la cotizacion sin salir de WhatsApp.</p>
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
          {pastingQuote ? 'Pegando cotizacion...' : 'Crear y pegar cotizacion'}
        </button>
      </footer>

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
    </aside>
  );
}
