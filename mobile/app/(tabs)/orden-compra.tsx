import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, TextInput, ScrollView, Modal, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FileText, Minus, Plus, PlusCircle, RefreshCw, Search, Share2, Trash2, X } from 'lucide-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useCartStore } from '@/src/store/useCartStore';
import { supabase } from '@/src/supabase/client';

type OrdenRow = {
  id: string;
  numero: number | string | null;
  fecha_orden: string | null;
  suplidor_id?: string | null;
  estado: string | null;
  total_orden: number | string | null;
  proveedores?: { nombre?: string | null } | null;
};

type Suplidor = {
  id: string;
  nombre: string;
};

const money = (value: number | string | null | undefined) =>
  `RD$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function OrdenCompraScreen() {
  const router = useRouter();
  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [ordenes, setOrdenes] = useState<OrdenRow[]>([]);
  const [suplidores, setSuplidores] = useState<Suplidor[]>([]);
  const [suplidorId, setSuplidorId] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [editingOrdenId, setEditingOrdenId] = useState<string | null>(null);
  const [editingOrdenNumero, setEditingOrdenNumero] = useState<string | number | null>(null);
  const [ordenModal, setOrdenModal] = useState<any | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const ordenShotRef = useRef<ViewShot>(null);

  const totalItems = items.reduce((acc, item) => acc + item.cantidad, 0);

  const detalles = useMemo(() => {
    return items.map((item) => {
      const precio = Number(item.costo || item.precioSeleccionado || 0);
      const cantidad = Number(item.cantidad || 0);
      const itbisPct = Number(item.itbis_pct || 0);
      const subtotal = cantidad * precio;
      const itbis = subtotal * itbisPct;
      const productoId = item.producto_id ?? (item.id.startsWith('orden-detalle-') ? null : item.id);
      return {
        producto_id: productoId,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad,
        unidad: 'UND',
        precio,
        descuento_pct: 0,
        itbis_pct: itbisPct,
        importe: subtotal + itbis,
      };
    });
  }, [items]);

  const totals = useMemo(() => {
    return detalles.reduce(
      (acc, item) => {
        const base = Number(item.cantidad || 0) * Number(item.precio || 0);
        const itbis = base * Number(item.itbis_pct || 0);
        if (Number(item.itbis_pct || 0) > 0) acc.total_gravado += base;
        else acc.total_exento += base;
        acc.itbis_total += itbis;
        acc.total_orden += base + itbis;
        return acc;
      },
      { total_exento: 0, total_gravado: 0, descuento_total: 0, itbis_total: 0, total_orden: 0 }
    );
  }, [detalles]);

  const fetchOrdenes = useCallback(async () => {
    setRecentLoading(true);
    try {
      const { data, error } = await supabase
        .from('ordenes_compra')
        .select('*, proveedores(nombre)')
        .eq('estado', 'Pendiente')
        .order('fecha_orden', { ascending: false })
        .limit(10);

      if (error) throw error;
      setOrdenes((data || []) as OrdenRow[]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron cargar las ordenes.');
    } finally {
      setRecentLoading(false);
    }
  }, []);

  const fetchSuplidores = useCallback(async () => {
    const { data, error } = await supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre');

    if (!error) setSuplidores((data || []) as Suplidor[]);
  }, []);

  useEffect(() => {
    fetchOrdenes();
    fetchSuplidores();
  }, [fetchOrdenes, fetchSuplidores]);

  useFocusEffect(
    useCallback(() => {
      fetchOrdenes();
    }, [fetchOrdenes])
  );

  useEffect(() => {
    if (suplidorId || items.length === 0) return;
    const firstSupplier = items.find(item => item.suplidor_id)?.suplidor_id;
    if (firstSupplier) setSuplidorId(firstSupplier);
  }, [items, suplidorId]);

  const selectedSuplidor = suplidores.find(s => s.id === suplidorId);

  const buildOrdenTexto = (orden: any) => {
    if (!orden) return '';
    const W = 42;
    const CODE_W = 10;
    const QTY_W = 8;
    const DESC_W = W - CODE_W - QTY_W;
    const sep = '-'.repeat(W);
    const center = (s: string) => {
      const pad = Math.max(0, Math.floor((W - s.length) / 2));
      return ' '.repeat(pad) + s;
    };
    const numero = orden.numero ? `OC-${String(orden.numero).padStart(7, '0').slice(-7)}` : 'OC-N/A';

    let t = '';
    t += center('ORDEN DE COMPRA') + '\n';
    t += center(numero) + '\n';
    if (orden.suplidor) t += center(orden.suplidor) + '\n';
    t += sep + '\n';
    t += 'CODIGO'.padEnd(CODE_W) + 'DESCRIPCION'.padEnd(DESC_W) + 'CANT.'.padStart(QTY_W) + '\n';
    t += sep + '\n';
    orden.items.forEach((item: any) => {
      const codigo = String(item.codigo || '').slice(0, CODE_W - 1).padEnd(CODE_W);
      const desc = String(item.descripcion || '').slice(0, DESC_W - 1).padEnd(DESC_W);
      const cant = `${Number(item.cantidad || 0)} ${item.unidad || 'UND'}`.slice(0, QTY_W).padStart(QTY_W);
      t += codigo + desc + cant + '\n';
    });
    return t;
  };

  const compartirOrden = async () => {
    if (!ordenModal || compartiendo) return;
    if (!ordenShotRef.current) {
      Alert.alert('Error', 'La vista de la orden aun no esta lista para compartir.');
      return;
    }
    setCompartiendo(true);
    try {
      const uri = await captureRef(ordenShotRef.current, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Compartir no esta disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Orden de compra ${ordenModal?.numero || ''}`,
        UTI: 'public.jpeg',
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo compartir la orden.');
    } finally {
      setCompartiendo(false);
    }
  };

  const handleOrdenAutomatica = async () => {
    if (!suplidorId) {
      Alert.alert('Seleccione un suplidor', 'Debe seleccionar un suplidor para generar una orden automatica.');
      return;
    }

    setAutoLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_productos_para_orden_automatica', {
        p_suplidor_id: suplidorId,
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        Alert.alert('Sin productos', 'No hay productos bajo el stock minimo para este suplidor.');
        return;
      }

      const uniqueRows = data.filter((product: any, index: number, rows: any[]) =>
        index === rows.findIndex((row) => row.id === product.id)
      );

      const existingIds = new Set(items.map(item => item.id));
      const newRows = uniqueRows.filter((product: any) => !existingIds.has(product.id));

      if (newRows.length === 0) {
        Alert.alert('Sin nuevos productos', 'Los productos sugeridos ya estan en la orden.');
        return;
      }

      newRows.forEach((product: any) => {
        const sugerida = Number(product.cantidad_sugerida)
          || Math.max(1, Math.ceil(Number(product.max_stock || product.min_stock || 0) - Number(product.existencia || 0)));
        const costo = Number(product.costo || product.precio || 0);

        addItem({
          id: product.id,
          codigo: product.codigo,
          descripcion: product.descripcion,
          referencia: product.referencia || null,
          existencia: Number(product.existencia || 0),
          precio_venta_1: costo,
          precio_venta_2: costo,
          costo,
          suplidor_id: product.suplidor_id || suplidorId,
          itbis_pct: Number(product.itbis_pct || 0),
          url_imagen: product.imagen_url || undefined,
        }, sugerida, 1);
      });

      if (!notas) setNotas('Generada automaticamente desde ventas');
      Alert.alert('Orden automatica', `${newRows.length} productos bajo stock agregados.`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron obtener los productos bajo stock.');
    } finally {
      setAutoLoading(false);
    }
  };

  const handleCrearOrden = async () => {
    if (items.length === 0) {
      Alert.alert('Sin articulos', 'Agregue productos para crear una orden de compra.');
      return;
    }
    if (!suplidorId) {
      Alert.alert('Suplidor requerido', 'Seleccione un suplidor o agregue un producto con suplidor asignado.');
      return;
    }

    setLoading(true);
    try {
      const fechaOrden = new Date();
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaOrden.getDate() + 30);

      let numero = editingOrdenNumero;
      if (!editingOrdenId) {
        const { data: nextNumero, error: numError } = await supabase.rpc('get_next_orden_compra_numero');
        if (numError) throw numError;
        numero = nextNumero;
      }

      const ordenData = {
        ...(editingOrdenId ? {} : { numero }),
        fecha_orden: dateOnly(fechaOrden),
        fecha_vencimiento: dateOnly(fechaVencimiento),
        notas,
        aplicar_itbis: true,
        itbis_incluido: true,
        suplidor_id: suplidorId,
        estado: 'Pendiente',
        total_exento: totals.total_exento,
        total_gravado: totals.total_gravado,
        descuento_total: totals.descuento_total,
        itbis_total: totals.itbis_total,
        total_orden: totals.total_orden,
      };

      let savedOrden: any;
      if (editingOrdenId) {
        const { data, error: ordenError } = await supabase
          .from('ordenes_compra')
          .update(ordenData)
          .eq('id', editingOrdenId)
          .select()
          .single();
        if (ordenError) throw ordenError;
        savedOrden = data;

        const { error: deleteError } = await supabase
          .from('ordenes_compra_detalle')
          .delete()
          .eq('orden_compra_id', editingOrdenId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error: ordenError } = await supabase
          .from('ordenes_compra')
          .insert(ordenData)
          .select()
          .single();
        if (ordenError) throw ordenError;
        savedOrden = data;
      }

      const detallesData = detalles.map(item => ({
        orden_compra_id: savedOrden.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        unidad: item.unidad,
        precio: item.precio,
        descuento_pct: item.descuento_pct,
        itbis_pct: item.itbis_pct,
        importe: item.importe,
      }));

      const { error: detallesError } = await supabase.from('ordenes_compra_detalle').insert(detallesData);
      if (detallesError) throw detallesError;

      setOrdenModal({
        id: savedOrden.id,
        numero: savedOrden.numero,
        suplidor: selectedSuplidor?.nombre || '',
        items: detallesData,
      });
      await fetchOrdenes();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar la orden de compra.');
    } finally {
      setLoading(false);
    }
  };

  const editarOrden = async (orden: OrdenRow) => {
    if ((orden.estado || '').trim().toLowerCase() !== 'pendiente') {
      Alert.alert('Orden bloqueada', 'Solo las ordenes pendientes pueden editarse.');
      return;
    }
    try {
      const [{ data: ordenFull, error: ordenError }, { data: details, error: detailsError }] = await Promise.all([
        supabase
          .from('ordenes_compra')
          .select('*')
          .eq('id', orden.id)
          .maybeSingle(),
        supabase
          .from('ordenes_compra_detalle')
          .select('*, productos(id, codigo, descripcion, referencia, imagen_url, itbis_pct, suplidor_id)')
          .eq('orden_compra_id', orden.id),
      ]);

      if (ordenError) throw ordenError;
      if (detailsError) throw detailsError;

      if (!details || details.length === 0) {
        Alert.alert('Orden sin articulos', 'Esta orden no tiene productos guardados para editar.');
        return;
      }

      clearCart();
      setEditingOrdenId(orden.id);
      setEditingOrdenNumero(orden.numero);
      setSuplidorId(ordenFull?.suplidor_id || orden.suplidor_id || '');
      setNotas(ordenFull?.notas || '');

      (details || []).forEach((detail: any) => {
        const product = detail.productos || {};
        const productoId = detail.producto_id || null;
        const itemId = productoId || `orden-detalle-${detail.id || detail.codigo || Date.now()}`;
        addItem({
          id: itemId,
          producto_id: productoId,
          codigo: detail.codigo || product.codigo || '',
          descripcion: detail.descripcion || product.descripcion || '',
          referencia: product.referencia || null,
          existencia: 0,
          precio_venta_1: Number(detail.precio || 0),
          precio_venta_2: Number(detail.precio || 0),
          costo: Number(detail.precio || 0),
          suplidor_id: product.suplidor_id || ordenFull?.suplidor_id || orden.suplidor_id || null,
          itbis_pct: Number(detail.itbis_pct || product.itbis_pct || 0),
          url_imagen: product.imagen_url || undefined,
        }, Number(detail.cantidad || 1), 1);
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo cargar la orden para editar.');
    }
  };

  const limpiarOrden = () => {
    clearCart();
    setSuplidorId('');
    setNotas('');
    setEditingOrdenId(null);
    setEditingOrdenNumero(null);
    setOrdenModal(null);
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-gray-500 text-xs font-medium uppercase">Modulo de compras</Text>
            <Text className="text-gray-900 text-xl font-bold">
              {editingOrdenId ? `Editando OC #${editingOrdenNumero || ''}` : 'Orden de compra'}
            </Text>
          </View>
          <TouchableOpacity
            className="bg-slate-800 rounded-full px-3 py-2 flex-row items-center"
            onPress={() => router.push('/(tabs)/catalogo?modo=orden-compra')}
          >
            <PlusCircle color="white" size={18} />
            <Text className="text-white font-bold ml-1.5 text-[13px]">Agregar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
          <View className="flex-row gap-2">
            {suplidores.map((suplidor) => (
              <TouchableOpacity
                key={suplidor.id}
                className={`px-3 py-2 rounded-full border ${suplidorId === suplidor.id ? 'bg-slate-800 border-slate-800' : 'bg-gray-100 border-gray-200'}`}
                onPress={() => setSuplidorId(suplidor.id)}
              >
                <Text className={`font-bold text-[12px] ${suplidorId === suplidor.id ? 'text-white' : 'text-gray-600'}`}>
                  {suplidor.nombre}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 220 }}
        ListEmptyComponent={
          <View className="items-center justify-center px-8 py-16">
            <View className="bg-slate-100 p-4 rounded-full mb-4">
              <FileText color="#1f2937" size={48} />
            </View>
            <Text className="text-gray-900 text-xl font-bold mb-2">Sin articulos</Text>
            <Text className="text-gray-500 text-center mb-6">
              Agregue productos para crear una orden. Al compartir solo se mostraran codigo, descripcion y cantidad.
            </Text>
            <TouchableOpacity
              className="bg-brand px-6 py-3 rounded-full flex-row items-center"
              onPress={() => router.push('/(tabs)/catalogo?modo=orden-compra')}
            >
              <Search color="white" size={20} />
              <Text className="text-white font-bold ml-2">Buscar Productos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`mt-3 bg-slate-900 px-6 py-3 rounded-full flex-row items-center ${autoLoading || !suplidorId ? 'opacity-60' : ''}`}
              onPress={handleOrdenAutomatica}
              disabled={autoLoading || !suplidorId}
            >
              <PlusCircle color="white" size={20} />
              <Text className="text-white font-bold ml-2">
                {autoLoading ? 'Generando...' : 'Orden Automatica'}
              </Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const costo = Number(item.costo || item.precioSeleccionado || 0);
          return (
            <View className="bg-white border-b border-gray-100 p-4">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-4">
                  <Text className="text-gray-900 font-bold leading-tight">{item.descripcion}</Text>
                  <Text className="text-gray-500 text-sm mt-1">{item.codigo}</Text>
                  <Text className="text-slate-700 font-medium mt-1">{money(costo)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-gray-900 font-bold text-lg mb-2">{money(costo * item.cantidad)}</Text>
                  <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden">
                    <TouchableOpacity
                      className="bg-gray-50 p-2 active:bg-gray-200"
                      onPress={() => (item.cantidad > 1 ? updateQuantity(item.id, item.cantidad - 1) : removeItem(item.id))}
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
          );
        }}
        ListFooterComponent={
          items.length === 0 ? (
            <View className="px-4 pt-4">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-gray-900 font-bold text-base">Ordenes pendientes</Text>
                <TouchableOpacity className="p-2" onPress={fetchOrdenes} disabled={recentLoading}>
                  <RefreshCw color="#6b7280" size={18} />
                </TouchableOpacity>
              </View>
              {ordenes.map((orden) => (
                <TouchableOpacity key={orden.id} className="bg-white border border-gray-100 rounded-xl p-3 mb-2" onPress={() => editarOrden(orden)}>
                  <View className="flex-row justify-between">
                    <Text className="text-gray-900 font-bold">#{orden.numero || 'N/A'}</Text>
                    <Text className="text-slate-700 font-bold">{money(orden.total_orden)}</Text>
                  </View>
                  <Text className="text-gray-600 mt-1" numberOfLines={1}>
                    {orden.proveedores?.nombre || 'Sin suplidor'}
                  </Text>
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-gray-400 text-xs">{orden.fecha_orden || 'Sin fecha'}</Text>
                    <Text className="text-gray-400 text-xs">{orden.estado || 'Pendiente'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
      />

      {items.length > 0 && (
        <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-200 p-4 pb-6">
          <TextInput
            className="bg-gray-100 rounded-xl px-3 py-2 text-gray-900 mb-3"
            placeholder="Notas para la orden"
            placeholderTextColor="#9ca3af"
            value={notas}
            onChangeText={setNotas}
          />
          <TouchableOpacity
            className={`bg-slate-900 py-3 rounded-xl flex-row justify-center items-center mb-3 ${autoLoading || !suplidorId ? 'opacity-60' : ''}`}
            onPress={handleOrdenAutomatica}
            disabled={autoLoading || !suplidorId}
          >
            <PlusCircle color="white" size={18} />
            <Text className="text-white font-bold ml-2">
              {autoLoading ? 'Generando...' : 'Orden Automatica'}
            </Text>
          </TouchableOpacity>

          <View className="space-y-1 mb-3">
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Articulos</Text>
              <Text className="text-gray-900 font-semibold">{totalItems}</Text>
            </View>
            <View className="flex-row justify-between pt-1 border-t border-gray-100">
              <Text className="text-gray-900 text-xl font-bold">Total</Text>
              <Text className="text-slate-800 text-xl font-bold">{money(totals.total_orden)}</Text>
            </View>
          </View>

          <View className="flex-row space-x-3">
            <TouchableOpacity className="bg-gray-100 p-4 rounded-xl flex-1 items-center justify-center" onPress={limpiarOrden}>
              <Trash2 color="#ef4444" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              className={`bg-slate-800 p-4 rounded-xl flex-[4] flex-row justify-center items-center ${loading ? 'opacity-50' : ''}`}
              disabled={loading}
              onPress={handleCrearOrden}
            >
              <FileText color="white" size={24} />
              <Text className="text-white font-bold text-lg ml-2">
                {loading ? 'Guardando...' : editingOrdenId ? 'Actualizar Orden' : 'Guardar Orden'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={ordenModal !== null} transparent animationType="slide" onRequestClose={() => setOrdenModal(null)}>
        <View className="flex-1 bg-black/60 justify-center items-center px-3">
          <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden" style={{ maxHeight: '90%' }}>
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500">Orden #{ordenModal?.numero}</Text>
                <Text className="text-base font-bold text-gray-900">Orden de compra</Text>
              </View>
              <TouchableOpacity onPress={() => setOrdenModal(null)} className="p-1">
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 0 }}>
              <ViewShot
                ref={ordenShotRef}
                options={{ format: 'jpg', quality: 0.95 }}
                style={{ backgroundColor: 'white' }}
              >
                <View style={{ padding: 16, backgroundColor: 'white' }}>
                  <Text
                    style={{
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      fontSize: 12,
                      color: '#111827',
                      lineHeight: 18,
                    }}
                  >
                    {buildOrdenTexto(ordenModal)}
                  </Text>
                </View>
              </ViewShot>
            </ScrollView>

            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity className="flex-1 py-4 items-center justify-center active:bg-gray-100" onPress={limpiarOrden}>
                <Text className="text-gray-700 font-medium">Cerrar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-slate-800 active:opacity-80 ${compartiendo ? 'opacity-60' : ''}`}
                onPress={compartirOrden}
                disabled={compartiendo}
              >
                <Share2 color="white" size={18} />
                <Text className="text-white font-bold ml-2">{compartiendo ? 'JPG...' : 'Compartir'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
