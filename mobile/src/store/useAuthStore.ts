import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';

interface AuthState {
  session: Session | null;
  user: User | null;
  empresaId: string | null;
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setEmpresaId: (id: string | null) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  empresaId: 'b7c3d702-8e6f-45a1-9c16-52bd800f133d', // Default to existing empresa ID for now or null
  setSession: (session) => set({ session, user: session?.user || null }),
  setUser: (user) => set({ user }),
  setEmpresaId: (id) => set({ empresaId: id }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
