import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';

// Pantalla que aparece al volver del correo de recuperación. Hay sesión, pero
// el sistema no se abre hasta que la persona elige su contraseña: si no, se
// entraría con un enlace de correo sin haber puesto clave nueva.
const NuevaPasswordForm = () => {
  const { cambiarPassword, signOut, user } = useAuth();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const corta = pass.length > 0 && pass.length < 6;
  const noCoinciden = pass2.length > 0 && pass !== pass2;
  const puede = pass.length >= 6 && pass === pass2 && !guardando;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!puede) return;
    setGuardando(true);
    const { error } = await cambiarPassword(pass);
    if (error) setGuardando(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#2563eb]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/10"
      >
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4"><MotoFlowLogo size="lg" /></div>
          <h1 className="text-lg font-bold text-gray-800 dark:text-white">Elige tu nueva contraseña</h1>
          {user?.email && (
            <p className="text-xs text-gray-500 mt-1">para <b>{user.email}</b></p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="np">Nueva contraseña</Label>
            <div className="relative mt-1">
              <Input
                id="np"
                type={ver ? 'text' : 'password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="pr-10"
                autoFocus
              />
              <Button
                type="button" variant="ghost" size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setVer(!ver)}
              >
                {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            {corta && <p className="text-[11px] text-amber-600 mt-1">Muy corta: usa al menos 6 caracteres.</p>}
          </div>

          <div>
            <Label htmlFor="np2">Repítela</Label>
            <Input
              id="np2"
              type={ver ? 'text' : 'password'}
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              placeholder="La misma de arriba"
              className="mt-1"
            />
            {noCoinciden && <p className="text-[11px] text-rose-600 mt-1">Las dos no son iguales.</p>}
          </div>

          <Button
            type="submit"
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold"
            disabled={!puede}
          >
            {guardando ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Guardando…
              </div>
            ) : (
              <><KeyRound className="w-4 h-4 mr-2" /> Guardar y entrar</>
            )}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={signOut}
            className="text-xs text-gray-400 hover:underline"
          >
            Cancelar y volver al inicio de sesión
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default NuevaPasswordForm;
