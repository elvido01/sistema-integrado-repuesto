/**
 * Script para insertar el Almacén Principal en la base de datos de producción.
 * Ejecutar: node scripts/insert_almacen_principal.js
 */
import { createClient } from '@supabase/supabase-js';

// Producción
const SUPABASE_URL = 'https://zdvxowpuklbypweyqqki.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('Verificando si existe almacén PRINCIPAL...');
  
  // Verificar si ya existe un almacén con código "A01" o nombre "PRINCIPAL"
  const { data: existing, error: checkError } = await supabase
    .from('almacenes')
    .select('*')
    .or('codigo.eq.A01,nombre.ilike.%PRINCIPAL%');
  
  if (checkError) {
    console.error('Error al verificar:', checkError.message);
    console.log('\nEjecute este SQL en el SQL Editor de Supabase:');
    console.log(`INSERT INTO public.almacenes (codigo, nombre, activo) VALUES ('A01', 'PRINCIPAL', true) ON CONFLICT (codigo) DO NOTHING;`);
    return;
  }

  if (existing && existing.length > 0) {
    console.log('Ya existe un almacén PRINCIPAL:', existing);
    return;
  }

  // Insertar almacén principal
  const { data, error } = await supabase
    .from('almacenes')
    .insert({
      codigo: 'A01',
      nombre: 'PRINCIPAL',
      activo: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error al insertar:', error.message);
    console.log('\nEjecute este SQL en el SQL Editor de Supabase:');
    console.log(`INSERT INTO public.almacenes (codigo, nombre, activo) VALUES ('A01', 'PRINCIPAL', true) ON CONFLICT (codigo) DO NOTHING;`);
  } else {
    console.log('✅ Almacén Principal creado exitosamente:', data);
  }
}

main();
