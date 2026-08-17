// El catálogo de herramientas del MCP contra las funciones SQL que dice
// llamar.
//
// >>> POR QUÉ ESTA PRUEBA EXISTE <<<
// Entre el nombre del parámetro en TypeScript (`p_dias_mora`) y el de la
// función en PostgreSQL no hay nada que los ate. Si uno cambia y el otro no,
// nada falla al desplegar: falla cuando alguien le pregunta a Jarvis quién
// le debe, y el error que ve es "Error consultando MotoFlow", que no dice
// dónde está el problema.
//
// Aquí se leen las dos cosas y se comparan. Es la única forma de que un
// nombre mal escrito muera en `npm test` y no delante de un cliente.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TOOLS } from '../supabase/functions/motoflow-mcp/tools.ts';

const RAIZ = join(import.meta.dirname, '..');
const SQL = join(RAIZ, 'sql');

// Todas las funciones mcp_* declaradas en sql/, con sus parámetros.
// Devuelve { mcp_buscar_piezas: ['p_texto', 'p_limite'], ... }
function firmasEnSql() {
  const firmas = {};
  for (const archivo of readdirSync(SQL).filter((f) => f.endsWith('.sql'))) {
    // Fuera los comentarios de línea ANTES de mirar la firma.
    //
    // (2026-08-17) Sin esto, un comentario detrás de un parámetro escondía
    // el SIGUIENTE: al partir por comas, el trozo empezaba por "--" y se
    // descartaba entero. Pasó con mcp_resolver_entidad, que perdió p_texto
    // y dio un fallo que parecía del catálogo y era del lector. Una prueba
    // que acusa al código equivocado es peor que no tenerla.
    const texto = readFileSync(join(SQL, archivo), 'utf8')
      .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
    const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(mcp_\w+)\s*\(([^)]*)\)/gi;
    let m;
    while ((m = re.exec(texto)) !== null) {
      const params = m[2]
        .split(',')
        .map((p) => p.trim().split(/\s+/)[0])
        .filter((p) => p.startsWith('p_'));
      // Si una función se redefine en dos archivos gana la última leída, que
      // es lo que también pasa al correrlos en orden.
      firmas[m[1]] = params;
    }
  }
  return firmas;
}

const FIRMAS = firmasEnSql();

describe('catálogo de herramientas del MCP', () => {
  it('encuentra las funciones mcp_ en los archivos SQL', () => {
    // Si esto falla es la prueba la que está rota, no el catálogo: querría
    // decir que el patrón de búsqueda dejó de encontrar las funciones y
    // entonces todo lo de abajo pasaría por vacío.
    expect(Object.keys(FIRMAS).length).toBeGreaterThanOrEqual(9);
  });

  it('ninguna herramienta repite nombre', () => {
    const nombres = TOOLS.map((t) => t.name);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('cada herramienta tiene lo que el protocolo exige', () => {
    for (const t of TOOLS) {
      expect(t.name, 'nombre').toMatch(/^[a-z][a-z0-9_]*$/);
      expect(t.description?.length ?? 0, `descripción de ${t.name}`).toBeGreaterThan(60);
      expect(t.inputSchema?.type, `inputSchema de ${t.name}`).toBe('object');
      expect(typeof t.rpc, `rpc de ${t.name}`).toBe('string');
      expect(typeof t.args, `args de ${t.name}`).toBe('function');
    }
  });

  it('la RPC que dice llamar existe en sql/', () => {
    for (const t of TOOLS) {
      expect(FIRMAS[t.rpc], `${t.name} llama a ${t.rpc}, que no está en sql/`).toBeDefined();
    }
  });

  it('los parámetros que manda son los que la función declara', () => {
    for (const t of TOOLS) {
      const declarados = FIRMAS[t.rpc] || [];
      // args() con el objeto vacío: interesan los NOMBRES de las claves, no
      // los valores. Por eso cada args() pone un valor por defecto.
      const enviados = Object.keys(t.args({}));
      for (const p of enviados) {
        expect(declarados, `${t.name} manda "${p}" y ${t.rpc} no lo tiene`).toContain(p);
      }
    }
  });

  it('los campos del inputSchema se usan de verdad en args()', () => {
    // Un campo declarado que args() ignora es una promesa que no se cumple:
    // el modelo lo manda, la función nunca lo recibe y la respuesta sale
    // sin el filtro que pidieron.
    for (const t of TOOLS) {
      const props = Object.keys(t.inputSchema?.properties || {});
      if (!props.length) continue;
      const fuente = t.args.toString();
      for (const campo of props) {
        expect(fuente, `${t.name} declara "${campo}" pero args() no lo lee`)
          .toContain(campo);
      }
    }
  });

  it('lo obligatorio del schema está entre lo declarado', () => {
    for (const t of TOOLS) {
      for (const req of t.inputSchema?.required || []) {
        expect(Object.keys(t.inputSchema.properties || {}),
          `${t.name} exige "${req}" sin declararlo`).toContain(req);
      }
    }
  });

  it('siguen siendo todas de lectura', () => {
    // El servidor MCP es de solo lectura por decisión, no por casualidad.
    // Lo que escribe pasa por agente_proponer_accion, que congela el payload
    // y espera autorización. Si algún día se cuela aquí una RPC que escribe,
    // esta prueba lo dice antes de que se despliegue.
    const escriben = /^mcp_(crear|guardar|grabar|anular|borrar|eliminar|registrar|actualizar|pagar)/;
    for (const t of TOOLS) {
      expect(t.rpc, `${t.rpc} suena a que escribe`).not.toMatch(escriben);
    }
  });
});
