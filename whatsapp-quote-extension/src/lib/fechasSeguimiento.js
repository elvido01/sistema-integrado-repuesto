// Cuando volver a buscar al cliente.
//
// >>> POR QUE ATAJOS Y NO UN CALENDARIO <<<
// Esto se llena con un cliente delante o entre dos mensajes de WhatsApp. Abrir
// un calendario, buscar el mes y contar los dias es exactamente el trabajo que
// hace que nadie cree el seguimiento -- y un seguimiento que no se crea no
// existe. Los atajos cubren lo que se dice en el mostrador: "manana",
// "el lunes", "en una semana".
//
// El calendario se queda igual, para la fecha rara. Los atajos solo lo llenan.
//
// >>> LA FECHA ES LOCAL, NO UTC <<<
// toISOString() devuelve la fecha en UTC, y en Republica Dominicana (UTC-4)
// eso adelanta el dia desde las 8 de la noche: un seguimiento creado el jueves
// a las 9 pm saldria fechado el viernes. Aqui se arma a mano desde los campos
// locales para que el dia sea el que la persona ve en su reloj.

/** YYYY-MM-DD de una fecha, en la zona del que la mira. */
export function aISO(fecha) {
  // new Date(null) NO es invalida: es la epoca, y en UTC-4 se lee 1969-12-31.
  // Sin esta guarda, un campo vacio se convertia en una fecha de seguimiento
  // de hace cincuenta y siete anos, y nadie lo notaba hasta ver la lista.
  if (fecha === null || fecha === undefined || fecha === '') return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Suma dias sin que el horario de verano mueva el resultado. */
export function sumarDias(desde, dias) {
  const d = desde instanceof Date ? new Date(desde) : new Date(desde);
  d.setHours(12, 0, 0, 0);   // mediodia: ningun cambio de hora cruza por aqui
  d.setDate(d.getDate() + Number(dias || 0));
  return d;
}

/**
 * El proximo dia de la semana pedido. 1 = lunes … 6 = sabado, 0 = domingo.
 * Si hoy ES ese dia, devuelve el de la semana que viene: "el lunes" dicho un
 * lunes significa el siguiente, no hoy mismo.
 */
export function proximoDia(desde, diaSemana) {
  const d = desde instanceof Date ? new Date(desde) : new Date(desde);
  d.setHours(12, 0, 0, 0);
  const faltan = ((Number(diaSemana) - d.getDay()) + 7) % 7 || 7;
  d.setDate(d.getDate() + faltan);
  return d;
}

/**
 * Los botones de atajo, ya resueltos a fecha.
 * Se le pasa `hoy` a proposito: sin eso no hay forma de probarlo sin falsear
 * el reloj del sistema.
 */
export function atajosDeFecha(hoy = new Date()) {
  return [
    { clave: 'manana',  etiqueta: 'Mañana',      fecha: aISO(sumarDias(hoy, 1)) },
    { clave: 'tres',    etiqueta: 'En 3 días',   fecha: aISO(sumarDias(hoy, 3)) },
    { clave: 'lunes',   etiqueta: 'El lunes',    fecha: aISO(proximoDia(hoy, 1)) },
    { clave: 'semana',  etiqueta: 'En 1 semana', fecha: aISO(sumarDias(hoy, 7)) },
    { clave: 'quince',  etiqueta: 'En 15 días',  fecha: aISO(sumarDias(hoy, 15)) },
  ];
}

/**
 * Como se lee una fecha de seguimiento en la lista.
 * "hoy" y "ayer" pesan mas que un 19/08 que hay que interpretar.
 */
export function comoSeLee(fechaISO, hoy = new Date()) {
  if (!fechaISO) return '';
  const dias = diasDesde(fechaISO, hoy);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias === -1) return 'mañana';
  if (dias > 1) return `hace ${dias} días`;
  return `en ${Math.abs(dias)} días`;
}

/** Dias transcurridos desde `fechaISO` hasta `hoy`. Positivo = atrasado. */
export function diasDesde(fechaISO, hoy = new Date()) {
  if (!fechaISO) return 0;
  const [a, m, d] = String(fechaISO).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return 0;
  const objetivo = new Date(a, m - 1, d, 12, 0, 0, 0);
  const base = hoy instanceof Date ? new Date(hoy) : new Date(hoy);
  base.setHours(12, 0, 0, 0);
  return Math.round((base - objetivo) / 86400000);
}
