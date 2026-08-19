// "Este preguntó por un caliper y no compró. Llamarlo el lunes."
//
// >>> POR QUE ESTE FORMULARIO ES TAN CORTO <<<
// (2026-08-19) El botón "Crear seguimiento" que había solo ponía una etiqueta
// en la conversación: sin fecha, sin producto, sin nota. Se usó UNA vez desde
// mayo, y se entiende — no servía para nada.
//
// Este pide lo mínimo que hace útil un seguimiento: cuándo volver a buscarlo
// y por qué pieza. Todo lo demás es opcional. Si pedimos más, se llena menos,
// y un seguimiento que no se crea no existe.
//
// La fecha va con atajos porque esto se llena con un cliente delante.

import React, { useEffect, useMemo, useState } from 'react';
import { atajosDeFecha } from '../../lib/fechasSeguimiento.js';

// El vocabulario NO es libre: son los CHECK de crm_seguimiento. Se ponen los
// que un vendedor usa al colgar el teléfono; los otros —requiere_aprobacion,
// agotado_solicitado— los pone el sistema por otros caminos.
const ESTADOS = [
  { valor: 'interesado',     texto: 'Interesado' },
  { valor: 'precio_enviado', texto: 'Le pasé precio' },
  { valor: 'prometio_pasar', texto: 'Prometió pasar' },
  { valor: 'pendiente_pago', texto: 'Falta que pague' },
  { valor: 'nuevo',          texto: 'Solo preguntó' },
];

const PRIORIDADES = [
  { valor: 'alta',  texto: 'Alta' },
  { valor: 'media', texto: 'Normal' },
  { valor: 'baja',  texto: 'Baja' },
];

export default function SeguimientoForm({
  isOpen,
  conversacion = null,
  nombreSugerido = '',
  telefonoSugerido = '',
  productoSugerido = '',
  guardando = false,
  onCerrar,
  onGuardar,
}) {
  const atajos = useMemo(() => atajosDeFecha(new Date()), [isOpen]);

  const [fecha, setFecha] = useState('');
  const [producto, setProducto] = useState('');
  const [estado, setEstado] = useState('interesado');
  const [prioridad, setPrioridad] = useState('media');
  const [accion, setAccion] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // "Mañana" por defecto: es lo que se contesta el 80% de las veces, y deja
    // el formulario listo para guardar de una.
    setFecha(atajos[0]?.fecha || '');
    setProducto(productoSugerido || '');
    setEstado('interesado');
    setPrioridad('media');
    setAccion('');
    setNombre(nombreSugerido || '');
    setTelefono(telefonoSugerido || '');
    setError('');
  }, [isOpen, nombreSugerido, telefonoSugerido, productoSugerido]);

  if (!isOpen) return null;

  const sinDestinatario = !String(nombre || '').trim() && !String(telefono || '').trim();

  const guardar = (event) => {
    event?.preventDefault?.();
    if (guardando) return;
    if (!fecha) { setError('Dime para qué día hay que volver a buscarlo.'); return; }
    if (sinDestinatario) { setError('Hace falta el nombre o el teléfono de quien hay que buscar.'); return; }
    setError('');
    onGuardar?.({
      fecha,
      conversationId: conversacion?.id || null,
      producto: producto.trim() || null,
      accion: accion.trim() || null,
      estado,
      prioridad,
      // Solo se mandan si no hay conversación: con conversación, el servidor
      // saca el nombre y el teléfono de ahí, que es la fuente buena.
      clienteNombre: conversacion?.id ? null : (nombre.trim() || null),
      telefono: conversacion?.id ? null : (telefono.trim() || null),
    });
  };

  return (
    <form className="mf-seg-form" onSubmit={guardar}>
      <header className="mf-seg-head">
        <strong>Seguimiento</strong>
        <button type="button" onClick={onCerrar} aria-label="Cerrar">✕</button>
      </header>

      {conversacion?.id ? (
        <p className="mf-seg-de">
          De: <b>{nombreSugerido || telefonoSugerido || 'esta conversación'}</b>
        </p>
      ) : (
        <div className="mf-seg-fila">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                 placeholder="Nombre del cliente" aria-label="Nombre del cliente" />
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
                 placeholder="Teléfono" aria-label="Teléfono" inputMode="tel" />
        </div>
      )}

      <label className="mf-seg-lbl">¿Qué pieza preguntó?</label>
      <input value={producto} onChange={(e) => setProducto(e.target.value)}
             placeholder="Ej: caliper trasero Pruss 200" aria-label="Pieza que preguntó" />

      <label className="mf-seg-lbl">¿Cuándo lo busco?</label>
      <div className="mf-seg-atajos">
        {atajos.map((a) => (
          <button key={a.clave} type="button"
                  className={fecha === a.fecha ? 'is-on' : ''}
                  onClick={() => setFecha(a.fecha)}>
            {a.etiqueta}
          </button>
        ))}
      </div>
      {/* El calendario se queda para la fecha rara. Los atajos solo lo llenan. */}
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
             aria-label="Fecha de seguimiento" />

      <div className="mf-seg-fila">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="En qué quedó">
          {ESTADOS.map((x) => <option key={x.valor} value={x.valor}>{x.texto}</option>)}
        </select>
        <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} aria-label="Prioridad">
          {PRIORIDADES.map((x) => <option key={x.valor} value={x.valor}>{x.texto}</option>)}
        </select>
      </div>

      <input value={accion} onChange={(e) => setAccion(e.target.value)}
             placeholder="Qué hay que hacer (opcional)" aria-label="Próxima acción" />

      {error && <p className="mf-seg-error">{error}</p>}

      <div className="mf-seg-pie">
        <button type="button" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button type="submit" className="mf-seg-ok" disabled={guardando || !fecha || sinDestinatario}>
          {guardando ? 'Guardando…' : 'Guardar seguimiento'}
        </button>
      </div>
    </form>
  );
}
