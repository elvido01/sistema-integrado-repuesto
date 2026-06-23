import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { supabase } from '@/src/supabase/client';
import { Lock, Mail, Eye, EyeOff, Fingerprint } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_CREDENTIALS_KEY = 'motoflow.biometric.credentials';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  async function checkBiometricAvailability() {
    if (Platform.OS === 'web') {
      setBiometricReady(false);
      return;
    }

    const [hasHardware, isEnrolled, savedCredentials] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY),
    ]);

    setBiometricReady(hasHardware && isEnrolled && !!savedCredentials);
  }

  async function saveBiometricCredentials(trimmedEmail: string, plainPassword: string) {
    if (Platform.OS === 'web') return;

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return;

    await SecureStore.setItemAsync(
      BIOMETRIC_CREDENTIALS_KEY,
      JSON.stringify({ email: trimmedEmail, password: plainPassword }),
      { requireAuthentication: false }
    );
    setBiometricReady(true);
  }

  async function signIn(trimmedEmail: string, plainPassword: string, shouldSaveBiometric = true) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: plainPassword,
    });

    if (error) {
      console.error('Error de login:', error.message);
      Alert.alert('Error de Login', error.message);
      return false;
    }

    if (shouldSaveBiometric) {
      await saveBiometricCredentials(trimmedEmail, plainPassword);
    }

    console.log('Login exitoso para:', data.user?.email);
    router.replace('/(tabs)');
    return true;
  }

  async function signInWithEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Datos requeridos', 'Digite el correo y la contrasena.');
      return;
    }

    setLoading(true);
    console.log('Intento de login para:', trimmedEmail);
    await signIn(trimmedEmail, password, true);
    setLoading(false);
  }

  async function signInWithBiometric() {
    if (Platform.OS === 'web') return;

    setBiometricLoading(true);
    try {
      const saved = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);
      if (!saved) {
        setBiometricReady(false);
        Alert.alert('Huella no activada', 'Inicia sesion con correo y clave una vez para activar la huella.');
        return;
      }

      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entrar a Motoflow',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar clave del telefono',
        disableDeviceFallback: false,
      });

      if (!auth.success) return;

      const credentials = JSON.parse(saved);
      await signIn(credentials.email, credentials.password, false);
    } catch (error: any) {
      console.error('Error de biometria:', error?.message || error);
      Alert.alert('Error', 'No se pudo iniciar sesion con huella.');
    } finally {
      setBiometricLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-white justify-center px-6">
      <View className="items-center mb-10">
        <View className="bg-brand w-24 h-24 rounded-full items-center justify-center mb-4">
          <Text className="text-white text-3xl font-bold">MF</Text>
        </View>
        <Text className="text-3xl font-bold text-gray-900">Motoflow</Text>
        <Text className="text-gray-500 text-base mt-2">Sistema Integrado Repuestos Morla</Text>
      </View>

      <View className="space-y-4">
        <View className="bg-gray-100 flex-row items-center rounded-xl px-4 py-3">
          <Mail color="#6b7280" size={20} />
          <TextInput
            className="flex-1 ml-3 text-base text-gray-900"
            placeholder="Correo electronico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View className="bg-gray-100 flex-row items-center rounded-xl px-4 py-3">
          <Lock color="#6b7280" size={20} />
          <TextInput
            className="flex-1 ml-3 text-base text-gray-900"
            placeholder="Contrasena"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="px-2">
            {showPassword ? (
              <EyeOff color="#6b7280" size={20} />
            ) : (
              <Eye color="#6b7280" size={20} />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className={`bg-brand rounded-xl py-4 mt-6 items-center flex-row justify-center ${loading ? 'opacity-70' : ''}`}
          onPress={signInWithEmail}
          disabled={loading || biometricLoading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" className="mr-2" />
          ) : null}
          <Text className="text-white text-lg font-semibold">Iniciar Sesion</Text>
        </TouchableOpacity>

        {biometricReady ? (
          <TouchableOpacity
            className={`border border-brand rounded-xl py-4 mt-3 items-center flex-row justify-center ${biometricLoading ? 'opacity-70' : ''}`}
            onPress={signInWithBiometric}
            disabled={biometricLoading || loading}
          >
            {biometricLoading ? (
              <ActivityIndicator color="#1d4ed8" className="mr-2" />
            ) : (
              <Fingerprint color="#1d4ed8" size={22} />
            )}
            <Text className="text-brand text-lg font-semibold ml-2">Entrar con huella</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
