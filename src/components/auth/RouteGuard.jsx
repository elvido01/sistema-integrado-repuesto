import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canAccess } from '@/lib/permissionsHelper';

/**
 * RouteGuard protege vistas completas basándose en permisos.
 * @param {string} moduleKey - Clave del módulo a validar.
 * @param {React.ReactNode} children - Contenido a mostrar si tiene permiso.
 * @param {React.ReactNode} fallback - (Opcional) UI si no tiene permiso.
 */
const RouteGuard = ({ moduleKey, children, fallback }) => {
    const { profile, permissions, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-morla-blue"></div>
            </div>
        );
    }

    const hasAccess = canAccess(profile, permissions, moduleKey);

    if (!hasAccess) {
        return fallback || (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
                <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m11 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Acceso Denegado</h2>
                <p className="text-gray-600 max-w-md">
                    No tienes permisos suficientes para acceder al módulo <strong>{moduleKey}</strong>.
                    Contacta al administrador para solicitar acceso.
                </p>
            </div>
        );
    }

    return <>{children}</>;
};

export default RouteGuard;
