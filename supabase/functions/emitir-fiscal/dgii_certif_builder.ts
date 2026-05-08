// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// Builder de XML para Set de Pruebas DGII (Certificacion)
// ============================================================
// Toma una fila del xlsx personalizado que DGII genera para cada
// emisor (Paso 2 de certificacion: "Pruebas de Datos e-CF") y
// produce el XML correspondiente para enviar al endpoint de
// recepcion de DGII.
//
// Filosofia: la fila del xlsx contiene los nombres EXACTOS de los
// tags del schema oficial e-CF. No se sustituye nada (ni datos del
// emisor real). DGII compara contra los datos que el mismo te dio.
//
// Campos repetidos vienen con sufijo [N]: TelefonoEmisor[1], FormaPago[1],
// MontoPago[1], NumeroLinea[1], etc. Se reagrupan en arrays.
//
// Maneja todos los tipos: 31, 32, 33, 34, 41, 43, 44, 45, 46, 47.
// ============================================================

const xmlEscape = (s) => {
  if (s === null || s === undefined || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Devuelve <Tag>val</Tag> o "" si val es vacio/null/undefined o "#e"
const t = (name, val) => {
  if (val === null || val === undefined || val === "" || val === "#e") return "";
  return `<${name}>${xmlEscape(val)}</${name}>`;
};

// Lo mismo pero siempre emite (incluso vacio)
const tAlways = (name, val) => `<${name}>${xmlEscape(val ?? "")}</${name}>`;

// ────────────────────────────────────────────────
// Reagrupa columnas con sufijo [N] en arrays
// ────────────────────────────────────────────────
// Ejemplo: { 'TelefonoEmisor[1]': '809-1', 'TelefonoEmisor[2]': '809-2' }
//   -> { TelefonoEmisor: ['809-1', '809-2'] }
function expandRepeated(row) {
  const repeated = {};
  const flat = {};
  for (const [key, val] of Object.entries(row)) {
    const m = key.match(/^(.+)\[(\d+)\]$/);
    if (m) {
      const [, base, idx] = m;
      const i = Number(idx);
      if (!repeated[base]) repeated[base] = [];
      if (val !== "" && val !== "#e" && val !== null && val !== undefined) {
        repeated[base][i - 1] = val;
      }
    } else {
      flat[key] = val;
    }
  }
  // Compactar arrays (eliminar gaps)
  for (const k of Object.keys(repeated)) {
    repeated[k] = repeated[k].filter((v) => v !== undefined && v !== null && v !== "" && v !== "#e");
  }
  return { ...flat, ...repeated };
}

// Ayuda: trae valor saneado, "#e" como vacio
function v(row, key) {
  const x = row[key];
  if (x === "#e" || x === null || x === undefined || x === "") return "";
  return x;
}

// ────────────────────────────────────────────────
// Items de detalle
// ────────────────────────────────────────────────
function buildItemsXml(row) {
  // Cada item tiene campos NumeroLinea[N], NombreItem[N], CantidadItem[N], etc.
  // Detectamos cuantos items hay buscando NumeroLinea[N] no vacios.
  const items = [];
  for (let i = 1; i <= 1000; i++) {
    const numeroLinea = row[`NumeroLinea[${i}]`];
    if (numeroLinea === undefined) break;
    if (numeroLinea === "" || numeroLinea === "#e" || numeroLinea === null) continue;
    items.push(i);
  }
  if (!items.length) return "";

  return items
    .map((i) => {
      const item = (key) => v(row, `${key}[${i}]`);
      return `<Item>` +
        t("NumeroLinea", item("NumeroLinea")) +
        t("IndicadorFacturacion", item("IndicadorFacturacion")) +
        ((item("MontoITBISRetenido") || item("MontoISRRetenido") || item("IndicadorAgenteRetencionoPercepcion"))
          ? `<Retencion>` +
              t("IndicadorAgenteRetencionoPercepcion", item("IndicadorAgenteRetencionoPercepcion")) +
              t("MontoITBISRetenido", item("MontoITBISRetenido")) +
              t("MontoISRRetenido", item("MontoISRRetenido")) +
            `</Retencion>`
          : "") +
        t("NombreItem", item("NombreItem")) +
        t("IndicadorBienoServicio", item("IndicadorBienoServicio")) +
        t("DescripcionItem", item("DescripcionItem")) +
        t("CantidadItem", item("CantidadItem")) +
        t("UnidadMedida", item("UnidadMedida")) +
        t("PrecioUnitarioItem", item("PrecioUnitarioItem")) +
        t("DescuentoMonto", item("DescuentoMonto")) +
        t("MontoItem", item("MontoItem")) +
      `</Item>`;
    })
    .join("");
}

// ────────────────────────────────────────────────
// Emisor (con telefonos repetidos)
// ────────────────────────────────────────────────
function buildEmisorXml(r) {
  const tels = [];
  for (let i = 1; i <= 10; i++) {
    const tel = v(r, `TelefonoEmisor[${i}]`);
    if (tel) tels.push(tel);
  }
  const telXml = tels.length
    ? `<TablaTelefonoEmisor>${tels.map((tel) => `<TelefonoEmisor>${xmlEscape(tel)}</TelefonoEmisor>`).join("")}</TablaTelefonoEmisor>`
    : "";

  // OJO: Sucursal SOLO si el set lo trae. NO derivar de DireccionEmisor.
  const sucursalXml = v(r, "DireccionSucursal") || v(r, "MunicipioSucursal") || v(r, "ProvinciaSucursal")
    ? `<Sucursal>` +
        t("DireccionSucursal", v(r, "DireccionSucursal")) +
        t("MunicipioSucursal", v(r, "MunicipioSucursal")) +
        t("ProvinciaSucursal", v(r, "ProvinciaSucursal")) +
      `</Sucursal>`
    : "";

  return `<Emisor>` +
    t("RNCEmisor", v(r, "RNCEmisor")) +
    t("RazonSocialEmisor", v(r, "RazonSocialEmisor")) +
    t("NombreComercial", v(r, "NombreComercial")) +
    sucursalXml +
    t("DireccionEmisor", v(r, "DireccionEmisor")) +
    t("Municipio", v(r, "Municipio")) +
    t("Provincia", v(r, "Provincia")) +
    telXml +
    t("CorreoEmisor", v(r, "CorreoEmisor")) +
    t("WebSite", v(r, "WebSite")) +
    t("ActividadEconomica", v(r, "ActividadEconomica")) +
    t("CodigoVendedor", v(r, "CodigoVendedor")) +
    t("NumeroFacturaInterna", v(r, "NumeroFacturaInterna")) +
    t("NumeroPedidoInterno", v(r, "NumeroPedidoInterno")) +
    t("ZonaVenta", v(r, "ZonaVenta")) +
    t("RutaVenta", v(r, "RutaVenta")) +
    t("InformacionAdicionalEmisor", v(r, "InformacionAdicionalEmisor")) +
    t("FechaEmision", v(r, "FechaEmision")) +
  `</Emisor>`;
}

// ────────────────────────────────────────────────
// Comprador
// ────────────────────────────────────────────────
function buildCompradorXml(r, tipo) {
  // Tipo 43 (Gastos Menores) NO lleva comprador
  if (tipo === "43") return "";

  const hasComprador =
    v(r, "RNCComprador") ||
    v(r, "IdentificadorExtranjero") ||
    v(r, "RazonSocialComprador");
  if (!hasComprador) return "";

  return `<Comprador>` +
    t("RNCComprador", v(r, "RNCComprador")) +
    t("IdentificadorExtranjero", v(r, "IdentificadorExtranjero")) +
    t("RazonSocialComprador", v(r, "RazonSocialComprador")) +
    t("ContactoComprador", v(r, "ContactoComprador")) +
    t("CorreoComprador", v(r, "CorreoComprador")) +
    t("DireccionComprador", v(r, "DireccionComprador")) +
    t("MunicipioComprador", v(r, "MunicipioComprador")) +
    t("ProvinciaComprador", v(r, "ProvinciaComprador")) +
    t("PaisComprador", v(r, "PaisComprador")) +
    t("FechaEntrega", v(r, "FechaEntrega")) +
    t("ContactoEntrega", v(r, "ContactoEntrega")) +
    t("DireccionEntrega", v(r, "DireccionEntrega")) +
    t("TelefonoAdicional", v(r, "TelefonoAdicional")) +
    t("FechaOrdenCompra", v(r, "FechaOrdenCompra")) +
    t("NumeroOrdenCompra", v(r, "NumeroOrdenCompra")) +
    t("CodigoInternoComprador", v(r, "CodigoInternoComprador")) +
    t("ResponsablePago", v(r, "ResponsablePago")) +
    t("InformacionAdicionalComprador", v(r, "InformacionAdicionalComprador")) +
  `</Comprador>`;
}

// ────────────────────────────────────────────────
// InformacionesAdicionales (NumeroContenedor, NumeroReferencia, FechaEmbarque, etc.)
// ────────────────────────────────────────────────
function buildInfoAdicionalesXml(r) {
  const fields = [
    "FechaEmbarque",
    "NumeroEmbarque",
    "NumeroContenedor",
    "NumeroContenedor ", // (con espacio, asi viene en algunos sets)
    "NumeroReferencia",
    "NombrePuertoEmbarque",
    "CondicionesEntrega",
    "TotalFob",
    "Seguro",
    "Flete",
    "OtrosGastos",
    "TotalCif",
    "RegimenAduanero",
    "NombrePuertoSalida",
    "NombrePuertoDesembarque",
    "PesoBruto",
    "PesoNeto",
    "CantidadBulto",
    "UnidadBulto",
    "VolumenBulto",
  ];
  const out = [];
  for (const f of fields) {
    const val = v(r, f);
    if (val) out.push(t(f.trim(), val));
  }
  if (!out.length) return "";
  return `<InformacionesAdicionales>${out.join("")}</InformacionesAdicionales>`;
}

// ────────────────────────────────────────────────
// Transporte (Tipo 46 — Exportaciones)
// ────────────────────────────────────────────────
function buildTransporteXml(r) {
  const fields = [
    "Conductor",
    "DocumentoTransporte",
    "Ficha",
    "Placa",
    "RutaTransporte",
    "ZonaTransporte",
    "NumeroAlbaran",
  ];
  const out = [];
  for (const f of fields) {
    const val = v(r, f);
    if (val) out.push(t(f, val));
  }
  if (!out.length) return "";
  return `<Transporte>${out.join("")}</Transporte>`;
}

// ────────────────────────────────────────────────
// Totales / Subtotales
// ────────────────────────────────────────────────
function buildTotalesXml(r) {
  const fields = [
    "MontoGravadoTotal",
    "MontoGravadoI1",
    "MontoGravadoI2",
    "MontoGravadoI3",
    "MontoExento",
    "ITBIS1",
    "ITBIS2",
    "ITBIS3",
    "TotalITBIS",
    "TotalITBIS1",
    "TotalITBIS2",
    "TotalITBIS3",
    "MontoImpuestoAdicional",
    "MontoTotal",
    "MontoNoFacturable",
    "MontoPeriodo",
    "SaldoAnterior",
    "MontoAvancePago",
    "ValorPagar",
    "TotalITBISRetenido",
    "TotalISRRetencion",
    "TotalITBISPercepcion",
    "TotalISRPercepcion",
  ];
  const out = [];
  for (const f of fields) {
    const val = v(r, f);
    if (val !== "") out.push(t(f, val));
  }
  // ImpuestosAdicionales si hay
  return `<Totales>${out.join("")}</Totales>`;
}

// ────────────────────────────────────────────────
// FormasPago (FormaPago[N] + MontoPago[N])
// ────────────────────────────────────────────────
function buildFormasPagoXml(r) {
  const out = [];
  for (let i = 1; i <= 10; i++) {
    const forma = v(r, `FormaPago[${i}]`);
    const monto = v(r, `MontoPago[${i}]`);
    if (forma && monto) {
      out.push(`<FormaDePago>${t("FormaPago", forma)}${t("MontoPago", monto)}</FormaDePago>`);
    }
  }
  if (!out.length) return "";
  return `<TablaFormasPago>${out.join("")}</TablaFormasPago>`;
}

// ────────────────────────────────────────────────
// IdDoc (encabezado fiscal del e-CF)
// ────────────────────────────────────────────────
// ORDEN OFICIAL DGII (formato e-CF V1.0, campos 1-12+):
// 1.TipoeCF, 2.eNCF, 3.FechaVencimientoSecuencia,
// 4.IndicadorEnvioDiferido (ANTES de NotaCredito? o despues?),
// 5.IndicadorNotaCredito (DGII orden oficial: 5),
// 6.IndicadorEnvioDiferido (oficial: 6),
// 7.IndicadorMontoGravado (oficial: 7),
// IndicadorServicioTodoIncluido,
// 8.TipoIngresos, 9.TipoPago, 10.FechaLimitePago, 11.TerminoPago,
// TablaFormasPago, TipoCuentaPago, NumeroCuentaPago, BancoPago,
// FechaDesde, FechaHasta, TotalPaginas
function buildIdDocXml(r) {
  return `<IdDoc>` +
    t("TipoeCF", v(r, "TipoeCF")) +
    t("eNCF", v(r, "ENCF")) +
    t("FechaVencimientoSecuencia", v(r, "FechaVencimientoSecuencia")) +
    t("IndicadorNotaCredito", v(r, "IndicadorNotaCredito")) +
    t("IndicadorEnvioDiferido", v(r, "IndicadorEnvioDiferido")) +
    t("IndicadorMontoGravado", v(r, "IndicadorMontoGravado")) +
    t("IndicadorServicioTodoIncluido", v(r, "IndicadorServicioTodoIncluido")) +
    t("TipoIngresos", v(r, "TipoIngresos")) +
    t("TipoPago", v(r, "TipoPago")) +
    t("FechaLimitePago", v(r, "FechaLimitePago")) +
    t("TerminoPago", v(r, "TerminoPago")) +
    buildFormasPagoXml(r) +
    t("TipoCuentaPago", v(r, "TipoCuentaPago")) +
    t("NumeroCuentaPago", v(r, "NumeroCuentaPago")) +
    t("BancoPago", v(r, "BancoPago")) +
    t("FechaDesde", v(r, "FechaDesde")) +
    t("FechaHasta", v(r, "FechaHasta")) +
    t("TotalPaginas", v(r, "TotalPaginas")) +
  `</IdDoc>`;
}

// ────────────────────────────────────────────────
// InformacionReferencia (Tipos 33, 34: notas debito/credito)
// ────────────────────────────────────────────────
function buildInfoReferenciaXml(r) {
  const ncfMod = v(r, "NCFModificado");
  if (!ncfMod) return "";
  return `<InformacionReferencia>` +
    t("NCFModificado", ncfMod) +
    t("RNCOtroContribuyente", v(r, "RNCOtroContribuyente")) +
    t("FechaNCFModificado", v(r, "FechaNCFModificado")) +
    t("CodigoModificacion", v(r, "CodigoModificacion")) +
    t("RazonModificacion", v(r, "RazonModificacion")) +
  `</InformacionReferencia>`;
}

// ────────────────────────────────────────────────
// MAIN: construye el XML completo de un caso de prueba e-CF
// ────────────────────────────────────────────────
export function buildEcfFromTestRow(rawRow) {
  if (!rawRow) throw new Error("buildEcfFromTestRow: row vacia");

  // Asumimos rawRow ya tiene field names planos. NO expandir [N] aqui
  // porque algunos campos los manejamos por sufijo (NumeroLinea[1], etc).
  const r = rawRow;
  const tipo = String(v(r, "TipoeCF") || "").trim();
  if (!tipo) throw new Error("Fila sin TipoeCF");

  const idDoc = buildIdDocXml(r);
  const emisor = buildEmisorXml(r);
  const comprador = buildCompradorXml(r, tipo);
  const infoAd = buildInfoAdicionalesXml(r);
  const transporte = buildTransporteXml(r);
  const totales = buildTotalesXml(r);
  const itemsXml = buildItemsXml(r);
  const infoRef = buildInfoReferenciaXml(r);

  // Estructura: <ECF><Encabezado>...</Encabezado><DetallesItems>...</DetallesItems>
  //   [<Subtotales>...</Subtotales>] [<DescuentosORecargos>...</DescuentosORecargos>]
  //   [<Paginacion>...</Paginacion>] [<InformacionReferencia>...</InformacionReferencia>]
  //   <FechaHoraFirma> (ANTES de Signature, requerido)
  // </ECF>
  //
  // FechaHoraFirma: timestamp del momento de firmar, formato dd-MM-yyyy HH:mm:ss
  const ahora = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const fechaHoraFirma =
    `${pad(ahora.getDate())}-${pad(ahora.getMonth() + 1)}-${ahora.getFullYear()} ` +
    `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="e-CF.xsd">` +
      `<Encabezado>` +
        `<Version>1.0</Version>` +
        idDoc +
        emisor +
        comprador +
        infoAd +
        transporte +
        totales +
      `</Encabezado>` +
      `<DetallesItems>${itemsXml}</DetallesItems>` +
      infoRef +
      `<FechaHoraFirma>${fechaHoraFirma}</FechaHoraFirma>` +
    `</ECF>`;

  return xml;
}

// ────────────────────────────────────────────────
// Genera codigo de seguridad de 6 caracteres alfanumericos.
// Para Consumo (RFCE), DGII permite codigo asignado por el emisor.
// IMPORTANTE: debe ser ALEATORIO en cada llamada — DGII rechaza con
// "combinacion e-NCF y codigo de seguridad ya utilizados previamente"
// si reintentas con el mismo codigo.
// ────────────────────────────────────────────────
function generarCodigoSeguridad() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let res = "";
  for (let i = 0; i < 6; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

// IdDoc reducido para RFCE (solo TipoeCF, eNCF, TipoIngresos, TipoPago, FormasPago).
// El RFCE no lleva Indicadores ni FechaVencimientoSecuencia.
function buildIdDocXmlRfce(r) {
  return `<IdDoc>` +
    t("TipoeCF", v(r, "TipoeCF")) +
    t("eNCF", v(r, "ENCF")) +
    t("TipoIngresos", v(r, "TipoIngresos")) +
    t("TipoPago", v(r, "TipoPago")) +
    buildFormasPagoXml(r) +
  `</IdDoc>`;
}

// ────────────────────────────────────────────────
// MAIN: construye el XML de un caso de RFCE (Resumen de Factura Consumo)
// ────────────────────────────────────────────────
// El RFCE es un resumen de factura de consumo < 250K. Estructura
// reducida: solo Encabezado con totales + CodigoSeguridadeCF.
// NO lleva DetalleRFCE/items. Tampoco Sucursal/Direccion del emisor.
//
// Estructura:
//   <RFCE><Encabezado>
//     <Version/><IdDoc/><Emisor/><Comprador/><Totales/>
//     <CodigoSeguridadeCF/>
//   </Encabezado></RFCE>
export function buildRfceFromTestRow(rawRow) {
  if (!rawRow) throw new Error("buildRfceFromTestRow: row vacia");
  const r = rawRow;
  const tipo = String(v(r, "TipoeCF") || "").trim();
  if (tipo !== "32") throw new Error("RFCE solo aplica a Tipo 32");

  const codigoSeg = v(r, "CodigoSeguridadeCF") || generarCodigoSeguridad();

  const compradorXml = (v(r, "RNCComprador") || v(r, "IdentificadorExtranjero") || v(r, "RazonSocialComprador"))
    ? `<Comprador>` +
        t("RNCComprador", v(r, "RNCComprador")) +
        t("IdentificadorExtranjero", v(r, "IdentificadorExtranjero")) +
        t("RazonSocialComprador", v(r, "RazonSocialComprador")) +
      `</Comprador>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<RFCE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="RFCE.xsd">` +
      `<Encabezado>` +
        `<Version>1.0</Version>` +
        buildIdDocXmlRfce(r) +
        `<Emisor>` +
          t("RNCEmisor", v(r, "RNCEmisor")) +
          t("RazonSocialEmisor", v(r, "RazonSocialEmisor")) +
          t("FechaEmision", v(r, "FechaEmision")) +
        `</Emisor>` +
        compradorXml +
        buildTotalesXml(r) +
        t("CodigoSeguridadeCF", codigoSeg) +
      `</Encabezado>` +
    `</RFCE>`;

  return xml;
}
