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
// El catalogo vive aparte para que se pueda probar sin levantar el servidor:
// importar este archivo arranca un Deno.serve().
import { TOOLS } from './tools.ts';

// 1.1.0 — se le agregaron los cinco ojos del negocio: cartera, cuentas por
// pagar, ventas del periodo, piezas criticas y buscar documento. Siguen
// siendo todas de lectura.
const VERSION = '1.1.0';
const PROTOCOL = '2024-11-05';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, mcp-session-id',
};

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
