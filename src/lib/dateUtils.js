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

// Los dos extremos de un día LOCAL, como instantes.
//
// Para filtrar una columna `timestamptz` por "el día de hoy" no sirve
// mandar '2026-08-20T00:00:00' pelado: la base está en UTC y lo lee como
// las 00:00 UTC, que aquí son las 8:00 PM de AYER. La ventana quedaba
// corrida cuatro horas — todo lo facturado o pagado después de las 8 PM
// caía fuera del cierre del día, y lo de ayer de 8 a 12 caía dentro.
//
// toDate() con la zona resuelve el desfase real (y seguiría bien si algún
// día el país volviera a mover la hora), en vez de pegarle un -04:00 a
// mano.
export const rangoDelDia = (fechaStr) => ({
  desde: toDate(`${fechaStr}T00:00:00`,     { timeZone: TIME_ZONE }).toISOString(),
  hasta: toDate(`${fechaStr}T23:59:59.999`, { timeZone: TIME_ZONE }).toISOString(),
});

// Un periodo de varios días, de la medianoche del primero a la medianoche
// del último — los dos en hora de aquí. Es lo que hay que usar para filtrar
// columnas con hora (`facturas.fecha`, `inventario_movimientos.fecha`) en
// cualquier reporte por rango: el 607 de un mes se armaba dejando fuera las
// ventas del último día después de las 8 PM.
export const rangoDeFechas = (desdeStr, hastaStr) => ({
  desde: rangoDelDia(desdeStr).desde,
  hasta: rangoDelDia(hastaStr).hasta,
});

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