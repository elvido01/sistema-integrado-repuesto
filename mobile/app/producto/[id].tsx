import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/supabase/client';
import { useCartStore } from '@/src/store/useCartStore';
import { ArrowLeft, ShoppingCart, Share2, Package } from 'lucide-react-native';
import { shareToWhatsApp } from '@/src/utils/whatsapp';

export default function ProductoDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [producto, setProducto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cantidad, setCantidad] = useState(1);
  const { addItem } = useCartStore();

  useEffect(() => {
    async function fetchProducto() {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('id', id)
        .single();
      
      if (!error && data) {
        setProducto(data);
      }
      setLoading(false);
    }
    fetchProducto();
  }, [id]);

  const handleAddToCart = () => {
    addItem(producto, cantidad);
    Alert.alert('Éxito', 'Producto agregado al carrito', [
      { text: 'Seguir comprando', style: 'cancel' },
      { text: 'Ir al carrito', onPress: () => router.push('/(tabs)/pos') }
    ]);
  };

  const handleShare = () => {
    const msg = `Hola, este producto está disponible en Repuestos Morla:\n\n${producto.descripcion}\nCódigo: ${producto.codigo}\nPrecio: RD$${producto.precio_venta_1.toLocaleString()}\nDisponibilidad: ${producto.existencia > 0 ? 'Disponible' : 'Agotado'}\n\nPara más información puede escribirnos por WhatsApp.`;
    shareToWhatsApp({ message: msg });
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  if (!producto) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text>Producto no encontrado</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-brand pt-12 pb-4 px-4 flex-row items-center justify-between shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <ArrowLeft color="white" size={24} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">Detalle de Producto</Text>
        <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
          <Share2 color="white" size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
          <View className="bg-gray-100 w-full h-48 rounded-xl items-center justify-center mb-4">
            <Package color="#9ca3af" size={64} />
          </View>
          <Text className="text-brand font-bold text-xl">{producto.codigo}</Text>
          <Text className="text-gray-900 font-bold text-2xl mt-1 leading-tight">{producto.descripcion}</Text>
          <Text className="text-gray-500 text-base mt-2">{producto.referencia || 'Sin referencia'}</Text>
        </View>

        <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
          <Text className="text-gray-900 font-bold text-lg mb-3">Precios</Text>
          <View className="flex-row justify-between py-2 border-b border-gray-50">
            <Text className="text-gray-500">Precio Detalle</Text>
            <Text className="text-gray-900 font-bold">RD${producto.precio_venta_1.toLocaleString()}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-gray-50">
            <Text className="text-gray-500">Precio Mayor</Text>
            <Text className="text-gray-900 font-bold">RD${producto.precio_venta_2.toLocaleString()}</Text>
          </View>
        </View>

        <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4 flex-row justify-between items-center">
          <View>
            <Text className="text-gray-900 font-bold text-lg">Existencia</Text>
            <Text className="text-gray-500 text-sm">Almacén principal</Text>
          </View>
          <View className={`px-4 py-2 rounded-full ${producto.existencia > 0 ? 'bg-accent-green/20' : 'bg-accent-red/20'}`}>
            <Text className={`font-bold text-lg ${producto.existencia > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {producto.existencia}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="bg-white p-4 border-t border-gray-200">
        <TouchableOpacity 
          className="bg-brand py-4 rounded-xl flex-row justify-center items-center shadow-sm"
          onPress={handleAddToCart}
        >
          <ShoppingCart color="white" size={20} className="mr-2" />
          <Text className="text-white font-bold text-lg">Agregar al Carrito</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
