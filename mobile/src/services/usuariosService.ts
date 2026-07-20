import { supabase } from '../supabase/client';
import { toLoginEmail } from '../lib/loginIdentity';

export type UsuarioPanel = {
  id: string;
  display_name: string;
  email: string | null;
  rol: string | null;
  activo: boolean;
};

export type RolUsuario = 'admin' | 'gerente' | 'supervisor' | 'seller';

export const ROLES: { value: RolUsuario; label: string }[] = [
  { value: 'seller', label: 'Vendedor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'admin', label: 'Administrador' },
];

export const etiquetaRol = (rol?: string | null): string =>
  ROLES.find((r) => r.value === rol)?.label
  ?? (rol === 'owner' ? 'Propietario' : rol || 'Empleado');

// Lista los usuarios de la empresa activa. El RPC ya filtra por
// get_user_tenant(), así que un admin de Caminero ve solo los de Caminero.
export async function fetchUsuarios(): Promise<UsuarioPanel[]> {
  const { data, error } = await supabase.rpc('get_usuarios_panel');
  if (error) throw error;
  return (data || []) as UsuarioPanel[];
}

export type CrearUsuarioInput = {
  nombre: string;
  usuario: string;        // nombre de usuario o correo real
  password: string;
  role: RolUsuario;
  tenantId: string;
};

export type CrearUsuarioResult = { mensaje: string; vinculado: boolean };

// Crea (o vincula, si ya existe en otra empresa) un usuario. Pasa por la
// edge function admin-management, que corre con service_role y valida que
// quien llama sea admin y que el tenant sea el suyo. La app nunca toca
// auth.admin directamente.
export async function crearUsuario(input: CrearUsuarioInput): Promise<CrearUsuarioResult> {
  const loginEmail = toLoginEmail(input.usuario);
  if (!loginEmail) throw new Error('Escribe un usuario o correo');
  if (!input.password) throw new Error('Escribe una contraseña');

  const { data, error } = await supabase.functions.invoke('admin-management', {
    body: {
      action: 'create_user',
      targetUserId: 'new', // placeholder; no se usa al crear
      updates: {
        email: loginEmail,
        password: input.password,
        full_name: input.nombre?.trim() || '',
        role: input.role,
        tenant_id: input.tenantId,
      },
    },
  });

  if (error) {
    // El cuerpo de la respuesta trae el mensaje real del backend.
    let msg = error.message;
    try {
      const body = await (error as any).context?.json?.();
      msg = body?.error || body?.message || msg;
    } catch {
      /* respuesta no-JSON */
    }
    if (/already.*registered|already exists|duplicate/i.test(msg || '')) {
      msg = `El usuario «${input.usuario}» ya existe. Elige otro nombre.`;
    }
    throw new Error(msg);
  }

  return {
    mensaje: data?.linked
      ? data.message
      : `Usuario creado. ${input.usuario.includes('@') ? input.usuario : `Usuario: ${input.usuario}`}. Ya puede iniciar sesión.`,
    vinculado: !!data?.linked,
  };
}
