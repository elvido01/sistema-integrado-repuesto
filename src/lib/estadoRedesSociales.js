// ════════════════════════════════════════════════════════════════════════
//  QUÉ CUENTA MANDA EN CADA RED, Y QUÉ SE PUEDE DECIR DE ELLA
// ════════════════════════════════════════════════════════════════════════
//  `social_accounts` puede tener varias filas de la misma red en una empresa:
//  el 29/09 YouTube tenía el registro MANUAL antiguo (@repuestos_morla, sin
//  token) y la conexión OAuth nueva (UCpzCEh9wP212K8p8QP_YvFQ). La pantalla
//  pintaba las dos y, como solo miraba `publicacion_habilitada`, las dos
//  salían "sin autorizar": una mentía sobre la conexión y la otra sobraba.
//
//  Aquí se elige UNA por red, siempre la misma, y se traduce su estado a lo
//  que de verdad significa. Conectar NO es poder publicar: la cuenta puede
//  estar conectada y el publicador seguir sin habilitar. Esa diferencia es
//  justo la que el dueño tiene que ver.
//
//  La misma cuenta elegida decide el indicador Y si el destino está
//  habilitado en el formulario: no puede haber un verde arriba y un bloqueo
//  abajo por mirar filas distintas.
// ════════════════════════════════════════════════════════════════════════

// Menor = gana. Una conexión viva manda sobre una rota, y cualquier conexión
// manda sobre el registro manual, que nunca tuvo token.
const PRIORIDAD_STATUS = { connected: 0, error: 1, disconnected: 2, manual: 3 };

const tiempo = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/** Orden determinista: status, habilitada, más reciente, y por último el id. */
export function compararCuentas(a, b) {
  const pa = PRIORIDAD_STATUS[a.status] ?? 9;
  const pb = PRIORIDAD_STATUS[b.status] ?? 9;
  if (pa !== pb) return pa - pb;
  const ha = a.publicacion_habilitada === true ? 0 : 1;
  const hb = b.publicacion_habilitada === true ? 0 : 1;
  if (ha !== hb) return ha - hb;
  const ta = tiempo(a.connected_at);
  const tb = tiempo(b.connected_at);
  if (ta !== tb) return tb - ta;
  // Empate total: que no dependa del orden en que llegaron las filas.
  return String(a.id ?? a.external_account_id ?? '').localeCompare(String(b.id ?? b.external_account_id ?? ''));
}

/** Una cuenta por red: { youtube: fila, facebook: fila, ... }. */
export function elegirCuentaPorRed(filas = []) {
  const porRed = {};
  for (const f of filas) {
    if (!f?.platform) continue;
    const actual = porRed[f.platform];
    if (!actual || compararCuentas(f, actual) < 0) porRed[f.platform] = f;
  }
  return porRed;
}

/**
 * Lo que se puede afirmar de una cuenta.
 *   clave:    'lista' | 'pendiente' | 'sin_conectar' | 'reconectar'
 *   puede:    true SOLO si está conectada Y habilitada (esto decide el destino)
 *   etiqueta: el texto del indicador
 *   detalle:  la explicación guardada, cuando la hay
 */
export function estadoCuenta(cuenta) {
  const detalle = (cuenta?.verificacion_detalle || '').trim() || null;
  if (!cuenta) {
    return { clave: 'sin_conectar', puede: false, etiqueta: 'Sin conectar', detalle: null };
  }
  if (cuenta.status === 'connected') {
    return cuenta.publicacion_habilitada === true
      ? { clave: 'lista', puede: true, etiqueta: 'Puede publicar', detalle }
      : { clave: 'pendiente', puede: false, etiqueta: 'Conectado · publicación pendiente', detalle };
  }
  if (cuenta.status === 'error' || cuenta.status === 'disconnected') {
    return { clave: 'reconectar', puede: false, etiqueta: 'Requiere reconexión', detalle };
  }
  // 'manual' (o cualquier otro): nunca hubo conexión. Aunque la fila diga
  // habilitada, sin conexión no se afirma que pueda publicar.
  return { clave: 'sin_conectar', puede: false, etiqueta: 'Sin conectar', detalle };
}

/** Las redes ya resueltas, en orden fijo, listas para pintar. */
export function indicadoresRedes(filas = []) {
  const elegidas = elegirCuentaPorRed(filas);
  return Object.keys(elegidas).sort().map((platform) => ({
    platform,
    cuenta: elegidas[platform],
    ...estadoCuenta(elegidas[platform]),
  }));
}
