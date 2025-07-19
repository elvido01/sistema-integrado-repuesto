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