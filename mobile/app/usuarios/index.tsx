import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, Modal, ScrollView,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, UserPlus, Users, X, ShieldCheck } from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import { isFullAccessRole } from '@/src/services/permissions';
import {
  fetchUsuarios, crearUsuario, etiquetaRol, ROLES,
  type UsuarioPanel, type RolUsuario,
} from '@/src/services/usuariosService';

export default function UsuariosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tenantId } = useAuthStore();
  const esAdmin = isFullAccessRole(profile?.role, profile?.is_superadmin);

  const [usuarios, setUsuarios] = useState<UsuarioPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await fetchUsuarios());
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (esAdmin) cargar(); else setLoading(false); }, [esAdmin, cargar]);

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2">
          <ArrowLeft color="#111827" size={24} />
        </TouchableOpacity>
        <Users color="#7c3aed" size={22} />
        <Text className="text-lg font-bold text-gray-900 ml-2 flex-1">Usuarios</Text>
      </View>

      {!esAdmin ? (
        <View className="flex-1 items-center justify-center p-8">
          <ShieldCheck color="#9ca3af" size={48} />
          <Text className="text-gray-500 text-center mt-4 text-base">
            Solo los administradores pueden ver y crear usuarios.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            refreshControl={<RefreshControl refreshing={loading} onRefresh={cargar} />}
          >
            <Text className="text-xs font-bold text-gray-400 uppercase px-4 pt-4 pb-1">
              {usuarios.length} usuario(s) en esta empresa
            </Text>
            {loading && !usuarios.length ? (
              <ActivityIndicator className="mt-8" color="#7c3aed" />
            ) : (
              <View className="bg-white border-y border-gray-200">
                {usuarios.map((u, i) => (
                  <View
                    key={u.id}
                    className={`flex-row items-center p-4 ${i !== usuarios.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <View className="bg-violet-100 w-11 h-11 rounded-full items-center justify-center mr-3">
                      <Text className="text-violet-700 font-bold text-lg">
                        {(u.display_name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-gray-900">{u.display_name}</Text>
                      {!!u.email && !u.email.endsWith('@usuario.motoflow.app') && (
                        <Text className="text-xs text-gray-400">{u.email}</Text>
                      )}
                    </View>
                    <View className="bg-slate-100 rounded-full px-3 py-1">
                      <Text className="text-xs font-bold text-slate-600">{etiquetaRol(u.rol)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View className="h-24" />
          </ScrollView>

          {/* Botón crear */}
          <TouchableOpacity
            onPress={() => setModal(true)}
            className="absolute right-5 bg-violet-600 rounded-full flex-row items-center px-5 py-4 shadow-lg"
            style={{ bottom: insets.bottom + 20 }}
          >
            <Plus color="#fff" size={22} />
            <Text className="text-white font-bold ml-1">Crear usuario</Text>
          </TouchableOpacity>

          <CrearUsuarioModal
            visible={modal}
            tenantId={tenantId}
            onClose={() => setModal(false)}
            onCreated={() => { setModal(false); cargar(); }}
          />
        </>
      )}
    </View>
  );
}

function CrearUsuarioModal({
  visible, tenantId, onClose, onCreated,
}: {
  visible: boolean;
  tenantId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RolUsuario>('seller');
  const [saving, setSaving] = useState(false);

  const limpiar = () => { setNombre(''); setUsuario(''); setPassword(''); setRole('seller'); };

  const guardar = async () => {
    if (!tenantId) { Alert.alert('Error', 'No se pudo determinar la empresa.'); return; }
    if (!usuario.trim()) { Alert.alert('Falta el usuario', 'Escribe un usuario o correo.'); return; }
    if (password.length < 6) { Alert.alert('Contraseña corta', 'Usa al menos 6 caracteres.'); return; }
    setSaving(true);
    try {
      const r = await crearUsuario({ nombre, usuario, password, role, tenantId });
      Alert.alert(r.vinculado ? 'Usuario vinculado' : 'Usuario creado', r.mensaje);
      limpiar();
      onCreated();
    } catch (e: any) {
      Alert.alert('No se pudo crear', e?.message || 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="bg-white rounded-t-3xl p-5" style={{ paddingBottom: insets.bottom + 20 }}>
            <View className="flex-row items-center mb-4">
              <UserPlus color="#7c3aed" size={22} />
              <Text className="text-lg font-bold text-gray-900 ml-2 flex-1">Nuevo usuario</Text>
              <TouchableOpacity onPress={onClose} className="p-1"><X color="#6b7280" size={22} /></TouchableOpacity>
            </View>

            <Text className="text-xs font-bold text-gray-500 mb-1">NOMBRE COMPLETO</Text>
            <TextInput
              value={nombre} onChangeText={setNombre} placeholder="Ej. Rafael Pérez"
              className="bg-gray-100 rounded-xl px-4 py-3 mb-3 text-gray-900"
            />

            <Text className="text-xs font-bold text-gray-500 mb-1">USUARIO O CORREO</Text>
            <TextInput
              value={usuario} onChangeText={setUsuario} placeholder="rafa (o correo real)"
              autoCapitalize="none" autoCorrect={false}
              className="bg-gray-100 rounded-xl px-4 py-3 mb-1 text-gray-900"
            />
            <Text className="text-[11px] text-gray-400 mb-3">
              Si no es correo, el usuario entra escribiendo solo ese nombre.
            </Text>

            <Text className="text-xs font-bold text-gray-500 mb-1">CONTRASEÑA</Text>
            <TextInput
              value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres"
              secureTextEntry autoCapitalize="none"
              className="bg-gray-100 rounded-xl px-4 py-3 mb-3 text-gray-900"
            />

            <Text className="text-xs font-bold text-gray-500 mb-1">ROL</Text>
            <View className="flex-row flex-wrap mb-4">
              {ROLES.map((r) => {
                const activo = role === r.value;
                return (
                  <TouchableOpacity
                    key={r.value}
                    onPress={() => setRole(r.value)}
                    className={`rounded-full px-4 py-2 mr-2 mb-2 border ${activo ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-300'}`}
                  >
                    <Text className={`text-sm font-bold ${activo ? 'text-white' : 'text-gray-600'}`}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={guardar} disabled={saving}
              className={`rounded-xl py-4 items-center ${saving ? 'bg-violet-300' : 'bg-violet-600'}`}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">Crear usuario</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
