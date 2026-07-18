import { describe, it, expect } from 'vitest';
import {
  normalizarTelefonoRD,
  clasificarSeguimiento,
  ordenarSeguimientos,
  filtrarSeguimientos,
  resumenSeguimientos,
  ultimaNota,
} from '../src/lib/seguimientosUtils.js';

const HOY = '2026-07-18';

const ficha = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  cliente_nombre: 'Juan Pérez',
  telefono: '8095551234',
  canal_origen: 'whatsapp',
  producto_consultado: 'goma 90/90-17',
  codigo_producto: 'GM9017',
  estado: 'precio_enviado',
  prioridad: 'media',
  proxima_accion: 'preguntar si pasa',
  fecha_seguimiento: HOY,
  notas: null,
  actualizado_en: '2026-07-18T10:00:00Z',
  ...over,
});

describe('normalizarTelefonoRD', () => {
  it('quita formato y el 1 de país (igual que crm_whatsapp_phone_key)', () => {
    expect(normalizarTelefonoRD('1 (809) 555-1234')).toBe('8095551234');
    expect(normalizarTelefonoRD('809-555-1234')).toBe('8095551234');
    expect(normalizarTelefonoRD('18292026692')).toBe('8292026692');
  });
  it('vacíos devuelven cadena vacía', () => {
    expect(normalizarTelefonoRD(null)).toBe('');
    expect(normalizarTelefonoRD('')).toBe('');
  });
});

describe('clasificarSeguimiento', () => {
  it('clasifica vencido / hoy / próximo / sin fecha', () => {
    expect(clasificarSeguimiento(ficha({ fecha_seguimiento: '2026-07-17' }), HOY)).toBe('vencido');
    expect(clasificarSeguimiento(ficha({ fecha_seguimiento: HOY }), HOY)).toBe('hoy');
    expect(clasificarSeguimiento(ficha({ fecha_seguimiento: '2026-07-20' }), HOY)).toBe('proximo');
    expect(clasificarSeguimiento(ficha({ fecha_seguimiento: null }), HOY)).toBe('sin_fecha');
  });
});

describe('ordenarSeguimientos', () => {
  it('alta primero, luego fecha más vieja, sin fecha al final', () => {
    const a = ficha({ id: 'a', prioridad: 'baja', fecha_seguimiento: '2026-07-10' });
    const b = ficha({ id: 'b', prioridad: 'alta', fecha_seguimiento: '2026-07-18' });
    const c = ficha({ id: 'c', prioridad: 'media', fecha_seguimiento: '2026-07-11' });
    const d = ficha({ id: 'd', prioridad: 'media', fecha_seguimiento: null });
    const e = ficha({ id: 'e', prioridad: 'media', fecha_seguimiento: '2026-07-09' });
    expect(ordenarSeguimientos([a, b, c, d, e]).map((f) => f.id)).toEqual(['b', 'e', 'c', 'd', 'a']);
  });
});

describe('filtrarSeguimientos', () => {
  const abiertas = [
    ficha({ id: 'v', fecha_seguimiento: '2026-07-15' }),                     // vencida (en crm_hoy)
    ficha({ id: 'h', fecha_seguimiento: HOY }),                              // hoy (en crm_hoy)
    ficha({ id: 'p', fecha_seguimiento: '2026-07-25' }),                     // próxima (NO en crm_hoy)
    ficha({ id: 's', fecha_seguimiento: null }),                             // sin fecha (en crm_hoy)
    ficha({ id: 'ag', estado: 'agotado_solicitado', fecha_seguimiento: null }), // esperando pieza (NO en crm_hoy)
  ];
  const idsHoy = new Set(['v', 'h', 's']); // lo que devolvió hermes_crm_hoy

  it('tab hoy = exactamente lo que dice crm_hoy (respeta el gating de agotados)', () => {
    const r = filtrarSeguimientos(abiertas, { tab: 'hoy' }, { hoyStr: HOY, idsHoy });
    expect(r.map((f) => f.id).sort()).toEqual(['h', 's', 'v']);
  });

  it('tab vencidos = solo fecha pasada dentro de crm_hoy', () => {
    const r = filtrarSeguimientos(abiertas, { tab: 'vencidos' }, { hoyStr: HOY, idsHoy });
    expect(r.map((f) => f.id)).toEqual(['v']);
  });

  it('tab próximos = fecha futura', () => {
    const r = filtrarSeguimientos(abiertas, { tab: 'proximos' }, { hoyStr: HOY, idsHoy });
    expect(r.map((f) => f.id)).toEqual(['p']);
  });

  it('filtra por estado, prioridad y canal', () => {
    const datos = [
      ficha({ id: '1', estado: 'requiere_aprobacion', prioridad: 'alta', canal_origen: 'tienda' }),
      ficha({ id: '2' }),
    ];
    const ctx = { hoyStr: HOY, idsHoy: new Set(['1', '2']) };
    expect(filtrarSeguimientos(datos, { tab: 'hoy', estado: 'requiere_aprobacion' }, ctx).map(f => f.id)).toEqual(['1']);
    expect(filtrarSeguimientos(datos, { tab: 'hoy', prioridad: 'alta' }, ctx).map(f => f.id)).toEqual(['1']);
    expect(filtrarSeguimientos(datos, { tab: 'hoy', canal: 'tienda' }, ctx).map(f => f.id)).toEqual(['1']);
  });

  it('busca por cliente, teléfono (con formato) o producto', () => {
    const ctx = { hoyStr: HOY, idsHoy };
    expect(filtrarSeguimientos(abiertas, { tab: 'hoy', busqueda: 'juan' }, ctx).length).toBe(3);
    expect(filtrarSeguimientos(abiertas, { tab: 'hoy', busqueda: '(809) 555' }, ctx).length).toBe(3);
    expect(filtrarSeguimientos(abiertas, { tab: 'hoy', busqueda: 'goma 90' }, ctx).length).toBe(3);
    expect(filtrarSeguimientos(abiertas, { tab: 'hoy', busqueda: 'no-existe' }, ctx).length).toBe(0);
  });
});

describe('resumenSeguimientos', () => {
  it('cuenta hoy, vencidos, alta, requiere_aprobacion y agotado_solicitado', () => {
    const abiertas = [
      ficha({ id: 'v', fecha_seguimiento: '2026-07-15', prioridad: 'alta' }),
      ficha({ id: 'h', fecha_seguimiento: HOY }),
      ficha({ id: 'p', fecha_seguimiento: '2026-07-25' }),
      ficha({ id: 'ra', estado: 'requiere_aprobacion', fecha_seguimiento: null }),
      ficha({ id: 'ag', estado: 'agotado_solicitado', fecha_seguimiento: null }),
    ];
    const idsHoy = new Set(['v', 'h', 'ra']);
    const r = resumenSeguimientos(abiertas, { hoyStr: HOY, idsHoy });
    expect(r).toEqual({ hoy: 3, vencidos: 1, alta: 1, requiereAprobacion: 1, agotadoSolicitado: 1 });
  });
});

describe('validarAccionEstado', () => {
  it('perdido y requiere_aprobacion exigen nota; agotado y guardar normal no', async () => {
    const { validarAccionEstado } = await import('../src/lib/seguimientosUtils.js');
    expect(validarAccionEstado('perdido', '').ok).toBe(false);
    expect(validarAccionEstado('perdido', '  ').ok).toBe(false);
    expect(validarAccionEstado('perdido', 'no le sirvió el precio').ok).toBe(true);
    expect(validarAccionEstado('requiere_aprobacion', '').ok).toBe(false);
    expect(validarAccionEstado('requiere_aprobacion', 'pide 10% de descuento').ok).toBe(true);
    expect(validarAccionEstado('agotado_solicitado', '').ok).toBe(true);
    expect(validarAccionEstado(null, '').ok).toBe(true);
  });
  it('cuando falla, dice qué falta', async () => {
    const { validarAccionEstado } = await import('../src/lib/seguimientosUtils.js');
    expect(validarAccionEstado('perdido', '').error).toMatch(/razón/i);
    expect(validarAccionEstado('requiere_aprobacion', '').error).toMatch(/nota/i);
  });
});

describe('ultimaNota', () => {
  it('devuelve la última línea con contenido', () => {
    expect(ultimaNota('17/07 pidió precio\n18/07 [auto] Comprado — factura #3014')).toBe('18/07 [auto] Comprado — factura #3014');
    expect(ultimaNota('una sola')).toBe('una sola');
    expect(ultimaNota(null)).toBe('');
  });
});
