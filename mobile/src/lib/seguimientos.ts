// Seguimiento de "precio sin respuesta" (12/11/2026).
// Mismas reglas que la web (src/lib/seguimientosUtils.js): si cambian allá,
// cambian aquí.

export type Seguimiento = {
  id: string;
  cliente_nombre: string | null;
  telefono: string | null;
  canal_origen: string | null;
  producto_consultado: string | null;
  codigo_producto: string | null;
  estado: string;
  prioridad: string | null;
  proxima_accion: string | null;
  fecha_seguimiento: string | null;
  notas: string | null;
  creado_por: string | null;
  creado_en: string;
};

// El precio sale de la nota que deja el seguimiento automático:
// `DD/MM HH:MI precio que le diste: «…»`.
export function precioQueSeLeDio(notas?: string | null): string {
  const m = /precio que le diste:\s*«([^»]*)»/i.exec(String(notas || ''));
  return m ? m[1].trim() : '';
}

export function cuandoSeLeDio(notas?: string | null): string {
  const m = /^(\d{2}\/\d{2} \d{2}:\d{2}) precio que le diste/i.exec(String(notas || ''));
  return m ? m[1] : '';
}

export function mensajeDeSeguimiento(f: Pick<Seguimiento, 'notas'>): string {
  const precio = precioQueSeLeDio(f?.notas);
  if (!precio) return 'Buen día. ¿Todavía te interesa lo que me preguntaste? Me avisas y te atiendo de una vez.';
  // Un precio suelto ("4,435") se dice distinto que una frase ("Farol delantero a 450").
  const soloNumero = /^[\d.,\s$RDrd]+$/.test(precio);
  return soloNumero
    ? `Buen día. ¿Todavía te interesa lo que me preguntaste? Te lo había dejado en ${precio}. Me avisas y te atiendo de una vez.`
    : `Buen día. ¿Todavía te interesa? Te había dicho: ${precio}. Me avisas y te atiendo de una vez.`;
}

// El teléfono guardado de un chat del espejo puede ser un id interno (@lid)
// que no es su número: solo se confía cuando el NOMBRE del contacto es el
// propio número ("+1 (829) 842-5722"). Si no, null: se copia y se busca el chat.
export function enlaceWhatsApp(f: Pick<Seguimiento, 'cliente_nombre'>, mensaje: string): string | null {
  const nombre = String(f?.cliente_nombre || '');
  if (!/^[\d\s()+\-.]+$/.test(nombre)) return null;
  let d = nombre.replace(/\D/g, '');
  if (d.length === 10) d = `1${d}`;
  if (d.length !== 11 || !/^1(809|829|849)/.test(d)) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensaje || '')}`;
}

// Fecha de hoy en República Dominicana (YYYY-MM-DD), para comparar con fecha_seguimiento.
export function hoyRD(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Toca hoy: sin fecha, o con fecha de hoy o vencida.
export function tocaHoy(f: Pick<Seguimiento, 'fecha_seguimiento'>, hoy: string): boolean {
  return !f.fecha_seguimiento || f.fecha_seguimiento <= hoy;
}
