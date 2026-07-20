import { describe, it, expect } from 'vitest';
import {
  parsearNota,
  hashContenido,
  duenoDeRuta,
  puedeEscribir,
  decidirAccion,
  nombreConflicto,
} from '../scripts/vault-sync/vaultSyncCore.mjs';

describe('parsearNota', () => {
  it('saca el título del primer encabezado', () => {
    const n = parsearNota('# Decisión — Multi-tenant compartido\n\nTexto...');
    expect(n.titulo).toBe('Decisión — Multi-tenant compartido');
  });

  it('cae al nombre del archivo si no hay encabezado', () => {
    const n = parsearNota('solo texto suelto', 'vision/target-ideal.md');
    expect(n.titulo).toBe('target-ideal');
  });

  it('extrae wikilinks, incluyendo los que tienen alias', () => {
    const n = parsearNota('ver [[multi-tenant-compartido]] y [[ventas|el módulo]]');
    expect(n.wikilinks).toEqual(['multi-tenant-compartido', 'ventas']);
  });

  it('extrae tags sin duplicar', () => {
    const n = parsearNota('#estrategia bla #dgii bla #estrategia');
    expect(n.tags.sort()).toEqual(['dgii', 'estrategia']);
  });

  it('no confunde un encabezado markdown con un tag', () => {
    const n = parsearNota('# Título\n\n## Sección\n\ntexto #real');
    expect(n.tags).toEqual(['real']);
  });
});

describe('duenoDeRuta', () => {
  it('las notas de Elvido son suyas', () => {
    expect(duenoDeRuta('vision/target-ideal.md')).toBe('elvido');
    expect(duenoDeRuta('decisiones/multi-tenant-compartido.md')).toBe('elvido');
  });

  it('reconoce la carpeta de cada agente', () => {
    expect(duenoDeRuta('agentes/hermes/resumen-dia.md')).toBe('hermes');
    expect(duenoDeRuta('agentes/claude/auditoria.md')).toBe('claude');
  });
});

describe('puedeEscribir', () => {
  it('un agente solo escribe en su carpeta', () => {
    expect(puedeEscribir('hermes', 'agentes/hermes/x.md')).toBe(true);
    expect(puedeEscribir('hermes', 'agentes/claude/x.md')).toBe(false);
    expect(puedeEscribir('hermes', 'vision/target-ideal.md')).toBe(false);
  });

  it('Elvido escribe en lo suyo pero no dentro de agentes/', () => {
    expect(puedeEscribir('elvido', 'vision/target-ideal.md')).toBe(true);
    expect(puedeEscribir('elvido', 'agentes/hermes/x.md')).toBe(false);
  });
});

describe('decidirAccion', () => {
  const base = { hashLocal: 'A', hashRemoto: 'A', hashBase: 'A' };

  it('no hace nada si nadie cambió', () => {
    expect(decidirAccion(base).accion).toBe('nada');
  });

  it('sube cuando solo cambió el archivo local', () => {
    expect(decidirAccion({ ...base, hashLocal: 'B' }).accion).toBe('subir');
  });

  it('baja cuando solo cambió el remoto', () => {
    expect(decidirAccion({ ...base, hashRemoto: 'B' }).accion).toBe('bajar');
  });

  it('marca conflicto si ambos cambiaron distinto', () => {
    const r = decidirAccion({ hashLocal: 'B', hashRemoto: 'C', hashBase: 'A' });
    expect(r.accion).toBe('conflicto');
  });

  it('no es conflicto si ambos llegaron al mismo contenido', () => {
    const r = decidirAccion({ hashLocal: 'B', hashRemoto: 'B', hashBase: 'A' });
    expect(r.accion).toBe('nada');
  });

  it('nota nueva local (sin base ni remoto) se sube', () => {
    expect(decidirAccion({ hashLocal: 'B', hashRemoto: null, hashBase: null }).accion).toBe('subir');
  });

  it('nota nueva remota (sin base ni local) se baja', () => {
    expect(decidirAccion({ hashLocal: null, hashRemoto: 'B', hashBase: null }).accion).toBe('bajar');
  });

  it('borrado local se propaga como borrado', () => {
    const r = decidirAccion({ hashLocal: null, hashRemoto: 'A', hashBase: 'A' });
    expect(r.accion).toBe('borrar-remoto');
  });

  it('si borré local pero el remoto cambió, gana el texto: se baja', () => {
    // Perder texto es peor que reaparecer un archivo que ya no querías.
    const r = decidirAccion({ hashLocal: null, hashRemoto: 'C', hashBase: 'A' });
    expect(r.accion).toBe('bajar');
  });
});

describe('nombreConflicto', () => {
  it('deja la copia al lado, sin pisar el original', () => {
    expect(nombreConflicto('vision/target-ideal.md', '2026-07-19'))
      .toBe('vision/target-ideal.conflicto-2026-07-19.md');
  });
});

describe('hashContenido', () => {
  it('es estable y distingue contenidos', () => {
    expect(hashContenido('hola')).toBe(hashContenido('hola'));
    expect(hashContenido('hola')).not.toBe(hashContenido('hola '));
  });

  it('ignora diferencias de fin de línea Windows/Unix', () => {
    // Obsidian en Windows guarda CRLF; Supabase devuelve LF. Sin esto,
    // cada nota se vería "cambiada" en cada arranque.
    expect(hashContenido('a\r\nb')).toBe(hashContenido('a\nb'));
  });
});
