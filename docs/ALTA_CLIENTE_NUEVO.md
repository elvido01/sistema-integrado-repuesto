# Alta de un cliente nuevo en MotoFlow

Guía paso a paso para poner a operar una empresa nueva. Escrita el
11/10/2026 revisando el código y la base. Marca cada paso al hacerlo.

---

## 1. Registro de la empresa (5 minutos)

- [ ] El cliente entra a **`https://motoflow.pages.dev/registro`** (o el dominio
      de marca blanca) y llena: nombre de la empresa, RNC, dirección,
      teléfono, correo, **tipo de negocio** (repuestos / dealer /
      financiera) y su usuario.

Qué crea el sistema solo:

- la empresa, con **15 días de prueba**;
- su configuración;
- un almacén **PRINCIPAL**;
- el primer usuario como **dueño (admin)**.

Es seguro: el usuario entra a la empresa con un "reclamo de alta" de un
solo uso que vence. Nadie puede colarse en una empresa ajena con su
identificador.

> Protegido (11/10/2026): el registro pide la verificación de Cloudflare
> (Turnstile, gratis; widget "MotoFlow registro" en la cuenta de Cloudflare).
> La función `registrar-empresa` la comprueba en el servidor antes de crear
> la empresa, y más de 10 altas en una hora se frenan. Si se agrega un
> dominio nuevo de marca blanca con registro, hay que añadirlo al widget.

## 2. Configuración inicial (15–30 minutos)

En **Configuración**, en este orden:

- [ ] **Perfil Empresa**: logo, slogan, RNC, dirección, teléfono, formato de
      factura (ticket 80 mm / 4", media hoja, carta), formato de etiquetas.
- [ ] **Usuarios y Permisos**: crear cajeros y vendedores y marcar qué
      módulos ve cada uno.
- [ ] **Vendedores**: los que cobran comisión. No es obligatorio: sin
      vendedor, la venta usa el nombre del usuario.
- [ ] **Comprobantes Fiscales**: las secuencias de NCF de papel (B01, B02…)
      que la DGII le autorizó, si todavía no factura electrónico.
- [ ] **Cuentas bancarias**, si va a cobrar por transferencia.

## 3. Catálogo de productos y clientes

- [ ] **Productos**: Mercancías → "Importar catálogo (Excel)".
- [ ] **Clientes**: Clientes → "Importar clientes (Excel)".
- [ ] **Lo que deben** (después de los clientes): Clientes → "Saldos iniciales (Excel)".
      Una fila por factura pendiente (cliente o RNC, documento, fecha, monto).
      Cada una queda como factura a crédito marcada como saldo inicial: se
      cobra con Recibo de Ingreso y suma al balance, pero no va al 607 ni a la
      DGII. Usar la fecha original; sin fecha queda en el último día del mes
      anterior, para no inflar las ventas del mes en que arranca. Subir el
      mismo archivo dos veces no duplica.

Los tres tienen "Bajar plantilla" y "Revisar (sin guardar)". Solo los ven
los administradores. "Importar existencias (CSV)" en Mercancías es otra cosa:
solo corrige la existencia de artículos que ya están creados.

## 4. Impresión (10 minutos)

- [ ] En la PC de caja, instalar el **MotoFlow Print Agent** y activar
      "impresión sin diálogo". Sin agente también funciona, por el diálogo
      del navegador.
- [ ] Elegir el formato (ticket 80 mm, 4", carta) y hacer una venta de prueba.
- [ ] Facturas electrónicas: el ticket sale como **imagen** (QR legible en
      cualquier impresora, también Star). Sin configurar nada más.

## 5. Facturación electrónica e-CF (si la quiere): 1 a 3 semanas, la marca la DGII

1. [ ] **Formulario de postulación** (Oficina Virtual de la DGII →
       Facturación Electrónica → Postulación). En «Datos del software a
       utilizar» se llena así (también sale en MotoFlow, Configuración → DGII,
       «Paso 1», con botones para copiar):

       | Campo del portal | Qué poner |
       |---|---|
       | Tipo de software | **PROPIO** |
       | Nombre del software | **MotoFlow** |
       | Versión del software | **1.0** |
       | URL de recepción | `zdvxowpuklbypweyqqki.supabase.co/functions/v1/dgii-receptor` |
       | URL de aprobación comercial | la misma dirección |
       | URL de autenticación | la misma dirección |

       - Sin `https://` delante ni `/fe/...` detrás: el portal los pone solo.
       - Las tres son la misma: el receptor de MotoFlow atiende los tres
         servicios y reconoce a la empresa por su RNC.
       - **GENERAR ARCHIVO** → se descarga un `.xml` → firmarlo en MotoFlow
         (Configuración → DGII → **Firmar XML**, necesita el `.p12` del paso 4)
         → subir el firmado en «Envío de archivo de postulación firmado».
2. [ ] El cliente compra su **certificado digital** (DigiFirma u otra
       entidad autorizada por INDOTEL), a nombre de quien firmará.
3. [ ] En su Oficina Virtual: delegar los roles (**Administrador de e-CF,
       Firmante, Aprobador comercial, Solicitante**) a esa persona, y que
       ella los acepte en su propia OFV.
4. [ ] En MotoFlow, **Configuración → DGII**: subir el `.p12` y su
       contraseña (se guarda cifrada).
5. [ ] Aprobada la postulación (punto 1), certificación con los **runners**
       de MotoFlow (pasos 2–15):
       - URL del receptor para los pasos 8 y 10:
         `https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/dgii-receptor`;
       - el software se declara como propio.
6. [ ] Al certificarse: solicitar las **secuencias e-NCF** (E31, E32, E34…) y
       cargarlas en `ecf_secuencias` (ambiente Produccion).
7. [ ] Pasar la integración a **modo producción**.
8. [ ] Hacer **una factura E32 y una E31 reales** y escanear el QR: la
       DGII debe decir "Aceptado".

Lo que cuida el sistema solo, ya activo:

- reintenta las ventas que quedaron sin e-CF (cada 5 min, mismo e-NCF);
- consulta los E31 enviados (cada 10 min) y avisa si alguno se rechaza;
- avisa a los 30/15/7 días de que venza el certificado, y cuando una
  secuencia va por menos del 10 %.

> Pendiente legal por confirmar: MotoFlow guarda y usa los certificados
> de sus clientes. Según la guía de la DGII, ese es el modelo de
> **Proveedor de Servicios de Facturación Electrónica**, que se autoriza
> aparte. Confirmar con facturacionelectronica@dgii.gov.do antes de tener
> muchos clientes de e-CF.

## 6. Módulos opcionales

Se encienden en `config_empresa.modulos`, sin tocar código:

| Módulo | Para quién |
|---|---|
| `gps`, `vehiculos`, `carta_ruta`, `ocultar_pedidos` | dealers de motos |
| `solicitudes_compras` | dealers y financieras que venden |
| `san`, `gestion_empresarial` | financieras |
| `equipo_ia`, `ai_ceo_dashboard`, `seguimientos_hoy` | plan con IA |
| `cotizaciones_magna`, `notas_comentarios`, `mover_a_empresa_nueva` | casos puntuales |

Los interruptores `feat_*` de `config_empresa` siguen existiendo (financiera,
CRM WhatsApp, Sales Hub, origen de la venta, medición de publicaciones…).

```sql
UPDATE config_empresa SET modulos = array_append(modulos, 'gps')
 WHERE tenant_id = '<uuid de la empresa>';
```

## 7. Cobro de la suscripción

- [ ] Antes de que venzan los 15 días: el cliente paga por transferencia y
      sube el comprobante en MotoFlow (queda en el bucket privado `pagos`).
- [ ] Tú lo revisas en **Admin → Pagos** y activas o extiendes la
      suscripción. Si vence sin pago, el sistema bloquea el acceso.

## 8. Verificación final (antes de entregarlo)

- [ ] El dueño entra y ve **solo** su empresa.
- [ ] Una venta de contado, una a crédito, una devolución y un recibo de ingreso.
- [ ] Los números empiezan en 1: FT-1, DV-1, recibos, pedidos (cada empresa
      tiene su propia secuencia).
- [ ] El ticket y la factura en carta se imprimen bien.
- [ ] Cierre de caja del día.
- [ ] Si tiene e-CF: el QR de la primera factura dice "Aceptado".
