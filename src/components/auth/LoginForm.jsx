import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Eye, EyeOff, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';
import { supabase } from '@/lib/customSupabaseClient';
import { toLoginEmail } from '@/lib/loginIdentity';

const LoginForm = ({ onRegistrar }) => {
  const { signIn, enviarRecuperacion } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // 'idle' | 'enviando' | 'enviado' | 'sin_correo'
  const [recupero, setRecupero] = useState('idle');

  // Multi-empresa: si el usuario pertenece a 2+ empresas, elegir cuál
  const [empresas, setEmpresas] = useState([]);
  const [empresaSel, setEmpresaSel] = useState('');

  useEffect(() => {
    const v = email.trim();
    if (!v) { setEmpresas([]); setEmpresaSel(''); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc('get_empresas_login', {
          p_usuario: toLoginEmail(v),
        });
        const lista = data || [];
        setEmpresas(lista);
        setEmpresaSel(prev =>
          lista.some(e => e.tenant_id === prev) ? prev : (lista[0]?.tenant_id || '')
        );
      } catch {
        setEmpresas([]);
        setEmpresaSel('');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [email]);

  // Branding del tenant detectado por dominio
  const [tenantBranding, setTenantBranding] = useState(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    // No detectar en localhost ni en dominios de despliegue de MotoFlow:
    // el login de la plataforma siempre muestra la marca MotoFlow. El
    // white-label por tenant queda solo para dominios propios de clientes
    // (tenants.dominio también alimenta la tienda pública, no se toca).
    const skipDomains = ['localhost', '127.0.0.1'];
    if (skipDomains.some(d => hostname.includes(d)) || hostname.endsWith('.pages.dev') || hostname.includes('motoflow')) {
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
    try {
      // Permite entrar con usuario (sin correo) o con correo real;
      // si eligió empresa (multi-empresa), entra directo a esa
      const { error } = await signIn(
        toLoginEmail(email),
        password,
        empresas.length > 1 ? empresaSel : null
      );
      // Si hubo error (ej. contraseña incorrecta), reactivar el boton.
      // Si fue exitoso, la sesion cambia y el componente se desmonta solo.
      if (error) setLoading(false);
    } catch (err) {
      console.error('[LoginForm] signIn error:', err);
      setLoading(false);
    }
  };

  const handleRecuperar = async () => {
    setRecupero('enviando');
    const { error } = await enviarRecuperacion(email);
    if (error?.message === 'sin_correo') setRecupero('sin_correo');
    else if (error) setRecupero('idle');
    else setRecupero('enviado');
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
            <Label htmlFor="email">Usuario o Correo</Label>
            <Input
              id="email"
              type="text"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="usuario o tu@empresa.com"
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

          {/* Selector de empresa: solo aparece si el usuario está en 2+ empresas */}
          {empresas.length > 1 && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <Label htmlFor="empresa" className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" /> Empresa
              </Label>
              <select
                id="empresa"
                value={empresaSel}
                onChange={(e) => setEmpresaSel(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {empresas.map((e) => (
                  <option key={e.tenant_id} value={e.tenant_id}>{e.nombre}</option>
                ))}
              </select>
            </motion.div>
          )}

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

        {/* Recuperar contraseña. Solo funciona con correos reales: quien entra
            con usuario no tiene buzón, y mandarlo a revisarlo sería pasearlo. */}
        <div className="mt-4 text-center">
          {recupero === 'enviado' ? (
            <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              Te enviamos un enlace a <b>{email.trim()}</b>. Ábrelo y pon tu contraseña nueva.
              Si no llega en unos minutos, mira la carpeta de correo no deseado.
            </p>
          ) : recupero === 'sin_correo' ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-left">
              Escribe arriba tu <b>correo completo</b> para enviarte el enlace.
              Si entras con un nombre de usuario (sin correo), no hay a dónde enviarlo:
              pídele a el administrador de tu empresa que te ponga una nueva.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleRecuperar}
              disabled={recupero === 'enviando'}
              className="text-xs text-blue-500 hover:underline font-semibold disabled:opacity-60"
            >
              {recupero === 'enviando' ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
            </button>
          )}
        </div>

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
