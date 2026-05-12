import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchProductos } from '@/src/services/productService';
import { useAuthStore } from '@/src/store/useAuthStore';
import { Search, ScanBarcode, ChevronRight, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import debounce from 'lodash.debounce';

export default function CatalogoScreen() {
  const { empresaId } = useAuthStore();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const router = useRouter();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching
  } = useInfiniteQuery({
    queryKey: ['productos', empresaId, debouncedSearch],
    queryFn: ({ pageParam = 1 }) => fetchProductos(empresaId as string, pageParam, 20, debouncedSearch),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length + 1 : undefined,
    enabled: !!empresaId,
  });

  const updateSearch = useCallback(
    debounce((text: string) => {
      setDebouncedSearch(text);
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

  const productos = useMemo(() => {
    return data?.pages.flatMap(page => page.productos) || [];
  }, [data]);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity 
      className="flex-row items-center bg-white border-b border-gray-100 p-3 active:bg-gray-50"
      onPress={() => router.push(`/producto/${item.id}`)}
    >
      <View className="flex-1 pl-2">
        <Text className="text-brand font-bold text-lg">{item.codigo}</Text>
        <Text className="text-gray-900 font-bold mt-1 text-base leading-tight">{item.descripcion}</Text>
        <Text className="text-gray-500 text-sm mt-0.5">{item.referencia || 'Sin referencia'}</Text>
        
        <View className="flex-row justify-between items-center mt-2">
          <View className="flex-row items-center">
            <Text className="text-gray-600 text-xs mr-1">EX</Text>
            <Text className={`font-bold ${item.existencia > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {Number(item.existencia).toFixed(2)}
            </Text>
          </View>
          <View className="flex-row space-x-4">
            <Text className="text-gray-600 font-medium">RD${Number(item.precio_venta_1).toLocaleString()}</Text>
            {item.precio_venta_2 !== item.precio_venta_1 && (
              <Text className="text-gray-400">RD${Number(item.precio_venta_2).toLocaleString()}</Text>
            )}
          </View>
        </View>
      </View>
      <ChevronRight color="#d1d5db" size={24} className="ml-2" />
    </TouchableOpacity>
  ), [router]);

  console.log('CatalogoScreen Rendering. Items:', productos.length, 'isLoading:', isLoading);

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-brand p-4 shadow-sm flex-row items-center">
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
    </View>
  );
}
