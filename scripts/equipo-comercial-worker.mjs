// ============================================================
// El Comercial-Creativo, trabajando
// ------------------------------------------------------------
// Hasta ahora había una ficha de puesto y una cola vacía. Esto es
// el empleado: toma de la cola, redacta, y contesta.
//
//   npm run equipo:comercial
//
// >>> LOS TRES MOTORES <<<
// Los elige la BASE, no este archivo. Se lee la configuración del
// agente en CADA mensaje, así que cambiar de motor es un UPDATE y
// no hace falta reiniciar nada.
//
//   claude_suscripcion  Claude Code en esta máquina, con TU cuenta.
//                       No necesita clave de API.
//   claude              API de Anthropic. Necesita ANTHROPIC_API_KEY.
//   openai              API de OpenAI. Necesita OPENAI_API_KEY.
//
// >>> DÓNDE CORRE ESTO <<<
// Con la suscripción, donde esté Claude Code instalado y con sesión
// iniciada: tu PC o el VPS. No es un servicio en la nube — si la
// máquina está apagada, el trabajo se queda en cola y se VE que se
// queda. Eso es a propósito: mejor parado y visible que contestado
// por otro sin avisar.
//
// >>> LO QUE ESTE PROCESO NO PUEDE HACER <<<
// No publica. No manda mensajes a clientes. No aprueba. No consulta
// MotoFlow — los precios y existencias le llegan verificados por
// Jarvis dentro del payload. Eso no depende de su buena voluntad:
// no tiene ni las credenciales ni las funciones para hacerlo.
// ============================================================

import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(import.meta.dirname, '..');
const require_ = createRequire(path.join(RAIZ, 'package.json'));
const { Client } = require_('pg');

try { process.loadEnvFile(path.join(RAIZ, 'scripts/migracion-siif/.env')); } catch { /* opcional */ }

const AGENTE = 'comercial_creativo';
const ESPERA_VACIO_MS = Number(process.env.EQUIPO_ESPERA_MS || 8000);
// El comando de Claude Code, configurable: sus banderas pueden cambiar y
// no quiero que eso obligue a editar este archivo. El prompt entra por
// stdin, no como argumento — un copy con el catálogo dentro pasa de largo
// el límite de longitud de la línea de comandos.
const CLAUDE_CMD  = process.env.CLAUDE_CMD  || 'claude';
const CLAUDE_ARGS = (process.env.CLAUDE_ARGS || '-p').split(' ').filter(Boolean);

const DSN = {
  host: process.env.EQUIPO_DB_HOST || 'aws-0-us-east-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: process.env.EQUIPO_DB_USER || 'hermes_readonly.zdvxowpuklbypweyqqki',
  password: process.env.HERMES_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

if (!DSN.password) {
  console.log(`
  Falta la clave de la base.

    $env:HERMES_DB_PASSWORD = "la-clave"          (PowerShell)
    HERMES_DB_PASSWORD=la-clave npm run equipo:comercial   (bash)

  No se guarda en el repo a proposito.
`);
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── La base ────────────────────────────────────────────────────────────
// Una transacción por operación y READ WRITE explícito: el rol es de solo
// lectura por defecto y estas funciones escriben.
const conectar = async () => { const c = new Client(DSN); await c.connect(); return c; };

const escribir = async (cli, sql, params) => {
  await cli.query('BEGIN');
  await cli.query('SET TRANSACTION READ WRITE');
  try {
    const r = await cli.query(sql, params);
    await cli.query('COMMIT');
    return r;
  } catch (e) { await cli.query('ROLLBACK'); throw e; }
};

// ── El prompt ──────────────────────────────────────────────────────────
// Las políticas se le enseñan como reglas, no se le piden por favor. Y los
// datos van marcados como verificados: es lo único que puede citar.
const armarPrompt = (cfg, msg) => {
  const p = cfg.politicas || {};
  const reglas = [
    p.solo_productos_activos && 'Solo productos activos.',
    p.nunca_inventar_precio_ni_existencia
      && 'NUNCA inventes precio ni existencia. Si un dato no viene abajo, dilo y no lo rellenes.',
    p.promocion_diaria_max_productos
      && `Maximo ${p.promocion_diaria_max_productos} productos por promocion.`,
    p.promocion_un_producto_mayor_a
      && `Prioriza un producto de mas de RD$${p.promocion_un_producto_mayor_a} y otro de mas de RD$${p.promocion_otro_producto_mayor_a}.`,
    p.preferir_promocionables_que_necesitan_empuje && 'Prefiere lo que necesita empuje, no lo que ya sale solo.',
    Array.isArray(p.no_promover_como_principal) && p.no_promover_como_principal.length
      && `No uses como producto principal: ${p.no_promover_como_principal.join(', ')}.`,
    p.no_repetir_propuestos_dias
      && `No repitas productos propuestos en los ultimos ${p.no_repetir_propuestos_dias} dias si hay alternativa.`,
    p.publicar_codigo_interno === false && 'No publiques el codigo interno salvo que te lo pidan.',
    p.exigir_foto_real && 'Exige foto real del producto. Si falta, avisalo como advertencia.',
    p.respetar_zona_segura_9_16 && 'En historias 9:16 respeta la zona segura: nada de texto cortado en los bordes.',
    'No publicas ni envias nada. Entregas un borrador para que lo revisen.',
  ].filter(Boolean);

  const datos = msg.payload && Object.keys(msg.payload).length
    ? JSON.stringify(msg.payload, null, 1)
    : '(no llegaron datos verificados)';

  return [
    cfg.persona || 'Preparas contenido comercial para una tienda de repuestos.',
    '',
    '## Reglas de la empresa',
    ...reglas.map((r) => `- ${r}`),
    '',
    '## Lo que te pide Hermes',
    msg.summary,
    '',
    '## Datos VERIFICADOS por Jarvis',
    'Esto salio de la base de MotoFlow. Es lo unico que puedes citar como precio o existencia.',
    '```json', datos, '```',
    '',
    '## Como contestar',
    'Devuelve SOLO un JSON con esta forma, sin texto alrededor:',
    '{"resumen":"una linea","propuesta":"...","copy":{"whatsapp":"...","instagram":"...","facebook":"..."},',
    ' "canal_sugerido":"...","requerimientos_visuales":["..."],"advertencias":["..."],"estado":"borrador"}',
  ].join('\n');
};

// ── Los motores ────────────────────────────────────────────────────────
const porClaudeCode = (prompt) => new Promise((resolve, reject) => {
  const hijo = spawn(CLAUDE_CMD, CLAUDE_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  let salida = '', err = '';
  hijo.stdout.on('data', (d) => { salida += d; });
  hijo.stderr.on('data', (d) => { err += d; });
  hijo.on('error', (e) => reject(new Error(
    `No se pudo ejecutar "${CLAUDE_CMD}": ${e.message}. `
    + 'Instala Claude Code en esta maquina e inicia sesion, o cambia CLAUDE_CMD.')));
  hijo.on('close', (code) => {
    if (code !== 0) return reject(new Error(`Claude Code salio con codigo ${code}: ${err.slice(0, 400)}`));
    resolve(salida.trim());
  });
  hijo.stdin.write(prompt);
  hijo.stdin.end();
});

const porApi = async (cfg, prompt) => {
  if (cfg.proveedor === 'claude') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Falta ANTHROPIC_API_KEY para el proveedor "claude".');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.modelo || 'claude-haiku-4-5-20251001',
        max_tokens: cfg.max_tokens || 800,
        temperature: Number(cfg.temperatura ?? 0.6),
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY para el proveedor "openai".');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.modelo || 'gpt-4o-mini',
      max_tokens: cfg.max_tokens || 800,
      temperature: Number(cfg.temperatura ?? 0.6),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
};

// El modelo devuelve texto; a veces con la valla de markdown alrededor. Si
// no es JSON válido no se descarta: se entrega como texto y se marca. Que
// el borrador llegue mal formado es un problema; que se pierda, dos.
const leerRespuesta = (texto) => {
  const limpio = String(texto || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return { ok: true, datos: JSON.parse(limpio) }; }
  catch { return { ok: false, datos: { resumen: limpio.slice(0, 200), texto: limpio, estado: 'borrador', formato: 'texto_libre' } }; }
};

// ── El ciclo ───────────────────────────────────────────────────────────
let corriendo = true;
process.on('SIGINT', () => { corriendo = false; log('parando…'); });

const cli = await conectar();
log(`worker de ${AGENTE} conectado`);

const { rows: [{ cfg }] } = await cli.query(
  'SELECT hermes.equipo_agente_config($1) AS cfg', [AGENTE]);
if (!cfg) { log('ese agente no esta registrado. Corre sql/equipo_ia.sql.'); process.exit(1); }
log(`motor: ${cfg.proveedor}${cfg.modelo ? ' · ' + cfg.modelo : ''}`);

while (corriendo) {
  let msg;
  try {
    const r = await escribir(cli, 'SELECT * FROM hermes.equipo_tomar($1, 1)', [AGENTE]);
    msg = r.rows[0];
  } catch (e) { log('error tomando de la cola:', e.message); await new Promise((s) => setTimeout(s, 15000)); continue; }

  if (!msg) { await new Promise((s) => setTimeout(s, ESPERA_VACIO_MS)); continue; }

  log(`tomado ${msg.id} · ${msg.summary}`);

  // Se relee en cada mensaje: cambiar de motor no exige reiniciar.
  const { rows: [{ cfg: actual }] } = await cli.query(
    'SELECT hermes.equipo_agente_config($1) AS cfg', [AGENTE]);

  // Renovar mientras piensa. El arrendamiento es de 15 min y una promo con
  // copy y concepto de arte puede pasarse.
  const renovar = setInterval(() => {
    escribir(cli, 'SELECT hermes.equipo_renovar($1,$2)', [msg.id, msg.claim_token])
      .catch((e) => log('no se pudo renovar:', e.message));
  }, 5 * 60 * 1000);

  try {
    const prompt = armarPrompt(actual, msg);
    const bruto = actual.proveedor === 'claude_suscripcion'
      ? await porClaudeCode(prompt)
      : await porApi(actual, prompt);

    const { ok, datos } = leerRespuesta(bruto);
    if (!ok) log('  (contesto en texto libre, no JSON — se entrega igual)');

    const r = await escribir(cli,
      'SELECT hermes.equipo_responder($1,$2,$3,$4::jsonb) AS r',
      [msg.id, msg.claim_token, String(datos.resumen || 'borrador listo').slice(0, 200),
       JSON.stringify({ ...datos, motor: actual.proveedor, modelo: actual.modelo || null })]);

    const res = r.rows[0].r;
    if (res?.abandonar) log('  el claim ya era de otro: se descarta');
    else log(`  respondido${res?.duplicado ? ' (ya estaba)' : ''}`);
  } catch (e) {
    log('  fallo:', e.message);
    await escribir(cli, 'SELECT hermes.equipo_error($1,$2,$3)',
      [msg.id, msg.claim_token, e.message]).catch(() => {});
  } finally {
    clearInterval(renovar);
  }
}

await cli.end();
log('parado.');
