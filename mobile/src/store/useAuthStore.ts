import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';

type Profile = {
  id: string;
  tenant_id: string | null;
  role?: string | null;
  is_superadmin?: boolean | null;
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
    empresa: empresaData,
    tenantId,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  empresa: null,
  tenantId: null,
  empresaId: null,
  setSession: async (session) => {
    const user = session?.user || null;
    set({ session, user });

    if (!user) {
      set({ profile: null, empresa: null, tenantId: null, empresaId: null });
      return;
    }

    try {
      const { profile, empresa, tenantId } = await fetchProfileAndEmpresa(user.id);
      set({ profile, empresa, tenantId, empresaId: tenantId });
    } catch (error) {
      console.error('[AuthStore] Error loading profile/company:', error);
      set({ profile: null, empresa: null, tenantId: null, empresaId: null });
    }
  },
  setUser: (user) => set({ user }),
  setEmpresaId: (id) => set({ tenantId: id, empresaId: id }),
  refreshProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      set({ session: null, user: null, profile: null, empresa: null, tenantId: null, empresaId: null });
      return;
    }
    const { profile, empresa, tenantId } = await fetchProfileAndEmpresa(session.user.id);
    set({ session, user: session.user, profile, empresa, tenantId, empresaId: tenantId });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, empresa: null, tenantId: null, empresaId: null });
  },
}));
