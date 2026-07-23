# Guía de trabajo — Sistema Integrado Repuestos (MotoFlow)

Cómo trabajar correctamente desde varias PC manteniendo **siempre la última versión en la web**.

Rama activa: **`feat/mercancias-filtros`** (no `main`).

---

## 🔑 Regla de oro

1. **GitHub es la fuente de la verdad.** Antes de trabajar: `pull`. Al terminar: `push`.
2. **La web solo se actualiza cuando corres `npm run deploy`.** Subir a GitHub **no** actualiza lo que ven los clientes por sí solo.

Orden que nunca falla:

```
git pull  →  trabajas  →  npm run deploy (web)  →  git commit + git push (GitHub)
```

---

## 📅 Rutina diaria (en CUALQUIER PC)

### 1. Al abrir el proyecto — SIEMPRE lo primero
```bash
git pull origin feat/mercancias-filtros
```
Baja lo último que hiciste en la otra PC. **Nunca empieces sin esto**, o editarías una versión vieja.

> Si el `pull` trae cambios en `package.json`, corre `npm install` una vez.

### 2. Mientras trabajas — guarda seguido
```bash
git add -A
git commit -m "descripción de lo que hiciste"
```

### 3. Para publicar en la web (que los clientes lo vean)
```bash
npm run deploy
```
Compila y sube a **motoflow.pages.dev** y **repuestos-morla.pages.dev**. En 1–2 minutos queda en vivo.

### 4. Al cerrar — obligatorio (aunque no hayas terminado)
```bash
git add -A
git commit -m "avance del día"
git push origin feat/mercancias-filtros
```
Si no haces `push`, la otra PC no verá tu trabajo y lo puedes perder.

---

## ⚠️ El error más peligroso (por trabajar en 2 PC)

Si en la **PC-B** (desactualizada) corres `npm run deploy` **sin hacer `pull` primero**,
**pisas la web con una versión vieja** y borras lo que habías publicado desde la PC-A.

Por eso el `git pull` va **siempre antes** de desplegar: garantiza que despliegas lo más nuevo.

---

## 🗄️ Cambios en la base de datos (SQL)

Los archivos `.sql` de la carpeta `sql/` **no se aplican solos**. Cuando haya uno nuevo:

1. Ábrelo y cópialo.
2. Pégalo en el **editor SQL de Supabase** (proyecto de **producción**).
3. Ejecútalo **una sola vez** (la base de datos es una sola, compartida por todas las PC).

---

## 📱 App móvil (solo si trabajas la app, carpeta `mobile/`)

- Tiene su propio `npm install` aparte: `cd mobile && npm install`.
- Cambios chicos (solo JavaScript): `eas update` → llega al teléfono al reabrir la app.
- Versión nueva a Play Store: `eas build --platform android --profile production --auto-submit`.

---

## 💾 Sobre el disco Elements (E:)

No es obligatorio: con `git pull` en la otra PC ya bajas todo el código. El disco te ahorra
el `npm install` y te lleva los `.env` (que **no** viajan por git). Reglas:

- Si trabajas **desde el disco**: igual `git pull` al abrir y `git push` al cerrar.
- Si prefieres el proyecto en el disco de cada PC: `git clone` una vez, copia los `.env`,
  y de ahí en adelante solo `pull` / `push`.

Lo que **no** viaja por GitHub (y por eso está en el disco o hay que recrearlo):
`node_modules/` (se regenera con `npm install`) y los archivos `.env*` (claves).

---

## ✅ Resumen en una línea

> **`git pull` → trabajo → `npm run deploy` (web) → `git commit` + `git push` (GitHub).**
