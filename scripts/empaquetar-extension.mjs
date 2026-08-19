// Arma los dos ZIP que se bajan desde Configuración del Sistema.
//
// >>> POR QUE EXISTE <<<
// (2026-08-19) Los ZIP se armaban a mano. El resultado: el de "Omni Beta"
// llevaba desde el 14 de julio, con la versión 2.0.0.1 y SIN los scripts de
// Instagram y TikTok — o sea que quien lo bajara instalaba una extensión a
// la que le faltaba justo lo que el panel dice que hace. Y nadie podía
// notarlo, porque la pantalla no enseñaba ninguna versión.
//
// Ahora los dos salen del mismo build, con un comando, y con la versión que
// diga el manifest.
//
//   npm run ext:zip        (después de compilar la extensión)
//
// Los dos manifests son hoy el MISMO contenido salvo el nombre del archivo.
// Se siguen generando los dos porque los dos botones existen en la pantalla;
// el día que se quede uno solo, se borra aquí y allí.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import JSZip from 'jszip';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIST = path.join(RAIZ, 'whatsapp-quote-extension/dist');
const DESTINO = path.join(RAIZ, 'public/downloads');

// Los scripts que carga el manifest, más el propio manifest. Se leen DEL
// manifest en vez de escribirlos aquí: si mañana se añade un canal nuevo con
// su script, el ZIP lo incluye solo. Un archivo que falte en el ZIP es una
// extensión que instala rota y no avisa.
function archivosDe(manifest) {
  const js = (manifest.content_scripts || []).flatMap((cs) => cs.js || []);
  return [...new Set(js)];
}

function armar({ manifestArchivo, salida, etiqueta }) {
  const rutaManifest = path.join(DIST, manifestArchivo);
  if (!existsSync(rutaManifest)) {
    throw new Error(`Falta ${manifestArchivo} en dist/. ¿Compilaste la extensión? (cd whatsapp-quote-extension && npm run build)`);
  }
  const manifest = JSON.parse(readFileSync(rutaManifest, 'utf8'));
  const zip = new JSZip();

  // El manifest SIEMPRE entra como manifest.json: Chrome no conoce otro
  // nombre. Por eso el beta se renombra al empaquetar.
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  for (const archivo of archivosDe(manifest)) {
    const ruta = path.join(DIST, archivo);
    if (!existsSync(ruta)) throw new Error(`El manifest pide ${archivo} y no está en dist/`);
    zip.file(archivo, readFileSync(ruta));
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then((buf) => {
    writeFileSync(path.join(DESTINO, salida), buf);
    const n = Object.keys(zip.files).length;
    console.log(`  ${etiqueta.padEnd(12)} v${manifest.version_name || manifest.version}  ${n} archivos  ${(buf.length / 1024).toFixed(0)} KB  →  ${salida}`);
    return manifest;
  });
}

console.log('\n  Empaquetando la extensión desde whatsapp-quote-extension/dist\n');

await armar({
  manifestArchivo: 'manifest.json',
  salida: 'motoflow-whatsapp-extension.zip',
  etiqueta: 'actual',
});
await armar({
  manifestArchivo: 'manifest.beta.json',
  salida: 'motoflow-omni-beta-extension.zip',
  etiqueta: 'omni beta',
});

console.log('\n  Listo. Falta `npm run build` para que entren en dist/ y se publiquen.\n');
