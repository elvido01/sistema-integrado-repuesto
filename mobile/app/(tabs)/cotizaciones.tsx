import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useCartStore } from '@/src/store/useCartStore';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { shareToWhatsApp } from '@/src/utils/whatsapp';
import { FileText, Plus, Share2 } from 'lucide-react-native';

export default function CotizacionesScreen() {
  const router = useRouter();
  const { items, getSubtotal, getTotal, clearCart, clienteNombre, clienteTelefono } = useCartStore();
  const { user, empresaId } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const subtotal = getSubtotal();
  const total = getTotal();

  const handleCrearCotizacion = async () => {
    if (items.length === 0) {
      Alert.alert('Error', 'Agregue productos al carrito (POS) para crear una cotización.');
      return;
    }

    setLoading(true);
    try {
      // 1. Guardar Cotización en Supabase
      const { data: cotizacion, error: cotizacionError } = await supabase
        .from('cotizaciones')
        .insert({
          usuario_id: user?.id,
          cliente_id: null,
          subtotal: subtotal,
          descuento_total: 0,
          itbis_total: 0,
          total_cotizacion: total,
          estado: 'Pendiente',
          fecha_vencimiento: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() // 15 días
        })
        .select()
        .single();

      if (cotizacionError) throw cotizacionError;

      // 2. Guardar Detalles
      const detalles = items.map(item => ({
        cotizacion_id: cotizacion.id,
        producto_id: item.id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precioSeleccionado,
        descuento_valor: item.descuento,
        itbis_valor: 0,
        importe: item.precioSeleccionado * item.cantidad - item.descuento
      }));

      const { error: detallesError } = await supabase.from('cotizaciones_detalle').insert(detalles);
      if (detallesError) throw detallesError;

      // 3. Compartir por WhatsApp
      let msg = `Hola, ${clienteNombre}.\nEsta es su cotización de Repuestos Morla:\n\n`;
      items.forEach((it, index) => {
        msg += `${index + 1}. ${it.descripcion}\nCantidad: ${it.cantidad}\nPrecio: RD$${it.precioSeleccionado.toLocaleString()}\nSubtotal: RD$${(it.cantidad * it.precioSeleccionado).toLocaleString()}\n\n`;
      });
      msg += `Total: RD$${total.toLocaleString()}\n\nGracias por preferirnos.\nRepuestos Morla\nDonde encuentras todo lo que necesitas para tu motocicleta.`;

      shareToWhatsApp({ phone: clienteTelefono, message: msg });
      
      clearCart();
      Alert.alert('Éxito', 'Cotización generada correctamente');

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Hubo un error al generar la cotización');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 items-center justify-center py-10 mt-10">
        <View className="bg-orange-100 p-4 rounded-full mb-4">
          <FileText color="#f97316" size={48} />
        </View>
        <Text className="text-xl font-bold text-gray-900 mb-2">Crear Cotización</Text>
        <Text className="text-gray-500 text-center mb-6">
          Las cotizaciones utilizan los productos que hayas agregado en el módulo de Ventas (Carrito).
        </Text>
        
        <View className="bg-gray-50 p-4 rounded-xl w-full mb-6">
          <Text className="text-gray-500 mb-1">Productos en carrito: {items.length}</Text>
          <Text className="text-gray-900 font-bold text-lg">Total estimado: RD${total.toLocaleString()}</Text>
        </View>

        <TouchableOpacity 
          className={`bg-orange-500 py-4 px-6 rounded-xl flex-row items-center w-full justify-center shadow-sm ${items.length === 0 || loading ? 'opacity-50' : ''}`}
          disabled={items.length === 0 || loading}
          onPress={handleCrearCotizacion}
        >
          <Share2 color="white" size={20} className="mr-2" />
          <Text className="text-white font-bold text-lg">{loading ? 'Procesando...' : 'Generar y Compartir'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
