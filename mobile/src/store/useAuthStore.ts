import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { useCartStore } from './useCartStore';
import type { ModulePermission } from '../services/permissions';

type Profile = {
  id: string;
  tenant_id: string | null;
  role?: string | null;
  is_superadmin?: boolean | null;
  full_name?: string | null;
  nombre_completo?: string | null;
};

type EmpresaConfig = {
  nombre?: string | null;
  razon_social?: string | null;
  rnc?: string | null;
  direccion1?: string | null;
  direccion2?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  formato_factura?: string | null;
  // repuestos | dealer | financiera | servicios | inmobiliaria
  tipo_negocio?: string | null;
};

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: ModulePermission[];
  empresa: EmpresaConfig | null;
  tenantId: string | null;
  empresaId: string | null;
  setSession: (session: Session | null) => Promise<void>;
  setUser: (user: User | null) => void;
  setEmpresaId: (id: string | null) => void;
  /** Empresas a las que el usuario puede entrar (para el selector del Inicio). */
  misEmpresas: { tenant_id: string; nombre: string }[];
  /** Cambia la empresa con la que trabaja la app (y la activa en el servidor). */
  cambiarEmpresa: (tenantId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

// (23/11/2026) Empresa de la app = la ACTIVA del servidor (usuario_tenant_activo,
// la misma que usa la web) si es una de las suyas; el Inicio muestra su nombre
// con un selector para cambiarla. Antes la app usaba solo la del perfil y el
// super admin no tiene (tenant_id null): tenantId quedaba vacío, Inicio en
// cero, y en Usuarios salía Zuri (el servidor tenía activo el colegio). Al
// abrir la app NO se mueve la activa (eso cambiaría la web sin avisar); solo
// se realinea a la del perfil si la activa no es válida para el usuario.
async function fetchProfileAndEmpresa(userId: string) {
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) throw profileError;

  let misEmpresas: { tenant_id: string; nombre: string }[] = [];
  try {
    const { data } = await supabase.rpc('get_mis_empresas');
    misEmpresas = ((data || []) as any[])
      .filter((e) => e?.tenant_id)
      .map((e) => ({ tenant_id: e.tenant_id, nombre: e.nombre || 'Empresa' }));
  } catch {
    /* sin lista: no hay selector, la app sigue con la del perfil */
  }

  let activo: string | null = null;
  try {
    const { data } = await supabase.rpc('get_user_tenant');
    activo = (data as string) || null;
  } catch { /* sin activa: se usa la del perfil */ }

  const activaValida = !!activo && (misEmpresas.some((e) => e.tenant_id === activo) || !!profileData?.is_superadmin);
  if (activaValida && activo && !misEmpresas.some((e) => e.tenant_id === activo)) {
    // Super admin dentro de una empresa de la que no es miembro: que salga en el selector.
    const { data: t } = await supabase.from('config_empresa').select('nombre').eq('tenant_id', activo).maybeSingle();
    misEmpresas = [{ tenant_id: activo, nombre: (t as any)?.nombre || 'Empresa' }, ...misEmpresas];
  }
  const tenantId: string | null = activaValida
    ? activo
    : (profileData?.tenant_id || misEmpresas[0]?.tenant_id || null);
  let empresaData: EmpresaConfig | null = null;
  let permissionsData: ModulePermission[] = [];

  // Las RPC del servidor resuelven la empresa con get_user_tenant(). Si la
  // activa no es válida para este usuario (caso yimber: activo en una empresa
  // ajena, catálogo vacío), se realinea a la que va a mostrar la app.
  if (tenantId && !activaValida) {
    try {
      if (activo !== tenantId) {
        await supabase.rpc('cambiar_empresa_activa', { p_tenant: tenantId });
      }
    } catch {
      /* si falla, la app sigue: solo se pierde la realineacion */
    }
  }

  const { data: perms, error: permsError } = await supabase
    .from('user_module_permissions')
    .select('module_key, can_view, can_edit')
    .eq('user_id', userId);

  if (permsError) throw permsError;
  permissionsData = (perms || []) as ModulePermission[];

  if (tenantId) {
    const { data, error } = await supabase
      .from('config_empresa')
      .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, formato_factura, tipo_negocio')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;
    empresaData = data || null;
  }

  return {
    profile: (profileData || null) as Profile | null,
    permissions: permissionsData,
    empresa: empresaData,
    tenantId,
    misEmpresas,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  permissions: [],
  empresa: null,
  tenantId: null,
  empresaId: null,
  misEmpresas: [],
  setSession: async (session) => {
    const user = session?.user || null;
    set({ session, user });

    if (!user) {
      set({ profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null, misEmpresas: [] });
      return;
    }

    try {
      const { profile, permissions, empresa, tenantId, misEmpresas } = await fetchProfileAndEmpresa(user.id);
      set({ profile, permissions, empresa, tenantId, empresaId: tenantId, misEmpresas });
    } catch (error) {
      console.error('[AuthStore] Error loading profile/company:', error);
      set({ profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null, misEmpresas: [] });
    }
  },
  setUser: (user) => set({ user }),
  setEmpresaId: (id) => set({ tenantId: id, empresaId: id }),
  cambiarEmpresa: async (nuevo) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { error } = await supabase.rpc('cambiar_empresa_activa', { p_tenant: nuevo });
    if (error) throw error;
    // El carrito (productos, cliente, cotización de origen) es de la empresa anterior.
    useCartStore.getState().clearCart();
    try {
      const r = await fetchProfileAndEmpresa(session.user.id);
      set({
        session, user: session.user, profile: r.profile, permissions: r.permissions, empresa: r.empresa,
        tenantId: r.tenantId, empresaId: r.tenantId, misEmpresas: r.misEmpresas,
      });
    } catch (e) {
      // El servidor ya cambió: la app no puede quedarse con la anterior.
      set({ tenantId: nuevo, empresaId: nuevo, empresa: null });
      throw new Error('Se cambió la empresa pero no se pudo recargar todo. Desliza hacia abajo para actualizar.');
    }
  },
  refreshProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      set({ session: null, user: null, profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null, misEmpresas: [] });
      return;
    }
    const { profile, permissions, empresa, tenantId, misEmpresas } = await fetchProfileAndEmpresa(session.user.id);
    set({ session, user: session.user, profile, permissions, empresa, tenantId, empresaId: tenantId, misEmpresas });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null, misEmpresas: [] });
  },
}));
