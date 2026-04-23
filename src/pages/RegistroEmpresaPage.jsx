import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, User, Mail, Phone, MapPin, FileText, Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';

const RegistroEmpresaPage = ({ onVolver }) => {
  const [step, setStep] = useState(1); // 1: empresa, 2: usuario, 3: éxito
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [empresa, setEmpresa] = useState({
    nombre: '',
    rnc: '',
    telefono: '',
    email: '',
    direccion: '',
  });

  const [usuario, setUsuario] = useState({
    nombre: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleEmpresaChange = (e) => {
    setEmpresa(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleUsuarioChange = (e) => {
    setUsuario(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleStep1 = (e) => {
    e.preventDefault();
    setError('');
    if (!empresa.nombre.trim()) {
      setError('El nombre de la empresa es requerido.');
      return;
    }
    setStep(2);
  };

  const handleRegistro = async (e) => {
    e.preventDefault();
    setError('');

    if (!usuario.nombre.trim() || !usuario.email.trim() || !usuario.password) {
      setError('Todos los campos del usuario son requeridos.');
      return;
    }
    if (usuario.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (usuario.password !== usuario.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      // 1. Crear el tenant en la BD (función SQL SECURITY DEFINER)
      const { data: tenantId, error: tenantError } = await supabase.rpc(
        'registrar_nueva_empresa',
        {
          p_nombre: empresa.nombre.trim(),
          p_rnc: empresa.rnc.trim() || null,
          p_direccion: empresa.direccion.trim() || null,
          p_telefono: empresa.telefono.trim() || null,
          p_email: empresa.email.trim() || null,
        }
      );

      if (tenantError) throw tenantError;

      // 2. Registrar el usuario admin con el tenant_id en metadata
      const { error: signUpError } = await supabase.auth.signUp({
        email: usuario.email.trim(),
        password: usuario.password,
        options: {
          data: {
            full_name: usuario.nombre.trim(),
            tenant_id: tenantId,
            role: 'admin',
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpError) throw signUpError;

      setStep(3);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al registrar la empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#2563eb] py-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-lg border border-white/10"
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <MotoFlowLogo size="md" showSlogan={false} />
          </div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Registra tu empresa</h1>
          <p className="text-gray-500 text-xs mt-1">15 días gratis — sin tarjeta de crédito</p>
        </div>

        {/* Steps indicator */}
        {step < 3 && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className={`flex items-center gap-1 text-xs font-medium ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
              Empresa
            </div>
            <div className={`h-px w-8 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
            <div className={`flex items-center gap-1 text-xs font-medium ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
              Usuario
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* STEP 1: Datos de la empresa */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <Label htmlFor="nombre" className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Nombre de la Empresa *
              </Label>
              <Input
                id="nombre"
                name="nombre"
                value={empresa.nombre}
                onChange={handleEmpresaChange}
                placeholder="Ej: Repuestos El Camino, S.R.L."
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="rnc" className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> RNC / Cédula
              </Label>
              <Input
                id="rnc"
                name="rnc"
                value={empresa.rnc}
                onChange={handleEmpresaChange}
                placeholder="000-00000-0"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="telefono" className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> Teléfono
                </Label>
                <Input
                  id="telefono"
                  name="telefono"
                  value={empresa.telefono}
                  onChange={handleEmpresaChange}
                  placeholder="809-000-0000"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email_empresa" className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> Email empresa
                </Label>
                <Input
                  id="email_empresa"
                  name="email"
                  type="email"
                  value={empresa.email}
                  onChange={handleEmpresaChange}
                  placeholder="info@empresa.com"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="direccion" className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Dirección
              </Label>
              <Input
                id="direccion"
                name="direccion"
                value={empresa.direccion}
                onChange={handleEmpresaChange}
                placeholder="Av. Principal #123, Ciudad"
                className="mt-1"
              />
            </div>

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
              Siguiente →
            </Button>
          </form>
        )}

        {/* STEP 2: Datos del usuario owner */}
        {step === 2 && (
          <form onSubmit={handleRegistro} className="space-y-4">
            <div>
              <Label htmlFor="nombre_usuario" className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Tu nombre completo *
              </Label>
              <Input
                id="nombre_usuario"
                name="nombre"
                value={usuario.nombre}
                onChange={handleUsuarioChange}
                placeholder="Juan Pérez"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="email_usuario" className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Correo electrónico *
              </Label>
              <Input
                id="email_usuario"
                name="email"
                type="email"
                value={usuario.email}
                onChange={handleUsuarioChange}
                placeholder="tu@correo.com"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Contraseña *
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={usuario.password}
                  onChange={handleUsuarioChange}
                  placeholder="Mínimo 6 caracteres"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirmar contraseña *</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={usuario.confirmPassword}
                onChange={handleUsuarioChange}
                placeholder="Repite la contraseña"
                className="mt-1"
                required
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Atrás
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? 'Registrando...' : 'Crear cuenta'}
              </Button>
            </div>
          </form>
        )}

        {/* STEP 3: Éxito */}
        {step === 3 && (
          <div className="text-center py-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
              ¡Empresa registrada!
            </h2>
            <p className="text-gray-500 text-sm mb-2">
              <span className="font-semibold text-gray-700">{empresa.nombre}</span> ha sido
              registrada exitosamente con un plan TRIAL de 15 días.
            </p>
            <p className="text-gray-400 text-xs mb-6">
              Revisa tu correo <span className="font-medium">{usuario.email}</span> para
              confirmar tu cuenta y comenzar a usar el sistema.
            </p>
            <Button onClick={onVolver} className="w-full bg-blue-600 hover:bg-blue-700">
              Ir al inicio de sesión
            </Button>
          </div>
        )}

        {/* Link volver al login */}
        {step < 3 && (
          <p className="text-center text-xs text-gray-400 mt-5">
            ¿Ya tienes cuenta?{' '}
            <button
              onClick={onVolver}
              className="text-blue-500 hover:underline font-medium"
            >
              Inicia sesión
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default RegistroEmpresaPage;
