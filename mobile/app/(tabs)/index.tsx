import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import { Barcode, ShoppingCart, FileText, Search, MapPin, ListOrdered, ClipboardList, Boxes, Receipt } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const router = useRouter();

  const quickActions = [
    { title: 'Nueva Venta', icon: ShoppingCart, route: '/(tabs)/pos', color: 'bg-brand' },
    { title: 'Catalogo', icon: Search, route: '/(tabs)/catalogo', color: 'bg-accent-green' },
    { title: 'Cotizar', icon: FileText, route: '/(tabs)/cotizaciones', color: 'bg-orange-500' },
    { title: 'Pedido', icon: ListOrdered, route: '/(tabs)/pedidos', color: 'bg-emerald-600' },
    { title: 'Recibo Ingreso', icon: Receipt, route: '/recibo-ingreso', color: 'bg-blue-700' },
    { title: 'Orden Compra', icon: ClipboardList, route: '/(tabs)/orden-compra', color: 'bg-slate-800' },
    { title: 'Escanear', icon: Barcode, route: '/scanner', color: 'bg-purple-500' },
  ];

  return (
    <ScrollView className="flex-1 bg-gray-50 p-4">
      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-900">Hola, {user?.email?.split('@')[0] || 'Usuario'}</Text>
        <Text className="text-gray-500">Que deseas hacer hoy?</Text>
      </View>

      <View className="flex-row flex-wrap justify-between">
        {quickActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <TouchableOpacity
              key={index}
              className="w-[48%] bg-white p-4 rounded-xl shadow-sm mb-4 items-center justify-center border border-gray-100"
              onPress={() => router.push(action.route as any)}
            >
              <View className={`${action.color} p-4 rounded-full mb-3`}>
                <Icon color="#fff" size={28} />
              </View>
              <Text className="font-semibold text-gray-800">{action.title}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        className="mt-6 bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex-row items-center justify-between"
        onPress={() => router.push('/ubicacion' as any)}
      >
        <View>
          <Text className="text-lg font-bold text-gray-900">Actualizar Ubicacion</Text>
          <Text className="text-gray-500">Cambiar ubicacion por codigo</Text>
        </View>
        <MapPin color="#1d4ed8" size={32} />
      </TouchableOpacity>

      <TouchableOpacity
        className="mt-4 bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex-row items-center justify-between"
        onPress={() => router.push('/existencia' as any)}
      >
        <View>
          <Text className="text-lg font-bold text-gray-900">Actualizar Existencia</Text>
          <Text className="text-gray-500">Ajustar existencia por conteo fisico</Text>
        </View>
        <Boxes color="#b45309" size={32} />
      </TouchableOpacity>
    </ScrollView>
  );
}
