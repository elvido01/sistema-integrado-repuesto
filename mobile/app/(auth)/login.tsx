import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { supabase } from '@/src/supabase/client';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function signInWithEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Datos requeridos', 'Digite el correo y la contrasena.');
      return;
    }

    setLoading(true);
    console.log('Intento de login para:', trimmedEmail);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: password,
    });

    if (error) {
      console.error('Error de login:', error.message);
      Alert.alert('Error de Login', error.message);
    } else {
      console.log('Login exitoso para:', data.user?.email);
      router.replace('/(tabs)');
    }
    setLoading(false);
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
            placeholder="Correo electrónico"
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
            placeholder="Contraseña"
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
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" className="mr-2" />
          ) : null}
          <Text className="text-white text-lg font-semibold">Iniciar Sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
