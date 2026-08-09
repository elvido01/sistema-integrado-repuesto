// ============================================================
// motoflow-mcp — Servidor MCP de MotoFlow
// ------------------------------------------------------------
// Expone el sistema como herramientas que cualquier cliente de IA puede
// llamar: Claude, ChatGPT, el propio Hermes. Habla JSON-RPC 2.0 sobre HTTP,
// que es el transporte "streamable HTTP" del protocolo.
//
// >>> POR QUE ESTO SI Y INSTAGRAM NO <<<
// Un MCP es un envoltorio, no un permiso. Contra Instagram no servia de
// nada porque el muro lo pone Meta. Aqui los datos son del negocio, asi que
// no hay a quien pedirle permiso.
//
// >>> LA EMPRESA SALE DE LA SESION <<<
// Se usa el token DEL USUARIO, nunca el service_role. Cada RPC resuelve su
// tenant con get_user_tenant(), asi que un modelo no puede pedir datos de
// otra empresa ni inventandose parametros: no hay donde ponerlos.
//
// >>> SOLO LECTURA <<<
// v1 no escribe. Una IA equivocada leyendo da un dato malo; escribiendo
// mueve inventario y plata.
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const VERSION = '1.0.0';
const PROTOCOL = '2024-11-05';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, mcp-session-id',
};

// ── Las herramientas ────────────────────────────────────────
// La 'description' no es adorno: es lo unico que el modelo lee para decidir
// si llama esta herramienta o no. Dice cuando usarla, no solo que hace.
const TOOLS = [
  {
    name: 'buscar_piezas',
    description:
      'Busca repuestos en el inventario por descripcion, marca o modelo y devuelve precio y EXISTENCIA REAL. ' +
      'Usala siempre que alguien pregunte si hay una pieza, cuanto cuesta o si sirve para una motocicleta. ' +
      'Nunca respondas de memoria sobre precios o existencias: consultala.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Lo que pide el cliente, tal cual. Ej: "cigueñal g2 vini", "goma trasera TVS 125"' },
        limite: { type: 'integer', description: 'Cuantas piezas devolver (1-25, por defecto 8)' },
      },
      required: ['texto'],
    },
    rpc: 'mcp_buscar_piezas',
    args: (a) => ({ p_texto: String(a.texto || ''), p_limite: a.limite ?? 8 }),
  },
  {
    name: 'ver_pieza',
    description:
      'Devuelve el detalle de UNA pieza por su codigo exacto: precio, existencia, ubicacion en almacen, ITBIS y garantia. ' +
      'Usala cuando ya sabes el codigo; si solo tienes la descripcion, usa buscar_piezas.',
    inputSchema: {
      type: 'object',
      properties: { codigo: { type: 'string', description: 'Codigo del producto' } },
      required: ['codigo'],
    },
    rpc: 'mcp_ver_pieza',
    args: (a) => ({ p_codigo: String(a.codigo || '') }),
  },
  {
    name: 'estado_cliente',
    description:
      'Situacion de un cliente: facturas pendientes, cuanto debe y prestamos activos. Busca por nombre, cedula o codigo. ' +
      'Si hay varios parecidos devuelve la lista para que preguntes cual, en vez de adivinar.',
    inputSchema: {
      type: 'object',
      properties: { busqueda: { type: 'string', description: 'Nombre, cedula/RNC o codigo del cliente' } },
      required: ['busqueda'],
    },
    rpc: 'mcp_estado_cliente',
    args: (a) => ({ p_busqueda: String(a.busqueda || '') }),
  },
  {
    name: 'resumen_dia',
    description:
      'Como va el dia: cantidad de facturas, total vendido, recibos cobrados (y cuanto en efectivo), gastos y prestamos ' +
      'desembolsados en efectivo. Lo ANULADO no cuenta. Sin fecha, usa hoy.',
    inputSchema: {
      type: 'object',
      properties: { fecha: { type: 'string', description: 'Fecha AAAA-MM-DD. Vacio = hoy' } },
    },
    rpc: 'mcp_resumen_dia',
    args: (a) => ({ p_fecha: a.fecha || null }),
  },
  {
    name: 'buscar_ayuda',
    description:
      'Explica COMO SE USA MotoFlow: en que modulo se hace cada cosa y los pasos. ' +
      'Usala siempre que pregunten "como hago...", "donde se registra...", "por que no me deja...", ' +
      'o cuando alguien no encuentre una pantalla. Devuelve tambien la clave del modulo, ' +
      'asi que despues de responder ofrece abrirlo con abrir_modulo. ' +
      'Si no devuelve nada, di que no lo sabes: NO inventes pasos.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'La duda tal cual la dijeron. Ej: "como registro un abono", "no me deja rebajar el precio"' },
        limite: { type: 'integer', description: 'Cuantas entradas devolver (1-10, por defecto 4)' },
      },
      required: ['texto'],
    },
    rpc: 'mcp_buscar_ayuda',
    args: (a) => ({ p_texto: String(a.texto || ''), p_limite: a.limite ?? 4 }),
  },
];

const rpcResponse = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json(rpcError(null, -32600, 'Solo se acepta POST'), 405);

  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();

  let body: any;
  try { body = await req.json(); } catch { return json(rpcError(null, -32700, 'JSON invalido'), 400); }

  const { id = null, method, params } = body || {};

  // 'initialize' y 'tools/list' no tocan datos: se contestan sin sesion para
  // que el cliente pueda descubrir el servidor antes de autenticarse.
  if (method === 'initialize') {
    return json(rpcResponse(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: 'motoflow', version: VERSION },
      instructions:
        'Herramientas del sistema MotoFlow (repuestos de motocicletas, Republica Dominicana). ' +
        'Los precios estan en pesos dominicanos. NUNCA inventes precios ni existencias: consultalos con buscar_piezas. ' +
        'Si una pieza aparece con existencia 0, dilo claro; no la ofrezcas como disponible.',
    }));
  }

  // Las notificaciones no llevan respuesta (no traen id).
  if (String(method || '').startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  if (method === 'tools/list') {
    return json(rpcResponse(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    }));
  }

  if (method === 'tools/call') {
    if (!token) return json(rpcError(id, -32001, 'Falta el token de sesion de MotoFlow'), 401);

    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return json(rpcError(id, -32602, `No existe la herramienta "${params?.name}"`));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false } },
    );

    try {
      const { data, error } = await supabase.rpc(tool.rpc, tool.args(params?.arguments || {}));
      if (error) {
        // isError deja que el modelo LEA el fallo y reaccione (pedir un dato,
        // reintentar) en vez de romper la conversacion entera.
        return json(rpcResponse(id, {
          content: [{ type: 'text', text: `Error consultando MotoFlow: ${error.message}` }],
          isError: true,
        }));
      }
      return json(rpcResponse(id, {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      }));
    } catch (e) {
      return json(rpcResponse(id, {
        content: [{ type: 'text', text: `Error: ${e?.message || String(e)}` }],
        isError: true,
      }));
    }
  }

  return json(rpcError(id, -32601, `Metodo no soportado: ${method}`));
});
