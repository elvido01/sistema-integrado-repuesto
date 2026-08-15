# Pendiente para ti: nadie vacía tu buzón

**Estado:** abierto · **Escrito:** 2026-08-15 · **Para:** Hermes

Cuando vuelvas a tener créditos, esto es lo primero. No es urgente para el negocio —no hay nada de valor atascado ahora mismo— pero mientras no se arregle, **el circuito del Equipo IA no cierra**.

## Qué pasa

Los mensajes dirigidos a ti (`equipo_mensajes` con `to_agent = 'hermes'`) **no los consume nadie**. El Comercial-Creativo contesta bien y deja su `draft_result` en tu buzón; ahí se queda para siempre.

El 14/08 se quedaron tres borradores 25 horas. Elvido los canceló el 15/08, así que hoy el buzón está limpio — pero la causa sigue.

## Por qué no fue la cuota

Esto lo comprobé antes de escribirlo, porque la explicación fácil era que te habías quedado sin crédito:

```
19:29:52   creas tú mismo la prueba de serialización   ← estabas trabajando
19:30:01   el Comercial te contesta                     ← nueve segundos después
           …ese mensaje nunca se reclamó
```

Estabas despierto en ese preciso momento: la tarea la abriste tú. Y las seis cartas que han pasado por ese buzón están todas con `attempts = 0` y `claimed_at = null` — **ninguna se ha reclamado jamás**. No es que lo intentaras y fallara: es que ese `to_agent` no lo lee nada.

## Qué hace falta

Que tu proceso consuma esa cola, igual que el worker del Comercial consume la suya. Las piezas ya existen y tienes permiso sobre todas (`hermes_readonly`):

| Paso | Función |
|---|---|
| 1. Tomar lo que te llegó | `hermes.equipo_tomar('hermes', 5)` |
| 2. Leer con qué medir | `hermes.equipo_criterios(<tipo del trabajo>)` |
| 3. Registrar tu veredicto | `hermes.equipo_revisar(trabajo_id, 'cumple' \| 'corregir', motivo, faltantes)` |
| 4a. Si cumple | `hermes.equipo_pedir_aprobacion(...)` → le llega a Elvido |
| 4b. Si hay que corregir | `hermes.equipo_delegar(...)` de vuelta al Comercial, con lo que falló |
| 5. Sacarlo de tu buzón | `hermes.equipo_responder(mensaje_id, claim_token, ...)` |

## Tres cosas nuevas que no había la última vez

**Los criterios están escritos** (`equipo_criterios`). Antes «que cumpla exactamente lo que pedí» no estaba en ninguna parte, así que cada evaluación era lo que te pareciera ese día. Ahora son nueve, siete bloqueantes y dos de advertencia, y **salen de las políticas que ya tenía el Comercial** — medirlo con otra vara sería injusto y además inútil. Léelos, no los inventes.

**Hay tope de correcciones.** `equipo_revisar` cuenta las rondas y te dice qué toca:

- `siguiente: 'corregir'` → devuélveselo, quedan intentos
- `siguiente: 'entregar_marcado'` → **se acabaron.** Entrégalo igual, marcado, diciendo qué faltó. No lo descartes: tirar lo hecho después de tres vueltas pagadas es el peor final posible.
- `siguiente: 'aprobacion'` → cumple, pásalo

El tope lo hace cumplir la base, no tú. Un tope que el revisor puede ignorar no es un tope.

**Hay reloj.** `public.equipo_atascos(30)` marca los trabajos abiertos sin movimiento y dice quién los tiene. Sale en la pantalla del Equipo IA en ámbar. Si esto vuelve a pasar, **se ve el mismo día** en vez de descubrirse al siguiente en una captura de pantalla.

## Lo que NO he probado

Escribí y verifiqué las funciones, y comprobé el reloj contra los tres trabajos reales. **No he corrido el ciclo completo** — tomar → evaluar → devolver o aprobar → cerrar. Eso lo estrenas tú.

Si algo de la cadena no encaja con cómo trabajas, dilo antes de forzarlo: es más barato cambiar la función que envolverla en un parche.

## Cómo sabrás que quedó bien

Elvido te va a pedir algo el día 20. Si el borrador del Comercial te llega, lo evalúas y él lo ve en **«Esperando tu aprobación»**, cerró. Si a los 30 minutos el trabajo sale en ámbar diciendo *«lo tiene Hermes»*, sigue igual.

Relacionado: [[canal-motoflow]] · [[mapa-datos-morla]] · [[acuerdo-operativo-vault-compartido]]
