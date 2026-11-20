// =====================================================================
// Registrar empresa desde la app (19/11/2026) — igual que la web
// ---------------------------------------------------------------------
// Mismos pasos y campos que /registro (src/pages/RegistroEmpresaPage.jsx):
//   1. Empresa (nombre, tipo, RNC, teléfono, correo, dirección)
//   2. Usuario dueño (nombre, correo, contraseña)
//   3. Listo: confirmar el correo y entrar.
// El "no soy un robot" de Cloudflare solo corre en una página web: se abre
// motoflow.com.do/captcha-app en el navegador del teléfono y vuelve a la app
// con el token. Luego, igual que la web: registrar-empresa (comprueba el
// captcha y crea la empresa) + signUp del dueño con el tenant en metadata.
// Repuestos, servicios, dealer y cafetería entran en el plan Gratis; los
// demás, con la prueba de 15 días (sql/registro_free.sql).
// =====================================================================
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { ArrowLeft, CheckCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';

const WEB = 'https://motoflow.com.do';

const TIPOS = [
  { v: 'repuestos', t: 'Repuestos / Tienda', d: 'Piezas, productos con inventario' },
  { v: 'dealer', t: 'Dealer', d: 'Venta de vehículos por chasis' },
  { v: 'financiera', t: 'Financiera', d: 'Préstamos y cobranza' },
  { v: 'servicios', t: 'Servicios', d: 'Sin inventario: honorarios, mantenimiento' },
  { v: 'inmobiliaria', t: 'Inmobiliaria', d: 'Solares, ventas a plazos, alquileres' },
  { v: 'educativo', t: 'Centro educativo', d: 'Colegios: estudiantes y mensualidades' },
  { v: 'aluminio', t: 'Ventanas y aluminio', d: 'Proyectos, medidas y desglose de ventanas' },
  { v: 'cafeteria', t: 'Cafetería', d: 'Venta rápida con pantalla táctil' },
];
const TIPOS_FREE = ['repuestos', 'servicios', 'dealer', 'cafeteria'];

function Campo({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-semibold text-gray-700">{label}</Text>
      <TextInput className="rounded-xl bg-gray-100 px-4 py-3 text-base text-gray-900" placeholderTextColor="#9ca3af" {...props} />
    </View>
  );
}

// El enlace de vuelta del captcha (mobile://registro?token=…) puede hacer que
// el enrutador vuelva a montar esta pantalla: lo escrito se guarda aquí para
// no perderlo, SOLO mientras se espera la verificación (al salir de la
// pantalla se borra) y nunca las contraseñas.
const VACIO_EMPRESA = { nombre: '', rnc: '', telefono: '', email: '', direccion: '', tipo_negocio: 'repuestos' };
const borrador = {
  esperando: false,
  paso: 1,
  empresa: { ...VACIO_EMPRESA },
  usuario: { nombre: '', email: '' },
  creada: null as null | { tenant_id: string; plan: string | null },
};
const limpiarBorrador = () => {
  borrador.esperando = false; borrador.paso = 1; borrador.empresa = { ...VACIO_EMPRESA };
  borrador.usuario = { nombre: '', email: '' }; borrador.creada = null;
};

export default function RegistroScreen() {
  const router = useRouter();
  const [paso, setPasoEstado] = useState(borrador.paso);
  const setPaso = (n: number) => { borrador.paso = n; setPasoEstado(n); };
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [empresa, setEmpresa] = useState(borrador.empresa);
  const [usuario, setUsuario] = useState({ ...borrador.usuario, password: '', confirmPassword: '' });
  // La empresa ya creada en un intento anterior (falló solo el usuario) y el
  // plan que le dio el servidor: reintentar no crea otra.
  const [creada, setCreadaEstado] = useState(borrador.creada);
  const setCreada = (c: typeof borrador.creada) => { borrador.creada = c; setCreadaEstado(c); };
  useEffect(() => {
    borrador.empresa = empresa;
    borrador.usuario = { nombre: usuario.nombre, email: usuario.email };
  }, [empresa, usuario.nombre, usuario.email]);
  useEffect(() => () => { if (!borrador.esperando) limpiarBorrador(); }, []);
  const params = useLocalSearchParams<{ token?: string }>();
  useEffect(() => { if (typeof params.token === 'string' && params.token) setCaptcha(params.token); }, [params.token]);
  const entraFree = TIPOS_FREE.includes(empresa.tipo_negocio);
  const quedoFree = creada?.plan ? creada.plan === 'FREE' : entraFree;

  const volverALogin = () => { limpiarBorrador(); router.replace('/(auth)/login'); };
  // Atrás de Android: a la pantalla de entrada (no hay historial: raíz Slot).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paso === 2) setPaso(1); else volverALogin();
      return true;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  const setE = (k: keyof typeof empresa) => (v: string) => setEmpresa((p) => ({ ...p, [k]: v }));
  const setU = (k: keyof typeof usuario) => (v: string) => setUsuario((p) => ({ ...p, [k]: v }));

  const siguiente = () => {
    setError('');
    if (!empresa.nombre.trim()) { setError('El nombre de la empresa es requerido.'); return; }
    setPaso(2);
  };

  const verificar = async () => {
    setError('');
    borrador.esperando = true;
    try {
      const vuelta = Linking.createURL('registro');
      const r = await WebBrowser.openAuthSessionAsync(`${WEB}/captcha-app?vuelta=${encodeURIComponent(vuelta)}`, vuelta);
      if (r.type !== 'success' || !r.url) return;
      const token = Linking.parse(r.url).queryParams?.token;
      if (typeof token === 'string' && token) setCaptcha(token);
      else setError('La verificación no pasó. Intenta de nuevo.');
    } catch {
      setError('No se pudo abrir la verificación. Revisa tu conexión.');
    } finally {
      borrador.esperando = false;
    }
  };

  const registrar = async () => {
    setError('');
    if (!usuario.nombre.trim() || !usuario.email.trim() || !usuario.password) { setError('Todos los campos del usuario son requeridos.'); return; }
    if (usuario.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (usuario.password !== usuario.confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (!captcha && !creada) { setError('Primero toca "Verificar que no soy un robot".'); return; }

    setCargando(true);
    let tenantId: string | null = creada?.tenant_id || null;
    try {
      if (!tenantId) {
        const { data: alta, error: altaError } = await supabase.functions.invoke('registrar-empresa', { body: { ...empresa, captcha } });
        if (altaError) {
          let msg = altaError.message;
          try { msg = (await (altaError as any).context.json()).error || msg; } catch { /* sin cuerpo */ }
          throw new Error(msg);
        }
        if (!alta?.ok) throw new Error(alta?.error || 'No se pudo registrar la empresa.');
        tenantId = alta.tenant_id as string;
        setCreada({ tenant_id: tenantId, plan: alta.plan || null });
      }

      const { data: alta2, error: signUpError } = await supabase.auth.signUp({
        email: usuario.email.trim(),
        password: usuario.password,
        options: {
          data: { full_name: usuario.nombre.trim(), tenant_id: tenantId, role: 'admin' },
          emailRedirectTo: WEB,
        },
      });
      if (signUpError) throw signUpError;
      // Correo que ya tiene cuenta: Supabase no da error, devuelve un usuario
      // sin identidades y no manda correo.
      if (alta2?.user && Array.isArray(alta2.user.identities) && alta2.user.identities.length === 0) {
        throw new Error('Ese correo ya tiene una cuenta en MotoFlow. Usa otro correo para el dueño de esta empresa.');
      }
      setPaso(3);
      const plan = borrador.creada?.plan ?? null;
      limpiarBorrador();
      setCreadaEstado(tenantId ? { tenant_id: tenantId, plan } : null);
    } catch (e: any) {
      setError(e?.message || 'Ocurrió un error al registrar la empresa.');
      // El token es de un solo uso: si la empresa no se creó, verificar otra
      // vez; si se creó, el reintento solo crea el usuario.
      if (!tenantId) setCaptcha('');
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerClassName="flex-grow px-6 py-10" keyboardShouldPersistTaps="handled">
        <View className="mb-6 items-center">
          <View className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-brand">
            <Text className="text-2xl font-bold text-white">MF</Text>
          </View>
          <Text className="text-2xl font-bold text-gray-900">Registra tu empresa</Text>
          <Text className="mt-1 text-xs text-gray-500">
            {entraFree ? 'Plan Gratis para siempre — sin tarjeta de crédito' : '15 días gratis — sin tarjeta de crédito'}
          </Text>
        </View>

        {paso < 3 && (
          <View className="mb-5 flex-row items-center justify-center">
            <Text className={`text-xs font-bold ${paso >= 1 ? 'text-brand' : 'text-gray-400'}`}>1 Empresa</Text>
            <View className={`mx-3 h-px w-8 ${paso >= 2 ? 'bg-brand' : 'bg-gray-200'}`} />
            <Text className={`text-xs font-bold ${paso >= 2 ? 'text-brand' : 'text-gray-400'}`}>2 Usuario</Text>
          </View>
        )}

        {!!error && (
          <View className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        {paso === 1 && (
          <View>
            <Campo label="Nombre de la Empresa *" value={empresa.nombre} onChangeText={setE('nombre')} placeholder="Ej: Repuestos El Camino, S.R.L." />
            <Text className="mb-1 text-sm font-semibold text-gray-700">Tipo de empresa *</Text>
            <View className="mb-3 flex-row flex-wrap justify-between">
              {TIPOS.map((o) => {
                const sel = empresa.tipo_negocio === o.v;
                return (
                  <TouchableOpacity key={o.v} onPress={() => setE('tipo_negocio')(o.v)}
                    className={`mb-2 w-[48%] rounded-lg border px-2 py-2 ${sel ? 'border-brand bg-blue-50' : 'border-gray-200'}`}>
                    <Text className="text-sm font-semibold text-gray-800">{o.t}</Text>
                    <Text className="text-[11px] text-gray-500">{o.d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Campo label="RNC / Cédula" value={empresa.rnc} onChangeText={setE('rnc')} placeholder="000-00000-0" keyboardType="numbers-and-punctuation" />
            <Campo label="Teléfono" value={empresa.telefono} onChangeText={setE('telefono')} placeholder="809-000-0000" keyboardType="phone-pad" />
            <Campo label="Email empresa" value={empresa.email} onChangeText={setE('email')} placeholder="info@empresa.com" keyboardType="email-address" autoCapitalize="none" />
            <Campo label="Dirección" value={empresa.direccion} onChangeText={setE('direccion')} placeholder="Av. Principal #123, Ciudad" />
            <TouchableOpacity onPress={siguiente} className="mt-2 items-center rounded-xl bg-brand py-4">
              <Text className="text-lg font-semibold text-white">Siguiente →</Text>
            </TouchableOpacity>
          </View>
        )}

        {paso === 2 && (
          <View>
            <Campo label="Tu nombre completo *" value={usuario.nombre} onChangeText={setU('nombre')} placeholder="Juan Pérez" />
            <Campo label="Correo electrónico *" value={usuario.email} onChangeText={setU('email')} placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <Text className="mb-1 text-sm font-semibold text-gray-700">Contraseña *</Text>
            <View className="mb-3 flex-row items-center rounded-xl bg-gray-100 px-4">
              <TextInput className="flex-1 py-3 text-base text-gray-900" value={usuario.password} onChangeText={setU('password')}
                placeholder="Mínimo 6 caracteres" placeholderTextColor="#9ca3af" secureTextEntry={!verClave} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setVerClave(!verClave)}>
                {verClave ? <EyeOff color="#6b7280" size={20} /> : <Eye color="#6b7280" size={20} />}
              </TouchableOpacity>
            </View>
            <Campo label="Confirmar contraseña *" value={usuario.confirmPassword} onChangeText={setU('confirmPassword')} placeholder="Repite la contraseña" secureTextEntry autoCapitalize="none" />

            <TouchableOpacity onPress={verificar} disabled={!!captcha || !!creada}
              className={`mb-3 flex-row items-center justify-center rounded-xl border py-3 ${captcha || creada ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300'}`}>
              <ShieldCheck color={captcha || creada ? '#059669' : '#374151'} size={20} />
              <Text className={`ml-2 font-semibold ${captcha || creada ? 'text-emerald-700' : 'text-gray-800'}`}>
                {captcha || creada ? 'Verificado' : 'Verificar que no soy un robot'}
              </Text>
            </TouchableOpacity>

            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => setPaso(1)} className="flex-1 flex-row items-center justify-center rounded-xl border border-gray-300 py-4">
                <ArrowLeft color="#374151" size={18} /><Text className="ml-1 font-semibold text-gray-800">Atrás</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={registrar} disabled={cargando || (!captcha && !creada)}
                className={`flex-1 flex-row items-center justify-center rounded-xl bg-brand py-4 ${cargando || (!captcha && !creada) ? 'opacity-60' : ''}`}>
                {cargando && <ActivityIndicator color="#fff" className="mr-2" />}
                <Text className="font-semibold text-white">{cargando ? 'Registrando…' : 'Crear cuenta'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {paso === 3 && (
          <View className="items-center py-4">
            <CheckCircle color="#22c55e" size={64} />
            <Text className="mb-2 mt-4 text-xl font-bold text-gray-800">¡Empresa registrada!</Text>
            <Text className="mb-2 text-center text-sm text-gray-500">
              <Text className="font-semibold text-gray-700">{empresa.nombre}</Text>
              {quedoFree
                ? ' quedó registrada en el plan Gratis. Cuando quieras, prueba el plan Profesional 15 días desde el Inicio.'
                : ' quedó registrada con una prueba de 15 días.'}
            </Text>
            <Text className="mb-6 text-center text-xs text-gray-400">
              Revisa tu correo <Text className="font-semibold text-gray-700">{usuario.email}</Text> para confirmar tu cuenta y luego entra con él.
            </Text>
            <TouchableOpacity onPress={volverALogin} className="w-full items-center rounded-xl bg-brand py-4">
              <Text className="text-lg font-semibold text-white">Ir al inicio de sesión</Text>
            </TouchableOpacity>
          </View>
        )}

        {paso < 3 && (
          <TouchableOpacity onPress={volverALogin} className="mt-5 items-center">
            <Text className="text-xs text-gray-500">¿Ya tienes cuenta? <Text className="font-semibold text-brand">Inicia sesión</Text></Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
