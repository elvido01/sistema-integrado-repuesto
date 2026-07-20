// Verificación en producción de los guardias del vault.
// Comprueba que lo que DEBE fallar, falla. Limpia lo que crea.
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const texto = await readFile(join(RAIZ, 'scripts', 'migracion-siif', '.env'), 'utf8');
for (const l of texto.split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const MORLA = '00000000-0000-0000-0000-000000000001';

let ok = 0, mal = 0;
const bien = (m) => { console.log(`  ✓ ${m}`); ok++; };
const falla = (m) => { console.log(`  ✗ ${m}`); mal++; };

const limpiar = [];
const insertar = (ruta, autor, contenido) =>
  db.from('vault_notas').insert({ tenant_id: MORLA, ruta, autor, contenido, titulo: 'prueba' });

console.log('\n1. Notas sincronizadas');
{
  const { count } = await db.from('vault_notas')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', MORLA).eq('borrada', false);
  count === 22 ? bien(`${count} notas en el vault`) : falla(`esperaba 22, hay ${count}`);
}

console.log('\n2. Separación por dueño (debe RECHAZAR)');
{
  const { error } = await insertar('agentes/hermes/intruso.md', 'elvido', 'x');
  error ? bien(`Elvido NO puede escribir en agentes/hermes/ — ${error.message.slice(0, 60)}…`)
        : falla('Elvido escribió en la carpeta de Hermes (¡hueco!)');
  if (!error) limpiar.push('agentes/hermes/intruso.md');
}
{
  const { error } = await insertar('vision/secuestrada.md', 'hermes', 'x');
  error ? bien(`Hermes NO puede escribir en vision/ — ${error.message.slice(0, 60)}…`)
        : falla('Hermes escribió en las notas de Elvido (¡hueco!)');
  if (!error) limpiar.push('vision/secuestrada.md');
}

console.log('\n3. Guardia de credenciales');
{
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQabc';
  const { error } = await insertar('agentes/claude/con-jwt.md', 'claude', `key: ${jwt}`);
  error ? bien('rechaza un JWT real')
        : falla('dejó pasar un JWT (¡hueco!)');
  if (!error) limpiar.push('agentes/claude/con-jwt.md');
}
{
  // El falso positivo que encontramos: hablar DEL concepto debe pasar
  const { error } = await insertar('agentes/claude/prueba-mencion.md', 'claude',
    'Cada edge function con `SERVICE_ROLE_KEY` debe validar tenant manualmente');
  error ? falla(`falso positivo: rechazó una mención — ${error.message.slice(0, 70)}`)
        : bien('deja pasar la MENCIÓN de SERVICE_ROLE_KEY (nota técnica normal)');
  if (!error) limpiar.push('agentes/claude/prueba-mencion.md');
}

console.log('\n4. RPC de Hermes');
{
  // La duda de Hermes: ¿el título es obligatorio?
  const { data, error } = await db.rpc('vault_guardar_nota', {
    p_ruta: 'prueba-dos-argumentos',
    p_contenido: '# Prueba\n\nCon [[ventas]] y #prueba',
  });
  if (error) falla(`RPC con 2 argumentos falló: ${error.message}`);
  else {
    bien(`RPC con 2 argumentos OK (título automático) → ${data}`);
    limpiar.push(data);
    const { data: fila } = await db.from('vault_notas')
      .select('titulo, wikilinks, tags').eq('tenant_id', MORLA).eq('ruta', data).single();
    fila?.titulo === 'Prueba' ? bien(`título sacado del encabezado: "${fila.titulo}"`)
                              : falla(`título mal: ${JSON.stringify(fila?.titulo)}`);
    fila?.wikilinks?.includes('ventas') ? bien(`wikilinks: ${JSON.stringify(fila.wikilinks)}`)
                                        : falla(`wikilinks mal: ${JSON.stringify(fila?.wikilinks)}`);
  }
}

console.log('\n5. Búsqueda');
{
  const { data, error } = await db.rpc('vault_buscar', { p_texto: 'multi-tenant RLS', p_limite: 3 });
  if (error) falla(`búsqueda falló: ${error.message}`);
  else if (!data?.length) falla('la búsqueda no encontró nada');
  else {
    bien(`encuentra ${data.length} nota(s); la 1ra: ${data[0].ruta}`);
    console.log(`      extracto: ${String(data[0].extracto).replace(/<\/?b>/g, '').slice(0, 90)}…`);
  }
}

console.log('\n6. Limpieza');
for (const ruta of limpiar) {
  await db.from('vault_notas').delete().eq('tenant_id', MORLA).eq('ruta', ruta);
  console.log(`  borrada ${ruta}`);
}
{
  const { count } = await db.from('vault_notas')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', MORLA).eq('borrada', false);
  count === 22 ? bien(`vault queda limpio: ${count} notas`) : falla(`quedaron ${count} notas (esperaba 22)`);
}

console.log(`\n${mal === 0 ? '✓ TODO BIEN' : '✗ HAY FALLAS'} — ${ok} ok, ${mal} mal\n`);
process.exit(mal === 0 ? 0 : 1);
