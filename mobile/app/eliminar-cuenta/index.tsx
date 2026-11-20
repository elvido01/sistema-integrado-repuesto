// =====================================================================
// Eliminar mi cuenta (20/11/2026) — exigencia de Google Play
// ---------------------------------------------------------------------
// Explica qué se borra, pide la contraseña (se comprueba de nuevo) y la
// palabra ELIMINAR, y llama eliminar_mi_cuenta (sql/eliminar_mi_cuenta.sql),
// que decide en el servidor: borra o anonimiza al usuario, borra la empresa
// si quedó vacía o la conserva si tiene datos fiscales.
// =====================================================================
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { BIOMETRIC_CREDENTIALS_KEY } from '@/src/lib/biometria';

export default function EliminarCuentaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, empresa, signOut } = useAuthStore();
  const [clave, setClave] = useState('');
  const [palabra, setPalabra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const listo = clave.length > 0 && palabra.trim() === 'ELIMINAR';

  const eliminar = async () => {
    if (!listo || !user?.email) return;
    setEnviando(true);
    try {
      // La contraseña se comprueba de nuevo: un teléfono prestado o
      // desbloqueado no basta para borrar la cuenta de otro.
      const { error: errClave } = await supabase.auth.signInWithPassword({ email: user.email, password: clave });
      if (errClave) {
        const credencial = /invalid login credentials/i.test(errClave.message || '');
        throw new Error(credencial ? 'La contraseña no es correcta.' : `No se pudo comprobar la contraseña (${errClave.message}). Revisa tu conexión e intenta de nuevo.`);
      }
      const { data, error } = await supabase.rpc('eliminar_mi_cuenta', { p_confirmacion: 'ELIMINAR' });
      if (error) throw error;
      try { await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY); } catch { /* sin huella guardada */ }
      const empresaMsg = data?.empresa === 'borrada'
        ? ' Tu empresa no tenía datos y también se borró.'
        : data?.empresa === 'conservada (datos)'
          ? ' Los comprobantes y registros de tu empresa se conservan porque la ley obliga a guardarlos.'
          : '';
      Alert.alert('Cuenta eliminada', `Tu cuenta y tus datos personales se borraron.${empresaMsg}`);
      await signOut();
    } catch (e: any) {
      Alert.alert('No se pudo eliminar', e?.message || 'Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} className="mb-4 flex-row items-center">
          <ArrowLeft color="#374151" size={20} /><Text className="ml-1 text-gray-700">Volver</Text>
        </TouchableOpacity>

        <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <Trash2 color="#dc2626" size={28} />
        </View>
        <Text className="text-2xl font-bold text-gray-900">Eliminar mi cuenta</Text>
        <Text className="mt-1 text-sm text-gray-500">{user?.email}{empresa?.nombre ? ` · ${empresa.nombre}` : ''}</Text>

        <View className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <Text className="mb-2 font-bold text-gray-800">Qué pasa al eliminarla</Text>
          <Text className="mb-1 text-sm text-gray-700">• Se borran tu nombre, tu correo, tu contraseña y tus accesos. No podrás volver a entrar.</Text>
          <Text className="mb-1 text-sm text-gray-700">• Si eres el último usuario y tu empresa no tiene datos, la empresa también se borra.</Text>
          <Text className="mb-1 text-sm text-gray-700">• Las ventas, comprobantes y cierres de la empresa se conservan: la ley obliga a guardarlos. En ellos tu nombre aparece como "Usuario eliminado".</Text>
          <Text className="text-sm text-gray-700">• Si eres el único administrador y hay más usuarios, primero pon a otro de administrador.</Text>
        </View>
        <Text className="mt-3 text-xs text-gray-400">Esto no se puede deshacer.</Text>

        <Text className="mb-1 mt-5 text-sm font-semibold text-gray-700">Tu contraseña</Text>
        <TextInput className="rounded-xl bg-gray-100 px-4 py-3 text-base text-gray-900" value={clave} onChangeText={setClave}
          secureTextEntry autoCapitalize="none" placeholder="Contraseña" placeholderTextColor="#9ca3af" />

        <Text className="mb-1 mt-4 text-sm font-semibold text-gray-700">Escribe ELIMINAR para confirmar</Text>
        <TextInput className="rounded-xl bg-gray-100 px-4 py-3 text-base text-gray-900" value={palabra} onChangeText={setPalabra}
          autoCapitalize="characters" autoCorrect={false} placeholder="ELIMINAR" placeholderTextColor="#9ca3af" />

        <TouchableOpacity onPress={eliminar} disabled={!listo || enviando}
          className={`mt-6 flex-row items-center justify-center rounded-xl bg-red-600 py-4 ${!listo || enviando ? 'opacity-50' : ''}`}>
          {enviando && <ActivityIndicator color="#fff" className="mr-2" />}
          <Text className="text-lg font-semibold text-white">{enviando ? 'Eliminando…' : 'Eliminar mi cuenta para siempre'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
