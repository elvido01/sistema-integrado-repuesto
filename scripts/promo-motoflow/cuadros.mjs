// ============================================================
// PROMO MOTOFLOW — captura los cuadros de escenas.html (30 fps)
// ============================================================
// Se corre con el navegador del skill browser-automation (patchright):
//   node <skill>/browser.mjs file:///.../escenas.html --script cuadros.mjs
// Lee <carpeta>/linea.json (la arma armar.mjs) y deja <carpeta>/cuadros/c00001.jpg…
// La carpeta va en la variable PROMO_DIR.
// ============================================================
import { readFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export default async function run(page) {
  const DIR = process.env.PROMO_DIR;
  const FPS = 30;
  const linea = JSON.parse(readFileSync(path.join(DIR, 'linea.json'), 'utf8'));
  const OUT = path.join(DIR, 'cuadros');
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) unlinkSync(path.join(OUT, f));

  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const n = await page.evaluate((t) => { document.dispatchEvent(new CustomEvent('promo-preparar', { detail: t })); return document.body.dataset.animaciones; }, JSON.stringify(linea.escenas));

  // PROMO_VISTA="3.2,9.5": solo esos segundos, para revisar el diseño.
  if (process.env.PROMO_VISTA) {
    const ts = process.env.PROMO_VISTA.split(',').map(Number);
    for (const s of ts) {
      await page.evaluate((x) => document.dispatchEvent(new CustomEvent('promo-ira', { detail: String(x) })), s);
      await page.screenshot({ path: path.join(OUT, `vista-${s}.jpg`), type: 'jpeg', quality: 80 });
    }
    return { animaciones: n, vista: ts.length };
  }
  const total = Math.ceil(linea.total * FPS);
  for (let i = 0; i < total; i += 1) {
    await page.evaluate((x) => document.dispatchEvent(new CustomEvent('promo-ira', { detail: String(x) })), i / FPS);
    await page.screenshot({ path: path.join(OUT, `c${String(i + 1).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  return { animaciones: n, cuadros: total };
}
