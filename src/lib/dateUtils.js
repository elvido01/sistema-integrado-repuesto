import { format as formatFns, utcToZonedTime, toDate } from 'date-fns-tz';
import { es } from 'date-fns/locale';

const TIME_ZONE = 'America/Santo_Domingo';

export const getCurrentDateInTimeZone = () => {
  return utcToZonedTime(new Date(), TIME_ZONE);
};

export const parseISOString = (isoString) => {
  if (!isoString) return new Date();
  return toDate(isoString, { timeZone: TIME_ZONE });
};

export const formatInTimeZone = (date, formatStr, options = {}) => {
  if (!date) return '';
  const zonedDate = toDate(date, { timeZone: TIME_ZONE });
  return formatFns(zonedDate, formatStr, {
    ...options,
    locale: es,
    timeZone: TIME_ZONE,
  });
};

export const formatDateForSupabase = (date) => {
  if (!date) return null;
  return formatInTimeZone(date, "yyyy-MM-dd");
};

// Formatea una fecha SOLO para mostrar, en dd/MM/yyyy. No usar para guardar.
// Acepta Date o string ISO ('2026-06-30' o con hora). Devuelve '' si viene vacía.
export const formatFechaDMY = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    // 'YYYY-MM-DD...' se formatea por texto para evitar desfase de zona horaria.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  try {
    return formatInTimeZone(value, 'dd/MM/yyyy');
  } catch {
    return String(value);
  }
};