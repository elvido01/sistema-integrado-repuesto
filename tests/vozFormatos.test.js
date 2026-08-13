// Pruebas de lo que se decide antes de tocar el micrófono.
//
// jsdom no tiene MediaRecorder ni AudioContext, así que estas decisiones
// viven en funciones puras a propósito: es la única forma de probarlas sin
// un navegador de verdad. Lo que NO se puede probar aquí queda dicho en el
// informe, no disimulado con un simulacro que siempre pasa.
import { describe, it, expect } from 'vitest';
import {
  elegirFormato, validarGrabacion, rutaAudio, LIMITES,
  explicarErrorMicrofono, formatearDuracion, ESTADOS_VOZ, FORMATOS,
} from '@/lib/vozFormatos';

describe('elegirFormato', () => {
  it('prefiere webm/opus cuando el navegador lo admite (Chrome y Edge)', () => {
    const f = elegirFormato(() => true);
    expect(f.mime).toBe('audio/webm;codecs=opus');
    expect(f.codec).toBe('opus');
    expect(f.ext).toBe('webm');
  });

  it('cae a mp4 en Safari, que no sabe de WebM ni de Ogg', () => {
    const safari = (m) => m === 'audio/mp4';
    const f = elegirFormato(safari);
    expect(f.mime).toBe('audio/mp4');
    expect(f.ext).toBe('m4a');
  });

  it('usa ogg/opus cuando solo hay eso', () => {
    expect(elegirFormato((m) => m === 'audio/ogg;codecs=opus').ext).toBe('ogg');
  });

  it('devuelve null si el navegador no admite ninguno, en vez de inventarse uno', () => {
    expect(elegirFormato(() => false)).toBeNull();
  });

  it('sobrevive a un navegador cuyo isTypeSupported lanza', () => {
    expect(() => elegirFormato(() => { throw new Error('vaya'); })).not.toThrow();
    expect(elegirFormato(() => { throw new Error('vaya'); })).toBeNull();
  });

  it('todos los formatos declaran un MIME que el bucket acepta', () => {
    // El bucket solo admite estos tipos base. Un formato de la lista que no
    // esté ahí se graba bien y se rechaza al subir: el peor momento.
    const admitidos = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];
    for (const f of FORMATOS) expect(admitidos).toContain(f.tipo);
  });
});

describe('validarGrabacion', () => {
  it('rechaza la grabación vacía', () => {
    expect(validarGrabacion({ size: 0, duracionMs: 3000 })).toMatch(/vacía/i);
  });

  it('rechaza la que pesa más que el límite', () => {
    const msg = validarGrabacion({ size: LIMITES.maxBytes + 1, duracionMs: 5000 });
    expect(msg).toMatch(/pesa/i);
  });

  it('rechaza la más larga que el máximo', () => {
    const msg = validarGrabacion({ size: 1000, duracionMs: LIMITES.maxDuracionMs + 1 });
    expect(msg).toMatch(/dura/i);
  });

  it('rechaza el clic sin querer', () => {
    expect(validarGrabacion({ size: 800, duracionMs: 120 })).toMatch(/corto/i);
  });

  it('acepta una nota normal', () => {
    expect(validarGrabacion({ size: 48000, duracionMs: 4200 })).toBeNull();
  });

  it('acepta justo en el límite, no un byte menos', () => {
    expect(validarGrabacion({ size: LIMITES.maxBytes, duracionMs: LIMITES.maxDuracionMs })).toBeNull();
  });
});

describe('rutaAudio', () => {
  const tenant = '00000000-0000-0000-0000-000000000001';

  it('pone el tenant de primero, que es lo que miran las políticas del bucket', () => {
    expect(rutaAudio(tenant, 'abc123', 'webm').split('/')[0]).toBe(tenant);
  });

  it('agrupa por año-mes para que la limpieza no barra una carpeta gigante', () => {
    expect(rutaAudio(tenant, 'abc', 'webm')).toMatch(
      new RegExp(`^${tenant}/\\d{4}-\\d{2}/abc\\.webm$`));
  });

  it('no deja que el nombre traiga rutas relativas', () => {
    // El nombre lo pone el código (es un hash), no el usuario. Esto fija la
    // expectativa: si alguien cambia eso, la prueba lo dice.
    const r = rutaAudio(tenant, 'deadbeef', 'webm');
    expect(r).not.toMatch(/\.\./);
    expect(r.split('/')).toHaveLength(3);
  });
});

describe('explicarErrorMicrofono', () => {
  it('traduce el permiso denegado a algo accionable', () => {
    const m = explicarErrorMicrofono({ name: 'NotAllowedError' });
    expect(m).toMatch(/candado/i);
    expect(m).not.toMatch(/NotAllowedError/);
  });

  it('distingue "no hay micrófono" de "no me dejan usarlo"', () => {
    expect(explicarErrorMicrofono({ name: 'NotFoundError' })).toMatch(/no encuentro/i);
    expect(explicarErrorMicrofono({ name: 'NotReadableError' })).toMatch(/ocupado/i);
  });

  it('no filtra el nombre técnico del error en ningún caso', () => {
    for (const n of ['NotAllowedError', 'NotFoundError', 'NotReadableError',
                     'OverconstrainedError', 'AbortError', '']) {
      expect(explicarErrorMicrofono({ name: n })).not.toMatch(/Error\b/);
    }
  });
});

describe('estados visibles', () => {
  it('todos tienen texto en español menos el inactivo', () => {
    for (const [clave, e] of Object.entries(ESTADOS_VOZ)) {
      if (clave === 'inactivo') continue;
      expect(e.txt.length).toBeGreaterThan(0);
      // Ni nombres de función ni palabras del contrato en la pantalla.
      expect(e.txt).not.toMatch(/media_id|claim|token|storage/i);
    }
  });

  it('solo los estados de grabación se marcan como grabando', () => {
    expect(ESTADOS_VOZ.grabando.grabando).toBe(true);
    expect(ESTADOS_VOZ.silencio.grabando).toBe(true);
    expect(ESTADOS_VOZ.subiendo.grabando).toBe(false);
    expect(ESTADOS_VOZ.reproduciendo.grabando).toBe(false);
  });
});

describe('formatearDuracion', () => {
  it('cuenta en minutos y segundos', () => {
    expect(formatearDuracion(0)).toBe('0:00');
    expect(formatearDuracion(4200)).toBe('0:04');
    expect(formatearDuracion(65000)).toBe('1:05');
    expect(formatearDuracion(120000)).toBe('2:00');
  });

  it('no enseña negativos si los relojes se cruzan', () => {
    expect(formatearDuracion(-500)).toBe('0:00');
    expect(formatearDuracion(null)).toBe('0:00');
  });
});
