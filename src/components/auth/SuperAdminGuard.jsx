import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ShieldAlert } from 'lucide-react';

/**
 * SuperAdminGuard protege vistas exclusivas del SuperAdmin.
 * Valida contra el flag is_superadmin del profile en la base de datos.
 */
const SuperAdminGuard = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const isSuperAdmin = profile?.is_superadmin === true;

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <div className="bg-red-100 text-red-600 p-5 rounded-full mb-4">
          <ShieldAlert className="w-14 h-14" />
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase">Acceso Restringido</h2>
        <p className="text-gray-600 max-w-md text-sm">
          Este panel es exclusivo para el administrador maestro del sistema.
          <br />
          Si crees que deberías tener acceso, contacta al equipo de soporte.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default SuperAdminGuard;
