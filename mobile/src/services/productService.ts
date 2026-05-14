import { supabase } from '../supabase/client';

export interface Producto {
  id: string;
  codigo: string;
  descripcion: string;
  referencia: string | null;
  existencia: number;
  precio_venta_1: number;
  precio_venta_2: number;
  url_imagen?: string;
}

// Usa la RPC get_productos_paginados (la misma que la web) que calcula
// la existencia en tiempo real via get_stock_actual(). La vista
// v_productos_catalogo trae valores estaticos/desactualizados.
// Nota: el tenant se filtra automaticamente por RLS via la session.
export async function fetchProductos(
  page = 1,
  pageSize = 20,
  search = '',
  marcaFilter = '',
  modeloFilter = ''
) {
  const offset = (page - 1) * pageSize;

  const { data, error } = await supabase.rpc('get_productos_paginados', {
    p_limit: pageSize,
    p_offset: offset,
    p_search_term: search || null,
    p_marca_filter: marcaFilter || null,
    p_modelo_filter: modeloFilter || null,
    p_include_zero_stock: true,
  });

  if (error) {
    console.error('Error fetching products:', error);
    throw error;
  }

  const rows = data || [];
  const total = rows.length > 0 ? Number(rows[0].total_count) || 0 : 0;

  const mappedProductos: Producto[] = rows.map((p: any) => {
    // Los precios 1, 2, 3 viven dentro del array `presentaciones`.
    // Tomamos la primera presentacion (usualmente UND) como referencia.
    const presentaciones = Array.isArray(p.presentaciones) ? p.presentaciones : [];
    const primeraPres = presentaciones[0] || {};
    const precio1 = Number(primeraPres.precio1) || Number(p.precio) || 0;
    const precio2 = Number(primeraPres.precio2) || precio1;
    return {
      id: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      referencia: p.referencia,
      existencia: Number(p.existencia) || 0,
      precio_venta_1: precio1,
      precio_venta_2: precio2,
      url_imagen: p.imagen_url || undefined,
    };
  });

  console.log(`[productService] Page ${page}: ${mappedProductos.length} of ${total} total`);

  return {
    productos: mappedProductos,
    total,
    hasMore: total > offset + pageSize,
  };
}
