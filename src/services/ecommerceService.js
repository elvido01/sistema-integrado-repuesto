/**
 * ecommerceService.js
 * Servicio para la tienda pública. Usa el supabase client con anon key.
 * Todas las funciones RPC son SECURITY DEFINER y accesibles sin autenticación.
 */
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Obtiene la configuración de la tienda para un dominio dado.
 * @param {string} dominio - hostname del tenant (ej: repuestos-morla.pages.dev)
 * @returns {{ tenant_id, nombre, logo_url, telefono, feat_tienda } | null}
 */
export async function fetchTiendaConfig(dominio) {
  const { data, error } = await supabase.rpc('get_tienda_config', {
    p_dominio: dominio,
  });

  if (error) {
    console.error('[ecommerceService] Error fetching tienda config:', error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Lista los productos publicados en la tienda (paginado).
 * @param {string} dominio
 * @param {Object} options
 * @param {number} options.page - página actual (1-indexed)
 * @param {number} options.pageSize - items por página
 * @param {string} options.search - término de búsqueda
 * @param {string} options.marca - filtro por marca
 * @param {string} options.tipo - filtro por tipo
 * @param {string} options.modelo - filtro por modelo
 * @returns {{ productos: Array, totalCount: number }}
 */
export async function fetchProductosTienda(dominio, {
  page = 1,
  pageSize = 20,
  search = '',
  marca = '',
  tipo = '',
  modelo = '',
} = {}) {
  const offset = (page - 1) * pageSize;

  const { data, error } = await supabase.rpc('get_productos_tienda', {
    p_dominio: dominio,
    p_limit: pageSize,
    p_offset: offset,
    p_search: search || null,
    p_marca: marca || null,
    p_tipo: tipo || null,
    p_modelo: modelo || null,
  });

  if (error) {
    console.error('[ecommerceService] Error fetching productos tienda:', error);
    return { productos: [], totalCount: 0 };
  }

  const totalCount = data?.[0]?.total_count || 0;

  return {
    productos: data || [],
    totalCount: Number(totalCount),
  };
}

/**
 * Obtiene un producto específico por su slug.
 * @param {string} dominio
 * @param {string} slug
 * @returns {Object|null}
 */
export async function fetchProductoPorSlug(dominio, slug) {
  const { data, error } = await supabase.rpc('get_producto_tienda_por_slug', {
    p_dominio: dominio,
    p_slug: slug,
  });

  if (error) {
    console.error('[ecommerceService] Error fetching producto por slug:', error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Obtiene las marcas, tipos y modelos disponibles para filtros.
 * @param {string} dominio
 * @returns {{ marcas: string[], tipos: string[], modelos: string[] }}
 */
export async function fetchFiltrosTienda(dominio) {
  const { data, error } = await supabase.rpc('get_filtros_tienda', {
    p_dominio: dominio,
  });

  if (error) {
    console.error('[ecommerceService] Error fetching filtros:', error);
    return { marcas: [], tipos: [], modelos: [] };
  }

  const row = data?.[0];
  return {
    marcas: (row?.marcas || []).map(m => m.nombre).filter(Boolean),
    tipos: (row?.tipos || []).map(t => t.nombre).filter(Boolean),
    modelos: (row?.modelos || []).map(m => m.nombre).filter(Boolean),
  };
}

/**
 * Genera la URL de WhatsApp con mensaje pre-llenado.
 * @param {string} telefono - número de teléfono del tenant
 * @param {Object} producto - datos del producto
 * @returns {string} URL de wa.me
 */
export function buildWhatsAppUrl(telefono, producto) {
  if (!telefono) return '';

  // Limpiar teléfono: solo dígitos
  const cleanPhone = telefono.replace(/\D/g, '');
  // Agregar código de país DR si no tiene
  const fullPhone = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone;

  const mensaje = producto
    ? `Hola! Me interesa el producto: *${producto.descripcion}* (Código: ${producto.codigo}). ¿Está disponible?`
    : 'Hola! Me gustaría consultar sobre sus productos.';

  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Registra un lead (CRM) para cuando un producto está agotado y el cliente desea ser avisado.
 * @param {string} dominio
 * @param {string} productoId
 * @param {string} nombre
 * @param {string} contacto
 * @returns {boolean} true si fue exitoso
 */
export async function registrarLeadTienda(dominio, productoId, nombre, contacto) {
  const { data, error } = await supabase.rpc('registrar_lead_tienda', {
    p_dominio: dominio,
    p_producto_id: productoId,
    p_nombre: nombre,
    p_contacto: contacto,
  });

  if (error) {
    console.error('[ecommerceService] Error registrando lead de tienda:', error);
    return false;
  }

  return !!data;
}
