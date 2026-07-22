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

export type ActualizarUsuarioInput = {
  userId: string;
  nombre?: string;
  usuario?: string;   // usuario o correo nuevo (vacío = no se cambia)
  password?: string;  // vacío = se mantiene la actual
  role?: RolUsuario;
};

// Edita un usuario existente, igual que la pantalla web:
//   * nombre / usuario-correo / contraseña → edge function admin-management
//     (corre con service_role; la app nunca toca auth.admin)
//   * rol → update directo a profiles (lo protege el RLS del tenant)
export async function actualizarUsuario(input: ActualizarUsuarioInput): Promise<void> {
  if (!input.userId) throw new Error('Usuario inválido');

  const updates: Record<string, string> = {};
  if (input.nombre?.trim()) updates.full_name = input.nombre.trim();
  if (input.usuario?.trim()) {
    const loginEmail = toLoginEmail(input.usuario);
    if (!loginEmail) throw new Error('Usuario o correo inválido');
    updates.email = loginEmail;
  }
  if (input.password) {
    if (input.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
    updates.password = input.password;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.functions.invoke('admin-management', {
      body: { action: 'update_user', targetUserId: input.userId, updates },
    });
    if (error) {
      let msg = error.message;
      try {
        const body = await (error as any).context?.json?.();
        msg = body?.error || body?.message || msg;
      } catch {
        /* respuesta no-JSON */
      }
      throw new Error(msg);
    }
  }

  if (input.role) {
    const { error } = await supabase
      .from('profiles')
      .update({ role: input.role })
      .eq('id', input.userId);
    if (error) throw new Error(error.message);
  }
}
