# MotoFlow como canal de Hermes — instrucciones para pegarle

> Igual que `HERMES_INSTRUCCIONES_TELEGRAM.md`, pero para el canal nuevo.
> Requiere que esté corrido `sql/hermes_canal_motoflow.sql`.

## Cómo le llega esto a Hermes

Hermes está en otra PC: una ruta de disco de aquí no le sirve de nada.
La primera vez se le pasó `docs/HERMES_CANAL_MOTOFLOW.md` y contestó que el
archivo no existía — tenía razón.

Tampoco tiene un "cliente del vault" aparte. **Para él el vault es una vista
en la misma base a la que ya está conectado con `hermes_readonly`:**

```sql
SELECT contenido FROM hermes.vault_notas
WHERE ruta = 'agentes/hermes/canal-motoflow.md';
```

Ese `GRANT` está en `sql/vault_agentes.sql`. Es el mismo camino por el que él
escribe: `hermes.vault_guardar_nota()`, no archivos.

Así que hay dos formas, en este orden:

1. **Por el vault** — se copia el bloque a `vault/agentes/hermes/`, se corre
   `npm run vault:sync:una-vez`, y se le dice que lea esa ruta con el SELECT
   de arriba. Sirve para cambios futuros: se edita el archivo y se le pide
   que relea.
2. **Pegándoselo** — el bloque de abajo cabe en un mensaje de Telegram
   (~2.2 KB de 4 KB). Es lo que hay que hacer si su conexión está caída.

## Por qué existe

Dentro de MotoFlow había un asistente con el nombre de Hermes que **no era
Hermes**: otra memoria, sin sus plugins, sin saber lo hablado por Telegram.
Esto lo reemplaza por un canal hacia el Hermes real.

No se inventó transporte nuevo. Se usa el mismo `LISTEN/NOTIFY` que ya usa
para las llegadas de piezas, con otro aviso.

---

## Bloque para pegarle a Hermes

```
CANAL MOTOFLOW (nuevo) — Repuestos Morla

MotoFlow es ahora un canal tuyo, como Telegram y WhatsApp. La gente te
escribe desde el sistema y tú contestas ahí mismo. Es la MISMA conversación:
lo que te dicen por Telegram lo sabes aquí, y al revés.

ESCUCHAR EN TIEMPO REAL
  LISTEN hermes_chat;
(conexión con autocommit ON, igual que hermes_llegadas)
El aviso trae JSON: id, tenant_id, texto. IGNORA los de otro tenant.

LEER LO PENDIENTE (al conectar y tras cada aviso)
  SELECT * FROM hermes.chat_pendientes();
Devuelve: id, texto, pantalla, creado_en.
El campo "pantalla" dice en qué módulo está la persona y qué datos tiene a
la vista. Úsalo: si pregunta "¿qué es esto?" o "¿por qué no cuadra?", se
refiere a eso.

RESPONDER
  BEGIN; SET TRANSACTION READ WRITE;
  SELECT hermes.chat_responder(p_mensaje_id := 123, p_texto := 'tu respuesta');
  COMMIT;
La respuesta aparece sola en la pantalla de la persona. Marca el mensaje como
respondido: si no lo llamas, al reconectarte lo verás otra vez.

AVISAR QUE ESTÁS VIVO (cada minuto)
  SELECT hermes.latido('{"origen":"gateway"}'::jsonb);
Sin latido, MotoFlow muestra "Hermes no está conectado" y no deja a nadie
esperando una respuesta que no va a llegar. Es importante: tú vives en la PC
de la tienda, y cuando esa máquina se apaga no hay asistente.

PROPONER UNA COTIZACIÓN
Puedes prepararla, pero NO se graba sola: aparece en pantalla y la persona
autoriza.
  SELECT public.agente_proponer_accion(
    p_tipo := 'crear_cotizacion',
    p_resumen := 'Cotización para Juan Pérez: 2 gomas 90/90-17',
    p_payload := '{"cliente_nombre":"Juan Pérez",
                   "lineas":[{"codigo":"GM9017","cantidad":2}]}'::jsonb);
El PRECIO no se manda: lo pone el catálogo al grabar. Si mandas uno, se
ignora — es a propósito, para que no pueda grabarse un precio inventado.
Después de proponerla, dilo en una línea y aclara que falta autorizar.
NUNCA digas que ya está hecha.

LO QUE NO PUEDES TODAVÍA
Facturar y registrar pagos. Están declarados pero sin ejecutor.

CÓMO CONTESTAR AQUÍ
Igual que en Telegram: corto, directo, sin rodeos. La persona suele estar en
el mostrador con un cliente delante, así que dos o tres líneas. Los precios y
existencias los CONSULTAS siempre; nunca de memoria.
```

---

## Comprobar que quedó andando

**Del lado de Hermes** (con su rol `hermes_readonly`):

```sql
SELECT hermes.latido('{"origen":"prueba"}'::jsonb);
SELECT * FROM hermes.chat_pendientes();
```

**Del lado de MotoFlow** (con sesión iniciada):

```sql
SELECT public.hermes_estado_canal();
```

Debe decir `conectado: true` en los dos minutos siguientes al latido.

Después, escríbele desde el círculo de MotoFlow y corre
`hermes.chat_pendientes()` — ahí debe estar el mensaje.

---

## Lo que cambia respecto al asistente anterior

| | El que se retira | Hermes |
|---|---|---|
| Memoria | solo esa conversación | la misma de Telegram y WhatsApp |
| Velocidad | dos segundos | lo que él tarde |
| Disponible | siempre | si su gateway está encendido |
| Puede | consultar y proponer | eso y todo lo suyo |
