import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Modal, StyleSheet, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Boxes, Calculator, Loader2, ScanBarcode, ScanLine, Search, X } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { fetchProductos, Producto } from '@/src/services/productService';

type ProductoEncontrado = {
  id: string;
  codigo: string;
  descripcion: string;
  costo?: number | null;
  existencia: number;
};

export default function ActualizarExistenciaScreen() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [nuevaExistencia, setNuevaExistencia] = useState('');
  const [product, setProduct] = useState<ProductoEncontrado | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogMarca, setCatalogMarca] = useState('');
  const [catalogModelo, setCatalogModelo] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<Producto[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  const diferencia = product
    ? Number(nuevaExistencia || 0) - Number(product.existencia || 0)
    : 0;

  const resetForm = () => {
    setCodigo('');
    setNuevaExistencia('');
    setProduct(null);
    setLoading(false);
    setSaving(false);
  };

  const getToday = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleProductSearch = useCallback(async (searchCodigo: string) => {
    const trimmed = searchCodigo.trim();
    if (!trimmed) return;

    setLoading(true);
    setProduct(null);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, descripcion, costo')
        .or(`codigo.eq.${trimmed},referencia.eq.${trimmed}`)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Producto no encontrado.');

      const found = data[0];
      const { data: stockData, error: stockError } = await supabase.rpc('get_stock_actual', {
        producto_uuid: found.id,
      });
      if (stockError) throw stockError;

      const existencia = Number(stockData || 0);
      const foundProduct = {
        id: found.id,
        codigo: found.codigo,
        descripcion: found.descripcion,
        costo: Number(found.costo || 0),
        existencia,
      };

      setProduct(foundProduct);
      setNuevaExistencia(String(existencia));
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo buscar el producto.');
      setProduct(null);
      setNuevaExistencia('');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalogProducts = useCallback(async (searchText = '', marcaText = '', modeloText = '') => {
    setCatalogLoading(true);
    try {
      const result = await fetchProductos(1, 60, searchText.trim(), marcaText.trim(), modeloText.trim());
      setCatalogProducts(result.productos);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo cargar el catalogo.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const openCatalog = () => {
    setCatalogOpen(true);
    loadCatalogProducts(catalogSearch, catalogMarca, catalogModelo);
  };

  useEffect(() => {
    if (!catalogOpen) return;
    const timer = setTimeout(() => {
      loadCatalogProducts(catalogSearch, catalogMarca, catalogModelo);
    }, 350);
    return () => clearTimeout(timer);
  }, [catalogOpen, catalogSearch, catalogMarca, catalogModelo, loadCatalogProducts]);

  const selectProductFromCatalog = (item: Producto) => {
    const existencia = Number(item.existencia || 0);
    setCodigo(item.codigo || '');
    setProduct({
      id: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      costo: Number(item.costo || 0),
      existencia,
    });
    setNuevaExistencia(String(existencia));
    setCatalogOpen(false);
  };

  const fmtMoney = (n: number) =>
    `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const first6 = (s?: string | null) => (s ? String(s).slice(0, 6) : '');
  const last6 = (s?: string | null) => (s ? String(s).slice(-6) : '');
  const shortLocation = (s?: string | null) => {
    const value = String(s || '').trim();
    return value || '-';
  };

  const requestScanner = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    const granted = status === 'granted';
    setHasPermission(granted);
    if (!granted) {
      Alert.alert('Sin acceso', 'No se concedio acceso a la camara.');
      return;
    }
    setScannerOpen(true);
    setScanned(false);
  };

  const closeScanner = () => {
    setScannerOpen(false);
    setScanned(false);
  };

  const handleScanSuccess = ({ data }: { data: string }) => {
    if (scanned || !data) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeScanner();
    setCodigo(data);
    handleProductSearch(data);
  };

  const handleSave = async () => {
    if (!product?.id) {
      Alert.alert('Producto no seleccionado', 'Primero debe buscar y encontrar un producto valido.');
      return;
    }

    const nueva = Number(nuevaExistencia);
    if (Number.isNaN(nueva) || nueva < 0) {
      Alert.alert('Existencia invalida', 'Ingrese una existencia mayor o igual a cero.');
      return;
    }

    const diff = nueva - Number(product.existencia || 0);
    if (Math.abs(diff) <= 0.001) {
      Alert.alert('Sin cambios', 'La existencia indicada es igual a la existencia actual.');
      return;
    }

    setSaving(true);
    try {
      const { data: almacenes, error: almError } = await supabase
        .from('almacenes')
        .select('id')
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .limit(1);

      if (almError) throw almError;
      const almacenId = almacenes?.[0]?.id;
      if (!almacenId) throw new Error('No existe un almacen activo para registrar el ajuste.');

      const costo = Number(product.costo || 0);
      const absDiff = Math.abs(diff);
      const detalle = [{
        producto_id: product.id,
        codigo: product.codigo,
        descripcion: product.descripcion,
        cantidad: absDiff,
        unidad: 'UND',
        costo_unitario: costo,
        importe: absDiff * costo,
      }];

      if (diff > 0) {
        const { data: numero, error: numError } = await supabase.rpc('get_next_entrada_numero');
        if (numError) throw numError;
        const { error } = await supabase.rpc('crear_entrada_inventario', {
          p_entrada_data: {
            numero,
            fecha: getToday(),
            referencia: 'AJUSTE DESDE APP MOVIL',
            concepto: 'AJUSTE DE INVENTARIO',
            almacen_id: almacenId,
            notas: `Ajuste de existencia desde app movil para ${product.codigo}`,
            total_costo: absDiff * costo,
          },
          p_detalles_data: detalle,
          p_tipo_movimiento: 'AJUSTE',
        });
        if (error) throw error;
      } else {
        const { data: numero, error: numError } = await supabase.rpc('get_next_salida_numero');
        if (numError) throw numError;
        const { error } = await supabase.rpc('crear_salida_inventario', {
          p_salida_data: {
            numero,
            fecha: getToday(),
            referencia: 'AJUSTE DESDE APP MOVIL',
            concepto: 'AJUSTE DE SALIDA',
            almacen_id: almacenId,
            notas: `Ajuste de existencia desde app movil para ${product.codigo}`,
            total_costo: absDiff * costo,
          },
          p_detalles_data: detalle,
          p_tipo_movimiento: 'AJUSTE',
        });
        if (error) throw error;
      }

      Alert.alert('Exito', `La existencia se actualizo de ${product.existencia} a ${nueva}.`);
      resetForm();
    } catch (error: any) {
      Alert.alert('Error al guardar', error.message || 'No se pudo actualizar la existencia del producto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-brand pt-12 pb-4 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
          <ArrowLeft color="white" size={24} />
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">Actualizar Existencia</Text>
      </View>

      <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
        <View className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <View className="items-center mb-6">
            <View className="bg-amber-100 p-4 rounded-full mb-3">
              <Boxes color="#b45309" size={36} />
            </View>
            <Text className="text-2xl font-bold text-gray-900">Actualizar Existencia</Text>
            <Text className="text-gray-500 text-center mt-1">
              Escanee o ingrese el codigo del producto y coloque la existencia fisica contada.
            </Text>
          </View>

          <Text className="text-brand font-bold mb-2">IDPRODUCTO*</Text>
          <View className="flex-row items-center bg-gray-100 rounded-xl px-3 mb-2">
            <TextInput
              className="flex-1 text-gray-900 py-3"
              placeholder="Ingrese o escanee el codigo"
              placeholderTextColor="#9ca3af"
              value={codigo}
              onChangeText={setCodigo}
              onSubmitEditing={() => handleProductSearch(codigo)}
              editable={!loading && !saving}
              autoCapitalize="characters"
              returnKeyType="search"
            />
            <TouchableOpacity className="p-2" onPress={openCatalog} disabled={loading || saving}>
              {loading ? <ActivityIndicator color="#1d4ed8" /> : <Search color="#1d4ed8" size={21} />}
            </TouchableOpacity>
            <TouchableOpacity className="p-2" onPress={requestScanner} disabled={loading || saving}>
              <ScanLine color="#6b7280" size={22} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="flex-row items-center my-3">
              <Loader2 color="#6b7280" size={18} />
              <Text className="text-gray-500 ml-2">Buscando producto...</Text>
            </View>
          ) : null}

          {product ? (
            <View className="bg-green-50 border-l-4 border-green-400 p-3 rounded-r-lg my-3">
              <Text className="text-green-900 font-bold">{product.descripcion}</Text>
              <Text className="text-green-700 text-xs mt-1">Codigo: {product.codigo}</Text>
              <Text className="text-green-700 text-xs mt-1">Existencia actual: {product.existencia}</Text>
            </View>
          ) : null}

          <Text className="text-brand font-bold mt-4 mb-2">EXISTENCIA FISICA*</Text>
          <View className={`flex-row items-center rounded-xl px-3 mb-2 ${product ? 'bg-gray-100' : 'bg-gray-50 opacity-60'}`}>
            <TextInput
              className="flex-1 text-gray-900 py-3 text-lg font-bold"
              placeholder="Ingrese la existencia contada"
              placeholderTextColor="#9ca3af"
              value={nuevaExistencia}
              onChangeText={setNuevaExistencia}
              editable={!!product && !saving}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            <Calculator color="#6b7280" size={22} />
          </View>

          {product ? (
            <View className="bg-blue-50 rounded-xl p-3 mb-4">
              <Text className="text-blue-900 font-bold">Movimiento a generar</Text>
              <Text className="text-blue-700 text-sm mt-1">
                {Math.abs(diferencia) <= 0.001
                  ? 'Sin diferencia.'
                  : diferencia > 0
                    ? `Entrada de ajuste por +${diferencia}`
                    : `Salida de ajuste por ${diferencia}`}
              </Text>
            </View>
          ) : null}

          <View className="flex-row gap-3 pt-2">
            <TouchableOpacity className="flex-1 bg-gray-100 rounded-xl py-4 items-center" onPress={resetForm} disabled={saving}>
              <Text className="text-gray-700 font-bold">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-[1.5] bg-brand rounded-xl py-4 items-center ${!product || saving ? 'opacity-60' : ''}`}
              onPress={handleSave}
              disabled={!product || saving}
            >
              <Text className="text-white font-bold">{saving ? 'Guardando...' : 'Guardar Cambios'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="fade" onRequestClose={closeScanner}>
        <View className="flex-1 bg-black">
          <View className="absolute top-12 left-4 z-10">
            <TouchableOpacity onPress={closeScanner} className="bg-black/50 p-2 rounded-full">
              <X color="white" size={30} />
            </TouchableOpacity>
          </View>
          {hasPermission ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'code128', 'code39'] }}
              onBarcodeScanned={scanned ? undefined : handleScanSuccess}
            />
          ) : null}
          <View className="absolute top-1/2 left-1/2 -mt-32 -ml-32 w-64 h-64 border-2 border-brand/80 rounded-xl" />
          <View className="absolute bottom-12 w-full items-center">
            <View className="bg-black/70 px-6 py-3 rounded-full">
              <Text className="text-white text-lg font-medium">Escanear producto</Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={catalogOpen} animationType="slide" onRequestClose={() => setCatalogOpen(false)}>
        <View className="flex-1 bg-gray-50">
          <View className="bg-brand pt-12 pb-4 px-4">
            <Text className="text-white text-xl font-bold">Catalogo</Text>
          </View>

          <TouchableOpacity
            className="bg-emerald-600 px-4 py-2 flex-row items-center justify-between active:bg-emerald-700"
            onPress={() => setCatalogOpen(false)}
          >
            <View className="flex-row items-center">
              <ArrowLeft color="white" size={20} />
              <Text className="text-white font-bold text-[15px] ml-2">Volver a existencia</Text>
            </View>
            <View className="bg-white/20 px-3 py-1 rounded-full">
              <Text className="text-white font-bold text-[13px]">Seleccionar</Text>
            </View>
          </TouchableOpacity>

          <View className="bg-brand p-4 pb-3 shadow-sm">
            <View className="flex-row items-center">
              <View className="flex-1 bg-white rounded-xl flex-row items-center px-3 py-2">
                <Search color="#9ca3af" size={20} />
                <TextInput
                  className="flex-1 ml-2 text-base text-gray-900"
                  placeholder="Buscar articulo, codigo o ref..."
                  placeholderTextColor="#9ca3af"
                  value={catalogSearch}
                  onChangeText={setCatalogSearch}
                  onSubmitEditing={() => loadCatalogProducts(catalogSearch, catalogMarca, catalogModelo)}
                  returnKeyType="search"
                  autoCapitalize="characters"
                />
                {catalogSearch ? (
                  <TouchableOpacity onPress={() => setCatalogSearch('')} className="p-1">
                    <X color="#9ca3af" size={16} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                className="ml-3 bg-white p-2.5 rounded-xl"
                onPress={() => {
                  setCatalogOpen(false);
                  requestScanner();
                }}
              >
                <ScanBarcode color="#1d4ed8" size={24} />
              </TouchableOpacity>
            </View>

            <View className="flex-row mt-2 gap-2">
              <View className="flex-1 bg-white rounded-lg flex-row items-center px-3" style={{ minHeight: 40 }}>
                <TextInput
                  className="flex-1 text-[14px] text-gray-900"
                  style={{ paddingVertical: 0, includeFontPadding: false } as any}
                  placeholder="Marca"
                  placeholderTextColor="#9ca3af"
                  value={catalogMarca}
                  onChangeText={setCatalogMarca}
                  returnKeyType="search"
                  onSubmitEditing={() => loadCatalogProducts(catalogSearch, catalogMarca, catalogModelo)}
                />
                {catalogMarca ? (
                  <TouchableOpacity onPress={() => setCatalogMarca('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="ml-1">
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
                  value={catalogModelo}
                  onChangeText={setCatalogModelo}
                  returnKeyType="search"
                  onSubmitEditing={() => loadCatalogProducts(catalogSearch, catalogMarca, catalogModelo)}
                />
                {catalogModelo ? (
                  <TouchableOpacity onPress={() => setCatalogModelo('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="ml-1">
                    <X color="#9ca3af" size={14} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {catalogLoading ? (
            <View className="flex-row items-center justify-center py-2 bg-white border-b border-gray-200">
              <ActivityIndicator size="small" color="#1d4ed8" />
              <Text className="text-gray-500 text-xs ml-2">Buscando...</Text>
            </View>
          ) : null}

          <FlatList
            data={catalogProducts}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              catalogLoading ? null : (
                <View className="p-8 items-center">
                  <Text className="text-gray-500 text-center">No se encontraron productos.</Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const exist = Number(item.existencia) || 0;
              return (
                <TouchableOpacity
                  className="bg-white border-b border-gray-200 px-3 py-2 active:bg-blue-50"
                  onPress={() => selectProductFromCatalog(item)}
                >
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

                  <View className="flex-row items-center mt-0.5">
                    <Text
                      className="text-gray-600 text-[12px] flex-[1.15]"
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {last6(item.referencia)}
                    </Text>
                    <Text
                      className="text-gray-500 font-semibold text-[12px] flex-[1.15] pl-1"
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {shortLocation(item.ubicacion)}
                    </Text>
                    <Text className={`font-bold text-[14px] text-center flex-[0.55] ${exist > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {exist}
                    </Text>
                    <Text className="font-bold text-[14px] text-right flex-[1.2] text-emerald-600">
                      {fmtMoney(item.precio_venta_1)}
                    </Text>
                    <Text className="font-bold text-[14px] text-right flex-[1.2] text-emerald-600">
                      {fmtMoney(item.precio_venta_2 || item.precio_venta_1)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
