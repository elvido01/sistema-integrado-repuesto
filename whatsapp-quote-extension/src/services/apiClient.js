const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const SESSION_KEY = 'motoflow_quote_extension_session';

// ── Sesion: se guarda en el almacenamiento de la EXTENSION ──────────────
// Antes vivia solo en window.localStorage, que es el de web.whatsapp.com:
// WhatsApp lo limpia por su cuenta y la sesion se perdia sola ("Conecta tu
// usuario de Motoflow" hasta recargar y entrar de nuevo). chrome.storage.local
// es propio de la extension y WhatsApp no lo toca.
// Se mantiene una copia en localStorage y una cache en memoria para que las
// lecturas sincronas (getStoredSession) sigan funcionando igual.
const extStorage = (() => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) return chrome.storage.local;
  } catch { /* fuera de la extension */ }
  return null;
})();

let cachedSession = null;

function readLocal() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persistSession(payload) {
  cachedSession = payload || null;
  try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload)); } catch { /* storage lleno */ }
  try { extStorage?.set({ [SESSION_KEY]: payload }); } catch { /* sin permiso */ }
  publicarConfigOmni();
}

// El puente de Instagram (public/ig-mirror.js) corre en instagram.com, donde
// no llega el bundle ni sus variables de compilacion. Se le deja aqui la URL
// y la anon key —las mismas que ya usa este panel— para que pueda llamar la
// RPC del espejo con la sesion que acaba de guardarse. No se publica ningun
// secreto: la anon key es publica por diseño y la sesion ya vivia aqui.
const CONFIG_KEY = 'motoflow_omni_config';
export function publicarConfigOmni() {
  if (!extStorage || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    extStorage.set({ [CONFIG_KEY]: { url: SUPABASE_URL, anon: SUPABASE_ANON_KEY } });
  } catch { /* sin permiso */ }
}

function clearSession() {
  cachedSession = null;
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  try { extStorage?.remove(SESSION_KEY); } catch { /* noop */ }
}

// Rehidrata la sesion desde el almacenamiento de la extension. La app la
// llama al montar: si WhatsApp borro su localStorage, la recupera de aqui.
export async function loadStoredSession() {
  publicarConfigOmni();
  const local = readLocal();
  if (local?.access_token) { cachedSession = local; return local; }
  if (!extStorage) return null;
  try {
    const saved = await new Promise((resolve) => {
      extStorage.get(SESSION_KEY, (res) => resolve(res?.[SESSION_KEY] || null));
    });
    if (saved?.access_token) {
      cachedSession = saved;
      // Devuelve la copia a localStorage para las lecturas sincronas
      try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(saved)); } catch { /* noop */ }
      return saved;
    }
  } catch { /* noop */ }
  return null;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || payload?.error_description || payload?.error || response.statusText;
    throw new Error(message);
  }

  return payload;
}

function isMissingOutOfStockRpcError(error) {
  const message = String(error?.message || '');
  return /omni_crear_solicitudes_agotadas/i.test(message)
    && /schema cache|function/i.test(message);
}

// Renueva el access_token usando el refresh_token (los tokens de Supabase
// expiran en ~1h). Si el refresh falla, limpia la sesion guardada.
async function refreshSession(session) {
  try {
    const payload = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    persistSession(payload);
    return payload;
  } catch {
    clearSession();
    throw new Error('Tu sesion expiro. Toca "Salir" y conecta de nuevo tu usuario de Motoflow.');
  }
}

// Devuelve una sesion con access_token vigente, renovando si esta por expirar.
async function getValidSession() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
  const session = getStoredSession();
  if (!session?.access_token) {
    throw new Error('Conecta tu usuario de Motoflow.');
  }
  // Renueva si ya expiro o le quedan menos de 60 segundos
  const expMs = (session.expires_at || 0) * 1000;
  if (expMs && expMs - Date.now() < 60000) {
    if (!session.refresh_token) {
      clearSession();
      throw new Error('Tu sesion expiro. Conecta de nuevo tu usuario de Motoflow.');
    }
    return refreshSession(session);
  }
  return session;
}

async function getAuthHeaders() {
  const session = await getValidSession();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  };
}

const APP_TIME_ZONE = 'America/Santo_Domingo';
const SUPABASE_PAGE_SIZE = 1000;
const IN_FILTER_CHUNK_SIZE = 180;
const DIAS_GRACIA_PAGO = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysBetween(from, to = todayDate()) {
  if (!from) return 0;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

function chunkArray(items, size = IN_FILTER_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function pendingCuota(cuota) {
  return Math.max(
    0,
    Number(cuota.capital || 0) + Number(cuota.interes || 0)
      - Number(cuota.capital_pagado || 0) - Number(cuota.interes_pagado || 0)
  );
}

function cleanLoanNumber(value) {
  const raw = String(value || '').trim();
  const duplicatedLegacy = raw.match(/^(PT-\d+)-2\d+$/i);
  return duplicatedLegacy ? duplicatedLegacy[1] : raw;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function fetchRestRows(table, params, headers, pageSize = SUPABASE_PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });
    url.searchParams.set('offset', String(from));
    url.searchParams.set('limit', String(pageSize));
    const data = await fetchJson(url.toString(), { headers });
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function getCurrentEmpresa(headers) {
  try {
    const payload = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_empresas_usuario_extension`, {
      method: 'POST',
      headers,
      body: '{}'
    });
    const empresas = payload?.empresas || [];
    const active = empresas.find((empresa) => empresa.activa) || empresas[0];
    if (active) return active;
  } catch {
    // Si el RPC nuevo no esta aplicado todavia, usa el flujo anterior.
  }

  const user = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, { headers });
  const profiles = await fetchRestRows('profiles', {
    select: 'tenant_id',
    id: `eq.${user?.id}`,
    limit: '1'
  }, headers);
  const tenantId = profiles?.[0]?.tenant_id;
  if (!tenantId) return null;

  try {
    const empresas = await fetchRestRows('config_empresa', {
      select: 'tenant_id,nombre,razon_social,plantilla_cobro,cobranza_hora_corte,feat_financiera',
      tenant_id: `eq.${tenantId}`,
      limit: '1'
    }, headers);
    return empresas?.[0] || null;
  } catch (error) {
    if (!/feat_financiera|plantilla_cobro|cobranza_hora_corte/i.test(error.message || '')) throw error;
    const empresas = await fetchRestRows('config_empresa', {
      select: 'tenant_id,nombre,razon_social',
      tenant_id: `eq.${tenantId}`,
      limit: '1'
    }, headers);
    return empresas?.[0] ? { ...empresas[0], feat_financiera: false } : null;
  }
}

function isFinancieraEmpresa(empresa) {
  const txt = normalizeText(`${empresa?.nombre || ''} ${empresa?.razon_social || ''}`);
  return Boolean(empresa?.feat_financiera)
    || txt.includes('motoprestamo')
    || txt.includes('moto prestamo')
    || txt.includes('naranjo');
}

async function getClientesMorososFinanciera(headers, empresa) {
  const prestamos = await fetchRestRows('prestamos', {
    select: 'id,numero,cliente_id,tipo,garantia,tasa_interes,estado,fecha_inicio,created_at',
    estado: 'eq.activo',
    order: 'fecha_inicio.asc,created_at.desc'
  }, headers);

  if (!prestamos.length) {
    return {
      tipo_cobranza: 'financiera',
      empresa_nombre: empresa?.nombre || empresa?.razon_social || 'la empresa',
      plantilla: empresa?.plantilla_cobro || null,
      clientes: []
    };
  }

  const prestamoIds = prestamos.map((p) => p.id).filter(Boolean);
  const cuotas = [];
  for (const ids of chunkArray(prestamoIds)) {
    const chunk = await fetchRestRows('prestamo_cuotas', {
      select: 'id,prestamo_id,numero_cuota,fecha_vencimiento,capital,interes,monto_cuota,capital_pagado,interes_pagado,estado',
      prestamo_id: `in.(${ids.join(',')})`,
      or: '(estado.is.null,estado.neq.pagada)',
      order: 'fecha_vencimiento.asc'
    }, headers);
    cuotas.push(...chunk);
  }

  const cuotasPorPrestamo = cuotas.reduce((acc, cuota) => {
    if (!acc[cuota.prestamo_id]) acc[cuota.prestamo_id] = [];
    acc[cuota.prestamo_id].push(cuota);
    return acc;
  }, {});

  const rowsByCliente = new Map();
  const recordatorioCandidatos = [];
  // Regla domingo-cerrado: la financiera no abre los domingos, asi que el
  // aviso de 3 dias que caia en DOMINGO se corre al LUNES. Ese lunes la
  // cuota (ya con 4 dias) cuenta como recordatorio, NO como morosa.
  const esLunes = new Date().getDay() === 1;
  const esDiaRecordatorio = (dias) => (
    dias === DIAS_GRACIA_PAGO || (esLunes && dias === DIAS_GRACIA_PAGO + 1)
  );
  prestamos.forEach((prestamo) => {
    const loanCuotas = cuotasPorPrestamo[prestamo.id] || [];
    const vencidas = loanCuotas.filter((cuota) => {
      const dias = daysBetween(cuota.fecha_vencimiento);
      return dias > DIAS_GRACIA_PAGO && !esDiaRecordatorio(dias) && pendingCuota(cuota) > 0;
    });
    const capitalBase = loanCuotas.reduce((sum, cuota) => (
      sum + Math.max(0, Number(cuota.capital || 0) - Number(cuota.capital_pagado || 0))
    ), 0);
    const ultimoInteres = loanCuotas
      .filter((cuota) => Number(cuota.interes || 0) > 0 && cuota.fecha_vencimiento)
      .map((cuota) => cuota.fecha_vencimiento)
      .sort()
      .at(-1);
    const interesCorrienteEquivalente = capitalBase > 0
      && Number(prestamo.tasa_interes || 0) > 0
      && ultimoInteres
      && daysBetween(ultimoInteres) > 0
      ? 1
      : 0;
    const pagosEquivalentes = vencidas.length + interesCorrienteEquivalente;
    if (!prestamo.cliente_id) return;
    if (pagosEquivalentes <= 0) {
      // No es moroso. "Recordatorio 3 dias" (aviso temprano): cuotas a 3 dias
      // (o a 4 los LUNES, por la regla domingo-cerrado) y nada mas atrasado.
      const dia3 = loanCuotas
        .filter((cuota) => (
          esDiaRecordatorio(daysBetween(cuota.fecha_vencimiento)) && pendingCuota(cuota) > 0
        ))
        .sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')));
      if (dia3.length >= 1) recordatorioCandidatos.push({ prestamo, cuota: dia3[0] });
      return;
    }

    const cleanNumero = cleanLoanNumber(prestamo.numero);
    const oldest = vencidas[0]?.fecha_vencimiento || ultimoInteres || prestamo.fecha_inicio;
    const dias = daysBetween(oldest);
    const monto = vencidas.reduce((sum, cuota) => sum + pendingCuota(cuota), 0);
    const current = rowsByCliente.get(prestamo.cliente_id) || {
      cliente_id: prestamo.cliente_id,
      cuotas_atrasadas: 0,
      total_atrasado: 0,
      dias_mas_vencido: 0,
      facturasMap: new Map()
    };

    current.cuotas_atrasadas += pagosEquivalentes;
    current.total_atrasado += monto;
    current.dias_mas_vencido = Math.max(current.dias_mas_vencido, dias);
    const existingLoan = current.facturasMap.get(cleanNumero);
    current.facturasMap.set(cleanNumero, {
      numero: cleanNumero,
      monto_atrasado: Math.round(((existingLoan?.monto_atrasado || 0) + monto) * 100) / 100,
      dias_vencida: Math.max(existingLoan?.dias_vencida || 0, dias)
    });
    rowsByCliente.set(prestamo.cliente_id, current);
  });

  const clienteIds = [...rowsByCliente.keys()];
  const recordatorioClienteIds = [...new Set(recordatorioCandidatos.map((r) => r.prestamo.cliente_id))];
  const todosClienteIds = [...new Set([...clienteIds, ...recordatorioClienteIds])];
  if (!todosClienteIds.length) {
    return {
      tipo_cobranza: 'financiera',
      empresa_nombre: empresa?.nombre || empresa?.razon_social || 'la empresa',
      plantilla: empresa?.plantilla_cobro || null,
      clientes: []
    };
  }

  const clientes = [];
  for (const ids of chunkArray(todosClienteIds)) {
    const chunk = await fetchRestRows('clientes', {
      select: 'id,nombre,telefono,rnc,codigo',
      id: `in.(${ids.join(',')})`,
      activo: 'eq.true'
    }, headers);
    clientes.push(...chunk);
  }
  const clientesMap = new Map(clientes.map((cliente) => [cliente.id, cliente]));

  let seguimientos = [];
  try {
    for (const ids of chunkArray(clienteIds)) {
      const chunk = await fetchRestRows('cobranza_seguimiento', {
        select: 'cliente_id,estado,fecha_promesa,nota,ultimo_envio',
        cliente_id: `in.(${ids.join(',')})`
      }, headers);
      seguimientos.push(...chunk);
    }
  } catch {
    seguimientos = [];
  }
  const seguimientoMap = new Map(seguimientos.map((seg) => [seg.cliente_id, seg]));

  let pagos = [];
  try {
    for (const ids of chunkArray(clienteIds)) {
      const chunk = await fetchRestRows('prestamo_pagos', {
        select: 'cliente_id,created_at,fecha,total_pagado,cobrador',
        cliente_id: `in.(${ids.join(',')})`,
        anulado: 'eq.false'
      }, headers);
      pagos.push(...chunk);
    }
  } catch {
    pagos = [];
  }
  const pagosPorCliente = pagos.reduce((acc, pago) => {
    if (!acc[pago.cliente_id]) acc[pago.cliente_id] = [];
    acc[pago.cliente_id].push(pago);
    return acc;
  }, {});

  const corte = empresa?.cobranza_hora_corte || '17:50';
  const nowTime = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());

  const out = clienteIds.map((clienteId) => {
    const row = rowsByCliente.get(clienteId);
    const cliente = clientesMap.get(clienteId) || {};
    const seg = seguimientoMap.get(clienteId) || {};
    const facturas = [...row.facturasMap.values()].sort((a, b) => b.dias_vencida - a.dias_vencida);
    const pagosCliente = (pagosPorCliente[clienteId] || []).sort((a, b) => (
      String(b.fecha || '').localeCompare(String(a.fecha || ''))
      || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    ));
    const ultimoPago = pagosCliente[0] || null;
    const ultimoEnvio = seg.ultimo_envio || null;
    const fechaBase = seg.fecha_promesa || (ultimoEnvio ? String(ultimoEnvio).slice(0, 10) : null);
    const pagoPosterior = ultimoEnvio
      ? (pagosPorCliente[clienteId] || []).some((pago) => String(pago.created_at || pago.fecha || '') >= String(ultimoEnvio))
      : false;
    const porReenviar = Boolean(
      ultimoEnvio
      && !pagoPosterior
      && (
        (fechaBase && fechaBase < todayDate())
        || (fechaBase === todayDate() && nowTime >= corte)
      )
    );

    return {
      tipo_cobranza: 'financiera',
      cliente_id: clienteId,
      cliente_nombre: cliente.nombre || 'Cliente',
      cliente_telefono: cliente.telefono || '',
      cuotas_atrasadas: row.cuotas_atrasadas,
      total_atrasado: Math.round(row.total_atrasado * 100) / 100,
      dias_mas_vencido: row.dias_mas_vencido,
      facturas,
      seg_estado: seg.estado || 'pendiente',
      seg_fecha: seg.fecha_promesa || null,
      seg_nota: seg.nota || '',
      ultimo_envio: ultimoEnvio,
      ultimo_pago: ultimoPago,
      ultimo_pago_fecha: ultimoPago?.fecha || null,
      ultimo_pago_monto: ultimoPago?.total_pagado || 0,
      por_reenviar: porReenviar
    };
  }).filter((row) => !(
    row.seg_estado === 'cliente_vendra'
    && row.seg_fecha
    && row.seg_fecha > todayDate()
  ));

  // Recordatorio 3 dias (aviso temprano): agrega los prestamos NO morosos con
  // exactamente 1 cuota a 3 dias, excluyendo los que ya tienen recordatorio
  // enviado (cobro_gestiones.mensaje_enviado con recordatorio_pago).
  if (recordatorioCandidatos.length) {
    let gestiones = [];
    try {
      for (const ids of chunkArray(recordatorioClienteIds)) {
        const chunk = await fetchRestRows('cobro_gestiones', {
          select: 'cliente_id,tipo,metadata',
          cliente_id: `in.(${ids.join(',')})`,
          tipo: 'eq.mensaje_enviado'
        }, headers);
        gestiones.push(...chunk);
      }
    } catch {
      gestiones = [];
    }
    const yaRecordado = (clienteId, cuotaId) => gestiones.some((g) => (
      g.cliente_id === clienteId
      && String(g.metadata?.recordatorio_pago ?? 'false') === 'true'
      && String(g.metadata?.recordatorio_cuota_id ?? '') === String(cuotaId)
    ));

    recordatorioCandidatos.forEach(({ prestamo, cuota }) => {
      if (yaRecordado(prestamo.cliente_id, cuota.id)) return;
      const cliente = clientesMap.get(prestamo.cliente_id);
      if (!cliente) return; // cliente inactivo o no encontrado
      const monto = Math.round(pendingCuota(cuota) * 100) / 100;
      const numero = cleanLoanNumber(prestamo.numero);
      out.push({
        tipo_cobranza: 'financiera',
        case_id: cuota.id,
        prestamo_id: prestamo.id,
        prestamo_numero: numero,
        cliente_id: prestamo.cliente_id,
        cliente_nombre: cliente.nombre || 'Cliente',
        cliente_telefono: cliente.telefono || '',
        cuotas_atrasadas: 1,
        pagos_vencidos_equivalentes: 1,
        total_atrasado: monto,
        dias_mas_vencido: DIAS_GRACIA_PAGO,
        recordatorio_pago: true,
        recordatorio_cuota_id: cuota.id,
        recordatorio_fecha_vencimiento: cuota.fecha_vencimiento,
        facturas: [{
          numero,
          cuota_id: cuota.id,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto_atrasado: monto,
          dias_vencida: DIAS_GRACIA_PAGO
        }],
        seg_estado: 'pendiente',
        seg_fecha: null,
        seg_nota: '',
        ultimo_envio: null,
        ultimo_pago: null,
        ultimo_pago_fecha: null,
        ultimo_pago_monto: 0,
        por_reenviar: false
      });
    });
  }

  out.sort((a, b) => (
    b.dias_mas_vencido - a.dias_mas_vencido
    || b.total_atrasado - a.total_atrasado
    || String(a.cliente_nombre || '').localeCompare(String(b.cliente_nombre || ''))
  ));

  return {
    tipo_cobranza: 'financiera',
    empresa_nombre: empresa?.nombre || empresa?.razon_social || 'la empresa',
    plantilla: empresa?.plantilla_cobro || null,
    clientes: out
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

  let token = SUPABASE_ANON_KEY;
  try {
    token = (await getValidSession()).access_token;
  } catch {
    // sin sesion vigente: la busqueda usara anon (no devuelve datos del tenant)
  }

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
    if (cachedSession?.access_token) return cachedSession;
    const session = readLocal();
    if (!session?.access_token) return null;
    cachedSession = session;
    // No se borra por expiracion: el refresh_token permite renovarla (ver getValidSession).
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

  persistSession(payload);
  return payload;
}

export function signOut() {
  clearSession();
}

export async function getEmpresasUsuarioExtension() {
  const headers = await getAuthHeaders();
  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_empresas_usuario_extension`, {
    method: 'POST',
    headers,
    body: '{}'
  });
}

export async function setEmpresaActivaExtension(tenantId) {
  if (!tenantId) throw new Error('Selecciona una empresa.');
  const headers = await getAuthHeaders();
  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/set_empresa_activa_extension`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_tenant_id: tenantId })
  });
}

export async function searchCustomers(query) {
  const headers = await getAuthHeaders();
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

export async function createOutOfStockRequests(payload) {
  const headers = await getAuthHeaders();
  try {
    return await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/omni_crear_solicitudes_agotadas`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_payload: payload })
    });
  } catch (error) {
    if (isMissingOutOfStockRpcError(error)) {
      throw new Error(
        'Supabase todavia no tiene cargada la funcion de Producto agotado. Ejecuta el SQL en el proyecto correcto y luego corre: SELECT pg_notify('
        + "'pgrst','reload schema'"
        + ');'
      );
    }
    throw error;
  }
}

export async function getAvailableProductNotifications({ limit = 10 } = {}) {
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/notificaciones`);
  url.searchParams.set('select', 'id,tipo,titulo,mensaje,solicitud_id,producto_id,created_at,visto_at');
  url.searchParams.set('tipo', 'eq.stock_disponible');
  url.searchParams.set('visto_at', 'is.null');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(limit));

  return fetchJson(url.toString(), { headers });
}

export async function getOutOfStockRequest(solicitudId) {
  if (!solicitudId) throw new Error('solicitud_id es requerido.');
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/solicitudes_clientes`);
  url.searchParams.set('select', '*,clientes(nombre,telefono),productos(codigo,descripcion,precio,precio1)');
  url.searchParams.set('id', `eq.${solicitudId}`);
  url.searchParams.set('limit', '1');

  const rows = await fetchJson(url.toString(), { headers });
  return rows?.[0] || null;
}

export async function markNotificationsRead(ids = []) {
  const cleanIds = ids.filter(Boolean);
  if (!cleanIds.length) return null;
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/notificaciones`);
  url.searchParams.set('id', `in.(${cleanIds.join(',')})`);

  return fetchJson(url.toString(), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ visto_at: new Date().toISOString() })
  });
}

export async function markOutOfStockCustomerNotified(solicitudId) {
  if (!solicitudId) throw new Error('solicitud_id es requerido.');
  const headers = await getAuthHeaders();
  const user = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, { headers }).catch(() => null);
  const url = new URL(`${SUPABASE_URL}/rest/v1/solicitudes_clientes`);
  url.searchParams.set('id', `eq.${solicitudId}`);
  url.searchParams.set('select', '*');

  const [row] = await fetchJson(url.toString(), {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      customer_notified_at: new Date().toISOString(),
      notified_by: user?.id || null
    })
  });

  return row;
}

export async function getVendors() {
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/vendedores`);
  url.searchParams.set('select', 'id,nombre');
  url.searchParams.set('activo', 'eq.true');
  url.searchParams.set('order', 'nombre.asc');

  return fetchJson(url.toString(), { headers });
}

export async function getOmniConversations({ channel = 'unified', search = '', limit = 60 } = {}) {
  const headers = await getAuthHeaders();
  const empresa = await getCurrentEmpresa(headers).catch(() => null);
  const url = new URL(`${SUPABASE_URL}/rest/v1/sales_conversations_view`);
  url.searchParams.set('select', '*');
  if (empresa?.tenant_id) url.searchParams.set('tenant_id', `eq.${empresa.tenant_id}`);

  if (channel === 'instagram' || channel === 'facebook' || channel === 'youtube') {
    url.searchParams.set('platform', `eq.${channel}`);
  } else {
    url.searchParams.set('platform', 'neq.whatsapp');
  }

  const cleanSearch = String(search || '').trim();
  if (cleanSearch) {
    const safeSearch = cleanSearch.replace(/[(),]/g, ' ');
    url.searchParams.set('or', [
      `customer_name.ilike.*${safeSearch}*`,
      `customer_phone.ilike.*${safeSearch}*`,
      `customer_external_id.ilike.*${safeSearch}*`,
      `last_message_preview.ilike.*${safeSearch}*`
    ].join(','));
  }

  url.searchParams.set('order', 'last_message_at.desc.nullslast');
  url.searchParams.set('limit', String(limit));

  return fetchJson(url.toString(), { headers });
}

export async function getOmniMessages(conversationId) {
  if (!conversationId) return [];
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/sales_messages`);
  url.searchParams.set('select', 'id,conversation_id,platform,sender_type,message_type,message_text,media_url,status,created_at,raw_data');
  url.searchParams.set('conversation_id', `eq.${conversationId}`);
  url.searchParams.set('order', 'created_at.asc');
  url.searchParams.set('limit', '120');

  return fetchJson(url.toString(), { headers });
}

// Espeja a Sales Hub la conversación de WhatsApp abierta (contacto +
// mensajes leídos del DOM). Llama la RPC omni_mirror_whatsapp (SECURITY
// DEFINER, valida tenant y deduplica). Degradación segura: si la RPC aún no
// existe, no rompe la extensión (devuelve null).
export async function mirrorWhatsAppConversation(payload) {
  if (!payload?.external_conversation_id || !Array.isArray(payload?.messages) || !payload.messages.length) {
    return null;
  }
  const headers = await getAuthHeaders();
  try {
    return await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/omni_mirror_whatsapp`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_payload: payload })
    });
  } catch (error) {
    const msg = String(error?.message || '');
    if (/omni_mirror_whatsapp/i.test(msg) && /schema cache|function|does not exist/i.test(msg)) {
      return null; // RPC no desplegada todavía
    }
    throw error;
  }
}

// Latido del espejo: se manda en CADA corrida (aunque no lea nada), con el
// diagnóstico { chatOpen, rowsFound, parsed }. Permite detectar que el espejo
// se rompió en silencio. Degradación segura si la RPC no existe.
export async function sendMirrorHeartbeat(diag = {}) {
  const headers = await getAuthHeaders();
  try {
    await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/omni_mirror_heartbeat`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_chat_open: !!diag.chatOpen,
        p_rows_found: Number(diag.rowsFound) || 0,
        p_parsed: Number(diag.parsed) || 0,
        p_probe: diag.probe || null,
      })
    });
  } catch (error) {
    const msg = String(error?.message || '');
    if (/omni_mirror_heartbeat/i.test(msg) && /schema cache|function|does not exist/i.test(msg)) return;
    // no relanzar: el latido nunca debe estorbar
  }
}

// Estado del espejo del tenant (para el chip visible). Devuelve el objeto de
// get_omni_mirror_status o null si aún no está desplegado.
export async function getMirrorStatus() {
  const headers = await getAuthHeaders();
  try {
    return await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_omni_mirror_status`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
  } catch {
    return null;
  }
}

// El ultimo comentario publico que dejo el cliente en esta conversacion.
// Instagram exige el id exacto para responderlo: la misma persona puede
// haber comentado en varias publicaciones.
async function ultimoComentarioDe(conversationId, headers) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/sales_messages`);
  url.searchParams.set('select', 'external_message_id,created_at');
  url.searchParams.set('conversation_id', `eq.${conversationId}`);
  url.searchParams.set('sender_type', 'eq.user');
  url.searchParams.set('message_type', 'eq.comment');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');
  const [fila] = await fetchJson(url.toString(), { headers }).catch(() => []);
  if (!fila?.external_message_id) return null;

  // La respuesta privada de un comentario se gasta una sola vez y caduca a
  // los 7 dias. Mientras siga disponible es la buena: llega al buzon y abre
  // 24h para conversar, en vez de quedarse en un comentario publico.
  const dias = (Date.now() - new Date(fila.created_at)) / 86400000;
  let privadaDisponible = dias <= 7;
  if (privadaDisponible) {
    const usada = new URL(`${SUPABASE_URL}/rest/v1/sales_messages`);
    usada.searchParams.set('select', 'id');
    usada.searchParams.set('conversation_id', `eq.${conversationId}`);
    usada.searchParams.set('sender_type', 'eq.agent');
    usada.searchParams.set('raw_data->>privado_por_comentario', `eq.${fila.external_message_id}`);
    usada.searchParams.set('limit', '1');
    const previas = await fetchJson(usada.toString(), { headers }).catch(() => []);
    privadaDisponible = !previas?.length;
  }

  return { id: fila.external_message_id, privadaDisponible };
}

export async function sendOmniReply({ conversation, text }) {
  if (!conversation?.id) throw new Error('Selecciona una conversacion.');
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('Escribe un mensaje para responder.');

  const headers = await getAuthHeaders();
  const empresa = await getCurrentEmpresa(headers).catch(() => null);
  if (!empresa?.tenant_id) throw new Error('No se pudo determinar la empresa activa.');

  // Si lo ultimo que escribio el cliente fue un comentario hay dos puertas, y
  // el orden importa: primero la privada -- se gasta una vez y hay indicios de
  // que contestar en publico la quema -- y el comentario publico despues, que
  // ese se puede repetir siempre.
  const comentario = await ultimoComentarioDe(conversation.id, headers);
  const comoComentario = Boolean(comentario) && !comentario.privadaDisponible;
  const privadaPorComentario = comentario?.privadaDisponible ? comentario.id : null;

  const [row] = await fetchJson(`${SUPABASE_URL}/rest/v1/sales_messages?select=*`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      tenant_id: empresa.tenant_id,
      conversation_id: conversation.id,
      platform: conversation.platform || 'instagram',
      sender_type: 'agent',
      message_type: comoComentario ? 'comment' : 'text',
      message_text: cleanText,
      status: 'queued',
      raw_data: {
        source: 'motoflow_omni_extension',
        ...(comoComentario ? { responder_a: comentario.id } : {}),
        ...(privadaPorComentario ? { privado_por_comentario: privadaPorComentario } : {})
      }
    })
  });

  // Y se manda. Antes se quedaba en 'queued' para siempre: la fila entraba
  // en la bandeja y nadie la despachaba nunca, asi que parecia enviada sin
  // haber salido. Si Meta la rechaza, el despachador la marca 'failed' con
  // el motivo dentro — que es lo que hay que ver, no un silencio.
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/meta-send-queued`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message_id: row.id })
    });
    const d = await r.json().catch(() => null);
    const estado = d?.message?.status || (d?.ok ? 'sent' : 'failed');
    const motivo = d?.message?.raw_data?.dispatch_error || d?.error || null;
    return { ...row, status: estado, dispatch_error: estado === 'sent' ? null : motivo };
  } catch (e) {
    return { ...row, status: 'queued', dispatch_error: e?.message || 'No se pudo contactar el despachador.' };
  }
}

export async function linkOmniConversationQuote({ conversationId, cotizacionId, status = 'cotizacion_enviada' }) {
  if (!conversationId || !cotizacionId) return null;
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/sales_conversations`);
  url.searchParams.set('id', `eq.${conversationId}`);
  url.searchParams.set('select', '*');

  const [row] = await fetchJson(url.toString(), {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      cotizacion_id: cotizacionId,
      status
    })
  });

  return row;
}

export async function updateOmniConversationStatus({ conversationId, status }) {
  if (!conversationId || !status) throw new Error('Selecciona una conversacion y un estado.');
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/sales_conversations`);
  url.searchParams.set('id', `eq.${conversationId}`);
  url.searchParams.set('select', '*');

  const [row] = await fetchJson(url.toString(), {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ status })
  });

  return row;
}

// Estado de cuenta (cobranza): cuotas atrasadas del cliente + plantilla
export async function getEstadoCuenta(clienteId) {
  if (!clienteId) throw new Error('Selecciona un cliente para ver su estado de cuenta.');
  const headers = await getAuthHeaders();

  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_estado_cuenta_cliente`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_cliente_id: clienteId })
  });
}

// Lista de cobranza:
// - Repuestos: TODOS los clientes con facturas vencidas + su seguimiento.
// - Financiera/MotoPrestamos: clientes con prestamos atrasados, agrupados por cliente.
export async function getClientesMorosos() {
  const headers = await getAuthHeaders();
  const empresa = await getCurrentEmpresa(headers).catch(() => null);

  try {
    const gestionCobro = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_gestion_cobro_extension`, {
      method: 'POST',
      headers,
      body: '{}'
    });
    if (gestionCobro?.clientes?.length || isFinancieraEmpresa(empresa)) {
      return gestionCobro;
    }
  } catch {
    // Si el RPC de Gestion de Cobro no esta aplicado todavia, usa los fallbacks.
  }

  try {
    const rpcFinanciera = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_clientes_morosos_financiera`, {
      method: 'POST',
      headers,
      body: '{}'
    });
    if (rpcFinanciera?.clientes?.length || isFinancieraEmpresa(empresa)) {
      return rpcFinanciera;
    }
  } catch {
    // Si el RPC no esta aplicado todavia, intenta con la lectura directa.
  }

  try {
    const cobranzaFinanciera = await getClientesMorososFinanciera(headers, empresa);
    if (cobranzaFinanciera?.clientes?.length || isFinancieraEmpresa(empresa)) {
      return cobranzaFinanciera;
    }
  } catch {
    // Si este tenant no tiene tablas/permisos de financiera, usa cobranza normal.
  }

  const cobranzaFacturas = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_clientes_morosos`, {
    method: 'POST',
    headers,
    body: '{}'
  });

  return cobranzaFacturas;
}

// Ficha completa del cliente (para el PDF que se manda al buscador)
export async function getClienteFicha(clienteId) {
  if (!clienteId) throw new Error('cliente_id es requerido.');
  const headers = await getAuthHeaders();

  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_cliente_ficha`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_cliente_id: clienteId })
  });
}

// Actualizar el telefono de un cliente desde la lista de cobranza
export async function setClienteTelefono({ clienteId, telefono }) {
  if (!clienteId) throw new Error('cliente_id es requerido.');
  const headers = await getAuthHeaders();

  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/set_cliente_telefono`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_cliente_id: clienteId,
      p_telefono: telefono || null
    })
  });
}

// Marcar que se le envio un recordatorio a un cliente (para detectar "no vino")
export async function marcarEnvioCobranza(clienteId) {
  if (!clienteId) return null;
  const headers = await getAuthHeaders();

  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/marcar_envio_cobranza`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_cliente_id: clienteId })
  });
}

// Guardar el seguimiento (estado / fecha promesa / nota) de un cliente
export async function setCobranzaSeguimiento({ clienteId, estado, fecha, nota }) {
  if (!clienteId) throw new Error('cliente_id es requerido.');
  const headers = await getAuthHeaders();

  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/set_cobranza_seguimiento`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_cliente_id: clienteId,
      p_estado: estado || 'pendiente',
      p_fecha: fecha || null,
      p_nota: nota || null
    })
  });
}

// Clientes con estado ROBADO activo (gestion tipo='robado' sin cerrar).
// Se consulta directo a la tabla para NO depender de que el RPC de gestion
// este actualizado con el campo es_robado.
export async function getRobadoClienteIds() {
  const headers = await getAuthHeaders();
  const rows = await fetchRestRows('cobro_gestiones', {
    select: 'cliente_id',
    tipo: 'eq.robado',
    estado: 'neq.cerrada'
  }, headers);
  return new Set((rows || []).map((r) => r.cliente_id).filter(Boolean));
}

// Cierra las gestiones ACTIVAS de un tipo para un cliente (ej: quitar el
// estado ROBADO). PATCH masivo: estado='cerrada'.
export async function closeCobroGestiones({ clienteId, tipo, resultado = 'cerrado_manual' }) {
  if (!clienteId || !tipo) throw new Error('cliente_id y tipo son requeridos.');
  const headers = await getAuthHeaders();
  const url = new URL(`${SUPABASE_URL}/rest/v1/cobro_gestiones`);
  url.searchParams.set('cliente_id', `eq.${clienteId}`);
  url.searchParams.set('tipo', `eq.${tipo}`);
  url.searchParams.set('estado', 'neq.cerrada');
  return fetchJson(url.toString(), {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ estado: 'cerrada', resultado })
  });
}

// Historial de gestiones de cobro del cliente (timeline del "Caso de cobro").
// Sin esto el caso solo mostraba las gestiones agregadas en la sesion actual
// y parecia que el historial no se guardaba.
export async function getCobroGestiones(clienteId, limit = 50) {
  if (!clienteId) return [];
  const headers = await getAuthHeaders();
  return fetchRestRows('cobro_gestiones', {
    select: 'id,cliente_id,prestamo_id,tipo,estado,resultado,fecha_promesa,monto_promesa,canal,nota,metadata,created_at',
    cliente_id: `eq.${clienteId}`,
    order: 'created_at.desc'
  }, headers, limit);
}

export async function insertCobroGestion(payload) {
  if (!payload?.cliente_id) throw new Error('cliente_id es requerido.');
  const headers = await getAuthHeaders();

  const [row] = await fetchJson(`${SUPABASE_URL}/rest/v1/cobro_gestiones?select=*`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      cliente_id: payload.cliente_id,
      prestamo_id: payload.prestamo_id || null,
      tipo: payload.tipo,
      estado: payload.estado || 'registrada',
      resultado: payload.resultado || null,
      fecha_promesa: payload.fecha_promesa || null,
      monto_promesa: payload.monto_promesa ?? null,
      canal: payload.canal || null,
      nota: payload.nota || null,
      metadata: payload.metadata || {}
    })
  });

  return row;
}

export async function castigarPrestamo({ prestamoId, motivo = 'incobrable', password = null }) {
  if (!prestamoId) throw new Error('prestamo_id es requerido.');
  const headers = await getAuthHeaders();

  return fetchJson(`${SUPABASE_URL}/rest/v1/rpc/castigar_prestamo`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_prestamo_id: prestamoId,
      p_motivo: motivo,
      p_password: password || null
    })
  });
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

  const headers = await getAuthHeaders();

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

  const headers = await getAuthHeaders();
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
