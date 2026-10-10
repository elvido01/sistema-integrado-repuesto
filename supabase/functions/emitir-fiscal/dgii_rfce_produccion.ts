// @ts-nocheck
// ============================================================
// RFCE de PRODUCCIÓN — un resumen por cada factura de consumo < RD$250,000
// ------------------------------------------------------------
// (10/10/2026) En producción la factura de consumo menor de 250 mil NO va a
// la recepción normal: va su RESUMEN (RFCE) a fc.dgii.gov.do/.../recepcionfc,
// con el mismo CodigoSeguridadeCF que imprime el QR (6 primeros caracteres
// del SignatureValue del e-CF completo). El e-CF completo se firma y se
// guarda igual: es lo que se imprime y lo que el cliente puede pedir.
//
// Se arma a partir del e-CF 32 YA FIRMADO, campo por campo y en el orden
// exacto del XSD oficial "RFCE 32 v.1.0" — que es más estrecho que el del
// e-CF: no lleva las tasas (ITBIS1 = 18), ni TasaImpuestoAdicional, ni
// ValorPagar/SaldoAnterior. buildRfceXml (dgii_xml_builder) usa un formato
// por lotes que la DGII no acepta; no usarlo.
// ============================================================

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// Valor (ya escapado en el XML de origen) del primer <tag> dentro de `xml`.
const val = (xml, tag) => {
  const m = String(xml || "").match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : "";
};
// Sección <tag>...</tag> (sin anidar del mismo nombre).
const seccion = (xml, tag) => {
  const m = String(xml || "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
};
const t = (tag, v) => (v === "" || v == null ? "" : `<${tag}>${v}</${tag}>`);

export function codigoSeguridadDe(xmlFirmado) {
  return val(xmlFirmado, "SignatureValue").slice(0, 6);
}

export function buildRfceDesdeEcf(xmlFirmado, codigoSeguridad) {
  const sinFirma = String(xmlFirmado || "").replace(/<Signature[\s\S]*<\/Signature>/, "");
  const idDoc = seccion(sinFirma, "IdDoc");
  const emisor = seccion(sinFirma, "Emisor");
  const comprador = seccion(sinFirma, "Comprador");
  const totales = seccion(sinFirma, "Totales");

  if (val(idDoc, "TipoeCF") !== "32") throw new Error("El RFCE solo aplica a facturas de consumo (32)");
  const codigo = codigoSeguridad || codigoSeguridadDe(xmlFirmado);
  if (!codigo || codigo.length !== 6) throw new Error("Falta el código de seguridad (6 caracteres)");

  const formas = [...seccion(idDoc, "TablaFormasPago").matchAll(/<FormaDePago>([\s\S]*?)<\/FormaDePago>/g)]
    .slice(0, 7)
    .map(([, f]) => `<FormaDePago>${t("FormaPago", val(f, "FormaPago"))}${t("MontoPago", val(f, "MontoPago"))}</FormaDePago>`)
    .join("");

  const impuestos = [...seccion(totales, "ImpuestosAdicionales").matchAll(/<ImpuestoAdicional>([\s\S]*?)<\/ImpuestoAdicional>/g)]
    .slice(0, 20)
    .map(([, i]) => `<ImpuestoAdicional>` +
      t("TipoImpuesto", val(i, "TipoImpuesto")) +
      t("MontoImpuestoSelectivoConsumoEspecifico", val(i, "MontoImpuestoSelectivoConsumoEspecifico")) +
      t("MontoImpuestoSelectivoConsumoAdvalorem", val(i, "MontoImpuestoSelectivoConsumoAdvalorem")) +
      t("OtrosImpuestosAdicionales", val(i, "OtrosImpuestosAdicionales")) +
    `</ImpuestoAdicional>`)
    .join("");

  // Los montos del TOTALES (no los de ImpuestosAdicionales, que van aparte).
  const totSinImp = totales.replace(/<ImpuestosAdicionales>[\s\S]*?<\/ImpuestosAdicionales>/, "");
  const tot = (tag) => t(tag, val(totSinImp, tag));

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<RFCE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
      `<Encabezado>` +
        `<Version>1.0</Version>` +
        `<IdDoc>` +
          t("TipoeCF", "32") +
          t("eNCF", val(idDoc, "eNCF")) +
          t("TipoIngresos", val(idDoc, "TipoIngresos")) +
          t("TipoPago", val(idDoc, "TipoPago")) +
          (formas ? `<TablaFormasPago>${formas}</TablaFormasPago>` : "") +
        `</IdDoc>` +
        `<Emisor>` +
          t("RNCEmisor", val(emisor, "RNCEmisor")) +
          t("RazonSocialEmisor", val(emisor, "RazonSocialEmisor")) +
          t("FechaEmision", val(emisor, "FechaEmision")) +
        `</Emisor>` +
        `<Comprador>` +
          t("RNCComprador", val(comprador, "RNCComprador")) +
          t("IdentificadorExtranjero", val(comprador, "IdentificadorExtranjero")) +
          t("RazonSocialComprador", val(comprador, "RazonSocialComprador")) +
        `</Comprador>` +
        `<Totales>` +
          tot("MontoGravadoTotal") + tot("MontoGravadoI1") + tot("MontoGravadoI2") + tot("MontoGravadoI3") +
          tot("MontoExento") +
          tot("TotalITBIS") + tot("TotalITBIS1") + tot("TotalITBIS2") + tot("TotalITBIS3") +
          tot("MontoImpuestoAdicional") +
          (impuestos ? `<ImpuestosAdicionales>${impuestos}</ImpuestosAdicionales>` : "") +
          tot("MontoTotal") + tot("MontoNoFacturable") + tot("MontoPeriodo") +
        `</Totales>` +
        t("CodigoSeguridadeCF", esc(codigo)) +
      `</Encabezado>` +
    `</RFCE>`;
}
