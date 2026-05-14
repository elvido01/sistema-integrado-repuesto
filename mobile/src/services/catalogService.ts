import { supabase } from '../supabase/client';

export interface Marca {
  id: string;
  nombre: string;
}

export interface Modelo {
  id: string;
  nombre: string;
  marca_id: string | null;
}

export async function fetchMarcas(): Promise<Marca[]> {
  const { data, error } = await supabase
    .from('marcas')
    .select('id, nombre')
    .order('nombre');
  if (error) {
    console.error('[catalogService] fetchMarcas error:', error);
    return [];
  }
  return (data || []) as Marca[];
}

export async function fetchModelos(): Promise<Modelo[]> {
  const { data, error } = await supabase
    .from('modelos')
    .select('id, nombre, marca_id')
    .order('nombre');
  if (error) {
    console.error('[catalogService] fetchModelos error:', error);
    return [];
  }
  return (data || []) as Modelo[];
}
