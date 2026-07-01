import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowDown, ArrowLeft, ArrowUp, RefreshCw, Save, Settings, Shield, UserCog } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { MOBILE_MODULES, ModulePermission, canAccessModule, isFullAccessRole } from '@/src/services/permissions';
import { DEFAULT_QUICK_ACCESS, QUICK_ACCESS_OPTIONS, getQuickAccessTabs, saveQuickAccessTabs } from '@/src/services/quickAccess';

type EmployeeProfile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  nombre_completo?: string | null;
  role?: string | null;
  tenant_id?: string | null;
  is_superadmin?: boolean | null;
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador', description: 'Acceso total.' },
  { value: 'supervisor', label: 'Supervisor', description: 'Acceso segun modulos activos.' },
  { value: 'seller', label: 'Vendedor', description: 'Acceso segun modulos activos.' },
];

const getName = (user: EmployeeProfile) => user.full_name || user.nombre_completo || user.email || 'Usuario';
const getRoleLabel = (role?: string | null) => ROLE_OPTIONS.find((option) => option.value === role)?.label || role || 'Vendedor';

export default function ConfiguracionMobileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, permissions, tenantId, refreshProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingQuickAccess, setSavingQuickAccess] = useState(false);
  const [users, setUsers] = useState<EmployeeProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<EmployeeProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState('seller');
  const [selectedPermissions, setSelectedPermissions] = useState<ModulePermission[]>([]);
  const [quickAccessTabs, setQuickAccessTabs] = useState(DEFAULT_QUICK_ACCESS);

  const canConfigure = canAccessModule(profile, permissions, 'configuracion');
  const selectedHasFullAccess = isFullAccessRole(selectedRole, selectedUser?.is_superadmin);

  const selectedPermissionMap = useMemo(() => {
    const map = new Map<string, ModulePermission>();
    selectedPermissions.forEach((perm) => map.set(perm.module_key, perm));
    return map;
  }, [selectedPermissions]);
  const orderedQuickAccessOptions = useMemo(() => {
    const optionMap = new Map(QUICK_ACCESS_OPTIONS.map((option) => [option.name, option]));
    const enabled = quickAccessTabs.map((name) => optionMap.get(name)).filter(Boolean) as typeof QUICK_ACCESS_OPTIONS;
    const disabled = QUICK_ACCESS_OPTIONS.filter((option) => !quickAccessTabs.includes(option.name));
    return [...enabled, ...disabled];
  }, [quickAccessTabs]);

  const selectUser = useCallback(async (user: EmployeeProfile) => {
    setSelectedUser(user);
    setSelectedRole(user.role || 'seller');
    try {
      const { data, error } = await supabase
        .from('user_module_permissions')
        .select('module_key, can_view, can_edit')
        .eq('user_id', user.id);

      if (error) throw error;
      setSelectedPermissions((data || []) as ModulePermission[]);
    } catch (error: any) {
      setSelectedPermissions([]);
      Alert.alert('Error', error?.message || 'No se pudieron cargar los permisos.');
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!tenantId || !canConfigure) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, tenant_id, is_superadmin')
        .eq('tenant_id', tenantId)
        .order('role', { ascending: true })
        .order('email', { ascending: true });

      if (error) throw error;
      const rows = (data || []) as EmployeeProfile[];
      setUsers(rows);
      if (!selectedUser && rows.length > 0) {
        await selectUser(rows[0]);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar los empleados.');
    } finally {
      setLoading(false);
    }
  }, [canConfigure, selectUser, selectedUser, tenantId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    getQuickAccessTabs(user?.id).then(setQuickAccessTabs);
  }, [user?.id]);

  const setQuickAccessEnabled = (tabName: string, enabled: boolean) => {
    setQuickAccessTabs((prev) => {
      if (enabled) {
        return prev.includes(tabName) ? prev : [...prev, tabName];
      }
      return prev.filter((name) => name !== tabName);
    });
  };

  const moveQuickAccess = (tabName: string, direction: -1 | 1) => {
    setQuickAccessTabs((prev) => {
      const index = prev.indexOf(tabName);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const saveQuickAccess = async () => {
    setSavingQuickAccess(true);
    try {
      await saveQuickAccessTabs(quickAccessTabs, user?.id);
      Alert.alert('Guardado', 'Accesos rapidos actualizados.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron guardar los accesos rapidos.');
    } finally {
      setSavingQuickAccess(false);
    }
  };

  const setModuleAccess = (moduleKey: string, enabled: boolean) => {
    setSelectedPermissions((prev) => {
      const exists = prev.find((perm) => perm.module_key === moduleKey);
      if (exists) {
        return prev.map((perm) =>
          perm.module_key === moduleKey
            ? { ...perm, can_view: enabled, can_edit: enabled ? !!perm.can_edit : false }
            : perm
        );
      }
      return [...prev, { module_key: moduleKey, can_view: enabled, can_edit: false }];
    });
  };

  const setModuleEdit = (moduleKey: string, enabled: boolean) => {
    setSelectedPermissions((prev) => {
      const exists = prev.find((perm) => perm.module_key === moduleKey);
      if (exists) {
        return prev.map((perm) =>
          perm.module_key === moduleKey
            ? { ...perm, can_view: enabled ? true : !!perm.can_view, can_edit: enabled }
            : perm
        );
      }
      return [...prev, { module_key: moduleKey, can_view: enabled, can_edit: enabled }];
    });
  };

  const saveChanges = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: selectedRole })
        .eq('id', selectedUser.id);

      if (profileError) throw profileError;

      const payload = MOBILE_MODULES.map((module) => {
        const perm = selectedPermissionMap.get(module.key);
        return {
          user_id: selectedUser.id,
          module_key: module.key,
          can_view: selectedHasFullAccess ? true : !!perm?.can_view,
          can_edit: selectedHasFullAccess ? true : !!perm?.can_edit,
        };
      });

      const { error: permsError } = await supabase
        .from('user_module_permissions')
        .upsert(payload, { onConflict: 'user_id,module_key' });

      if (permsError) throw permsError;

      setUsers((prev) => prev.map((user) => (user.id === selectedUser.id ? { ...user, role: selectedRole } : user)));
      setSelectedUser((prev) => (prev ? { ...prev, role: selectedRole } : prev));
      await refreshProfile();
      Alert.alert('Guardado', 'Cargo y permisos actualizados correctamente.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  if (!canConfigure) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="bg-brand px-4 pb-4 flex-row items-center" style={{ paddingTop: Math.max(insets.top + 12, 24) }}>
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
            <ArrowLeft color="white" size={22} />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg">Configuracion</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Shield color="#94a3b8" size={48} />
          <Text className="text-slate-900 text-lg font-black mt-4 text-center">Sin acceso</Text>
          <Text className="text-slate-500 text-center mt-2">Tu cargo no tiene permiso para configurar empleados.</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-brand px-4 pb-4 flex-row items-center" style={{ paddingTop: Math.max(insets.top + 12, 24) }}>
        <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
          <ArrowLeft color="white" size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white font-bold text-lg">Configuracion</Text>
          <Text className="text-blue-100 text-xs">Cargos y acceso por modulo</Text>
        </View>
        <TouchableOpacity className="p-2" onPress={loadUsers} disabled={loading}>
          <RefreshCw color="white" size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1d4ed8" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 14, paddingBottom: Math.max(insets.bottom + 32, 48) }}>
          <View className="bg-white border border-slate-200 rounded-xl p-3 mb-4">
            <View className="flex-row items-center mb-2">
              <Settings color="#1d4ed8" size={20} />
              <View className="ml-2 flex-1">
                <Text className="text-slate-900 font-black">Accesos rapidos inferiores</Text>
                <Text className="text-slate-500 text-xs">Puedes quitar o cambiar el orden. Mas queda fijo.</Text>
              </View>
            </View>

            {orderedQuickAccessOptions.map((option) => {
              const enabled = quickAccessTabs.includes(option.name);
              const enabledIndex = quickAccessTabs.indexOf(option.name);
              return (
                <View key={option.name} className="flex-row items-center py-3 border-t border-slate-100">
                  <Switch value={enabled} onValueChange={(value) => setQuickAccessEnabled(option.name, value)} />
                  <Text className="flex-1 text-slate-900 font-bold ml-3">{option.label}</Text>
                  <TouchableOpacity
                    className={`w-9 h-9 rounded-lg items-center justify-center mr-2 ${enabled && enabledIndex > 0 ? 'bg-slate-100' : 'bg-slate-50 opacity-40'}`}
                    onPress={() => moveQuickAccess(option.name, -1)}
                    disabled={!enabled || enabledIndex <= 0}
                  >
                    <ArrowUp color="#475569" size={18} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`w-9 h-9 rounded-lg items-center justify-center ${enabled && enabledIndex < quickAccessTabs.length - 1 ? 'bg-slate-100' : 'bg-slate-50 opacity-40'}`}
                    onPress={() => moveQuickAccess(option.name, 1)}
                    disabled={!enabled || enabledIndex >= quickAccessTabs.length - 1}
                  >
                    <ArrowDown color="#475569" size={18} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              className={`mt-2 rounded-xl py-3 flex-row justify-center items-center ${savingQuickAccess ? 'bg-slate-400' : 'bg-blue-800'}`}
              onPress={saveQuickAccess}
              disabled={savingQuickAccess}
            >
              {savingQuickAccess ? <ActivityIndicator color="white" /> : <Save color="white" size={18} />}
              <Text className="text-white font-black ml-2">{savingQuickAccess ? 'Guardando...' : 'Guardar accesos rapidos'}</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-[11px] font-black uppercase text-slate-500 mb-2">Empleados</Text>
          <FlatList
            horizontal
            data={users}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => {
              const active = item.id === selectedUser?.id;
              return (
                <TouchableOpacity
                  className={`mr-2 rounded-xl border px-3 py-3 min-w-[180px] ${active ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200'}`}
                  onPress={() => selectUser(item)}
                >
                  <Text className="text-slate-900 font-black" numberOfLines={1}>{getName(item)}</Text>
                  <Text className="text-slate-500 text-xs mt-1" numberOfLines={1}>{item.email || 'Sin correo'}</Text>
                  <Text className="text-blue-800 text-xs font-bold mt-2">{getRoleLabel(item.role)}</Text>
                </TouchableOpacity>
              );
            }}
          />

          {selectedUser ? (
            <>
              <View className="bg-white border border-slate-200 rounded-xl p-3 mb-4">
                <View className="flex-row items-center mb-3">
                  <UserCog color="#1d4ed8" size={20} />
                  <View className="ml-2 flex-1">
                    <Text className="text-slate-900 font-black">{getName(selectedUser)}</Text>
                    <Text className="text-slate-500 text-xs">{selectedUser.email || 'Sin correo'}</Text>
                  </View>
                </View>

                <Text className="text-[11px] font-black uppercase text-slate-500 mb-2">Cargo</Text>
                <View className="flex-row flex-wrap gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <TouchableOpacity
                      key={role.value}
                      className={`rounded-xl border px-3 py-2 ${selectedRole === role.value ? 'bg-blue-700 border-blue-700' : 'bg-white border-slate-200'}`}
                      onPress={() => setSelectedRole(role.value)}
                    >
                      <Text className={`font-bold ${selectedRole === role.value ? 'text-white' : 'text-slate-700'}`}>{role.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text className="text-[11px] font-black uppercase text-slate-500 mb-2">Modulos permitidos</Text>
              {selectedHasFullAccess ? (
                <View className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
                  <View className="flex-row items-center">
                    <Shield color="#1d4ed8" size={20} />
                    <Text className="text-blue-900 font-black ml-2">Acceso total</Text>
                  </View>
                  <Text className="text-blue-800 text-sm mt-2">Este cargo puede entrar a todos los modulos sin configurar permisos individuales.</Text>
                </View>
              ) : null}

              {MOBILE_MODULES.map((module) => {
                const perm = selectedPermissionMap.get(module.key);
                const canView = selectedHasFullAccess || !!perm?.can_view;
                const canEdit = selectedHasFullAccess || !!perm?.can_edit;
                return (
                  <View key={module.key} className={`bg-white border rounded-xl p-3 mb-2 ${canView ? 'border-blue-100' : 'border-slate-200'}`}>
                    <View className="flex-row items-center">
                      <View className="bg-slate-100 rounded-lg p-2 mr-3">
                        <Settings color={canView ? '#1d4ed8' : '#94a3b8'} size={18} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-slate-900 font-black">{module.label}</Text>
                        <Text className="text-slate-500 text-xs mt-0.5">{module.description}</Text>
                      </View>
                      <Switch value={canView} onValueChange={(value) => setModuleAccess(module.key, value)} disabled={selectedHasFullAccess} />
                    </View>
                    <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-100">
                      <Text className="text-slate-500 text-xs font-bold uppercase">Permitir editar/guardar</Text>
                      <Switch value={canEdit} onValueChange={(value) => setModuleEdit(module.key, value)} disabled={selectedHasFullAccess || !canView} />
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <View className="bg-white border border-slate-200 rounded-xl p-6 items-center">
              <UserCog color="#94a3b8" size={42} />
              <Text className="text-slate-500 mt-3">No hay empleados disponibles.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {selectedUser ? (
        <View className="bg-white border-t border-slate-200 px-3 pt-3" style={{ paddingBottom: Math.max(insets.bottom + 14, 28) }}>
          <TouchableOpacity
            className={`bg-blue-800 rounded-xl py-3 flex-row justify-center items-center ${saving ? 'opacity-60' : ''}`}
            onPress={saveChanges}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="white" /> : <Save color="white" size={18} />}
            <Text className="text-white font-black ml-2">{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
