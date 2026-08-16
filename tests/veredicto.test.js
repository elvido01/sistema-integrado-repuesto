// Autorizar o descartar una propuesta, dicho o escrito.
//
// (2026-08-16) La lista aceptaba "autorizo" y "autorizado" pero NO
// "autorízalo", que es como lo dice la gente. La palabra se iba al modelo, y
// el modelo contestó proponiendo una cotización de OTRO cliente. Una
// conjugación de más costó eso, así que ahora se reconoce por raíz — y se
// prueba, para que la próxima variante no vuelva a colarse.

import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('window', {});
const { veredictoDeVoz } = await import('../src/components/jarvis/JarvisAdminAssistant.jsx');

describe('veredictoDeVoz — autoriza', () => {
  it('las formas que la gente usa de verdad', () => {
    for (const t of [
      'si', 'SI', 'Sí',
      'autorizo', 'autorízalo', 'autorizalo', 'autorízala', 'autorizarlo',
      'lo autorizo', 'sí, autorízalo',
      'apruebo', 'apruébalo', 'aprobado',
      'confirmo', 'confírmalo',
      'dale', 'hazlo', 'adelante', 'ok', 'procede',
    ]) expect(veredictoDeVoz(t), t).toBe('si');
  });

  it('el dictado parte el pronombre: "autoriza lo"', () => {
    // Así llegó de verdad desde el micrófono. El pronombre puede quedar
    // delante o detrás, y las dos formas significan lo mismo.
    for (const t of ['autoriza lo', 'autoriza la', 'aprueba lo', 'confirma lo', 'autoriza eso'])
      expect(veredictoDeVoz(t), t).toBe('si');
  });
});

describe('veredictoDeVoz — descarta', () => {
  it('las formas de decir que no', () => {
    for (const t of [
      'no', 'no autorizo', 'no lo hagas',
      'cancela', 'cancélalo', 'cancelar',
      'descarta', 'descártalo', 'anúlalo', 'rechazalo',
      'déjalo', 'olvídalo',
    ]) expect(veredictoDeVoz(t), t).toBe('no');
  });

  it('"no autorizo" nunca se lee como un sí', () => {
    // Empieza por una palabra de rechazo y contiene la raíz de autorizar:
    // es exactamente el caso donde un orden mal puesto factura sin permiso.
    expect(veredictoDeVoz('no autorizo')).toBe('no');
  });
});

describe('veredictoDeVoz — ante la duda, no toca nada', () => {
  it('esperar no es descartar', () => {
    // Quien dice "espera" quiere pensarlo. Descartarle la propuesta sería
    // decidir por él.
    for (const t of ['espera', 'para', 'un momento', 'dejame ver'])
      expect(veredictoDeVoz(t), t).toBeNull();
  });

  it('una frase larga es una instrucción nueva, no una decisión', () => {
    expect(veredictoDeVoz('si pero antes dime cuanto me queda en el almacen')).toBeNull();
  });

  it('una pregunta no decide nada', () => {
    for (const t of ['cuanto es', 'y el precio', 'quien es ese cliente', ''])
      expect(veredictoDeVoz(t), t).toBeNull();
  });
});
