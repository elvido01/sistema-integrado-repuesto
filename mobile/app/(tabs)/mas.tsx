import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import { LogOut, Settings, PackageOpen, MapPin, Barcode, FileText, Boxes, Printer, Receipt, ClipboardList, Pin, PinOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { canAccessModule } from '@/src/services/permissions';
import { getQuickAccessTabs, saveQuickAccessTabs, subscribeQuickAccess } from '@/src/services/quickAccess';

const CAMINERO_MOTORS_TENANT = 'b39506c3-27dc-467d-830b-096731b83113';

export default function MasScreen() {
  const { signOut, user, tenantId, profile, permissions } = useAuthStore();
  const router = useRouter();
  const isCamineroMotors = tenantId === CAMINERO_MOTORS_TENANT;
  const [quickTabs, setQuickTabs] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    getQuickAccessTabs(user?.id).then((tabs) => {
      if (mounted) setQuickTabs(tabs);
    });
    const unsubscribe = subscribeQuickAccess((tabs) => setQuickTabs(tabs));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  const menuItems = [
    { title: 'Scanner', icon: Barcode, route: '/(tabs)/scanner', color: '#8b5cf6', moduleKey: 'scanner', quickName: 'scanner' },
    {
      title: isCamineroMotors ? 'Recibo de Pago' : 'Recibo de Ingreso',
      icon: Receipt,
      route: isCamineroMotors ? '/(tabs)/recibo-pago-financiera' : '/(tabs)/recibo-ingreso',
      color: '#1d4ed8',
      moduleKey: 'recibo-ingreso',
      quickName: isCamineroMotors ? 'recibo-pago-financiera' : 'recibo-ingreso',
    },
    ...(isCamineroMotors
      ? [{ title: 'Solicitudes de Compra', icon: ClipboardList, route: '/(tabs)/solicitudes', color: '#1d4ed8', moduleKey: 'solicitudes-compras', quickName: 'solicitudes' }]
      : []),
    { title: 'Orden de Compra', icon: FileText, route: '/(tabs)/orden-compra', color: '#1f2937', moduleKey: 'orden-compra', quickName: 'orden-compra' },
    { title: 'Ubicacion de Productos', icon: MapPin, route: '/(tabs)/ubicacion', color: '#10b981', moduleKey: 'actualizar-ubicacion', quickName: 'ubicacion' },
    { title: 'Actualizar Existencia', icon: Boxes, route: '/(tabs)/existencia', color: '#b45309', moduleKey: 'actualizar-existencia', quickName: 'existencia' },
    { title: 'Recepcion de Mercancia', icon: PackageOpen, route: '/recepcion', color: '#f59e0b', moduleKey: 'recepcion-mercancia' },
    { title: 'Impresora Bluetooth', icon: Printer, route: '/(tabs)/impresora', color: '#0ea5e9', moduleKey: 'impresora-bluetooth', quickName: 'impresora' },
    { title: 'Configuracion', icon: Settings, route: '/(tabs)/configuracion', color: '#6b7280', moduleKey: 'configuracion', quickName: 'configuracion' },
  ].filter((item) => canAccessModule(profile, permissions, item.moduleKey));

  const roleLabel = profile?.role === 'admin'
    ? 'Administrador'
    : profile?.role === 'owner'
      ? 'Propietario'
      : profile?.role || 'Empleado';

  const toggleQuickAccess = async (name: string) => {
    const exists = quickTabs.includes(name);
    const next = exists ? quickTabs.filter((tab) => tab !== name) : [...quickTabs, name];
    const saved = await saveQuickAccessTabs(next, user?.id);
    setQuickTabs(saved);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="bg-white p-6 border-b border-gray-200 mb-4 items-center">
        <View className="bg-brand w-20 h-20 rounded-full items-center justify-center mb-3">
          <Text className="text-white text-2xl font-bold">{user?.email?.charAt(0).toUpperCase() || 'U'}</Text>
        </View>
        <Text className="text-xl font-bold text-gray-900">{profile?.nombre_completo || profile?.full_name || user?.email}</Text>
        <Text className="text-gray-500 mt-1">{roleLabel}</Text>
      </View>

      <View className="bg-white border-y border-gray-200">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const isPinned = item.quickName ? quickTabs.includes(item.quickName) : false;
          return (
            <View
              key={item.moduleKey}
              className={`flex-row items-center p-4 ${index !== menuItems.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <TouchableOpacity
                className="flex-row items-center flex-1"
                onPress={() => item.route && router.push(item.route as any)}
              >
                <View className="p-2 rounded-lg mr-3" style={{ backgroundColor: `${item.color}20` }}>
                  <Icon color={item.color} size={24} />
                </View>
                <Text className="flex-1 text-base text-gray-800 font-medium">{item.title}</Text>
              </TouchableOpacity>
              {item.quickName ? (
                <TouchableOpacity
                  className={`ml-3 flex-row items-center rounded-full px-3 py-2 ${isPinned ? 'bg-blue-50' : 'bg-slate-100'}`}
                  onPress={() => toggleQuickAccess(item.quickName)}
                >
                  {isPinned ? <PinOff color="#1d4ed8" size={15} /> : <Pin color="#475569" size={15} />}
                  <Text className={`text-xs font-black ml-1 ${isPinned ? 'text-blue-700' : 'text-slate-600'}`}>
                    {isPinned ? 'Quitar' : 'Fijar abajo'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        className="mt-6 bg-white border-y border-gray-200 p-4 flex-row items-center justify-center"
        onPress={signOut}
      >
        <LogOut color="#ef4444" size={20} className="mr-2" />
        <Text className="text-accent-red text-lg font-bold">Cerrar Sesion</Text>
      </TouchableOpacity>

      <Text className="text-center text-gray-400 mt-8 mb-4">Motoflow Mobile v1.0.0</Text>
    </ScrollView>
  );
}
