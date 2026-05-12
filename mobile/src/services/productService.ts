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

export async function fetchProductos(empresaId: string, page = 1, pageSize = 20, search = '') {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('v_productos_catalogo')
    .select('*', { count: 'exact' });

  if (search) {
    query = query.or(`codigo.ilike.%${search}%,descripcion.ilike.%${search}%,referencia.ilike.%${search}%`);
  }

  const { data, error, count } = await query
    .order('descripcion', { ascending: true })
    .range(from, to);

  if (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
  
  if (data && data.length > 0) {
    console.log("Columnas disponibles en v_productos_catalogo:", Object.keys(data[0]));
  }
  console.log("Fetched products count:", data?.length, "Total:", count);

  const mappedProductos: Producto[] = (data || []).map((p: any) => ({
    id: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    referencia: p.referencia,
    existencia: p.existencia || 0,
    precio_venta_1: p.precio || 0,
    precio_venta_2: p.precio || 0, // Fallback si no hay precio mayorista en la vista
  }));

  return {
    productos: mappedProductos,
    total: count || 0,
    hasMore: (count || 0) > to + 1,
  };
}
