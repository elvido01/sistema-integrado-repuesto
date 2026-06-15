# DGII — Lecciones aprendidas

Notas crudas de lo que aprendí integrando DGII e-CF. Algunas no están en la documentación oficial.

## La documentación DGII no es suficiente

El portal de DGII tiene PDFs y XSDs pero:
- Los **ejemplos** son mínimos y a veces incorrectos
- Los **mensajes de error** son crípticos (`"Estructura del archivo XML inválida"` sin decir qué)
- Las **reglas de firma XAdES-BES** se interpretan distinto entre proveedores

Aprendí más mirando ejemplos de proyectos open-source (`dgii-ecf` library en Node, `eCF.NET` en C#) que leyendo PDFs.

## Lo que me ahorró tiempo

### Validar XML local con XSD

Antes de mandar a DGII, validar localmente contra el `.xsd` oficial ahorra el ciclo "mandar → DGII rechaza → debug".

Hay un mini-validador en `emitir-fiscal/dgii_xml_builder.ts` que aplica reglas básicas. Falta validador completo con XSD (pendiente).

### Probar contra TestECF antes de Cert

TestECF acepta casi todo (es relajado). Sirve para validar el flujo end-to-end.

CerteCF es estricto (replica producción). Si pasas CerteCF, pasas Producción.

NO pegues directo en producción sin pasar CerteCF — riesgo de que e-NCF reales queden quemados por rechazo.

### Logs del callback

`dgii_callbacks_log` guarda el `raw_body` (50KB por evento). En auditoría puedes ver exactamente qué mandó DGII.

Lección: cuando DGII se queja "no recibí tu factura", muéstrale el callback que mandaron de "aceptado".

## Lo que me hizo perder días

### Case-sensitive en URLs

```
✗ https://ecf.dgii.gov.do/testecf/...
✓ https://ecf.dgii.gov.do/TesteCF/...
```

Aprendí esto cuando recibí 404 reproducible. El error era confuso porque DNS resolvía bien.

### Firma XAdES-BES — el orden de canonicalización

Hay 2 algoritmos posibles: C14N exclusive y normal. DGII espera **EXCLUSIVE** pero con ancestor namespaces incluidos en SignedInfo.

Una mala canonicalización = `Digest mismatch` = firma inválida = DGII rechaza con mensaje genérico.

Reglas que me funcionaron (byte-perfect contra librería de referencia):

1. Digest sobre el root XML **sin** xml-declaration (`<?xml ?>`)
2. SignedInfo debe incluir el namespace heredado del root
3. NO sortear atributos `xmlns` en el output final

Si una factura te falla con "firma inválida", revisa esas 3.

### `TotalITBIS` sin sufijo dentro de `<Totales>`

XSD oficial dice que dentro de `<Totales>` solo van `TotalITBIS1`, `TotalITBIS2`, `TotalITBIS3` (uno por tasa).

Pero hay docs viejos que muestran `<TotalITBIS>123.45</TotalITBIS>` sin sufijo. Te confunde, lo metes, y DGII te tira 400.

Pasó en certificación de Morla. Bug fix en Fase 0.4.

### Endpoint cambia con ambiente

| Ambiente | Base URL | Path |
|---|---|---|
| Test | `https://ecf.dgii.gov.do/TesteCF/` | `/recepcion/api/FacturasElectronicas` |
| Cert | `https://ecf.dgii.gov.do/CerteCF/` | `/recepcion/api/FacturasElectronicas` |
| Prod | `https://ecf.dgii.gov.do/eCF/` | `/recepcion/api/FacturasElectronicas` |

Mismo path final, distinto subdominio. Si hardcodeas mal, vas a Test mientras crees que estás en Prod.

## Lo que sigo sin entender bien

### Por qué a veces el callback tarda 24 horas

DGII tiene SLA de "horas" pero a veces tarda 1-2 días. Si tu cliente pregunta "¿está aceptada mi factura?" después de 6h, no tienes respuesta clara.

Mitigación: la representación impresa (PDF tipo factura) sale sin esperar callback. Cliente recibe ticket. Si DGII rechaza después, hay que generar nota de crédito o ajuste.

### Por qué algunas facturas son rechazadas con razones distintas en Test vs Cert

He visto facturas que pasan en TestECF y fallan en CerteCF con el mismo XML. Posible explicación: TestECF es más relajado en algunas validaciones (probable bug suyo o pre-prod).

Lección: siempre validar también en CerteCF antes de declarar "funciona".

## Sets de prueba CerteCF (25 casos)

DGII te da un Excel con 25 casos de prueba que el tenant nuevo debe pasar antes de poder emitir en Producción.

Los runners están en `DgiiCertificacionRunner.jsx`, `DgiiSimulacionRunner.jsx`, etc.

Yo todavía no he corrido los 25 (Morla los pasó hace tiempo, los nuevos tenants no). Cuando llegue cliente nuevo: bloque de tiempo para esto.

## Tipos que faltan implementar

- **33 Nota de Débito** — para devoluciones parciales + recargo de productos nuevos
- **41 Compras** — para que tenant también ENVÍE a DGII su factura recibida (algunos casos)
- **44 Régimen Especial** — exportaciones, tasa ITBIS3 = 0

Hoy solo se emiten 31, 32, 34. Para los demás se levanta error "tipo no soportado".

## Si alguien te dice "DGII es fácil"

No es. Hay sutilezas que solo aprendes implementándolo. Cualquier proveedor que diga "lo integramos en 2 días" o no entendió el alcance, o usa adapter de terceros (Alegra, Cardnet, etc.) que paga por cada emisión.

MotoFlow es **directo** (sin intermediario). Es más complejo pero el cliente no paga por emisión.

## Ver también

- [[../modulos/dgii]] — implementación técnica actualizada
- `docs/INTEGRATIONS.md`
- Memoria: `reference_dgii_*.md`, `feedback_dgii_*.md`
