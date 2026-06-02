const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const SESSION_KEY = 'motoflow_quote_extension_session';

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || payload?.error_description || payload?.error || response.statusText;
    throw new Error(message);
  }

  return payload;
}

function getAuthHeaders() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }

  const session = getStoredSession();
  if (!session?.access_token) {
    throw new Error('Conecta tu usuario de Motoflow.');
  }

  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  };
}

export async function searchProducts(queryOrFilters) {
  const filters =
    typeof queryOrFilters === 'string'
      ? { query: queryOrFilters }
      : queryOrFilters || {};
  const query = filters.query || '';
  const limit = filters.limit || 12;
  const offset = filters.offset || 0;
  const marca = filters.marca || null;
  const modelo = filters.modelo || null;
  const includeZeroStock = filters.includeZeroStock !== false;

  if (API_BASE_URL) {
    const url = new URL('/products/search', API_BASE_URL);
    url.searchParams.set('q', query);
    if (marca) url.searchParams.set('marca', marca);
    if (modelo) url.searchParams.set('modelo', modelo);
    url.searchParams.set('includeZeroStock', String(includeZeroStock));
    return fetchJson(url.toString(), { credentials: 'include' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para buscar productos.');
  }

  const session = getStoredSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;

  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_productos_paginados`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_limit: limit,
      p_offset: offset,
      p_search_term: query,
      p_marca_filter: marca,
      p_modelo_filter: modelo,
      p_include_zero_stock: includeZeroStock
    })
  });
}

export function getStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (!session?.access_token) return null;
    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function signInWithPassword(email, password) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }

  const payload = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  return payload;
}

export function signOut() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function searchCustomers(query) {
  const headers = getAuthHeaders();
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  const orFilter = [
    `nombre.ilike.*${cleanQuery}*`,
    `telefono.ilike.*${cleanQuery}*`,
    `rnc.ilike.*${cleanQuery}*`,
    `codigo.ilike.*${cleanQuery}*`
  ].join(',');

  const url = new URL(`${SUPABASE_URL}/rest/v1/clientes`);
  url.searchParams.set('select', 'id,nombre,telefono,rnc,codigo');
  url.searchParams.set('activo', 'eq.true');
  url.searchParams.set('or', `(${orFilter})`);
  url.searchParams.set('order', 'nombre.asc');
  url.searchParams.set('limit', '8');

  return fetchJson(url.toString(), { headers });
}

export async function getVendors() {
  const headers = getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/vendedores`);
  url.searchParams.set('select', 'id,nombre');
  url.searchParams.set('activo', 'eq.true');
  url.searchParams.set('order', 'nombre.asc');

  return fetchJson(url.toString(), { headers });
}

export async function createQuote(data) {
  if (API_BASE_URL) {
    return fetchJson(new URL('/quotes', API_BASE_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
  }

  const headers = getAuthHeaders();

  const numero = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_next_cotizacion_numero`, {
    method: 'POST',
    headers,
    body: '{}'
  });

  const user = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, { headers });
  const cotizacionPayload = {
    numero,
    fecha_cotizacion: data.fecha_cotizacion,
    fecha_vencimiento: data.fecha_vencimiento,
    cliente_id: data.cliente_id,
    subtotal: data.subtotal,
    descuento_total: data.descuento_total || 0,
    itbis_total: data.itbis_total,
    total_cotizacion: data.total_cotizacion,
    estado: 'Facturando',
    notas: data.notas || null,
    usuario_id: user?.id || null,
    vendedor_id: data.vendedor_id || null,
    manual_cliente_nombre: data.manual_cliente_nombre || null
  };

  const [cotizacion] = await fetchJson(`${SUPABASE_URL}/rest/v1/cotizaciones?select=*`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(cotizacionPayload)
  });

  const detalles = data.detalles.map((item) => ({
    ...item,
    cotizacion_id: cotizacion.id
  }));

  await fetchJson(`${SUPABASE_URL}/rest/v1/cotizaciones_detalle`, {
    method: 'POST',
    headers,
    body: JSON.stringify(detalles)
  });

  return cotizacion;
}

export async function logConversationEvent(event) {
  if (API_BASE_URL) {
    return fetchJson(new URL('/conversation-events', API_BASE_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(event)
    });
  }

  const headers = getAuthHeaders();
  const payload = {
    source: 'whatsapp_web_extension',
    event_type: event.event_type,
    cliente_id: event.cliente_id || null,
    vendedor_id: event.vendedor_id || null,
    cotizacion_id: event.cotizacion_id || null,
    chat_id: event.chat_id || null,
    chat_name: event.chat_name || null,
    customer_name: event.customer_name || null,
    customer_phone: event.customer_phone || null,
    status: event.status || null,
    note: event.note || null,
    quote_total: event.quote_total || 0,
    items: event.items || [],
    metadata: event.metadata || {}
  };

  return fetchJson(`${SUPABASE_URL}/rest/v1/crm_whatsapp_conversation_events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
}
