/**
 * Busca el almacén principal (por defecto) de una lista de almacenes.
 * Prioridad: código '01' > código 'ALM01' > nombre contiene 'principal' > primer almacén.
 */
export function findAlmacenPrincipal(almacenes) {
  if (!almacenes || almacenes.length === 0) return null;

  // 1. Buscar por código exacto '01' (nuevo estándar para empresas SaaS)
  const byCode01 = almacenes.find(a => a.codigo?.trim() === '01');
  if (byCode01) return byCode01;

  // 2. Buscar por código exacto 'ALM01' (legacy Morla)
  const byCode = almacenes.find(a => a.codigo?.toUpperCase() === 'ALM01');
  if (byCode) return byCode;

  // 3. Buscar por nombre que contenga 'principal'
  const byName = almacenes.find(a => a.nombre?.toLowerCase().includes('principal'));
  if (byName) return byName;

  // 4. Fallback: primer almacén
  return almacenes[0];
}
