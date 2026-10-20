# Promo MotoFlow 02 — "Lunes 8 de la mañana"

Video vertical para Reels/TikTok/Shorts. **Objetivo:** más comercial y llamativo que la promo 01. La 01 es un catálogo de funciones bien hecho, pero se ve como un anuncio, y en las redes los anuncios se saltan.

## Lo que dice la investigación

| Hallazgo | Fuente | Cómo se aplica |
|---|---|---|
| La propuesta va en los **primeros 3 segundos** | TikTok, guía oficial de creativos | El caos y la pregunta salen desde el segundo 0, sin logo al principio |
| Texto en pantalla a **5–10 palabras por segundo**, con subtítulos | TikTok, guía oficial | Subtítulos grandes palabra por palabra, al ritmo de la voz |
| Lo que funciona **parece contenido normal**, no anuncio | varias guías 2026 | Formato "POV" y escena de humor con la que el dueño se identifica |
| Los anuncios de referencia (Treinta 23 M, Claro 31 M, Crony) duran **30–47 s**: primero el dolor, después la solución | YouTube | Bajamos de 47 s a **~30 s**, con más cortes y menos funciones |
| Crony POS usa **humor exagerado** (la fila que no avanza) | anuncio de Crony | Un antes caótico y exagerado contra un después tranquilo |

## La idea

**Formato POV**, con humor dominicano y antes/después:

> *"POV: eres dueño de un negocio en RD y es lunes a las 8 de la mañana."*

- **El antes:** el teléfono vibra sin parar, un cliente pide precio por WhatsApp, otro por Instagram, el empleado grita "¿y a cómo es la cadena?", el cuaderno de fiaos, la DGII con la factura electrónica.
- **El corte:** suena una caja registradora, ¡cha-ching!, y todo se ordena.
- **El después:** el mismo dueño, tranquilo, con MotoFlow.

La misma persona en las dos mitades es lo que hace que funcione el antes/después. Se genera una sola foto del dueño y las demás salen de esa misma foto, para que conserve la cara.

## Guion (~30 s)

| s | Imagen | Texto en pantalla | Voz | Sonido |
|---|---|---|---|---|
| 0–2 | Dueño agobiado detrás del mostrador, el teléfono vibrando en la mano, zoom rápido con temblor | **POV: lunes 8:00 AM** 😩 | (dueño, cansado) *"Diantre… otra vez."* | Notificaciones sin parar, ping ping ping |
| 2–6 | Burbujas que tapan la pantalla: WhatsApp "¿a cómo la goma?", IG "¿tienen cadena 428?", FB "¿hacen envío?", TikTok "precio?" | 47 mensajes sin contestar | (locutor, rápido) *"Clientes por WhatsApp, Instagram, TikTok…"* | Pings que se aceleran |
| 6–9 | Cuaderno de fiaos, talonario y sobre de la DGII que caen sobre el mostrador | ¿Y la factura electrónica? 😰 | *"…el cuaderno de los fiaos… ¡y la DGII pidiendo factura electrónica!"* | Golpe seco, ¡pum! |
| 9–10 | Pantalla en negro con un destello | **¡BASTA!** | (dueño) *"¡Ya!"* | Silencio, luego un barrido |
| 10–12 | Logo de MotoFlow que entra con un barrido | MotoFlow | (locutor) *"Con MotoFlow…"* | ¡Cha-ching! de caja registradora |
| 12–16 | El mismo dueño, sonriendo, con la laptop; tarjeta "✓ e-CF aceptada" | Factura electrónica ✅ | *"…facturas electrónico en un clic…"* | Ding suave |
| 16–20 | El dueño con el celular: la bandeja única con los 4 canales y "🛒 Listo para comprar" | Todo en 1 bandeja | *"…contestas a todos desde una sola bandeja, y la IA te dice quién va a comprar."* | Pop por cada tarjeta |
| 20–23 | Tarjetas rápidas: inventario, por cobrar, cierre de caja ✓ | Inventario · Cobros · Caja | *"Inventario, cobros y caja, todo en uno."* | Tic, tic, tic al ritmo |
| 23–27 | El dueño tranquilo con un cafecito, el teléfono en silencio | Lunes 8:00 AM 😎 | (dueño, relajado) *"Ahora sí."* (locutor) *"Desde mil novecientos cincuenta al mes."* | La música sube |
| 27–30 | Pantalla final verde: 15 DÍAS GRATIS + enlace | **Pruébalo GRATIS 15 días** 👇 link en comentarios | *"¡Pruébalo quince días gratis! El enlace, en los comentarios."* | Golpe final |

**El gancho del segundo 0 es lo que más decide.** Hay tres versiones para probar con el mismo cuerpo. Se publica una distinta cada día y se queda la que más gente vea completa:
- **A:** "POV: lunes 8:00 AM en tu negocio 😩", la de la tabla.
- **B:** "Si todavía tienes un cuaderno de fiaos, este video es para ti 📒"
- **C:** "La DGII ya exige factura electrónica. ¿Tú estás listo? 🧾"

## Cómo se produce (lo mismo que la 01, con 4 mejoras)

1. **Dos voces:** el dueño (marin o ash, voz de persona normal y con emoción) y el locutor (cedar, comercial). Es más natural que un locutor solo.
2. **Subtítulos palabra por palabra**, grandes, con la palabra clave en color. Los tiempos los da Whisper sobre la voz, a nivel de palabra.
3. **Efectos de sonido** (pings, golpe, barrido, cha-ching) hechos con ffmpeg, sin bancos de sonidos pagos, y cortes al ritmo de la música.
4. **El mismo dueño** en el antes y el después: una foto base con gpt-image-2 y las demás con "edits" sobre esa foto. Son unas 5 tomas, cerca de US$1.

Se reaprovecha la tubería de la 01 en `scripts/promo-motoflow/`: escenas.html, voz.mjs, imagenes.mjs y armar.mjs.

## Lo que haría falta de ti (opcional)

- **Un clip real de 3 a 5 s** en el mostrador de Morla, grabado con el celular: alguien cobrando o con la laptop. Un pedazo real en medio de lo generado le da mucha credibilidad. Si no hay, va todo generado.
- Si prefieres que **el dueño del video seas tú**, con tu voz en las dos líneas cortas ("Diantre… otra vez" y "Ahora sí"), se graban en el grabador del Escritorio en 1 minuto.

## Al publicar

- Instagram y TikTok no abren los enlaces que van en los comentarios. Ahí va **"Link en la bio"** o **"Escríbenos PRUEBA"**, y los casos del CRM avisan de cada uno que escriba. En Facebook sí sirve el enlace en el comentario.
- Antes de pagar publicidad, publicar las 3 versiones del gancho de forma orgánica, una por día, y medir cuánta gente ve el video completo y cuántos se registran.
