// Lo que hay que perseguir hoy.
//
// >>> POR QUE ESTA AQUI, ENCIMA DE COBRANZA <<<
// (2026-08-19) El botón SG del riel ya llevaba a esta pantalla. Si el número
// del riel contara seguimientos comerciales pero al pulsarlo solo se vieran
// deudas, el número estaría mintiendo — y un contador que miente deja de
// mirarse, que es justo lo que le pasó al de Instagram.
//
// Son dos cosas distintas y se ven separadas: arriba a quién hay que llamar
// por una pieza, abajo a quién hay que cobrarle.
//
// >>> LOS ATRASADOS VAN DE PRIMERO <<<
// Los ordena el servidor por días de atraso. Un seguimiento de hace cinco
// días es más urgente que el de hoy, no menos: al de hoy todavía le queda
// el día por delante.

import React, { useState } from 'react';
import { comoSeLee, diasDesde, atajosDeFecha } from '../../lib/fechasSeguimiento.js';

// 'redes' sigue aqui por las filas de antes del 19/08/2026, cuando las tres
// redes se guardaban en la misma bolsa. Las nuevas ya vienen separadas.
const CANALES = {
  whatsapp: 'WhatsApp', tienda: 'Tienda',
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
  telefono: 'Teléfono', referido: 'Referido', otro: 'Otro',
  redes: 'Redes (viejo)',
};

const ESTADOS = {
  nuevo: 'solo preguntó', interesado: 'interesado', precio_enviado: 'le pasé precio',
  pendiente_pago: 'falta que pague', prometio_pasar: 'prometió pasar',
  agotado_solicitado: 'pedido al suplidor', requiere_aprobacion: 'requiere aprobación',
};

export default function SeguimientosHoy({ seguimientos = [], ocupado = false, onCerrar, onRecargar }) {
  const [moviendo, setMoviendo] = useState(null);

  if (!seguimientos.length) return null;

  const hoy = new Date();
  const atrasados = seguimientos.filter((s) => diasDesde(s.fecha_seguimiento, hoy) > 0).length;

  return (
    <section className="mf-seg-hoy" aria-label="Seguimientos de venta">
      <header className="mf-seg-hoy-head">
        <strong>
          {seguimientos.length} {seguimientos.length === 1 ? 'seguimiento' : 'seguimientos'}
        </strong>
        {atrasados > 0 && <em className="mf-seg-atraso">{atrasados} atrasado{atrasados === 1 ? '' : 's'}</em>}
        <button type="button" onClick={onRecargar} disabled={ocupado} aria-label="Actualizar">↻</button>
      </header>

      <ul className="mf-seg-hoy-lista">
        {seguimientos.map((s) => {
          const dias = diasDesde(s.fecha_seguimiento, hoy);
          return (
            <li key={s.id} className={dias > 0 ? 'is-atrasado' : ''}>
              <div className="mf-seg-hoy-fila">
                <b>{s.cliente_nombre || s.telefono || 'Sin nombre'}</b>
                <span className="mf-seg-cuando">{comoSeLee(s.fecha_seguimiento, hoy)}</span>
              </div>

              {/* La pieza es lo que hace la llamada posible: sin ella hay que
                  abrir la conversación y leerla entera para saber de qué se
                  hablaba. */}
              {s.producto_consultado && <p className="mf-seg-pieza">{s.producto_consultado}</p>}

              <p className="mf-seg-meta">
                {CANALES[s.canal_origen] || s.canal_origen}
                {s.estado && ESTADOS[s.estado] ? ` · ${ESTADOS[s.estado]}` : ''}
                {s.prioridad === 'alta' ? ' · prioridad alta' : ''}
                {s.telefono ? ` · ${s.telefono}` : ''}
              </p>

              {s.proxima_accion && <p className="mf-seg-accion">{s.proxima_accion}</p>}

              {moviendo === s.id ? (
                <div className="mf-seg-mover">
                  {atajosDeFecha(hoy).slice(0, 4).map((a) => (
                    <button key={a.clave} type="button" disabled={ocupado}
                            onClick={() => { onCerrar?.(s, 'nuevo', a.fecha); setMoviendo(null); }}>
                      {a.etiqueta}
                    </button>
                  ))}
                  <button type="button" onClick={() => setMoviendo(null)}>Cancelar</button>
                </div>
              ) : (
                <div className="mf-seg-hoy-acciones">
                  <button type="button" disabled={ocupado}
                          onClick={() => onCerrar?.(s, 'comprado')}>Compró</button>
                  <button type="button" disabled={ocupado}
                          onClick={() => onCerrar?.(s, 'perdido')}>No quiso</button>
                  {/* Mover de fecha es la salida honesta: "lo llamé y me dijo
                      que la semana que viene" no es ni ganado ni perdido, y sin
                      esta opción la gente cierra como perdido lo que sigue vivo. */}
                  <button type="button" disabled={ocupado}
                          onClick={() => setMoviendo(s.id)}>Mover</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
