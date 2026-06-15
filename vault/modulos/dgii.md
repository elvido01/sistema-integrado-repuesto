# Módulo DGII e-CF

## Lo que es DGII

Dirección General de Impuestos Internos de RD. Desde 2023-2024 obligatorio para empresas grandes y progresivamente para todos: **emitir Comprobantes Fiscales Electrónicos (e-CF)** firmados digitalmente.

Tipos de e-CF que importan:
- **31** Factura de Crédito Fiscal (B2B, con RNC)
- **32** Factura de Consumo (B2C, sin RNC) ← el más común en repuestos
- **33** Nota de Débito (pendiente implementar en MotoFlow)
- **34** Nota de Crédito (devoluciones)
- **41-47** otros (compras, gastos menores, exportación, gubernamental)

## Cómo se integra MotoFlow

Decisión clave: **Camino B — cada tenant es su propio Emisor**.

Esto significa que:
- Cada tenant tiene su propio certificado `.p12` subido a Storage
- Sus propias secuencias e-NCF (`E310000001`, etc.)
- Sus propias credenciales DGII (test/cert/prod)

NO usamos a Repuestos Morla como "hub" que firma por todos. Cada cliente es su propio Emisor ante DGII.

Costo: onboarding de cada tenant nuevo requiere su propio set de certificación (Fase 3f, 25 pruebas).

Ganancia: legalmente correcto. Si DGII audita a un tenant, su certificado y secuencias son suyos.

## Pipeline real (la versión sin endulzar)

1. Vendedor da F10 en VentasPage
2. `useVentas.handleSave` graba factura
3. Si `fiscalActivo` → llama edge function `emitir-fiscal`
4. emitir-fiscal:
   - Carga `.p12` del tenant desde Storage
   - Pide siguiente e-NCF de la secuencia (atómico)
   - Construye XML según schema DGII
   - Firma con XAdES-BES
   - Sube XML firmado al bucket `ecf-xmls` (retención 10 años obligatoria)
   - Autentica contra DGII (Semilla)
   - POST a `recepcion/api/FacturasElectronicas`
   - DGII responde 200 + `track_id`
   - Guarda en `documentos_fiscales` con estado=`emitido`, estado_dgii=`enviado`
5. DGII manda callback async a `dgii-callback`:
   - `ARECF` (Acuse de Recibo) → procesa, actualiza estado_dgii=`aceptado`/`rechazado`
   - Loguea raw en `dgii_callbacks_log` (50KB por evento)

## Bugs históricos que me hicieron sufrir

### 1. `TotalITBIS` sin sufijo dentro de `<Totales>`

DGII XML schema: dentro de `<Totales>` SOLO acepta `TotalITBIS1`, `TotalITBIS2`, `TotalITBIS3`. El sin sufijo **rompe el schema** → DGII responde 400 con mensaje confuso.

El error: "The element 'Totales' has invalid child element 'TotalITBIS'."

Cuándo me cayó: en certificación de Morla. Una factura era rechazada y no entendíamos por qué.

Fix: Fase 0.4 (2026-06-15).

### 2. Endpoints case-sensitive

`https://ecf.dgii.gov.do/TesteCF/...` con T mayúscula. Y `/CerteCF/` y `/eCF/`. Si normalizas a lowercase → 404.

Aprendido por trial and error con curl en producción.

### 3. Firma XAdES-BES — orden de canonicalización

3 reglas para output byte-perfect:
- Digest sobre root sin xml-declaration
- Ancestor ns en SignedInfo
- Output sin sort xmlns

Si no las cumples, DGII rechaza con "Firma inválida" sin más detalle.

Hay tests con XMLs de referencia para validar (`dgii-ecf` library).

### 4. Race condition: dos `emitir_factura` paralelos

Si el usuario tiene mala conexión y le da doble click a F10, podían crearse 2 documentos fiscales para la misma factura.

Resultado: 2 e-NCF consumidos, DGII recibe 2 emisiones de la misma factura.

Fix: Fase 0.5 (UNIQUE PARCIAL en `documentos_fiscales(factura_id) WHERE estado IN ('procesando','emitido')`).

### 5. Callback duplicado de DGII

DGII a veces manda el mismo callback dos veces (su infra los reintenta). El UPDATE sobreescribía el `arecf_recibido_at` del primero → perdías el timestamp original.

Fix: Fase 0.9 (UPDATE condicional — no toca si ya está en estado terminal).

### 6. `dgii_anular_ecf` sin chequear estado previo

Función anulaba un rango de e-NCF sin verificar si DGII ya los había aceptado. Resultado: en nuestra BD queda como anulado, pero DGII tiene la factura aceptada → contabilidad inconsistente.

Fix: Fase 0.7 (excluye `estado_dgii IN ('aceptado','aceptado_condicional')`).

## Trazabilidad (art. 38 NES)

DGII exige que cada e-CF tenga vinculado QUIÉN lo emitió.

Implementación: `documentos_fiscales.emitido_por uuid REFERENCES auth.users(id)`.

Fase 3.3 agregó esto. Filas previas a 2026-06-15 quedan con NULL (sin migración retroactiva).

## Lo que falta

### Tipo 33 (Nota de Débito)

Hoy solo está la acción `dgii_test_nota_xml` que genera XML pero NO envía. La acción real `dgii_emitir_nota_debito` falta implementar.

Caso de uso real: cliente devuelve mercadería parcial Y al mismo tiempo lleva otros productos más caros → Nota de Débito ajusta la diferencia.

### Fase 3f Certificación CerteCF

DGII requiere que cada tenant nuevo pase un set de 25 pruebas en ambiente Certificación antes de poder emitir en Producción.

Hoy: las herramientas están (runners en `DgiiCertificacionRunner.jsx`, `DgiiSimulacionRunner.jsx`, etc.) pero ningún tenant nuevo lo ha corrido aún.

Cuando llegue cliente nuevo que quiera DGII, hay que correrlas las 25.

## Por qué este módulo es el más complejo

- **Auditoría real**: DGII puede pedirte 5 años atrás cualquier XML firmado
- **No es retry-friendly**: si emites con error, gastaste un e-NCF y hay que reportar el anulado
- **Async ambiguo**: el callback puede tardar 1 segundo o 24 horas
- **Multi-ambiente**: TestECF / CerteCF / eCF con paths distintos
- **Firma compleja**: XAdES-BES con reglas no-obvias en canonicalización

Por eso este módulo tiene 3 comunidades en Graphify (DGII Document Processing, DGII Certification Processing, DGII Commercial Approval) — bien aislado por flujo, intencionalmente.

## Referencias

- Doc oficial DGII: ver memoria `reference_dgii_documentacion.md`
- Endpoints: memoria `reference_dgii_endpoints.md`
- Reglas signer: memoria `feedback_dgii_signer_*`
