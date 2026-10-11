// ============================================================
// modulos.js — módulos encendidos por empresa
// ============================================================
// (10/10/2026) Antes, qué veía cada empresa se decidía con uuids fijos en el
// código (GPS y campos de vehículo de Caminero, SAN de MotoPréstamos...).
// Ahora es configuración: config_empresa.modulos (text[]), que se carga en
// la sesión (SupabaseAuthContext → empresa.modulos).
// Lista de módulos y quién los tiene: sql/modulos_por_empresa.sql
// ============================================================

export const tieneModulo = (empresa, modulo) =>
  Array.isArray(empresa?.modulos) && empresa.modulos.includes(modulo);
