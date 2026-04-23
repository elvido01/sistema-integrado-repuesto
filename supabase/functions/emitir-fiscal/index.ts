// @ts-nocheck
// deno-lint-ignore-file
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ── Adaptadores por proveedor ──

async function alegraFetch(path, method, user, token, payload) {
  const basic = btoa(`${user}:${token}`);
  const resp = await fetch(`https://api.alegra.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Alegra ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function alegraTestConnection(config) {
  const result = await alegraFetch("/companies", "GET", config.user, config.token);
  return { ok: true, company: result.name || result.id };
}

async function alegraGetOrCreateContact(supabase, config, cliente) {
  // Si ya tiene fiscal_contact_id, retornarlo
  if (cliente.fiscal_contact_id) return cliente.fiscal_contact_id;

  const payload = {
    name: [{ firstName: cliente.nombre }],
    identification: cliente.rnc || undefined,
    phonePrimary: cliente.telefono || undefined,
    email: cliente.email || undefined,
    address: { address: cliente.direccion || undefined },
    type: ["client"],
  };

  const resp = await alegraFetch("/contacts", "POST", config.user, config.token, payload);
  const contactId = String(resp.id);

  // Guardar fiscal_contact_id en clientes
  await supabase
    .from("clientes")
    .update({ fiscal_contact_id: contactId, updated_at: new Date().toISOString() })
    .eq("id", cliente.id);

  return contactId;
}

async function alegraEmitirFactura(supabase, config, factura, detalles, cliente) {
  // 1. Obtener/crear contacto
  let contactId = null;
  if (cliente && cliente.id !== "00000000-0000-0000-0000-000000000000") {
    contactId = await alegraGetOrCreateContact(supabase, config, cliente);
  }

  // 2. Preparar líneas
  const items = detalles.map((d) => ({
    name: d.descripcion || "Producto",
    quantity: d.cantidad,
    price: d.precio,
    discount: d.descuento_monto || 0,
    tax: [{ percentage: (d.itbis_pct || 0.18) * 100 }],
  }));

  // 3. Crear factura
  const invoicePayload = {
    date: new Date(factura.fecha).toISOString().split("T")[0],
    dueDate: factura.forma_pago === "CREDITO"
      ? new Date(new Date(factura.fecha).getTime() + (factura.dias_credito || 30) * 86400000).toISOString().split("T")[0]
      : new Date(factura.fecha).toISOString().split("T")[0],
    client: contactId ? { id: contactId } : undefined,
    items,
    paymentMethod: factura.forma_pago === "CONTADO" ? "cash" : "credit",
    observations: factura.notas || "",
  };

  const resp = await alegraFetch("/invoices", "POST", config.user, config.token, invoicePayload);

  return {
    proveedor_invoice_id: String(resp.id || ""),
    proveedor_number: resp.numberTemplate?.fullNumber || resp.number || null,
    ncf: resp.stamp?.trackId || null,
    response_payload: resp,
    request_payload: invoicePayload,
  };
}

// ── Proveedores registrados ──
const ADAPTADORES = {
  alegra: {
    testConnection: alegraTestConnection,
    emitirFactura: alegraEmitirFactura,
  },
  // factura_digital: {
  //   testConnection: facturaDigitalTestConnection,
  //   emitirFactura: facturaDigitalEmitirFactura,
  // },
};

// ── Handler principal ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar usuario autenticado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Token inválido");

    // Obtener tenant del usuario
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) throw new Error("Usuario sin tenant");
    const tenantId = profile.tenant_id;

    // ── ACTION: test_connection ──
    if (action === "test_connection") {
      const { proveedor, config } = body;
      const adaptador = ADAPTADORES[proveedor];
      if (!adaptador) throw new Error(`Proveedor '${proveedor}' no soportado`);

      const result = await adaptador.testConnection(config);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── ACTION: emitir_factura ──
    if (action === "emitir_factura") {
      const { factura_id } = body;
      if (!factura_id) throw new Error("factura_id es requerido");

      // 1. Cargar integración del tenant
      const { data: integ, error: integError } = await supabase
        .from("integraciones_fiscales")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activo", true)
        .single();

      if (integError || !integ) {
        throw new Error("No hay integración fiscal activa para esta empresa");
      }

      const adaptador = ADAPTADORES[integ.proveedor];
      if (!adaptador) throw new Error(`Proveedor '${integ.proveedor}' no soportado`);

      // 2. Cargar factura
      const { data: factura, error: facturaError } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id)
        .eq("tenant_id", tenantId)
        .single();

      if (facturaError || !factura) throw new Error("Factura no encontrada");

      // 3. Verificar que no esté ya emitida
      const { data: existingDoc } = await supabase
        .from("documentos_fiscales")
        .select("id, estado")
        .eq("factura_id", factura_id)
        .eq("estado", "emitido")
        .maybeSingle();

      if (existingDoc) {
        throw new Error("Esta factura ya tiene un documento fiscal emitido");
      }

      // 4. Cargar detalles
      const { data: detalles } = await supabase
        .from("facturas_detalle")
        .select("*")
        .eq("factura_id", factura_id);

      if (!detalles?.length) throw new Error("Factura sin detalle");

      // 5. Cargar cliente
      let cliente = null;
      if (factura.cliente_id) {
        const { data: clienteData } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", factura.cliente_id)
          .single();
        cliente = clienteData;
      }

      // 6. Crear registro pendiente
      const { data: docFiscal, error: docError } = await supabase
        .from("documentos_fiscales")
        .insert({
          tenant_id: tenantId,
          factura_id: factura.id,
          proveedor: integ.proveedor,
          tipo_documento: "factura",
          estado: "procesando",
        })
        .select()
        .single();

      if (docError) throw new Error(`Error creando documento fiscal: ${docError.message}`);

      // 7. Emitir via adaptador
      try {
        const resultado = await adaptador.emitirFactura(
          supabase, integ.config, factura, detalles, cliente
        );

        // 8. Actualizar como emitido
        await supabase
          .from("documentos_fiscales")
          .update({
            estado: "emitido",
            proveedor_invoice_id: resultado.proveedor_invoice_id,
            proveedor_number: resultado.proveedor_number,
            ncf: resultado.ncf,
            request_payload: resultado.request_payload,
            response_payload: resultado.response_payload,
            emitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", docFiscal.id);

        return new Response(JSON.stringify({
          ok: true,
          factura_id: factura.id,
          proveedor_invoice_id: resultado.proveedor_invoice_id,
          proveedor_number: resultado.proveedor_number,
          ncf: resultado.ncf,
        }), { status: 200, headers: corsHeaders });

      } catch (emitError) {
        // Marcar como error
        await supabase
          .from("documentos_fiscales")
          .update({
            estado: "error",
            error_message: emitError.message,
            retry_count: (docFiscal.retry_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", docFiscal.id);

        throw emitError;
      }
    }

    throw new Error(`Acción '${action}' no reconocida. Use: test_connection, emitir_factura`);

  } catch (error) {
    console.error("[emitir-fiscal]", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    }), { status: 400, headers: corsHeaders });
  }
});
