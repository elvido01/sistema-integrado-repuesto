# Contrato del Equipo IA — MotoFlow ↔ Hermes

> **Versión 1** · 2026-08-12 · Tres agentes, delegación auditable, aprobación de Elvido.
>
> Complementa `CONTRATO_CANAL_HERMES.md` (v4), **no lo sustituye**. El chat sigue
> siendo `hermes_chat` + las funciones `hermes.chat_*`. Esto es otra cosa: cómo
> Hermes le pasa trabajo a Jarvis y al Comercial-Creativo.

---

## Lo que está hecho y lo que no

**En MotoFlow, hecho y en el repositorio:** las cuatro tablas, las quince
funciones, el trigger que impide que Jarvis y Comercial-Creativo se hablen,
la pantalla, y las pruebas.

**En Hermes, sin hacer:** su plugin todavía no llama a ninguna función
`equipo_*`. Hasta que lo haga, la pantalla se ve, se puede pedir un trabajo y
queda registrado — pero nadie lo recoge. **No está simulado**: un trabajo sin
worker se queda en `pending` y se ve que se queda.

---

## Los tres, y qué puede hacer cada uno

| | Hermes | Jarvis | Comercial-Creativo |
|---|---|---|---|
| Delega a | Jarvis y Comercial-Creativo | **nadie** | **nadie** |
| Responde a | Elvido | Hermes | Hermes |
| Toca MotoFlow | no directamente | **sí, y solo él** | **no** |
| Publica | no | no | **no, nunca** |
| Aprueba | no | no | no |

Que Jarvis no pueda delegarle al Comercial-Creativo no es una convención: lo
impide `equipo_mensajes_validar_trg`, un trigger `BEFORE INSERT`. Un `INSERT`
a mano tampoco pasa.

---

## Lo que Hermes tiene que implementar

### 1. Tomar trabajo

```sql
BEGIN; SET TRANSACTION READ WRITE;
SELECT * FROM hermes.equipo_tomar('hermes', 1);
COMMIT;
```

Devuelve `claim_token` y `lease_until`. **Guarda el token.** Arrendamiento de
15 minutos (`hermes.equipo_lease()`), más largo que el del chat porque
preparar una promoción no cabe en cinco.

Cada agente pide lo suyo: `equipo_tomar('jarvis', 1)`,
`equipo_tomar('comercial_creativo', 1)`.

### 2. Abrir un trabajo desde el chat

Cuando lo que entra por `hermes_chat` merezca coordinación:

```sql
SELECT hermes.equipo_abrir_trabajo(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Promoción del día', '<lo que pidió Elvido>', 'promocion',
  '<conversation_key>', <context_epoch>, 'motoflow', '<origin_chat_id>', '<origin_message_id>');
```

La `conversation_key` y la época se pasan **tal como venían del chat**. El
canal de respuesta sale de `origin_chat_id`, nunca de la clave de conversación.

### 3. Delegar

```sql
SELECT hermes.equipo_delegar(
  '<trabajo_id>', 'hermes', 'jarvis', 'data_request',
  'buscar candidatos para la promoción',
  '{"criterio":"activos, uno >1000 y otro >100"}'::jsonb,
  '<parent_message_id o NULL>');
```

Devuelve `{"ok":true,"duplicado":false,"mensaje_id":…}`. Con la misma llamada
dos veces devuelve `duplicado:true` y el id de la primera.

A la profundidad 3 contesta `{"ok":false,"motivo":"profundidad_maxima"}` en vez
de dar vueltas.

### 4. Responder

```sql
SELECT hermes.equipo_responder('<mensaje_id>', '<claim_token>',
  'encontré 6 candidatos', '<payload jsonb>');
```

Cierra el mensaje y crea la respuesta de vuelta a Hermes. Idempotente:
repetirlo devuelve `duplicado:true` sin escribir una segunda respuesta.

**`data_result` es la única fuente de precios y existencias.** Jarvis los
saca de `hermes.buscar_producto(texto, limite)` y `hermes.catalogo_resumen()`.
Si consulta `hermes.productos` a pelo, con `activo IS TRUE`. Nunca de la
memoria del modelo.

### 5. Fallar, renovar, reportar

```sql
SELECT hermes.equipo_error('<mensaje_id>', '<claim_token>', '<el error literal>');
SELECT hermes.equipo_renovar('<mensaje_id>', '<claim_token>');
SELECT hermes.equipo_progreso('<trabajo_id>', 'jarvis', 'consultando el catálogo');
```

A los 3 intentos el mensaje sale de la cola y el trabajo entero queda en
`failed`. **Comercial-Creativo no recibe nada**: sin `data_result` no hay
delegación creativa, y el bloqueo se ve en pantalla.

### 6. Pedir aprobación y cerrar

```sql
SELECT hermes.equipo_pedir_aprobacion('<trabajo_id>', 'comercial_creativo',
  'Publicar la promoción', '<motivo>', '<datos_usados>'::jsonb,
  '<impacto>', 'alto', '<contenido>'::jsonb, '<mensaje_id>');

SELECT hermes.equipo_cerrar_trabajo('<trabajo_id>', '<resultado>'::jsonb);
```

Un mensaje con `requires_approval = true` **no se puede tomar** hasta que
Elvido apruebe: `equipo_tomar()` lo salta. No es una comprobación en el
plugin — es la consulta de la cola.

`equipo_cerrar_trabajo` se niega si queda alguna aprobación pendiente.

---

## La regla que hay que obedecer

> **`abandonar: true` → parar y no responder.**

Igual que en el contrato v4. Aparece en `equipo_responder`, `equipo_error` y
`equipo_renovar` cuando el claim ya es de otro.

---

## Lo que NO debe hacer Hermes

- **No enseñar la coordinación en el chat.** Los `equipo_mensajes` son de
  dentro. Al chat va el resultado consolidado.
- **No pasarle a Comercial-Creativo datos sin verificar.** Si Jarvis falló,
  se reporta el bloqueo; no se inventa un precio para que el copy salga.
- **No publicar.** `politicas.publicacion_automatica_habilitada = false`.

---

## Las reglas comerciales viven en la base

`equipo_agentes.politicas` del Comercial-Creativo. Se leen, no se hardcodean:

```
solo_productos_activos                  true
promocion_diaria_max_productos          2
promocion_un_producto_mayor_a           1000
promocion_otro_producto_mayor_a         100
no_promover_como_principal              ["arandela plana"]
no_repetir_propuestos_dias              14
publicar_codigo_interno                 false
exigir_foto_real                        true
respetar_zona_segura_9_16               true
publicacion_automatica_habilitada       false
```

Cambiarlas es un `UPDATE`, no un despliegue.

---

## Errores

| `motivo` | Qué hacer |
|---|---|
| `claim_reemplazado` | Parar. Otro lo tiene. |
| `profundidad_maxima` | Cortar la cadena y consolidar con lo que haya. |
| `trabajo_cerrado` | Ya terminó. |
| `aprobacion_pendiente` | Esperar a Elvido. |

Ninguna respuesta de error lleva credenciales ni cadenas de conexión.

---

## Pruebas de aceptación del lado de Hermes

1. `equipo_tomar` con dos workers a la vez → mensajes distintos, tokens distintos.
2. Un `data_request` contestado dos veces → una sola respuesta.
3. Jarvis intentando `equipo_delegar` a Comercial-Creativo → excepción.
4. Un `execution_request` con `requires_approval` → no se toma hasta aprobar.
5. Reinicio del gateway a mitad → el mensaje vuelve a la cola a los 15 min.
6. Precio contestado sin `buscar_producto` → no debe ocurrir; se audita en
   `equipo_mensajes.payload` del `data_result`.
