import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useCartStore } from '@/src/store/useCartStore';
import { Trash2, Plus, Minus, Search, User, CreditCard } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { shareToWhatsApp } from '@/src/utils/whatsapp';
import { useAuthStore } from '@/src/store/useAuthStore';
import { supabase } from '@/src/supabase/client';

export default function POSScreen() {
  const router = useRouter();
  const { user, empresaId } = useAuthStore();
  const { items, getSubtotal, getTotal, removeItem, updateQuantity, clearCart, clienteNombre, clienteTelefono } = useCartStore();
  const [loading, setLoading] = useState(false);

  const subtotal = getSubtotal();
  const total = getTotal();

  const handleCobrar = async () => {
    if (items.length === 0) {
      Alert.alert('Error', 'El carrito está vacío');
      return;
    }

    setLoading(true);
    try {
      // 1. Guardar Venta en Supabase
      const { data: venta, error: ventaError } = await supabase
        .from('facturas')
        .insert({
          usuario_id: user?.id,
          cliente_id: null, // Asumimos cliente genérico por ahora
          subtotal: subtotal,
          descuento: 0,
          itbis: 0,
          total: total,
          forma_pago: 'EFECTIVO', // Por defecto para venta rápida
          estado: 'PAGADA'
        })
        .select()
        .single();

      if (ventaError) throw ventaError;

      // 2. Guardar Detalles de Venta
      const detalles = items.map(item => ({
        factura_id: venta.id,
        producto_id: item.id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio: item.precioSeleccionado,
        descuento: item.descuento,
        itbis: 0,
        importe: item.precioSeleccionado * item.cantidad - item.descuento
      }));

      const { error: detallesError } = await supabase.from('facturas_detalle').insert(detalles);
      if (detallesError) throw detallesError;

      // 3. Compartir por WhatsApp
      let msg = `Gracias por su compra en Repuestos Morla.\n\nDetalle:\n`;
      items.forEach((it, index) => {
        msg += `${index + 1}. ${it.descripcion}\nCantidad: ${it.cantidad}\nPrecio: RD$${it.precioSeleccionado.toLocaleString()}\nSubtotal: RD$${(it.cantidad * it.precioSeleccionado).toLocaleString()}\n\n`;
      });
      msg += `Total pagado: RD$${total.toLocaleString()}\n\nRepuestos Morla\nDonde encuentras todo lo que necesitas para tu motocicleta.`;

      shareToWhatsApp({ phone: clienteTelefono, message: msg });

      // 4. Limpiar carrito
      clearCart();
      Alert.alert('Éxito', 'Venta completada correctamente');

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white p-4 border-b border-gray-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <View className="bg-gray-100 p-2 rounded-full mr-3">
            <User color="#6b7280" size={20} />
          </View>
          <View>
            <Text className="text-gray-900 font-bold">{clienteNombre}</Text>
            {clienteTelefono ? <Text className="text-gray-500 text-sm">{clienteTelefono}</Text> : null}
          </View>
        </View>
        <TouchableOpacity>
          <Text className="text-brand font-medium">Cambiar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center p-10 mt-20">
            <ShoppingCart color="#d1d5db" size={64} />
            <Text className="text-gray-400 text-lg mt-4 text-center">No hay productos en el carrito</Text>
            <TouchableOpacity 
              className="mt-6 bg-brand px-6 py-3 rounded-full flex-row items-center"
              onPress={() => router.push('/(tabs)/catalogo')}
            >
              <Search color="white" size={20} className="mr-2" />
              <Text className="text-white font-medium">Buscar Productos</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white border-b border-gray-100 p-4">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-4">
                <Text className="text-gray-900 font-bold leading-tight">{item.descripcion}</Text>
                <Text className="text-gray-500 text-sm mt-1">{item.codigo}</Text>
                <Text className="text-brand font-medium mt-1">RD${item.precioSeleccionado.toLocaleString()}</Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-900 font-bold text-lg mb-2">
                  RD${(item.precioSeleccionado * item.cantidad).toLocaleString()}
                </Text>
                <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden">
                  <TouchableOpacity 
                    className="bg-gray-50 p-2 active:bg-gray-200"
                    onPress={() => item.cantidad > 1 ? updateQuantity(item.id, item.cantidad - 1) : removeItem(item.id)}
                  >
                    <Minus color="#4b5563" size={16} />
                  </TouchableOpacity>
                  <Text className="font-bold px-4">{item.cantidad}</Text>
                  <TouchableOpacity 
                    className="bg-gray-50 p-2 active:bg-gray-200"
                    onPress={() => updateQuantity(item.id, item.cantidad + 1)}
                  >
                    <Plus color="#4b5563" size={16} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
      />

      <View className="bg-white border-t border-gray-200 p-4 pb-6">
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-500">Subtotal</Text>
          <Text className="font-medium">RD${subtotal.toLocaleString()}</Text>
        </View>
        <View className="flex-row justify-between mb-4">
          <Text className="text-gray-900 text-xl font-bold">Total</Text>
          <Text className="text-brand text-xl font-bold">RD${total.toLocaleString()}</Text>
        </View>
        
        <View className="flex-row space-x-3">
          <TouchableOpacity 
            className="bg-gray-100 p-4 rounded-xl flex-1 items-center justify-center"
            onPress={() => clearCart()}
          >
            <Trash2 color="#ef4444" size={24} />
          </TouchableOpacity>
          <TouchableOpacity 
            className={`bg-brand p-4 rounded-xl flex-[4] flex-row justify-center items-center ${items.length === 0 || loading ? 'opacity-50' : ''}`}
            disabled={items.length === 0 || loading}
            onPress={handleCobrar}
          >
            <CreditCard color="white" size={24} className="mr-2" />
            <Text className="text-white font-bold text-lg">{loading ? 'Procesando...' : 'Cobrar'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
