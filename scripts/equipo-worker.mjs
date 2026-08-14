// ============================================================
// Los agentes del Equipo IA, trabajando
// ------------------------------------------------------------
// Hasta ahora había fichas de puesto y colas vacías. Esto es el
// empleado: toma de su cola, hace lo suyo, y contesta.
//
//   npm run equipo:comercial     el Comercial-Creativo
//   npm run equipo:jarvis        Jarvis por la cola del equipo
//
// >>> OJO CON JARVIS <<<
// Jarvis vive en DOS sitios y solo uno es este. El del widget de
// MotoFlow es la Edge Function motoflow-ai-chat: sincrona, la llama
// el navegador y atiende a cualquiera que entre. Esa NO puede usar
// una suscripcion —no hay cuenta con la que autenticarse— y se
// queda con clave de API.
//
// Este worker es el otro: la cola del Equipo IA, asincrona, en una
// maquina tuya. Aqui si vale la suscripcion. Los dos Jarvis leen la
// misma ficha, asi que pueden tener motores distintos a proposito.
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
// >>> EL AGENTE TIENE SU PROPIA CUENTA <<<
// Con la suscripción, la cuenta NO sale de la base: sale de la sesión de
// Claude Code de la máquina donde corre esto. Por eso el agente usa un
// directorio aparte —~/.claude-agente— y no el tuyo:
//
//   ~/.claude          la cuenta con la que TÚ trabajas en VS Code
//   ~/.claude-agente   la cuenta que atiende la cola
//
// Así el consumo del agente no se come tu cuota, se ve en qué cuenta va
// el gasto, y cerrar sesión en una no deja muda a la otra. Se prepara una
// sola vez con `npm run equipo:login`.
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
import { hostname } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { CONFIG_DIR, resolverClaude, entorno, cuenta, comoIniciarSesion } from './claude-agente.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const require_ = createRequire(path.join(RAIZ, 'package.json'));
const { Client } = require_('pg');

try { process.loadEnvFile(path.join(RAIZ, 'scripts/migracion-siif/.env')); } catch { /* opcional */ }

const AGENTES_VALIDOS = ['comercial_creativo', 'jarvis', 'hermes'];
const AGENTE = process.argv[2] || process.env.EQUIPO_AGENTE || 'comercial_creativo';
if (!AGENTES_VALIDOS.includes(AGENTE)) {
  console.log(`Agente desconocido: ${AGENTE}. Usa uno de: ${AGENTES_VALIDOS.join(', ')}`);
  process.exit(1);
}
const ESPERA_VACIO_MS = Number(process.env.EQUIPO_ESPERA_MS || 8000);
// El comando de Claude Code, configurable: sus banderas pueden cambiar y
// no quiero que eso obligue a editar este archivo. El prompt entra por
// stdin, no como argumento — un copy con el catálogo dentro pasa de largo
// el límite de longitud de la línea de comandos.
const { cmd: CLAUDE_CMD, origen: CLAUDE_ORIGEN } = resolverClaude();
const CLAUDE_ARGS = (process.env.CLAUDE_ARGS || '-p').split(' ').filter(Boolean);

// EQUIPO_DB_URL manda si está puesta: una cadena de conexión completa es
// lo que permite mover el worker a otro rol o a otro pooler sin tocar
// este archivo. Si no está, se arma con las piezas de siempre.
const DSN = process.env.EQUIPO_DB_URL
  ? { connectionString: process.env.EQUIPO_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 }
  : {
    host: process.env.EQUIPO_DB_HOST || 'aws-0-us-east-2.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: process.env.EQUIPO_DB_USER || 'hermes_readonly.zdvxowpuklbypweyqqki',
    password: process.env.HERMES_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  };

if (!process.env.EQUIPO_DB_URL && !DSN.password) {
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
// lectura por defecto y estas funciones escriben. Eso NO es un permiso que
// falte —`SET TRANSACTION READ WRITE` lo levanta— sino un cinturón: si
// algún día alguien manda un UPDATE suelto fuera de estas funciones, la
// transacción lo rechaza.
//
// >>> POR QUÉ ESTO SE RECONECTA (2026-08-14) <<<
// Antes había UN cliente para toda la vida del proceso, sin reconexión y
// sin oyente de 'error'. El pooler cierra las conexiones ociosas, y el
// worker no se enteraba: latía bien durante horas y de golpe dejaba de
// latir y de tomar trabajo, con el proceso vivo. Desde fuera parecía un
// problema de permisos —la cola no avanzaba y el log se llenaba de
// errores— y no lo era.
//
// Un proceso que sigue en pie sin poder trabajar es peor que uno caído: al
// caído lo levanta el supervisor.
let cli = null;

const conectar = async () => {
  const c = new Client(DSN);
  // Sin este oyente, un corte de conexión tumba el proceso con un error no
  // capturado. Con él, se marca muerto y la siguiente operación reconecta.
  c.on('error', (e) => { log('conexión perdida:', e.message); if (cli === c) cli = null; });
  await c.connect();
  return c;
};

const cliente = async () => {
  if (cli) return cli;
  cli = await conectar();
  return cli;
};

// Errores que significan "esta conexión ya no sirve", no "esta consulta
// está mal". Solo con estos se reintenta: repetir una consulta que falló
// por su propio contenido sería un bucle.
const conexionMuerta = (e) => /terminat|ECONNRESET|EPIPE|ENOTFOUND|ETIMEDOUT|closed|shutdown|not queryable/i
  .test(String(e?.message ?? ''));

const conConexion = async (fn) => {
  for (let intento = 1; intento <= 2; intento += 1) {
    const c = await cliente();
    try {
      return await fn(c);
    } catch (e) {
      if (!conexionMuerta(e) || intento === 2) throw e;
      log('reconectando a la base…');
      try { await c.end(); } catch { /* ya estaba rota */ }
      cli = null;
    }
  }
  throw new Error('inalcanzable');
};

const consultar = (sql, params) => conConexion((c) => c.query(sql, params));

// BEGIN y SET van DENTRO del try, y esto no es cosmético. Estaban fuera, y
// si `SET TRANSACTION READ WRITE` fallaba no se hacía ROLLBACK: la
// transacción quedaba abierta y abortada, y desde ese momento CUALQUIER
// consulta en esa conexión respondía "current transaction is aborted".
// El worker quedaba mudo para siempre con el proceso en pie — un error de
// un segundo se convertía en una avería permanente.
const escribir = (sql, params) => conConexion(async (c) => {
  try {
    await c.query('BEGIN');
    await c.query('SET TRANSACTION READ WRITE');
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    // El ROLLBACK no puede tapar el error original si él mismo falla.
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  }
});

// ── ¿PUEDE ESCRIBIR DE VERDAD? ─────────────────────────────────────────
// Se comprueba al arrancar y no a la primera tarea. Si la conexión es de
// solo lectura irremediable —una réplica, o un rol al que no se le deja
// subir la transacción— hay que decirlo UNA vez y parar, no descubrirlo
// mil veces en el log mientras la cola se queda quieta.
const comprobarEscritura = async () => {
  const { rows: [r] } = await consultar(
    `SELECT current_user AS rol, pg_is_in_recovery() AS replica`);
  let escribe = false;
  try {
    await conConexion(async (c) => {
      try {
        await c.query('BEGIN');
        await c.query('SET TRANSACTION READ WRITE');
        const { rows: [t] } = await c.query(
          `SELECT current_setting('transaction_read_only') AS ro`);
        escribe = t.ro === 'off';
      } finally {
        await c.query('ROLLBACK').catch(() => {});
      }
    });
  } catch (e) { log('no se pudo comprobar la escritura:', e.message); }

  if (!escribe) {
    console.log(`
  La conexión de la base NO permite escribir.

    rol conectado : ${r.rol}
    ¿es réplica?  : ${r.replica ? 'sí' : 'no'}

  El worker necesita escribir para latir, tomar de la cola y guardar la
  respuesta. ${r.replica
    ? 'Está apuntando a una réplica de solo lectura: hay que usar el endpoint principal.'
    : 'Pon EQUIPO_DB_URL con un rol al que se le permita subir la transacción a escritura.'}

  No arranco: dar vueltas fallando llenaría el log y dejaría la cola
  parada sin que se vea por qué.
`);
    process.exit(1);
  }
  log(`base: ${r.rol} · escritura OK`);
};

// ── Lo que Jarvis consulta DE VERDAD ───────────────────────────────────
// El modelo NO busca: busca el SQL. Jarvis pregunta al catalogo con la
// funcion autorizada y el modelo solo ordena y redacta lo que salio.
//
// Esto no es desconfianza: es que "nunca inventes un precio" escrito en un
// prompt es una peticion, y esto es una garantia. Si la consulta no
// devuelve nada, no hay nada que el modelo pueda inventar porque no tiene
// de donde sacarlo.
const consultarCatalogo = async (texto) => {
  const q = String(texto || '').trim();
  if (!q) return [];
  try {
    const r = await consultar(
      'SELECT codigo, descripcion, marca, precio, existencia, ubicacion '
      + 'FROM hermes.buscar_producto($1, 8, false)', [q]);
    // Se anota qué preguntó y cuánto salió. Las búsquedas del agente son
    // las que vienen en lenguaje de cliente ("algo para que no se
    // recaliente"), justo las que peor resuelve la búsqueda por palabras:
    // sin registro no hay forma de saber cuántas se quedan en nada.
    // Va aparte y con el error tragado — anotar no puede tumbar una
    // respuesta a un cliente.
    escribir('SELECT public.registrar_busqueda($1,$2,$3)', ['agente', q, r.rows.length])
      .catch(() => {});
    return r.rows;
  } catch (e) {
    log('  no se pudo consultar el catalogo:', e.message);
    throw e;   // sin datos NO se contesta: se reporta el fallo
  }
};

const armarPromptJarvis = (cfg, msg, filas) => [
  cfg.persona || 'Eres el especialista de datos de MotoFlow. Devuelves datos verificables, no opiniones.',
  '',
  '## Lo que te pide Hermes',
  msg.summary,
  '',
  '## Lo que devolvio el catalogo AHORA MISMO',
  'Salio de hermes.buscar_producto sobre la base de MotoFlow, en este instante.',
  'Es lo UNICO que existe. No agregues productos, precios ni existencias que no esten aqui.',
  '```json', JSON.stringify(filas, null, 1), '```',
  '',
  '## Como contestar',
  filas.length
    ? 'Devuelve SOLO un JSON: {"resumen":"una linea","productos":[...],"fuente":"hermes.buscar_producto","nota":"..."}. '
      + 'En "productos" copia las filas tal cual, sin cambiar un numero.'
    : 'El catalogo no devolvio nada. Devuelve SOLO: {"resumen":"sin resultados","productos":[],'
      + '"fuente":"hermes.buscar_producto","nota":"que se busco y por que no hubo resultados"}.',
].join('\n');

// ── El prompt del creativo ─────────────────────────────────────────────
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
  // entorno() lleva CLAUDE_CONFIG_DIR: contesta la cuenta DEL AGENTE, no la
  // que tengas abierta en VS Code.
  const hijo = spawn(CLAUDE_CMD, CLAUDE_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: entorno(),
  });
  let salida = '', err = '';
  hijo.stdout.on('data', (d) => { salida += d; });
  hijo.stderr.on('data', (d) => { err += d; });
  hijo.on('error', (e) => reject(new Error(
    `No se pudo ejecutar "${CLAUDE_CMD}": ${e.message}. `
    + 'Instala Claude Code en esta maquina, o apunta CLAUDE_CMD a su ruta.')));
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

await comprobarEscritura();
log(`worker de ${AGENTE} conectado`);

const { rows: [{ cfg }] } = await consultar(
  'SELECT hermes.equipo_agente_config($1) AS cfg', [AGENTE]);
if (!cfg) { log('ese agente no esta registrado. Corre sql/equipo_ia.sql.'); process.exit(1); }
log(`motor: ${cfg.proveedor}${cfg.modelo ? ' · ' + cfg.modelo : ''}`);

// ── Con qué cuenta va a contestar ──────────────────────────────────────
// Se dice al arrancar y no se deduce después. La cuenta no está en la base
// —sale de la sesión de esta máquina— así que si no se imprime aquí, no
// hay ningún sitio donde mirarla.
//
// Y se comprueba ANTES de tomar trabajo: sin sesión, cada mensaje se
// tomaría solo para fallar, gastando un intento cada vez.
let cuentaClaude = null;
if (cfg.proveedor === 'claude_suscripcion') {
  log(`claude: ${CLAUDE_CMD} (${CLAUDE_ORIGEN})`);
  log(`casa:   ${CONFIG_DIR}`);
  const c = cuenta(CLAUDE_CMD);
  if (!c.ok) {
    log(`sin sesion de Claude para el agente. ${c.motivo || ''}`);
    console.log(comoIniciarSesion());
    if (cli) await cli.end().catch(() => {});
    process.exit(1);
  }
  log(`cuenta: ${c.email}${c.plan ? ' · ' + c.plan : ''}`);
  cuentaClaude = c;
}

// ── El latido ──────────────────────────────────────────────────────────
// La pantalla no puede saber sola si hay alguien atendiendo ni con qué
// cuenta: eso vive en esta máquina. Se lo decimos nosotros, cada minuto.
//
// Sin esto, guardar "Suscripción de Claude" en el módulo es una promesa
// sin comprobante — se ve el motor elegido y no se ve si contesta alguien.
// >>> Y UNA SEÑAL LOCAL, PARA EL VIGILANTE <<<
// Un vigilante que solo comprueba que el proceso existe no sirve: lo que
// pasó el 14/08 fue justo eso — proceso en pie, conexión muerta, cola
// parada dos horas y todos los PID correctos.
//
// Este archivo se toca SOLO si la base confirmó el latido. Así su fecha
// prueba el camino entero: conexión viva, transacción en escritura y
// función ejecutada. Si no cambia en varios minutos, el worker está mudo
// aunque respire, y hay que reiniciarlo.
//
// Se hace por archivo y no consultando la base para que el vigilante no
// necesite credenciales: un script de arranque con la clave de la base
// encima es superficie de ataque a cambio de nada.
const ARCHIVO_LATIDO = process.env.EQUIPO_LATIDO_FILE
  || path.join(RAIZ, `.latido-${AGENTE}`);

const latir = async () => {
  const cfgAhora = await consultar('SELECT hermes.equipo_agente_config($1) AS cfg', [AGENTE])
    .then((r) => r.rows[0]?.cfg).catch(() => null);
  try {
    await escribir('SELECT hermes.equipo_latido($1,$2,$3,$4,$5,$6,$7)', [
      AGENTE,
      cuentaClaude?.email || null,
      cuentaClaude?.plan || null,
      hostname(),
      cfgAhora?.proveedor || cfg.proveedor,
      cfgAhora?.modelo || cfg.modelo || null,
      process.version,
    ]);
    await writeFile(ARCHIVO_LATIDO, `${new Date().toISOString()}\n`).catch(() => {});
  } catch (e) {
    // A propósito NO se toca el archivo: que se quede viejo es la señal.
    log('no se pudo latir:', e.message);
  }
};

await latir();
const latido = setInterval(() => { latir(); }, 60 * 1000);

while (corriendo) {
  let msg;
  try {
    const r = await escribir('SELECT * FROM hermes.equipo_tomar($1, 1)', [AGENTE]);
    msg = r.rows[0];
  } catch (e) { log('error tomando de la cola:', e.message); await new Promise((s) => setTimeout(s, 15000)); continue; }

  if (!msg) { await new Promise((s) => setTimeout(s, ESPERA_VACIO_MS)); continue; }

  log(`tomado ${msg.id} · ${msg.summary}`);

  // Se relee en cada mensaje: cambiar de motor no exige reiniciar.
  const { rows: [{ cfg: actual }] } = await consultar(
    'SELECT hermes.equipo_agente_config($1) AS cfg', [AGENTE]);

  // Renovar mientras piensa. El arrendamiento es de 15 min y una promo con
  // copy y concepto de arte puede pasarse.
  const renovar = setInterval(() => {
    escribir('SELECT hermes.equipo_renovar($1,$2)', [msg.id, msg.claim_token])
      .catch((e) => log('no se pudo renovar:', e.message));
  }, 5 * 60 * 1000);

  try {
    let prompt;
    if (AGENTE === 'jarvis') {
      // El texto de la consulta sale del payload si Hermes lo mando
      // explicito; si no, del resumen de la peticion.
      const busca = msg.payload?.consulta || msg.payload?.texto || msg.summary;
      const filas = await consultarCatalogo(busca);
      log(`  catalogo: ${filas.length} resultado(s)`);
      prompt = armarPromptJarvis(actual, msg, filas);
    } else {
      prompt = armarPrompt(actual, msg);
    }
    const bruto = actual.proveedor === 'claude_suscripcion'
      ? await porClaudeCode(prompt)
      : await porApi(actual, prompt);

    const { ok, datos } = leerRespuesta(bruto);
    if (!ok) log('  (contesto en texto libre, no JSON — se entrega igual)');

    const r = await escribir(
      'SELECT hermes.equipo_responder($1,$2,$3,$4::jsonb) AS r',
      [msg.id, msg.claim_token, String(datos.resumen || 'borrador listo').slice(0, 200),
       JSON.stringify({ ...datos, motor: actual.proveedor, modelo: actual.modelo || null })]);

    const res = r.rows[0].r;
    if (res?.abandonar) log('  el claim ya era de otro: se descarta');
    else log(`  respondido${res?.duplicado ? ' (ya estaba)' : ''}`);
  } catch (e) {
    log('  fallo:', e.message);
    await escribir('SELECT hermes.equipo_error($1,$2,$3)',
      [msg.id, msg.claim_token, e.message]).catch(() => {});
  } finally {
    clearInterval(renovar);
  }
}

clearInterval(latido);
if (cli) await cli.end().catch(() => {});
log('parado.');
