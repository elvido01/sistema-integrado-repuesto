import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import { LogOut, Settings, PackageOpen, MapPin, Barcode } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function MasScreen() {
  const { signOut, user } = useAuthStore();
  const router = useRouter();

  const menuItems = [
    { title: 'Scanner', icon: Barcode, route: '/scanner', color: '#8b5cf6' },
    { title: 'Ubicación de Productos', icon: MapPin, route: '/ubicacion', color: '#10b981' },
    { title: 'Recepción de Mercancía', icon: PackageOpen, route: '/recepcion', color: '#f59e0b' },
    { title: 'Configuración', icon: Settings, route: '/configuracion', color: '#6b7280' },
  ];

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="bg-white p-6 border-b border-gray-200 mb-4 items-center">
        <View className="bg-brand w-20 h-20 rounded-full items-center justify-center mb-3">
          <Text className="text-white text-2xl font-bold">{user?.email?.charAt(0).toUpperCase() || 'U'}</Text>
        </View>
        <Text className="text-xl font-bold text-gray-900">{user?.email}</Text>
        <Text className="text-gray-500 mt-1">Vendedor</Text>
      </View>

      <View className="bg-white border-y border-gray-200">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <TouchableOpacity 
              key={index}
              className={`flex-row items-center p-4 ${index !== menuItems.length - 1 ? 'border-b border-gray-100' : ''}`}
              onPress={() => item.route && router.push(item.route as any)}
            >
              <View className="p-2 rounded-lg mr-3" style={{ backgroundColor: `${item.color}20` }}>
                <Icon color={item.color} size={24} />
              </View>
              <Text className="flex-1 text-base text-gray-800 font-medium">{item.title}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity 
        className="mt-6 bg-white border-y border-gray-200 p-4 flex-row items-center justify-center"
        onPress={signOut}
      >
        <LogOut color="#ef4444" size={20} className="mr-2" />
        <Text className="text-accent-red text-lg font-bold">Cerrar Sesión</Text>
      </TouchableOpacity>
      
      <Text className="text-center text-gray-400 mt-8 mb-4">Motoflow Mobile v1.0.0</Text>
    </ScrollView>
  );
}
