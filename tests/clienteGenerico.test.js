// El cliente genérico, en un solo sitio.
//
// (2026-08-17) La lista de UUID centinela estaba copiada a mano 18 veces en
// 13 archivos. Trece copias de la misma verdad son trece sitios donde puede
// quedar vieja — y ya pasó: DevolucionesPage nunca tuvo la comprobación,
// hacía `cliente.id` a secas, y grabar una devolución de contado reventaba
// con "Cannot read properties of null".
//
// La última prueba de este archivo es la que impide que vuelva a pasar.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  IDS_GENERICOS, ID_GENERICO_FINAL, esClienteGenerico, nombreDeCliente,
} from '../src/lib/clienteGenerico.js';

describe('esClienteGenerico', () => {
  it('reconoce los dos centinelas', () => {
    for (const id of IDS_GENERICOS) expect(esClienteGenerico(id), id).toBe(true);
    expect(esClienteGenerico(ID_GENERICO_FINAL)).toBe(true);
  });

  it('acepta el id suelto o el objeto cliente', () => {
    // En unos sitios se tiene uno y en otros el otro. Obligar a recordar
    // cuál es lo que produjo las copias divergentes.
    expect(esClienteGenerico(IDS_GENERICOS[0])).toBe(true);
    expect(esClienteGenerico({ id: IDS_GENERICOS[0], nombre: 'Cliente Genérico' })).toBe(true);
  });

  it('un cliente de verdad no es genérico', () => {
    expect(esClienteGenerico('a3f1b2c4-1111-2222-3333-444455556666')).toBe(false);
    expect(esClienteGenerico({ id: 'a3f1b2c4-1111-2222-3333-444455556666' })).toBe(false);
  });

  it('con nada no revienta y dice que no', () => {
    // Es el caso que causó el fallo: el centinela no aparece al buscar
    // clientes de TU empresa, así que llega null.
    for (const v of [null, undefined, '', 0, {}]) expect(esClienteGenerico(v), String(v)).toBe(false);
  });
});

describe('nombreDeCliente', () => {
  it('lo escrito a mano en el documento manda', () => {
    // Es lo que el cajero tecleó para ESTA venta.
    expect(nombreDeCliente({ nombre: 'Cliente Genérico', id: IDS_GENERICOS[0] },
                           { manual_cliente_nombre: 'Juan Pérez' })).toBe('Juan Pérez');
  });

  it('sin nada, dice la verdad en vez de dejar el hueco', () => {
    // Un comprobante con el nombre en blanco parece roto; "CONSUMIDOR
    // FINAL" es exacto y se entiende en el mostrador.
    expect(nombreDeCliente(null, null)).toBe('CONSUMIDOR FINAL');
    expect(nombreDeCliente(null, { manual_cliente_nombre: '   ' })).toBe('CONSUMIDOR FINAL');
  });

  it('un cliente de verdad conserva su nombre', () => {
    expect(nombreDeCliente({ id: 'x1', nombre: 'FERRETERIA LOPEZ' })).toBe('FERRETERIA LOPEZ');
  });
});

describe('la lista no vuelve a duplicarse', () => {
  it('ningún archivo de src/ trae el UUID centinela a mano', () => {
    // Esta es la prueba que importa. Si alguien vuelve a copiar el id en
    // otra pantalla, esto se pone rojo y le dice dónde va.
    const RAIZ = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const CENTRAL = 'clienteGenerico.js';
    const culpables = [];

    const mirar = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== 'graphify-out') mirar(p); continue; }
        if (!/\.(js|jsx)$/.test(f) || f === CENTRAL) continue;
        const texto = readFileSync(p, 'utf8');
        for (const id of IDS_GENERICOS) {
          if (texto.includes(id)) culpables.push(`${p.split(/[\\/]/).slice(-2).join('/')} → ${id.slice(0, 8)}`);
        }
      }
    };
    mirar(RAIZ);

    expect(culpables, `Usa esClienteGenerico() o IDS_GENERICOS de @/lib/clienteGenerico:\n  ${culpables.join('\n  ')}`)
      .toEqual([]);
  });
});
