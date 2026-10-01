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
    const { profile, permissions, loading, empresa } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-morla-blue"></div>
            </div>
        );
    }

    // Apagado para TODA la empresa (config_empresa.modulos_deshabilitados),
    // administradores incluidos. Ej.: Compras y Ventas en MotoPréstamos
    // (01/10/2026), donde se digitó por error una compra de Caminero Motors.
    if ((empresa?.modulos_deshabilitados || []).includes(moduleKey)) {
        return fallback || (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Módulo desactivado en esta empresa</h2>
                <p className="text-gray-600 max-w-md">
                    <strong>{moduleKey}</strong> no se usa en <strong>{empresa?.nombre || 'esta empresa'}</strong>.
                    Si necesitas grabar aquí, cambia primero a la empresa correcta.
                </p>
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
