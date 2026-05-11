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
 * @returns {{ productos: Array, totalCount: number }}
 */
export async function fetchProductosTienda(dominio, {
  page = 1,
  pageSize = 20,
  search = '',
  marca = '',
  tipo = '',
} = {}) {
  const offset = (page - 1) * pageSize;

  const { data, error } = await supabase.rpc('get_productos_tienda', {
    p_dominio: dominio,
    p_limit: pageSize,
    p_offset: offset,
    p_search: search || null,
    p_marca: marca || null,
    p_tipo: tipo || null,
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
 * Obtiene las marcas y tipos disponibles para filtros.
 * @param {string} dominio
 * @returns {{ marcas: string[], tipos: string[] }}
 */
export async function fetchFiltrosTienda(dominio) {
  const { data, error } = await supabase.rpc('get_filtros_tienda', {
    p_dominio: dominio,
  });

  if (error) {
    console.error('[ecommerceService] Error fetching filtros:', error);
    return { marcas: [], tipos: [] };
  }

  const row = data?.[0];
  return {
    marcas: (row?.marcas || []).map(m => m.nombre).filter(Boolean),
    tipos: (row?.tipos || []).map(t => t.nombre).filter(Boolean),
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
