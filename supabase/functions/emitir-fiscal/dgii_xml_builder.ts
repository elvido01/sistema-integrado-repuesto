// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// Generador de XML para e-CF DGII
// ============================================================
// Implementa la estructura del e-CF segun el schema oficial v1.0
// publicado por DGII. Este archivo es importado por index.ts.
//
// Tipos soportados (en orden de implementacion):
//   ✅ 32 - Factura de Consumo (B2C, no requiere RNC del comprador)
//   ⏳ 31 - Factura de Credito Fiscal (B2B, RNC obligatorio)
//   ⏳ 33 - Nota de Debito
//   ⏳ 34 - Nota de Credito
//   ⏳ 41 - Compras
//   ⏳ 43 - Gastos Menores
//   ⏳ 44 - Regimen Especial
//   ⏳ 45 - Gubernamentales
//   ⏳ 46 - Comprobantes para Exportaciones
//   ⏳ 47 - Comprobantes para pagos al Exterior
//
// REFERENCIA OFICIAL:
//   - "Formato Comprobante Fiscal Electronico (e-CF) V 1.0" - DGII
//   - Schemas XSD por tipo en https://dgii.gov.do (seccion e-CF)
// ============================================================

// ────────────────────────────────────────────────
// Utilidades para escapar XML y formatear valores
// ────────────────────────────────────────────────
const xmlEscape = (s) => {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const fmtMoney = (n) => {
  // DGII pide hasta 2 decimales. Formato '0.00'
  const v = Number(n) || 0;
  return v.toFixed(2);
};

const fmtDate = (d) => {
  // DGII usa formato DD-MM-YYYY
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}-${month}-${year}`;
};

const normalizeDgiiDate = (d) => {
  if (d === null || d === undefined || d === "") return "";
  const raw = String(d).trim();
  let m = raw.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-20${m[3]}`;
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return raw;
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return fmtDate(d);
};

const fmtDateTime = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d || "");
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  const hours = String(dt.getHours()).padStart(2, "0");
  const minutes = String(dt.getMinutes()).padStart(2, "0");
  const seconds = String(dt.getSeconds()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
};

const fmtAcecfDate = (d) => {
  if (typeof d === "string" && /^\d{2}-\d{2}-\d{4}$/.test(d.trim())) return d.trim();
  return fmtDate(d);
};

const nowDgiiDateTime = () => {
  const now = new Date();
  const rd = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const day = String(rd.getUTCDate()).padStart(2, "0");
  const month = String(rd.getUTCMonth() + 1).padStart(2, "0");
  const year = rd.getUTCFullYear();
  const hours = String(rd.getUTCHours()).padStart(2, "0");
  const minutes = String(rd.getUTCMinutes()).padStart(2, "0");
  const seconds = String(rd.getUTCSeconds()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
};
const fechaVencimientoSecuenciaXml = (input) =>
  input.fecha_vencimiento_secuencia
    ? `<FechaVencimientoSecuencia>${xmlEscape(normalizeDgiiDate(input.fecha_vencimiento_secuencia))}</FechaVencimientoSecuencia>`
    : "";

const tag = (name, value, opts = {}) => {
  // Genera <Name>value</Name>. Si value es null/undefined/'', omite el tag
  // a menos que opts.always=true.
  if ((value === null || value === undefined || value === "") && !opts.always) {
    return "";
  }
  return `<${name}>${xmlEscape(value)}</${name}>`;
};

const isPositiveAmount = (value) => Number(value) > 0;

const retencionXml = (it) => {
  const hasItbis = isPositiveAmount(it.monto_itbis_retenido);
  const hasIsr = isPositiveAmount(it.monto_isr_retenido);
  if (!hasItbis && !hasIsr) return "";
  return `<Retencion>` +
    tag("IndicadorAgenteRetencionoPercepcion", it.indicador_agente_retencion) +
    (hasItbis ? tag("MontoITBISRetenido", it.monto_itbis_retenido) : "") +
    (hasIsr ? tag("MontoISRRetenido", it.monto_isr_retenido) : "") +
  `</Retencion>`;
};

const itemMontoBase = (it) => {
  if (it.monto_item != null) return Number(it.monto_item) || 0;
  const cantidad = Number(it.cantidad) || 0;
  const precio = Number(it.precio_unitario) || 0;
  const descuento = Number(it.descuento_monto) || 0;
  return Number((cantidad * precio - descuento).toFixed(2));
};

// Normaliza itbis_pct: acepta 0.18 (decimal) o 18 (porcentaje), siempre retorna decimal
const normalizeRateTo01 = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1 ? raw / 100 : raw;
};

const reconcileTotalesWithItems = (totales, items) => {
  if (!Array.isArray(items) || !items.length) return totales || {};
  const next = { ...(totales || {}) };

  // Fase 0.4: calcular el ITBIS sumando item por item con su itbis_pct real,
  // en lugar de hardcodear 0.18 sobre el gravado total. Esto:
  //  1) Respeta tasas mixtas (8% / 16% / 18%) si llegan
  //  2) Calcula igual al 18% cuando todos son 18% (caso actual)
  //  3) Evita drift de redondeo respecto al detalle linea por linea
  let montoGravado18 = 0;
  let itbis18 = 0;
  let montoExento = 0;

  for (const it of items) {
    const indicador = String(it.indicador_facturacion || "1");
    const base = itemMontoBase(it);
    if (indicador === "1") {
      const rate = normalizeRateTo01(it.itbis_pct ?? it.itbis_porcentaje ?? 0.18);
      montoGravado18 += base;
      itbis18 += Number((base * rate).toFixed(2));
    } else if (indicador === "4") {
      montoExento += base;
    }
  }

  itbis18 = Number(itbis18.toFixed(2));

  next.monto_gravado_total = Number(montoGravado18.toFixed(2));
  next.monto_gravado_18 = Number(montoGravado18.toFixed(2));
  next.monto_exento = Number(montoExento.toFixed(2));
  next.total_itbis_18 = montoGravado18 > 0 ? itbis18 : 0;
  next.monto_total = Number((montoGravado18 + montoExento + itbis18).toFixed(2));
  // itbis_total sin sufijo se elimina: DGII solo acepta TotalITBIS1 dentro de <Totales>
  return next;
};

const indicadorMontoGravado = () => "0";

const tipoIngresosXml = (input, fallback = "01") =>
  tag("TipoIngresos", input.tipo_ingresos || fallback);

// ────────────────────────────────────────────────
// Validaciones previas al XML — fail fast
// ────────────────────────────────────────────────
function validarAcecf(input) {
  const errs = [];
  if (!input.rnc_emisor) errs.push("rnc_emisor requerido");
  if (!input.encf) errs.push("encf requerido");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (input.monto_total == null || input.monto_total === "") errs.push("monto_total requerido");
  if (!input.rnc_comprador) errs.push("rnc_comprador requerido");
  if (!input.estado) errs.push("estado requerido (1 aceptado, 2 rechazado)");
  if (String(input.estado) === "2" && !input.detalle_motivo_rechazo) {
    errs.push("detalle_motivo_rechazo requerido cuando estado=2");
  }
  if (!input.fecha_hora_aprobacion_comercial) {
    errs.push("fecha_hora_aprobacion_comercial requerida");
  }
  if (errs.length) {
    const e = new Error("Validacion fallida (ACECF): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

export function buildAcecfXml(input) {
  validarAcecf(input);

  const estado = String(input.estado).trim();
  const motivo = estado === "2"
    ? `<DetalleMotivoRechazo>${xmlEscape(input.detalle_motivo_rechazo)}</DetalleMotivoRechazo>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<ACECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="ACECF.xsd">
  <DetalleAprobacionComercial>
    <Version>1.0</Version>
    <RNCEmisor>${xmlEscape(input.rnc_emisor)}</RNCEmisor>
    <eNCF>${xmlEscape(input.encf)}</eNCF>
    <FechaEmision>${xmlEscape(fmtAcecfDate(input.fecha_emision))}</FechaEmision>
    <MontoTotal>${fmtMoney(input.monto_total)}</MontoTotal>
    <RNCComprador>${xmlEscape(input.rnc_comprador)}</RNCComprador>
    <Estado>${xmlEscape(estado)}</Estado>
    ${motivo}
    <FechaHoraAprobacionComercial>${xmlEscape(fmtDateTime(input.fecha_hora_aprobacion_comercial))}</FechaHoraAprobacionComercial>
  </DetalleAprobacionComercial>
</ACECF>`.trim();
}

function validarTipo32(input) {
  const errs = [];
  if (!input.encf) errs.push("encf es requerido");
  if (!input.encf?.match(/^E\d{12}$/)) errs.push("encf debe tener formato E<tipo><10digitos>");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.emisor?.razon_social) errs.push("emisor.razon_social requerido");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido (array no vacio)");
  if (input.items?.length > 750) errs.push("Max 750 items por e-CF (DGII)");

  input.items?.forEach((it, i) => {
    if (!it.descripcion) errs.push(`items[${i}].descripcion requerido`);
    if (it.cantidad == null || it.cantidad <= 0) errs.push(`items[${i}].cantidad debe ser > 0`);
    if (it.precio_unitario == null) errs.push(`items[${i}].precio_unitario requerido`);
  });

  if (errs.length) {
    const e = new Error("Validacion fallida: " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

// ────────────────────────────────────────────────
// Tipo 32: Factura de Consumo (B2C)
// ────────────────────────────────────────────────
//
// Estructura del input esperado:
//   {
//     encf:           'E320000000001',   // ya generado por get_next_encf
//     fecha_emision:  Date | string,
//     fecha_vencimiento_secuencia: 'DD-MM-YYYY',  // del rango DGII
//
//     emisor: {
//       rnc:           '102000001',
//       razon_social:  'REPUESTOS MORLA SRL',
//       nombre_comercial: 'Repuestos Morla',  // opcional
//       direccion:     'Av. Duarte 100',
//       municipio:     'Higuey',
//       provincia:     'La Altagracia',
//       telefono:      ['809-555-1234'],
//       email:         'contacto@morla.do',
//     },
//
//     comprador: {                         // OPCIONAL en tipo 32
//       razon_social: 'CLIENTE GENERICO',  // si existe
//     },
//
//     items: [
//       {
//         descripcion:       'GOMA 110/70-12',
//         cantidad:           1,
//         unidad_medida:      'UND',     // codigo DGII (43 es UND)
//         precio_unitario:    500.00,
//         descuento_monto:    0,
//         indicador_facturacion: '1',    // '1'=gravado 18%, '2'=exento, etc
//         monto_item:         500.00,
//       },
//     ],
//
//     totales: {
//       monto_gravado_total: 500.00,
//       itbis_total:         90.00,
//       monto_total:         590.00,
//       total_itbis_18:      90.00,    // monto del ITBIS al 18%
//     },
//
//     forma_pago: '01',  // '01'=Efectivo, '02'=Cheque/Transf, '03'=Tarjeta, '04'=Credito, '05'=Bonos, '06'=Permuta, '07'=Otras
//   }
//

// Helper compartido: genera el bloque <DetallesItems> para tipo 31 y 32
function buildItemsXml(items) {
  return items.map((it, idx) => {
    const numeroLinea = idx + 1;
    const cantidad = Number(it.cantidad) || 0;
    const precio = Number(it.precio_unitario) || 0;
    const descuento = Number(it.descuento_monto) || 0;
    const monto = it.monto_item != null
      ? Number(it.monto_item)
      : Number((cantidad * precio - descuento).toFixed(2));

    return `
    <Item>
      <NumeroLinea>${numeroLinea}</NumeroLinea>
      ${tag("IndicadorFacturacion", it.indicador_facturacion || "1")}
      ${retencionXml(it)}
      ${tag("NombreItem", it.descripcion)}
      ${tag("IndicadorBienoServicio", it.indicador_bien_servicio || "1")}
      <CantidadItem>${cantidad}</CantidadItem>
      ${tag("UnidadMedida", it.unidad_medida || "43")}
      <PrecioUnitarioItem>${fmtMoney(precio)}</PrecioUnitarioItem>
      ${descuento > 0 ? `<DescuentoMonto>${fmtMoney(descuento)}</DescuentoMonto>` : ""}
      <MontoItem>${fmtMoney(monto)}</MontoItem>
    </Item>`.trim();
  }).join("\n    ");
}

// Helper compartido: genera el bloque <Totales>
function buildTotalesXml(t) {
  return `<Totales>
      ${t.monto_gravado_total ? `<MontoGravadoTotal>${fmtMoney(t.monto_gravado_total)}</MontoGravadoTotal>` : ""}
      ${t.monto_gravado_18 ? `<MontoGravadoI1>${fmtMoney(t.monto_gravado_18)}</MontoGravadoI1>` : ""}
      ${t.monto_exento ? `<MontoExento>${fmtMoney(t.monto_exento)}</MontoExento>` : ""}
      ${t.total_itbis_18 ? `<ITBIS1>18</ITBIS1>` : ""}
      ${t.total_itbis_18 ? `<TotalITBIS1>${fmtMoney(t.total_itbis_18)}</TotalITBIS1>` : ""}
      <MontoTotal>${fmtMoney(t.monto_total)}</MontoTotal>
      ${t.monto_periodo != null ? `<MontoPeriodo>${fmtMoney(t.monto_periodo)}</MontoPeriodo>` : ""}
      ${t.valor_pagar != null ? `<ValorPagar>${fmtMoney(t.valor_pagar)}</ValorPagar>` : ""}
      ${t.total_itbis_retenido ? `<TotalITBISRetenido>${fmtMoney(t.total_itbis_retenido)}</TotalITBISRetenido>` : ""}
      ${t.total_isr_retencion ? `<TotalISRRetencion>${fmtMoney(t.total_isr_retencion)}</TotalISRRetencion>` : ""}
    </Totales>`;
}

// Helper compartido: genera el bloque <Emisor>
function buildEmisorXml(e, fechaEmision) {
  const sucursal = e.direccion_sucursal || e.municipio_sucursal || e.provincia_sucursal
    ? `<Sucursal>
        ${tag("DireccionSucursal", e.direccion_sucursal)}
        ${tag("MunicipioSucursal", e.municipio_sucursal)}
        ${tag("ProvinciaSucursal", e.provincia_sucursal)}
      </Sucursal>`
    : "";
  return `<Emisor>
      <RNCEmisor>${xmlEscape(e.rnc)}</RNCEmisor>
      <RazonSocialEmisor>${xmlEscape(e.razon_social)}</RazonSocialEmisor>
      ${tag("NombreComercial", e.nombre_comercial)}
      ${sucursal}
      ${tag("DireccionEmisor", e.direccion)}
      ${tag("Municipio", e.municipio)}
      ${tag("Provincia", e.provincia)}
      ${e.telefono?.length ? `<TablaTelefonoEmisor>${e.telefono.map(t => `<TelefonoEmisor>${xmlEscape(t)}</TelefonoEmisor>`).join("")}</TablaTelefonoEmisor>` : ""}
      ${tag("CorreoEmisor", e.email)}
      <FechaEmision>${fmtDate(fechaEmision)}</FechaEmision>
    </Emisor>`;
}

function buildXmlTipo32(input) {
  validarTipo32(input);

  const e = input.emisor;
  const c = input.comprador || {};
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);

  // Tipo 32 NO va a DGII fila a fila — va en RFCE batch (resumen).
  // PERO el XML individual se genera igual y se firma porque el comprador
  // puede pedirlo en formato representacion impresa.

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${tag("IndicadorMontoGravado", indicadorMontoGravado(input))}
      ${tipoIngresosXml(input)}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
      ${input.forma_pago === "04" ? `<FechaLimitePago>${fmtDate(input.fecha_limite_pago || input.fecha_emision)}</FechaLimitePago>` : ""}
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    ${(c.rnc || c.razon_social) ? `<Comprador>
      ${tag("RNCComprador", c.rnc)}
      ${tag("RazonSocialComprador", c.razon_social)}
    </Comprador>` : ""}
    ${buildTotalesXml(t)}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Tipo 31: Factura de Credito Fiscal (B2B)
// ────────────────────────────────────────────────
// Similar a tipo 32, pero:
//   - El comprador es OBLIGATORIO (RNC + razon social)
//   - Se envia individualmente a DGII (no en batch RFCE)
//   - El comprador debe aceptar (AECF) para que el credito fiscal aplique
//
// Input adicional vs tipo 32:
//   comprador: {
//     rnc:           '131000001',          // OBLIGATORIO
//     razon_social:  'EMPRESA COMPRADORA SRL', // OBLIGATORIO
//   }

function validarTipo31(input) {
  const errs = [];
  if (!input.encf) errs.push("encf es requerido");
  if (!input.encf?.match(/^E\d{12}$/)) errs.push("encf debe tener formato E<tipo><10digitos>");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.emisor?.razon_social) errs.push("emisor.razon_social requerido");
  if (!input.comprador?.rnc) errs.push("comprador.rnc requerido (obligatorio en tipo 31)");
  if (!input.comprador?.razon_social) errs.push("comprador.razon_social requerido (obligatorio en tipo 31)");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido (array no vacio)");
  if (input.items?.length > 750) errs.push("Max 750 items por e-CF (DGII)");

  input.items?.forEach((it, i) => {
    if (!it.descripcion) errs.push(`items[${i}].descripcion requerido`);
    if (it.cantidad == null || it.cantidad <= 0) errs.push(`items[${i}].cantidad debe ser > 0`);
    if (it.precio_unitario == null) errs.push(`items[${i}].precio_unitario requerido`);
  });

  if (errs.length) {
    const e = new Error("Validacion fallida: " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

function buildXmlTipo31(input) {
  validarTipo31(input);

  const e = input.emisor;
  const c = input.comprador || {};
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>31</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${fechaVencimientoSecuenciaXml(input)}
      ${tag("IndicadorMontoGravado", indicadorMontoGravado(input))}
      ${tipoIngresosXml(input)}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
      ${input.forma_pago === "04" ? `<FechaLimitePago>${fmtDate(input.fecha_limite_pago || input.fecha_emision)}</FechaLimitePago>` : ""}
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    <Comprador>
      <RNCComprador>${xmlEscape(c.rnc)}</RNCComprador>
      <RazonSocialComprador>${xmlEscape(c.razon_social)}</RazonSocialComprador>
      ${tag("ContactoComprador", c.contacto)}
      ${tag("CorreoComprador", c.email)}
      ${tag("DireccionComprador", c.direccion)}
    </Comprador>
    ${buildTotalesXml(t)}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Helpers compartidos para Notas (Tipos 33 y 34)
// ────────────────────────────────────────────────
//
// CodigoModificacion (DGII):
//   1 = Anula comprobante anterior
//   2 = Corrige texto del comprobante anterior
//   3 = Corrige monto del comprobante anterior (mas comun)
//   4 = Reemplaza preimpreso
//   5 = Para emitir nota de debito al ITBIS
//   6 = Para emitir nota de credito al ITBIS

function validarReferenciaNota(input) {
  const errs = [];
  const r = input.referencia;
  if (!r) {
    errs.push("referencia es requerida para Notas (Tipo 33/34)");
  } else {
    if (!r.encf_modificado) errs.push("referencia.encf_modificado requerido");
    if (!r.encf_modificado?.match(/^E\d{12}$/)) {
      errs.push("referencia.encf_modificado debe tener formato E<tipo><10digitos>");
    }
    if (!r.fecha_ncf_modificado) errs.push("referencia.fecha_ncf_modificado requerida");
    if (!r.codigo_modificacion) errs.push("referencia.codigo_modificacion requerido (1-6)");
    if (r.codigo_modificacion && !"123456".includes(String(r.codigo_modificacion))) {
      errs.push(`referencia.codigo_modificacion '${r.codigo_modificacion}' invalido (1-6)`);
    }
  }
  return errs;
}

function buildInformacionReferenciaXml(r) {
  return `<InformacionReferencia>` +
    `<NCFModificado>${xmlEscape(r.encf_modificado)}</NCFModificado>` +
    (r.rnc_otro_contribuyente ? `<RNCOtroContribuyente>${xmlEscape(r.rnc_otro_contribuyente)}</RNCOtroContribuyente>` : "") +
    `<FechaNCFModificado>${xmlEscape(r.fecha_ncf_modificado)}</FechaNCFModificado>` +
    `<CodigoModificacion>${xmlEscape(r.codigo_modificacion)}</CodigoModificacion>` +
    (r.razon_modificacion ? `<RazonModificacion>${xmlEscape(r.razon_modificacion)}</RazonModificacion>` : "") +
  `</InformacionReferencia>`;
}

function validarTipo33o34(input, tipo) {
  const errs = [];
  if (!input.encf) errs.push("encf es requerido");
  if (!input.encf?.match(/^E\d{12}$/)) errs.push("encf debe tener formato E<tipo><10digitos>");
  if (input.encf && !input.encf.startsWith(`E${tipo}`)) {
    errs.push(`encf debe empezar con E${tipo} para tipo ${tipo}`);
  }
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.emisor?.razon_social) errs.push("emisor.razon_social requerido");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido (array no vacio)");

  // Validacion de referencia (obligatoria para 33/34)
  errs.push(...validarReferenciaNota(input));

  // Si modifica una factura B2B (Tipo 31), DEBE llevar comprador con RNC.
  // Si la nota es sobre un Tipo 32 (B2C), comprador es opcional.
  const refEncf = input.referencia?.encf_modificado || "";
  const isModB2B = refEncf.startsWith("E31");
  if (isModB2B) {
    if (!input.comprador?.rnc) errs.push("comprador.rnc requerido (la nota modifica un e-CF B2B)");
    if (!input.comprador?.razon_social) errs.push("comprador.razon_social requerido");
  }

  if (errs.length) {
    const e = new Error("Validacion fallida (Tipo " + tipo + "): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

// Builder genérico para 33/34 — la unica diferencia es el TipoeCF
function buildXmlNota(input, tipo) {
  validarTipo33o34(input, tipo);

  const e = input.emisor;
  const c = input.comprador || {};
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);
  const refXml = buildInformacionReferenciaXml(input.referencia);

  const compradorXml = (c.rnc || c.razon_social) ? (
    `<Comprador>` +
      (c.rnc ? `<RNCComprador>${xmlEscape(c.rnc)}</RNCComprador>` : "") +
      (c.razon_social ? `<RazonSocialComprador>${xmlEscape(c.razon_social)}</RazonSocialComprador>` : "") +
      tag("ContactoComprador", c.contacto) +
      tag("CorreoComprador", c.email) +
      tag("DireccionComprador", c.direccion) +
    `</Comprador>`
  ) : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${tipo}</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${tipo === "34" ? "" : fechaVencimientoSecuenciaXml(input)}
      ${tipo === "34" ? tag("IndicadorNotaCredito", input.indicador_nota_credito ?? "0") : ""}
      ${tag("IndicadorMontoGravado", indicadorMontoGravado(input))}
      ${tipoIngresosXml(input)}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
      ${input.forma_pago === "04" ? `<FechaLimitePago>${fmtDate(input.fecha_limite_pago || input.fecha_emision)}</FechaLimitePago>` : ""}
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    ${compradorXml}
    ${buildTotalesXml(t)}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  ${refXml}
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

function buildXmlTipo33(input) { return buildXmlNota(input, "33"); }
function buildXmlTipo34(input) { return buildXmlNota(input, "34"); }

// ────────────────────────────────────────────────
// Tipo 41 — Compras (auto-comprobante)
// ────────────────────────────────────────────────
// El emisor SOMOS NOSOTROS (comprador), pero el bloque <Comprador>
// describe AL VENDEDOR (puede o no tener RNC). Lo emite el contribuyente
// que compra a alguien que no entrega NCF.

function validarTipo41(input) {
  const errs = [];
  if (!input.encf) errs.push("encf requerido");
  if (!input.encf?.match(/^E41\d{10}$/)) errs.push("encf debe empezar con E41");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.emisor?.razon_social) errs.push("emisor.razon_social requerido");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido");
  // El "vendedor" se reporta en bloque <Comprador> por convencion DGII
  if (!input.comprador?.razon_social) errs.push("comprador.razon_social requerido (vendedor real)");
  if (errs.length) {
    const e = new Error("Validacion fallida (Tipo 41): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

function buildXmlTipo41(input) {
  validarTipo41(input);
  const e = input.emisor;
  const c = input.comprador || {};
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>41</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${fechaVencimientoSecuenciaXml(input)}
      ${tag("IndicadorMontoGravado", indicadorMontoGravado(input))}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    <Comprador>
      ${tag("RNCComprador", c.rnc)}
      ${tag("IdentificadorExtranjero", c.id_extranjero)}
      <RazonSocialComprador>${xmlEscape(c.razon_social)}</RazonSocialComprador>
      ${tag("ContactoComprador", c.contacto)}
      ${tag("CorreoComprador", c.email)}
    </Comprador>
    ${buildTotalesXml(t)}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Tipo 43 — Gastos Menores
// ────────────────────────────────────────────────
// Para registrar pagos pequeños (refrigerios, estacionamientos, etc)
// donde no se obtiene factura. No requiere identificar al "vendedor".

function validarTipo43(input) {
  const errs = [];
  if (!input.encf) errs.push("encf requerido");
  if (!input.encf?.match(/^E43\d{10}$/)) errs.push("encf debe empezar con E43");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido");
  if (errs.length) {
    const e = new Error("Validacion fallida (Tipo 43): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

function buildXmlTipo43(input) {
  validarTipo43(input);
  const e = input.emisor;
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>43</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${fechaVencimientoSecuenciaXml(input)}
      <TipoPago>1</TipoPago>
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    <Totales>
      ${t.monto_exento ? `<MontoExento>${fmtMoney(t.monto_exento)}</MontoExento>` : ""}
      <MontoTotal>${fmtMoney(t.monto_total)}</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Tipo 44 — Regimen Especial (Zonas Francas, PROINDUSTRIA, etc)
// ────────────────────────────────────────────────
// Estructura como Tipo 31 pero con indicadores de regimen especial.
// TODO: confirmar campo IndicadorRegimenEspecial cuando llegue rechazo
// de DGII en CerteCF — la espec V1.0 no lo nombra explicitamente.

function validarTipo44(input) {
  const errs = [];
  if (!input.encf) errs.push("encf requerido");
  if (!input.encf?.match(/^E44\d{10}$/)) errs.push("encf debe empezar con E44");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.comprador?.rnc) errs.push("comprador.rnc requerido (regimen especial)");
  if (!input.comprador?.razon_social) errs.push("comprador.razon_social requerido");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido");
  if (errs.length) {
    const e = new Error("Validacion fallida (Tipo 44): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

function buildXmlTipo44(input) {
  validarTipo44(input);
  const e = input.emisor;
  const c = input.comprador || {};
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>44</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${fechaVencimientoSecuenciaXml(input)}
      ${tipoIngresosXml(input)}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    <Comprador>
      <RNCComprador>${xmlEscape(c.rnc)}</RNCComprador>
      <RazonSocialComprador>${xmlEscape(c.razon_social)}</RazonSocialComprador>
      ${tag("ContactoComprador", c.contacto)}
      ${tag("CorreoComprador", c.email)}
      ${tag("DireccionComprador", c.direccion)}
    </Comprador>
    ${buildTotalesXml(t)}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Tipo 45 — Gubernamentales
// ────────────────────────────────────────────────
// El comprador es una entidad del gobierno (Estado RD). Estructura
// igual a Tipo 31 pero el RNC del comprador es de una institucion
// publica.

function validarTipo45(input) {
  const errs = [];
  if (!input.encf) errs.push("encf requerido");
  if (!input.encf?.match(/^E45\d{10}$/)) errs.push("encf debe empezar con E45");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.comprador?.rnc) errs.push("comprador.rnc requerido (gubernamental)");
  if (!input.comprador?.razon_social) errs.push("comprador.razon_social requerido");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido");
  if (errs.length) {
    const e = new Error("Validacion fallida (Tipo 45): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

function buildXmlTipo45(input) {
  validarTipo45(input);
  const e = input.emisor;
  const c = input.comprador || {};
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>45</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${fechaVencimientoSecuenciaXml(input)}
      ${tag("IndicadorMontoGravado", indicadorMontoGravado(input))}
      ${tipoIngresosXml(input)}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    <Comprador>
      <RNCComprador>${xmlEscape(c.rnc)}</RNCComprador>
      <RazonSocialComprador>${xmlEscape(c.razon_social)}</RazonSocialComprador>
      ${tag("ContactoComprador", c.contacto)}
      ${tag("CorreoComprador", c.email)}
      ${tag("DireccionComprador", c.direccion)}
    </Comprador>
    ${buildTotalesXml(t)}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Tipo 46 — Comprobantes para Exportaciones
// ────────────────────────────────────────────────
// El comprador esta en el extranjero. ITBIS exento. Indicadores
// especificos para exportacion.
// TODO: agregar campos de exportacion (puerto destino, etc) cuando
// DGII publique requerimientos completos en CerteCF.

function validarTipo46(input) {
  const errs = [];
  if (!input.encf) errs.push("encf requerido");
  if (!input.encf?.match(/^E46\d{10}$/)) errs.push("encf debe empezar con E46");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.comprador?.razon_social) errs.push("comprador.razon_social requerido (importador extranjero)");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido");
  if (errs.length) {
    const e = new Error("Validacion fallida (Tipo 46): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

function buildXmlTipo46(input) {
  validarTipo46(input);
  const e = input.emisor;
  const c = input.comprador || {};
  const t = input.totales || {};
  const itemsXml = buildItemsXml(input.items || []);
  const montoGravadoI3 = Number(t.monto_gravado_0 || t.monto_gravado_i3 || t.monto_gravado_total || t.monto_total || 0);
  const montoTotal = Number(t.monto_total || montoGravadoI3 || 0);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>46</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${fechaVencimientoSecuenciaXml(input)}
      ${tipoIngresosXml(input)}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    <Comprador>
      ${tag("IdentificadorExtranjero", c.id_extranjero || c.rnc)}
      <RazonSocialComprador>${xmlEscape(c.razon_social)}</RazonSocialComprador>
      ${tag("ContactoComprador", c.contacto)}
      ${tag("CorreoComprador", c.email)}
      ${tag("DireccionComprador", c.direccion)}
    </Comprador>
    <Totales>
      <MontoGravadoTotal>${fmtMoney(montoGravadoI3)}</MontoGravadoTotal>
      <MontoGravadoI3>${fmtMoney(montoGravadoI3)}</MontoGravadoI3>
      <ITBIS3>0</ITBIS3>
      <TotalITBIS3>0.00</TotalITBIS3>
      <MontoTotal>${fmtMoney(montoTotal)}</MontoTotal>
      <MontoPeriodo>${fmtMoney(montoTotal)}</MontoPeriodo>
      <ValorPagar>${fmtMoney(montoTotal)}</ValorPagar>
    </Totales>
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Tipo 47 — Pagos al Exterior
// ────────────────────────────────────────────────
// Auto-comprobante de pagos a entidades fuera de RD (servicios
// internacionales, suscripciones SaaS extranjeras, etc).

function validarTipo47(input) {
  const errs = [];
  if (!input.encf) errs.push("encf requerido");
  if (!input.encf?.match(/^E47\d{10}$/)) errs.push("encf debe empezar con E47");
  if (!input.emisor?.rnc) errs.push("emisor.rnc requerido");
  if (!input.comprador?.razon_social) errs.push("comprador.razon_social requerido (proveedor extranjero)");
  if (!input.fecha_emision) errs.push("fecha_emision requerida");
  if (!Array.isArray(input.items) || input.items.length === 0) errs.push("items requerido");
  if (errs.length) {
    const e = new Error("Validacion fallida (Tipo 47): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

function buildXmlTipo47(input) {
  validarTipo47(input);
  const e = input.emisor;
  const c = input.comprador || {};
  const t = reconcileTotalesWithItems(input.totales, input.items);
  const itemsXml = buildItemsXml(input.items || []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>47</TipoeCF>
      <eNCF>${xmlEscape(input.encf)}</eNCF>
      ${fechaVencimientoSecuenciaXml(input)}
      <TipoPago>${input.forma_pago === "04" ? "2" : "1"}</TipoPago>
    </IdDoc>
    ${buildEmisorXml(e, input.fecha_emision)}
    <Comprador>
      ${tag("IdentificadorExtranjero", c.id_extranjero || c.rnc)}
      <RazonSocialComprador>${xmlEscape(c.razon_social)}</RazonSocialComprador>
      ${tag("ContactoComprador", c.contacto)}
      ${tag("CorreoComprador", c.email)}
    </Comprador>
    ${buildTotalesXml(t)}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  <FechaHoraFirma>${nowDgiiDateTime()}</FechaHoraFirma>
</ECF>`.trim();

  return xml;
}

// ────────────────────────────────────────────────
// Dispatcher principal
// ────────────────────────────────────────────────
export function buildEcfXml(tipo_ecf, input) {
  switch (String(tipo_ecf)) {
    case "31":
      return buildXmlTipo31(input);
    case "32":
      return buildXmlTipo32(input);
    case "33":
      return buildXmlTipo33(input);
    case "34":
      return buildXmlTipo34(input);
    case "41":
      return buildXmlTipo41(input);
    case "43":
      return buildXmlTipo43(input);
    case "44":
      return buildXmlTipo44(input);
    case "45":
      return buildXmlTipo45(input);
    case "46":
      return buildXmlTipo46(input);
    case "47":
      return buildXmlTipo47(input);
    default:
      throw new Error(`Tipo e-CF '${tipo_ecf}' no reconocido`);
  }
}

// ────────────────────────────────────────────────
// Helper: convertir una factura del sistema en el input de buildEcfXml
// ────────────────────────────────────────────────
//
// Toma una fila de `facturas` + sus `facturas_detalle` + el cliente
// + el config del emisor (de integraciones_fiscales) y arma el objeto
// que espera buildXmlTipo32. Esto centraliza la traduccion.

export function facturaToEcfInput(factura, detalles, cliente, configEmisor, encf) {
  if (!factura) throw new Error("facturaToEcfInput: factura es requerida");
  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw new Error("facturaToEcfInput: detalles vacios o ausentes");
  }
  if (!configEmisor) throw new Error("facturaToEcfInput: configEmisor es requerido");
  if (!configEmisor.rnc_emisor) throw new Error("facturaToEcfInput: configEmisor.rnc_emisor es requerido");
  if (!configEmisor.nombre_emisor) throw new Error("facturaToEcfInput: configEmisor.nombre_emisor es requerido");

  // Debug: log raw data for troubleshooting
  console.log("[facturaToEcfInput] factura.id:", factura.id, "numero:", factura.numero, "fecha:", factura.fecha);
  console.log("[facturaToEcfInput] detalles count:", detalles.length);
  console.log("[facturaToEcfInput] detalles[0] sample keys:", detalles[0] ? Object.keys(detalles[0]).join(",") : "EMPTY");
  console.log("[facturaToEcfInput] detalles[0] sample:", detalles[0] ? JSON.stringify(detalles[0]) : "EMPTY");
  console.log("[facturaToEcfInput] configEmisor keys:", Object.keys(configEmisor).join(","));
  console.log("[facturaToEcfInput] cliente:", cliente ? `${cliente.nombre} rnc=${cliente.rnc}` : "null");

  const isB2B = !!(cliente && cliente.rnc && String(cliente.rnc).trim().length > 0);
  const tipoEcf = isB2B ? "31" : "32";

  // Items — facturas_detalle columns: precio (base sin ITBIS), cantidad,
  // descuento (monto plano), itbis (monto), importe (neto con ITBIS).
  // Fallback: precio_unitario si 'precio' no existe.
  const items = detalles.map((d, idx) => {
    const cantidad = Number(d.cantidad) || 0;
    // d.precio = precio base sin ITBIS (como lo guarda useVentas.js)
    // d.precio_unitario = fallback por si viene de otro origen
    const precioBase = Number(d.precio) || Number(d.precio_unitario) || 0;
    const descuento = 0;
    const monto = Number((cantidad * precioBase).toFixed(2));

    // Determinar si aplica ITBIS: si hay campo itbis_pct, usar ese.
    // Si no, revisar si d.itbis > 0 como indicador de que es gravado.
    const itbisPct = Number(d.itbis_pct);
    const itbisMonto = Number(d.itbis);
    const aplicaItbis = isFinite(itbisPct)
      ? itbisPct > 0
      : (isFinite(itbisMonto) && itbisMonto > 0 ? true : true); // default gravado

    return {
      descripcion: d.descripcion || `Item ${idx + 1}`,
      cantidad: cantidad,
      precio_unitario: precioBase,
      descuento_monto: descuento,
      indicador_facturacion: aplicaItbis ? "1" : "4", // 1=gravado, 4=exento
      monto_item: Number(monto.toFixed(2)),
      itbis_pct: aplicaItbis ? (isFinite(itbisPct) && itbisPct > 0 ? itbisPct : 0.18) : 0,
      unidad_medida: "43", // unidad por defecto
    };
  });

  // Fase 0.4: respetar itbis_pct por item en lugar de hardcoded 0.18
  const totalGravado = items.reduce((s, it) =>
    it.indicador_facturacion === "1" ? s + it.monto_item : s, 0);
  const totalExento = items.reduce((s, it) =>
    it.indicador_facturacion === "4" ? s + it.monto_item : s, 0);
  const totalItbis = items.reduce((s, it) => {
    if (it.indicador_facturacion !== "1") return s;
    const rate = it.itbis_pct > 1 ? it.itbis_pct / 100 : it.itbis_pct;
    return s + Number((it.monto_item * rate).toFixed(2));
  }, 0);
  const total = totalGravado + totalExento + totalItbis;

  console.log("[facturaToEcfInput] Calculated totals:", { totalGravado, totalExento, totalItbis, total });

  return {
    tipo_ecf: tipoEcf,
    encf,
    fecha_emision: factura.fecha,
    emisor: {
      rnc: configEmisor.rnc_emisor,
      razon_social: configEmisor.nombre_emisor,
      nombre_comercial: configEmisor.nombre_comercial,
      direccion: configEmisor.direccion,
      municipio: configEmisor.municipio,
      provincia: configEmisor.provincia,
      telefono: configEmisor.telefono ? [configEmisor.telefono] : [],
      email: configEmisor.email,
    },
    comprador: cliente
      ? {
          rnc: cliente.rnc || null,
          razon_social: cliente.nombre || null,
          email: cliente.email || null,
          contacto: cliente.telefono || null,
          direccion: cliente.direccion || null,
        }
      : null,
    items,
    totales: {
      monto_gravado_total: Number(totalGravado.toFixed(2)),
      monto_gravado_18: Number(totalGravado.toFixed(2)),
      monto_exento: Number(totalExento.toFixed(2)),
      itbis_total: Number(totalItbis.toFixed(2)),
      total_itbis_18: Number(totalItbis.toFixed(2)),
      monto_total: Number(total.toFixed(2)),
    },
    forma_pago: factura.forma_pago === "CREDITO" ? "04" : "01",
    fecha_limite_pago: factura.forma_pago === "CREDITO"
      ? new Date(new Date(factura.fecha).getTime() + (factura.dias_credito || 30) * 86400000)
      : null,
  };
}

// ────────────────────────────────────────────────
// Helper: convertir una NOTA del sistema en input para Tipo 33/34
// ────────────────────────────────────────────────
//
// Una "nota" en MotoFlow es típicamente:
//   - devoluciones (Tipo 34 — disminuye)
//   - cargos posteriores / cobros de mora (Tipo 33 — aumenta)
//
// El sistema actual no tiene una tabla 'notas_credito_debito' formal
// — se manejan como ajustes sobre la factura. Cuando exista, este
// helper se conecta. Por ahora documenta la estructura esperada.
//
// Inputs requeridos:
//   nota:            { fecha, items, total, monto_gravado, itbis, tipo: 'debito'|'credito' }
//   facturaOriginal: { numero, fecha, ncf (e-NCF original), cliente_id }
//   cliente:         (igual que facturaToEcfInput; se valida por tipo de original)
//   configEmisor:    config DGII del tenant
//   encf:            el e-NCF nuevo asignado a esta nota
//   codigo_modificacion:  '1'-'6' (default '3' = corrige monto)
//   razon_modificacion:   texto libre opcional

export function notaToEcfInput(nota, facturaOriginal, cliente, configEmisor, encf, opts = {}) {
  if (!nota) throw new Error("notaToEcfInput: nota requerida");
  if (!facturaOriginal) throw new Error("notaToEcfInput: facturaOriginal requerida");
  if (!facturaOriginal.ncf) throw new Error("notaToEcfInput: facturaOriginal.ncf (e-NCF original) requerido");
  if (!configEmisor?.rnc_emisor) throw new Error("notaToEcfInput: configEmisor.rnc_emisor requerido");
  if (!configEmisor?.nombre_emisor) throw new Error("notaToEcfInput: configEmisor.nombre_emisor requerido");

  const codigoModificacion = opts.codigo_modificacion || "3";  // default: corrige monto
  const razonModificacion = opts.razon_modificacion || null;

  // Tipo: 33 (debito) o 34 (credito) — viene de la nota o se infiere
  const tipoEcf = (nota.tipo === "debito" || nota.tipo === "33") ? "33" : "34";

  // Items del AJUSTE (no toda la factura, sólo lo que cambia)
  const items = (nota.items || []).map((d, idx) => {
    const cantidad = Number(d.cantidad) || 0;
    const precio = Number(d.precio) || 0;
    const descuento = 0;
    const monto = Number((cantidad * precio).toFixed(2));
    const itbisPct = Number(d.itbis_pct);
    const aplicaItbis = isFinite(itbisPct) ? itbisPct > 0 : true;
    return {
      descripcion: d.descripcion || `Ajuste ${idx + 1}`,
      cantidad,
      precio_unitario: precio,
      descuento_monto: descuento,
      indicador_facturacion: aplicaItbis ? "1" : "4",
      monto_item: Number(monto.toFixed(2)),
      itbis_pct: aplicaItbis ? (isFinite(itbisPct) && itbisPct > 0 ? itbisPct : 0.18) : 0,
      unidad_medida: "43",
    };
  });

  // Fase 0.4: respetar itbis_pct por item
  const totalGravado = items.reduce((s, it) =>
    it.indicador_facturacion === "1" ? s + it.monto_item : s, 0);
  const totalExento = items.reduce((s, it) =>
    it.indicador_facturacion === "4" ? s + it.monto_item : s, 0);
  const totalItbis = items.reduce((s, it) => {
    if (it.indicador_facturacion !== "1") return s;
    const rate = it.itbis_pct > 1 ? it.itbis_pct / 100 : it.itbis_pct;
    return s + Number((it.monto_item * rate).toFixed(2));
  }, 0);
  const total = totalGravado + totalExento + totalItbis;

  // Formato de fecha del NCF original: DD-MM-YYYY (lo que pide DGII)
  const fechaNcfMod = (() => {
    const d = facturaOriginal.fecha ? new Date(facturaOriginal.fecha) : null;
    if (!d || isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  })();

  return {
    tipo_ecf: tipoEcf,
    encf,
    fecha_emision: nota.fecha || new Date().toISOString(),
    emisor: {
      rnc: configEmisor.rnc_emisor,
      razon_social: configEmisor.nombre_emisor,
      nombre_comercial: configEmisor.nombre_comercial,
      direccion: configEmisor.direccion,
      municipio: configEmisor.municipio,
      provincia: configEmisor.provincia,
      telefono: configEmisor.telefono ? [configEmisor.telefono] : [],
      email: configEmisor.email,
    },
    comprador: cliente
      ? {
          rnc: cliente.rnc || null,
          razon_social: cliente.nombre || null,
          email: cliente.email || null,
          direccion: cliente.direccion || null,
        }
      : null,
    items,
    totales: {
      monto_gravado_total: Number(totalGravado.toFixed(2)),
      monto_gravado_18: Number(totalGravado.toFixed(2)),
      monto_exento: Number(totalExento.toFixed(2)),
      itbis_total: Number(totalItbis.toFixed(2)),
      total_itbis_18: Number(totalItbis.toFixed(2)),
      monto_total: Number(total.toFixed(2)),
    },
    forma_pago: "01",
    referencia: {
      encf_modificado: facturaOriginal.ncf,
      rnc_otro_contribuyente: null,  // solo si la nota la emite un tercero
      fecha_ncf_modificado: fechaNcfMod,
      codigo_modificacion: codigoModificacion,
      razon_modificacion: razonModificacion,
    },
  };
}

// ════════════════════════════════════════════════════════
// ANECF — Anulacion de e-CF
// ════════════════════════════════════════════════════════
// Estructura para anular uno o varios e-NCF previamente emitidos.
// Se firma como cualquier otro documento (XAdES-BES) y se envia
// al endpoint /Anulacion/api/Anulaciones de DGII.
//
// Input esperado:
//   {
//     rnc_emisor:   '102000001',
//     fecha_anulacion: Date | string,
//     ncf_inicial: 'E320000000010',  // primer eNCF del rango anulado
//     ncf_final:   'E320000000015',  // ultimo (puede ser igual al inicial para anular uno)
//   }
//
// O variante con rangos multiples:
//   { rnc_emisor, fecha_anulacion, rangos: [{ inicial, final }, ...] }

function validarAnecf(input) {
  const errs = [];
  if (!input.rnc_emisor) errs.push("rnc_emisor requerido");
  if (!input.fecha_anulacion) errs.push("fecha_anulacion requerida");
  const rangos = input.rangos || [{ inicial: input.ncf_inicial, final: input.ncf_final }];
  rangos.forEach((r, i) => {
    if (!r.inicial?.match(/^E\d{12}$/)) errs.push(`rangos[${i}].inicial debe tener formato E<tipo><10digitos>`);
    if (!r.final?.match(/^E\d{12}$/))   errs.push(`rangos[${i}].final debe tener formato E<tipo><10digitos>`);
  });
  if (errs.length) {
    const e = new Error("Validacion fallida (ANECF): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

export function buildAnecfXml(input) {
  validarAnecf(input);
  const rangos = input.rangos || [{ inicial: input.ncf_inicial, final: input.ncf_final }];

  const rangosXml = rangos.map((r, idx) => `
      <Anulacion>
        <NoLinea>${idx + 1}</NoLinea>
        <NCFDesde>${xmlEscape(r.inicial)}</NCFDesde>
        <NCFHasta>${xmlEscape(r.final)}</NCFHasta>
      </Anulacion>`.trim()).join("\n      ");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="ANECF.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <RNCEmisor>${xmlEscape(input.rnc_emisor)}</RNCEmisor>
    <CantidadeNCFAnulados>${rangos.length}</CantidadeNCFAnulados>
    <FechaHoraAnulacion>${fmtDate(input.fecha_anulacion)}</FechaHoraAnulacion>
  </Encabezado>
  <DetalleAnulacion>
      ${rangosXml}
  </DetalleAnulacion>
</ANECF>`.trim();

  return xml;
}

// ════════════════════════════════════════════════════════
// RFCE — Resumen de Facturas de Consumo Electronica
// ════════════════════════════════════════════════════════
// Para Tipo 32 (Consumo B2C), DGII NO exige envio individual en
// tiempo real. Se envian batches diarios/mensuales con un resumen.
// Esto es CRITICO para retail high-volume (Morla, Caminero Repuestos).
//
// Sin RFCE: 3000 e-CF/mes x firma+envio = costo prohibitivo y lentitud.
// Con RFCE: 1 envio/dia con todos los Tipo 32 del dia. Mucho mas eficiente.
//
// Input esperado:
//   {
//     rnc_emisor: '102000001',
//     fecha_inicio: Date,
//     fecha_fin:    Date,
//     facturas: [
//       {
//         encf: 'E320000000001',
//         monto_total: 590.00,
//         total_itbis: 90.00,
//       },
//       ...
//     ],
//   }

function validarRfce(input) {
  const errs = [];
  if (!input.rnc_emisor) errs.push("rnc_emisor requerido");
  if (!input.fecha_inicio) errs.push("fecha_inicio requerida");
  if (!input.fecha_fin)    errs.push("fecha_fin requerida");
  if (!Array.isArray(input.facturas) || input.facturas.length === 0) {
    errs.push("facturas requerido (array no vacio)");
  }
  if (input.facturas?.length > 1000) {
    errs.push("Max 1000 e-CF por RFCE (DGII limite)");
  }
  input.facturas?.forEach((f, i) => {
    if (!f.encf?.match(/^E32\d{10}$/)) errs.push(`facturas[${i}].encf debe ser E32<10digitos>`);
    if (f.monto_total == null) errs.push(`facturas[${i}].monto_total requerido`);
  });
  if (errs.length) {
    const e = new Error("Validacion fallida (RFCE): " + errs.join("; "));
    e.validation_errors = errs;
    throw e;
  }
}

export function buildRfceXml(input) {
  validarRfce(input);

  const totalMonto = input.facturas.reduce((s, f) => s + (Number(f.monto_total) || 0), 0);
  const totalItbis = input.facturas.reduce((s, f) => s + (Number(f.total_itbis) || 0), 0);

  const facturasXml = input.facturas.map((f, idx) => `
      <Resumen>
        <NoLinea>${idx + 1}</NoLinea>
        <eNCF>${xmlEscape(f.encf)}</eNCF>
        <MontoTotal>${fmtMoney(f.monto_total)}</MontoTotal>
        ${f.total_itbis != null ? `<TotalITBIS>${fmtMoney(f.total_itbis)}</TotalITBIS>` : ""}
        ${f.monto_gravado != null ? `<MontoGravado>${fmtMoney(f.monto_gravado)}</MontoGravado>` : ""}
        ${f.monto_exento != null ? `<MontoExento>${fmtMoney(f.monto_exento)}</MontoExento>` : ""}
      </Resumen>`.trim()).join("\n      ");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RFCE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="RFCE.xsd">
  <Encabezado>
    <Version>1.0</Version>
    <RNCEmisor>${xmlEscape(input.rnc_emisor)}</RNCEmisor>
    <FechaInicio>${fmtDate(input.fecha_inicio)}</FechaInicio>
    <FechaFin>${fmtDate(input.fecha_fin)}</FechaFin>
    <CantidadResumenes>${input.facturas.length}</CantidadResumenes>
    <MontoTotal>${fmtMoney(totalMonto)}</MontoTotal>
    ${totalItbis > 0 ? `<TotalITBIS>${fmtMoney(totalItbis)}</TotalITBIS>` : ""}
  </Encabezado>
  <DetalleResumenes>
      ${facturasXml}
  </DetalleResumenes>
</RFCE>`.trim();

  return xml;
}
