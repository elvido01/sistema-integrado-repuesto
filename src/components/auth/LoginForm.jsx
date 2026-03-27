import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';
import { supabase } from '@/lib/customSupabaseClient';

const LoginForm = ({ onRegistrar }) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Branding del tenant detectado por dominio
  const [tenantBranding, setTenantBranding] = useState(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    // No detectar en localhost ni en el dominio de MotoFlow
    const skipDomains = ['localhost', '127.0.0.1', 'motoflow.pages.dev'];
    if (skipDomains.some(d => hostname.includes(d))) {
      setBrandingLoaded(true);
      return;
    }

    const fetchBranding = async () => {
      try {
        const { data } = await supabase.rpc('get_tenant_por_dominio', {
          p_dominio: hostname,
        });
        if (data && data.length > 0) {
          setTenantBranding(data[0]);
        }
      } catch (err) {
        console.error('[LoginForm] Error fetching tenant branding:', err);
      } finally {
        setBrandingLoaded(true);
      }
    };

    fetchBranding();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await signIn(email, password);
  };

  const nombreMostrado = tenantBranding?.nombre || 'MotoFlow';
  const logoUrl = tenantBranding?.logo_url || null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#2563eb]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/10"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            {brandingLoaded && logoUrl ? (
              // Logo del tenant
              <img
                src={logoUrl}
                alt={nombreMostrado}
                className="object-contain h-16"
              />
            ) : brandingLoaded && tenantBranding ? (
              // Tenant sin logo: inicial + nombre
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-3xl shadow-lg">
                  {nombreMostrado.charAt(0).toUpperCase()}
                </div>
                <span className="text-xl font-bold text-gray-800 dark:text-white">
                  {nombreMostrado}
                </span>
              </div>
            ) : (
              // Default: logo MotoFlow
              <MotoFlowLogo size="lg" showSlogan={true} />
            )}
          </div>

          {tenantBranding ? (
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
              Sistema de gestión — {nombreMostrado}
            </p>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-3">
              Sistema inteligente de gestión empresarial
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@empresa.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative mt-1">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold"
            disabled={loading || !email || !password}
          >
            {loading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Iniciando sesión...
              </div>
            ) : (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Iniciar Sesión
              </>
            )}
          </Button>
        </form>

        {/* Link a registro — solo si no hay tenant detectado (es la plataforma MotoFlow) */}
        {onRegistrar && !tenantBranding && (
          <div className="mt-5 text-center">
            <p className="text-xs text-gray-500">
              ¿Nuevo en MotoFlow?{' '}
              <button
                type="button"
                onClick={onRegistrar}
                className="text-blue-500 hover:underline font-semibold"
              >
                Registra tu empresa gratis
              </button>
            </p>
          </div>
        )}

        <div className="mt-4 text-center">
          <p className="text-[10px] text-gray-400">
            © 2026 {nombreMostrado} — Todos los derechos reservados
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginForm;
