// La foto del chat: las partes que se pueden probar sin navegador.
//
// El rescate en sí (blob: → canvas → JPEG) se comprobó en un navegador de
// verdad antes de escribirlo: fetch devolvió 14,293 bytes del original y el
// canvas 5,395 del mismo, con taint = false. Lo que se prueba aquí es lo
// que decide si la foto acaba en el sitio correcto y una sola vez.

import { describe, it, expect } from 'vitest';
import { medidaDestino, nombreDeArchivo } from '../whatsapp-quote-extension/src/utils/fotoDelChat';

const TENANT = '00000000-0000-0000-0000-000000000001';

describe('el tamaño de la copia', () => {
  it('encoge una foto de telefono al lado largo', () => {
    // Lo que manda un celular: 3024x4032 vertical.
    expect(medidaDestino(3024, 4032)).toEqual({ w: 768, h: 1024 });
  });

  it('respeta el apaisado igual de bien', () => {
    expect(medidaDestino(4032, 3024)).toEqual({ w: 1024, h: 768 });
  });

  it('NUNCA agranda', () => {
    // Una miniatura estirada pesa mas y no enseña nada nuevo.
    expect(medidaDestino(320, 240)).toEqual({ w: 320, h: 240 });
  });

  it('una imagen sin cargar da cero, no una division rara', () => {
    expect(medidaDestino(0, 0)).toEqual({ w: 0, h: 0 });
    expect(medidaDestino(undefined, undefined)).toEqual({ w: 0, h: 0 });
  });
});

describe('donde acaba guardada', () => {
  it('va SIEMPRE dentro de la carpeta de su empresa', () => {
    // La politica del bucket mira esa primera carpeta. Si el nombre saliera
    // de otra forma, la subida se rechaza (o peor, cae en la de otro).
    const ruta = nombreDeArchivo(TENANT, '18095551234@c.us:false_abc123');
    expect(ruta.startsWith(`${TENANT}/`)).toBe(true);
    expect(ruta.endsWith('.jpg')).toBe(true);
  });

  it('el id de WhatsApp no rompe la ruta', () => {
    // Los ids traen ':', '@' y '.', que en una llave de storage estorban.
    const ruta = nombreDeArchivo(TENANT, '18095551234@c.us:false_A1B2.C3');
    expect(ruta).toBe(`${TENANT}/espejo/18095551234_c.us_false_A1B2.C3.jpg`);
    expect(ruta).not.toMatch(/[:@]/);
  });

  it('la misma foto da SIEMPRE la misma ruta', () => {
    // De esto depende que el espejo, que relee el chat cada 20 segundos, no
    // suba la misma foto 180 veces al dia.
    const a = nombreDeArchivo(TENANT, 'x:false_abc');
    const b = nombreDeArchivo(TENANT, 'x:false_abc');
    expect(a).toBe(b);
  });

  it('dos fotos distintas no se pisan', () => {
    expect(nombreDeArchivo(TENANT, 'x:false_aaa'))
      .not.toBe(nombreDeArchivo(TENANT, 'x:false_bbb'));
  });

  it('un id larguisimo se recorta por el final, que es lo que distingue', () => {
    const ruta = nombreDeArchivo(TENANT, 'y'.repeat(300) + ':false_ELFINAL');
    expect(ruta).toContain('ELFINAL');
    expect(ruta.length).toBeLessThan(200);
  });

  it('sin id no revienta', () => {
    expect(nombreDeArchivo(TENANT, null)).toBe(`${TENANT}/espejo/sin-id.jpg`);
  });
});
