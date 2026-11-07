import { describe, it, expect } from 'vitest';
import {
  problemaArchivo, nombreSeguro, formatoBytes, slugDe, limpiarDominio, esDominioPropio,
  urlDeAutenticacion, listaRequisitos, enlaceWhatsapp, enlaceRed, extension,
} from '../src/lib/colegioSitio.js';

describe('página web del colegio', () => {
  it('archivo: acepta documentos, rechaza videos y lo pesado', () => {
    expect(problemaArchivo({ name: 'Tarea 1.PDF', size: 1000 })).toBeNull();
    expect(problemaArchivo({ name: 'clase.mp4', size: 1000 })).toMatch(/YouTube/);
    expect(problemaArchivo({ name: 'virus.exe', size: 10 })).toMatch(/no se acepta/);
    expect(problemaArchivo({ name: 'libro.pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(problemaArchivo(null)).toBeTruthy();
    expect(extension('a.b.DOCX')).toBe('docx');
  });

  it('nombre seguro para el bucket', () => {
    expect(nombreSeguro('Práctica de Matemáticas #3.docx')).toBe('Practica-de-Matematicas-3.docx');
    expect(nombreSeguro('ñ.pdf')).toBe('n.pdf');
    expect(nombreSeguro('???.pdf')).toBe('archivo.pdf');
  });

  it('bytes legibles', () => {
    expect(formatoBytes(500)).toBe('500 B');
    expect(formatoBytes(2048)).toBe('2 KB');
    expect(formatoBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('slug desde el nombre', () => {
    expect(slugDe('Colegio Nuestra Señora de la Altagracia')).toBe('colegio-nuestra-senora-de-la-altagracia');
    expect(slugDe('  --Centenario!! ')).toBe('centenario');
  });

  it('dominio limpio (con ñ pasa a xn--, como lo manda el navegador)', () => {
    expect(limpiarDominio('https://www.Colegio.com/inicio')).toBe('colegio.com');
    expect(limpiarDominio('nuestraseñora.com')).toMatch(/^xn--/);
    expect(limpiarDominio('')).toBe('');
  });

  it('solo los dominios de clientes abren la página', () => {
    expect(esDominioPropio('nuestrasenora.com')).toBe(true);
    expect(esDominioPropio('www.nuestrasenora.com')).toBe(true);
    expect(esDominioPropio('motoflow.com.do')).toBe(false);
    expect(esDominioPropio('repuestos-morla.pages.dev')).toBe(false);
    expect(esDominioPropio('localhost')).toBe(false);
    expect(esDominioPropio('192.168.1.5')).toBe(false);
  });

  it('enlaces de recuperar contraseña van al sistema', () => {
    expect(urlDeAutenticacion('#access_token=x&type=recovery', '')).toBe(true);
    expect(urlDeAutenticacion('', '?code=abc')).toBe(true);
    expect(urlDeAutenticacion('#tareas', '')).toBe(false);
  });

  it('requisitos uno por línea', () => {
    expect(listaRequisitos('- Acta de nacimiento\n\n2) Dos fotos\n• Récord de notas')).toEqual(['Acta de nacimiento', 'Dos fotos', 'Récord de notas']);
  });

  it('WhatsApp y redes', () => {
    expect(enlaceWhatsapp('809-554-9431')).toBe('https://wa.me/18095549431');
    expect(enlaceWhatsapp('')).toBeNull();
    expect(enlaceRed('@colegio', 'instagram')).toBe('https://instagram.com/colegio');
    expect(enlaceRed('facebook.com/colegio', 'facebook')).toBe('https://facebook.com/colegio');
    expect(enlaceRed('https://fb.com/x', 'facebook')).toBe('https://fb.com/x');
  });
});
