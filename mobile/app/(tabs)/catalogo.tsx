import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Modal, Image } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchProductos } from '@/src/services/productService';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useCartStore } from '@/src/store/useCartStore';
import { Search, ScanBarcode, X, ArrowLeft, Plus, Minus } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import debounce from 'lodash.debounce';

export default function CatalogoScreen() {
  const { empresaId } = useAuthStore();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [marca, setMarca] = useState('');
  const [debouncedMarca, setDebouncedMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [debouncedModelo, setDebouncedModelo] = useState('');
  const [productoModal, setProductoModal] = useState<any | null>(null);
  // Modo venta: viene de pos.tsx para agregar productos al carrito
  const params = useLocalSearchParams<{ modo?: string }>();
  const modoVenta = params.modo === 'venta';
  const router = useRouter();
  const cartItems = useCartStore((s) => s.items);
  const cartGetTotal = useCartStore((s) => s.getTotal);
  const addToCart = useCartStore((s) => s.addItem);
  // Modal para agregar cantidad al carrito (modo venta, double tap)
  const [cartModalProducto, setCartModalProducto] = useState<any | null>(null);
  const [cartModalQty, setCartModalQty] = useState<string>('1');
  // Para detectar double tap
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const cartCount = cartItems.reduce((acc, it) => acc + it.cantidad, 0);
  const cartTotalActual = cartGetTotal();

  const onProductTap = useCallback((item: any) => {
    if (!modoVenta) {
      // modo normal: navega a detalle (single tap)
      router.push(`/producto/${item.id}`);
      return;
    }
    // modo venta: detectar double tap (dos taps en menos de 300ms sobre el mismo item)
    const now = Date.now();
    const prev = lastTapRef.current;
    if (prev && prev.id === item.id && now - prev.time < 300) {
      lastTapRef.current = null;
      // double tap → abre modal de cantidad
      setCartModalProducto(item);
      setCartModalQty('1');
    } else {
      lastTapRef.current = { id: item.id, time: now };
    }
  }, [modoVenta, router]);

  const confirmarAgregarAlCarrito = () => {
    const qty = parseInt(cartModalQty, 10);
    if (!cartModalProducto || isNaN(qty) || qty < 1) {
      return;
    }
    addToCart(cartModalProducto, qty, 1);
    setCartModalProducto(null);
    setCartModalQty('1');
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching
  } = useInfiniteQuery({
    queryKey: ['productos', empresaId, debouncedSearch, debouncedMarca, debouncedModelo],
    initialPageParam: 1,
    queryFn: ({ pageParam = 1 }: { pageParam: number }) =>
      fetchProductos(pageParam, 20, debouncedSearch, debouncedMarca, debouncedModelo),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length + 1 : undefined,
    enabled: !!empresaId,
  });

  const updateSearch = useCallback(
    debounce((text: string) => {
      setDebouncedSearch(text);
    }, 500),
    []
  );
  const updateMarca = useCallback(
    debounce((text: string) => {
      setDebouncedMarca(text);
    }, 500),
    []
  );
  const updateModelo = useCallback(
    debounce((text: string) => {
      setDebouncedModelo(text);
    }, 500),
    []
  );

  const handleSearchChange = (text: string) => {
    setSearch(text);
    updateSearch(text);
  };

  const clearSearch = () => {
    setSearch('');
    updateSearch('');
  };
  const handleMarcaChange = (text: string) => {
    setMarca(text);
    updateMarca(text);
  };
  const clearMarca = () => {
    setMarca('');
    updateMarca('');
  };
  const handleModeloChange = (text: string) => {
    setModelo(text);
    updateModelo(text);
  };
  const clearModelo = () => {
    setModelo('');
    updateModelo('');
  };

  const productos = useMemo(() => {
    return data?.pages.flatMap(page => page.productos) || [];
  }, [data]);

  const fmtMoney = (n: number) =>
    `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const first6 = (s?: string | null) => (s ? String(s).slice(0, 6) : '');
  const last6 = (s?: string | null) => (s ? String(s).slice(-6) : '');

  const renderItem = useCallback(({ item }: { item: any }) => {
    const exist = Number(item.existencia) || 0;
    return (
      <TouchableOpacity
        className="bg-white border-b border-gray-200 px-3 py-2 active:bg-gray-50"
        onPress={() => onProductTap(item)}
        onLongPress={() => setProductoModal(item)}
        delayLongPress={2000}
      >
        {/* Fila 1: codigo(6) | descripcion (azul, hasta 2 lineas) */}
        <View className="flex-row items-start">
          <Text className="text-emerald-700 font-bold text-[13px] flex-[1.4]">
            {first6(item.codigo)}
          </Text>
          <Text
            className="text-blue-700 font-bold text-[13px] flex-[3.6] pl-1 leading-tight"
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.descripcion}
          </Text>
        </View>

        {/* Fila 2: referencia (ultimos 6) | existencia | precio1 | precio2 */}
        <View className="flex-row items-center mt-0.5">
          <Text
            className="text-gray-600 text-[12px] flex-[1.4]"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {last6(item.referencia)}
          </Text>
          <Text className={`font-bold text-[14px] text-right flex-1 ${exist > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {exist}
          </Text>
          <Text className="font-bold text-[14px] text-right flex-[1.3] text-emerald-600">
            {fmtMoney(item.precio_venta_1)}
          </Text>
          <Text className="font-bold text-[14px] text-right flex-[1.3] text-emerald-600">
            {fmtMoney(item.precio_venta_2 || item.precio_venta_1)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  console.log('CatalogoScreen Rendering. Items:', productos.length, 'isLoading:', isLoading);

  return (
    <View className="flex-1 bg-gray-50">
      {/* Barra "Volver a factura" — solo en modo venta */}
      {modoVenta && (
        <TouchableOpacity
          className="bg-emerald-600 px-4 py-2 flex-row items-center justify-between active:bg-emerald-700"
          onPress={() => router.push('/(tabs)/pos')}
        >
          <View className="flex-row items-center">
            <ArrowLeft color="white" size={20} />
            <Text className="text-white font-bold text-[15px] ml-2">Volver a factura</Text>
          </View>
          <View className="bg-white/20 px-3 py-1 rounded-full">
            <Text className="text-white font-bold text-[13px]">
              {cartCount} {cartCount === 1 ? 'item' : 'items'} — RD${cartTotalActual.toLocaleString()}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View className="bg-brand p-4 pb-3 shadow-sm">
        {/* Barra de busqueda + scanner */}
        <View className="flex-row items-center">
          <View className="flex-1 bg-white rounded-xl flex-row items-center px-3 py-2">
            <Search color="#9ca3af" size={20} />
            <TextInput
              className="flex-1 ml-2 text-base text-gray-900"
              placeholder="Buscar artículo, código o ref..."
              value={search}
              onChangeText={handleSearchChange}
            />
            {search ? (
              <TouchableOpacity onPress={clearSearch} className="p-1">
                <X color="#9ca3af" size={16} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            className="ml-3 bg-white p-2.5 rounded-xl"
            onPress={() => router.push('/scanner')}
          >
            <ScanBarcode color="#1d4ed8" size={24} />
          </TouchableOpacity>
        </View>

        {/* Inputs de filtro: Marca + Modelo lado a lado */}
        <View className="flex-row mt-2 gap-2">
          <View className="flex-1 bg-white rounded-lg flex-row items-center px-3" style={{ minHeight: 40 }}>
            <TextInput
              className="flex-1 text-[14px] text-gray-900"
              style={{ paddingVertical: 0, includeFontPadding: false } as any}
              placeholder="Marca"
              placeholderTextColor="#9ca3af"
              value={marca}
              onChangeText={handleMarcaChange}
            />
            {marca ? (
              <TouchableOpacity onPress={clearMarca} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="ml-1">
                <X color="#9ca3af" size={14} />
              </TouchableOpacity>
            ) : null}
          </View>
          <View className="flex-1 bg-white rounded-lg flex-row items-center px-3" style={{ minHeight: 40 }}>
            <TextInput
              className="flex-1 text-[14px] text-gray-900"
              style={{ paddingVertical: 0, includeFontPadding: false } as any}
              placeholder="Modelo"
              placeholderTextColor="#9ca3af"
              value={modelo}
              onChangeText={handleModeloChange}
            />
            {modelo ? (
              <TouchableOpacity onPress={clearModelo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="ml-1">
                <X color="#9ca3af" size={14} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {isLoading && !isRefetching ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      ) : (
        <FlatList
          data={productos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={{ flex: 1 }}
          onEndReached={() => {
            if (hasNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator size="small" color="#1d4ed8" className="my-4" /> : null}
          ListEmptyComponent={
            <View className="p-8 items-center justify-center">
              <Text className="text-gray-500 text-center text-lg">No se encontraron productos.</Text>
            </View>
          }
          onRefresh={refetch}
          refreshing={isRefetching && !isFetchingNextPage}
          contentContainerStyle={{ paddingBottom: 20 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          windowSize={5}
        />
      )}

      {/* Modal cantidad (modo venta, double tap): agregar al carrito */}
      <Modal
        visible={cartModalProducto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCartModalProducto(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCartModalProducto(null)}
          className="flex-1 bg-black/60 justify-center items-center px-4"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
          >
            {/* Header con codigo */}
            <View className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <Text className="text-emerald-700 font-bold text-base">
                {cartModalProducto?.codigo || ''}
              </Text>
              <Text className="text-blue-700 font-bold text-[14px] mt-1" numberOfLines={2}>
                {cartModalProducto?.descripcion || ''}
              </Text>
              <Text className="text-gray-600 text-[12px] mt-1">
                Precio: RD${Number(cartModalProducto?.precio_venta_1 || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Selector de cantidad */}
            <View className="px-4 py-5">
              <Text className="text-center text-gray-600 text-[13px] mb-3">Cantidad</Text>
              <View className="flex-row items-center justify-center">
                <TouchableOpacity
                  className="bg-gray-100 w-12 h-12 rounded-full items-center justify-center active:bg-gray-200"
                  onPress={() => {
                    const n = Math.max(1, parseInt(cartModalQty, 10) - 1 || 1);
                    setCartModalQty(String(n));
                  }}
                >
                  <Minus color="#374151" size={20} />
                </TouchableOpacity>
                <TextInput
                  className="text-center text-2xl font-bold text-gray-900 mx-4 border-b border-gray-300 min-w-[80px]"
                  style={{ paddingVertical: 4, includeFontPadding: false } as any}
                  keyboardType="number-pad"
                  value={cartModalQty}
                  onChangeText={(t) => setCartModalQty(t.replace(/[^0-9]/g, ''))}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  className="bg-gray-100 w-12 h-12 rounded-full items-center justify-center active:bg-gray-200"
                  onPress={() => {
                    const n = (parseInt(cartModalQty, 10) || 0) + 1;
                    setCartModalQty(String(n));
                  }}
                >
                  <Plus color="#374151" size={20} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Botones cancelar / OK */}
            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity
                className="flex-1 py-3 items-center active:bg-gray-100"
                onPress={() => setCartModalProducto(null)}
              >
                <Text className="text-gray-600 font-medium">Cancelar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className="flex-1 py-3 items-center bg-emerald-600 active:bg-emerald-700"
                onPress={confirmarAgregarAlCarrito}
              >
                <Text className="text-white font-bold">OK</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal preview (long-press 2s): imagen + descripcion del producto */}
      <Modal
        visible={productoModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setProductoModal(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setProductoModal(null)}
          className="flex-1 bg-black/70 justify-center items-center px-4"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden"
          >
            {/* Header con codigo y boton cerrar */}
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500 uppercase">Código</Text>
                <Text className="text-emerald-700 font-bold text-base">
                  {productoModal?.codigo || ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setProductoModal(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="p-1"
              >
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            {/* Imagen */}
            <View className="items-center justify-center bg-gray-100" style={{ height: 280 }}>
              {productoModal?.url_imagen ? (
                <Image
                  source={{ uri: productoModal.url_imagen }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              ) : (
                <Text className="text-gray-400 text-sm">Sin imagen disponible</Text>
              )}
            </View>

            {/* Descripcion + referencia */}
            <View className="px-4 py-3">
              <Text className="text-blue-700 font-bold text-base leading-snug">
                {productoModal?.descripcion || ''}
              </Text>
              {productoModal?.referencia ? (
                <Text className="text-gray-500 text-[12px] mt-1">
                  Ref: {productoModal.referencia}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
