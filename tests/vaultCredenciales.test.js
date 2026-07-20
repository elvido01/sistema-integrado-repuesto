import { describe, it, expect } from 'vitest';
import { pareceCredencial } from '../scripts/vault-sync/vaultSyncCore.mjs';

// El vault es técnico: hablar DE credenciales es normal y necesario.
// Lo que no puede salir de esta PC es una credencial de verdad.
describe('pareceCredencial — no molesta al hablar de seguridad', () => {
  it('deja pasar la mención del concepto (caso real del vault)', () => {
    expect(pareceCredencial(
      'Cada edge function con `SERVICE_ROLE_KEY` debe validar tenant manualmente'
    )).toBe(false);
  });

  it('deja pasar prosa sobre contraseñas', () => {
    expect(pareceCredencial('El login pide contraseña y valida el token de sesión')).toBe(false);
    expect(pareceCredencial('Rotar el api key de OpenAI cada trimestre')).toBe(false);
  });

  it('deja pasar plantillas de .env sin valor', () => {
    expect(pareceCredencial('SUPABASE_SERVICE_ROLE_KEY=')).toBe(false);
    expect(pareceCredencial('VITE_SUPABASE_ANON_KEY="TU_CLAVE_AQUI"')).toBe(false);
  });

  it('deja pasar nombres de columnas y funciones', () => {
    expect(pareceCredencial('la tabla guarda password_hash con bcrypt')).toBe(false);
  });
});

describe('pareceCredencial — bloquea valores reales', () => {
  it('detecta un JWT', () => {
    expect(pareceCredencial(
      'key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ'
    )).toBe(true);
  });

  it('detecta una clave de OpenAI', () => {
    expect(pareceCredencial('usar sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(true);
  });

  it('detecta una llave privada PEM', () => {
    expect(pareceCredencial('-----BEGIN RSA PRIVATE KEY-----\nMIIEow...')).toBe(true);
  });

  it('detecta una cadena de conexión con contraseña', () => {
    expect(pareceCredencial('postgres://usuario:Sup3rS3cr3ta@db.host.co:5432/postgres')).toBe(true);
  });

  it('detecta una asignación con valor opaco largo', () => {
    expect(pareceCredencial('SERVICE_ROLE_KEY=aB3dEfGh1jKlMn0pQrStUvWxYz789456123')).toBe(true);
    expect(pareceCredencial('password: "x9K2mQ7pL4nR8vT1wZ5yB3cF6hJ0"')).toBe(true);
  });

  it('tolera texto vacío o nulo', () => {
    expect(pareceCredencial('')).toBe(false);
    expect(pareceCredencial(null)).toBe(false);
  });
});
