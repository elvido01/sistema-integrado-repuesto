import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
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
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

async function fetchProfileAndEmpresa(userId: string) {
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) throw profileError;

  const tenantId = profileData?.tenant_id || null;
  let empresaData: EmpresaConfig | null = null;
  let permissionsData: ModulePermission[] = [];

  // La app movil trabaja SIEMPRE con la empresa del perfil (no tiene selector).
  // Pero las RPC del servidor resuelven la empresa con get_user_tenant(), que
  // respeta usuario_tenant_activo — y ese lo cambia el selector de la WEB. Si
  // quedan desalineados, el movil muestra "CAMINERO MOTORS" pero el servidor
  // sirve otra empresa: catalogo vacio, ventas en blanco, etc. (caso yimber:
  // activo en Odalys, catalogo de Caminero vacio). Aqui se realinean.
  if (tenantId) {
    try {
      const { data: activo } = await supabase.rpc('get_user_tenant');
      if (activo && activo !== tenantId) {
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
      .select('nombre, razon_social, rnc, direccion1, direccion2, telefono, email, logo_url, formato_factura')
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
  setSession: async (session) => {
    const user = session?.user || null;
    set({ session, user });

    if (!user) {
      set({ profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null });
      return;
    }

    try {
      const { profile, permissions, empresa, tenantId } = await fetchProfileAndEmpresa(user.id);
      set({ profile, permissions, empresa, tenantId, empresaId: tenantId });
    } catch (error) {
      console.error('[AuthStore] Error loading profile/company:', error);
      set({ profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null });
    }
  },
  setUser: (user) => set({ user }),
  setEmpresaId: (id) => set({ tenantId: id, empresaId: id }),
  refreshProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      set({ session: null, user: null, profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null });
      return;
    }
    const { profile, permissions, empresa, tenantId } = await fetchProfileAndEmpresa(session.user.id);
    set({ session, user: session.user, profile, permissions, empresa, tenantId, empresaId: tenantId });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, permissions: [], empresa: null, tenantId: null, empresaId: null });
  },
}));
