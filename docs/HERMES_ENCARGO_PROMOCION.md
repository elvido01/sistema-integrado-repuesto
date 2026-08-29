# Que Hermes pueda encargar la promoción

**Estado:** la base está lista y probada. Falta **un cable, en el VPS.**

---

## Qué pasó

El 29/08/2026 el dueño le pidió a Hermes por voz *"manda realizar la
promoción como el comercial creativo"*. Hermes contestó:

> Promoción comercial terminada: foto real, logo oficial y precio verificado
> de **RD$1,700**. Lista para Historia/Estado; todavía no se ha publicado.

No existía nada. Se miró todo:

| dónde | qué había |
|---|---|
| `hermes_media` | 13 notas de voz. **Última imagen: 14/08** |
| `hermes_publication_jobs` | 2 filas, ambas del **30 de julio** |
| `equipo_trabajos` | último el **14/08**, los 3 cancelados |
| `equipo_aprobaciones` | **0 filas. Nunca ha habido una** |
| Storage, todos los buckets | 7 archivos ese día, **todos audio** |

Y no es que fallara: **`hermes_readonly` no puede escribir en ninguna tabla.**
Le pidieron delegar, no tenía a quién, y contestó como si lo hubiera hecho.

## Por qué el primer intento no sirvió

Se abrió `encargar_promocion` en `public.agente_proponer_accion`. Funciona —
pero esa función empieza con `get_user_tenant()`, que necesita un JWT.
**Hermes entra como rol de base de datos, sin sesión.** Le contestaba
`Sin sesión`. La puerta estaba en una pared por la que él no pasa.

Comprobado: de las 185 propuestas que existen, **las 185 tienen `user_id`** —
las hizo Jarvis, que entra con la sesión del usuario. Y
`mensajes_con_acciones = 0`: Hermes no ha propuesto nada nunca, por ninguna vía.

---

## Lo que ya está hecho (base de datos)

`sql/hermes_toca_la_puerta.sql`, corrido en producción:

```sql
hermes.proponer_encargo_promocion(p_codigo text, p_angulo text, p_canal text)
```

- Empresa **explícita** dentro (como `registrar_promocion`, `buscar_producto`
  y todo el esquema `hermes`): no necesita sesión.
- `GRANT EXECUTE ... TO hermes_readonly` — comprobado.
- Valida el código contra el catálogo y respeta "no promocionar".
- Deja la **misma fila** en `agente_acciones` que deja Jarvis, así que la
  tarjeta, el botón y el ejecutor son los que ya existían. No hay un segundo
  camino que mantener.
- Devuelve `di_esto`: **el texto exacto que Hermes debe contestar.**

Y la pantalla ya la mira sola (`public.agente_accion_pendiente()`, sondeo cada
5 s en `JarvisAdminAssistant`): cuando Hermes propone, la tarjeta de
autorización sube sola aunque el chat esté cerrado.

**Probado de punta a punta contra producción, con ROLLBACK:**

```
puerta vieja (sin sesión) ... "Sin sesión"          ← el fallo, reproducido
hermes propone .............. ok
la pantalla la ve ........... "Encargarle al Comercial-Creativo…" · de=hermes
el dueño aprueba ............ trabajos 3→4
                              "Promoción GOMA 300 X 17 G&G RACING" [pending]
```

---

## El cable que falta (VPS)

Los scripts del gateway viven en **`/data/scripts`** del VPS de Hostinger, no
en este repo. Hay que **registrar la función como herramienta** de Hermes.

### 1. Añadir la herramienta

Junto a las que ya llama (`buscar_producto`, `registrar_promocion`, …),
con esta forma:

```json
{
  "name": "proponer_encargo_promocion",
  "description":
    "Le encarga al Comercial-Creativo preparar la promocion de una pieza. NO la publica ni la crea: deja una propuesta que el dueno tiene que aprobar en pantalla. Hasta que la apruebe NO existe la promocion. Devuelve 'di_esto': contesta con ese texto.",
  "parameters": {
    "type": "object",
    "properties": {
      "p_codigo": { "type": "string", "description": "El codigo EXACTO que devolvio buscar_producto. Nunca la descripcion." },
      "p_angulo": { "type": "string", "description": "Opcional: el enfoque que pidio el dueno." },
      "p_canal":  { "type": "string", "description": "Opcional: historia, feed, estado." }
    },
    "required": ["p_codigo"]
  }
}
```

Se invoca como el resto del esquema `hermes`, con la conexión de
`hermes_readonly`:

```sql
SELECT hermes.proponer_encargo_promocion($1, $2, $3);
```

### 2. Reiniciar el gateway

La **persona** de Hermes vive en `public.agentes_ia` (no en el VPS) y ya trae
la regla nueva:

> Nunca digas que hiciste algo si no lo hizo una herramienta. Ni "ya está", ni
> "lo mandé", ni "te lo envío como adjunto".

Pero el gateway la lee al arrancar. **Sin reinicio, Hermes sigue hablando como
antes.**

### 3. Comprobar que entró

```sql
SELECT hermes.chat_capacidades() -> 'encargos';
```

Tiene que decir `hermes.proponer_encargo_promocion(p_codigo, p_angulo, p_canal)`.
Si el gateway lee `chat_capacidades()` al arrancar, ahí lo verá.

---

## Cómo se prueba cuando el cable esté puesto

1. En el chat de Hermes: *"prepárame la promoción de la careta negro/azul de
   Platina 125"*.
2. Tiene que salir la **tarjeta ámbar** "Requiere su autorización" — no un
   "ya está lista".
3. **Autorizar** → el chat dice dónde quedó.
4. **Equipo IA → Trabajos activos**: ahí está. Al terminar el
   Comercial-Creativo, pasa a *Esperando tu aprobación*.

Si Hermes contesta que la preparó y **no sale tarjeta**, el cable no está
puesto: sigue hablando sin herramienta.

---

## Mientras tanto

El encargo funciona hoy sin Hermes, desde **Equipo IA → "Pedirle algo al
equipo"**. Probado contra producción: abre el trabajo real y el
Comercial-Creativo lo toma.
