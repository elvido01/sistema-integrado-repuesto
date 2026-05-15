import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Modal, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, ScanLine, Search, X } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';

type Ubicacion = {
  id: string;
  nombre: string;
  codigo?: string | null;
};

type ProductoEncontrado = {
  id: string;
  descripcion: string;
  ubicacion?: string | null;
};

type ScannerField = 'product' | 'location' | null;

export default function ActualizarUbicacionScreen() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [ubicacionSearch, setUbicacionSearch] = useState('');
  const [product, setProduct] = useState<ProductoEncontrado | null>(null);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerField, setScannerField] = useState<ScannerField>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const fetchUbicaciones = async () => {
      const { data, error } = await supabase
        .from('ubicaciones')
        .select('id, nombre, codigo')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) {
        Alert.alert('Error', 'No se pudieron cargar las ubicaciones.');
        return;
      }
      setUbicaciones((data || []) as Ubicacion[]);
    };

    fetchUbicaciones();
  }, []);

  const filteredUbicaciones = useMemo(() => {
    const term = ubicacionSearch.trim().toUpperCase();
    if (!term) return ubicaciones.slice(0, 25);
    return ubicaciones
      .filter((u) =>
        u.nombre?.toUpperCase().includes(term) ||
        u.codigo?.toUpperCase().includes(term)
      )
      .slice(0, 25);
  }, [ubicaciones, ubicacionSearch]);

  const resetForm = () => {
    setCodigo('');
    setUbicacion('');
    setUbicacionSearch('');
    setProduct(null);
    setLoading(false);
    setSaving(false);
  };

  const handleProductSearch = useCallback(async (searchCodigo: string) => {
    const trimmed = searchCodigo.trim();
    if (!trimmed) return;

    setLoading(true);
    setProduct(null);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, descripcion, ubicacion')
        .or(`codigo.eq.${trimmed},referencia.eq.${trimmed}`)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Producto no encontrado.');

      const foundProduct = data[0] as ProductoEncontrado;
      setProduct(foundProduct);
      setUbicacion(foundProduct.ubicacion || '');
      setUbicacionSearch(foundProduct.ubicacion || '');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo buscar el producto.');
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestScanner = async (field: ScannerField) => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    const granted = status === 'granted';
    setHasPermission(granted);
    if (!granted) {
      Alert.alert('Sin acceso', 'No se concedio acceso a la camara.');
      return;
    }
    setScannerField(field);
    setScanned(false);
  };

  const closeScanner = () => {
    setScannerField(null);
    setScanned(false);
  };

  const handleScanSuccess = ({ data }: { data: string }) => {
    if (scanned || !data) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeScanner();

    if (scannerField === 'product') {
      setCodigo(data);
      handleProductSearch(data);
      return;
    }

    if (scannerField === 'location') {
      const matched = ubicaciones.find((u) =>
        u.nombre?.toUpperCase() === data.toUpperCase() ||
        u.codigo?.toUpperCase() === data.toUpperCase()
      );

      if (!matched) {
        Alert.alert('Ubicacion no encontrada', `"${data}" no coincide con ninguna ubicacion registrada.`);
        return;
      }

      setUbicacion(matched.nombre);
      setUbicacionSearch(matched.nombre);
    }
  };

  const handleSave = async () => {
    if (!product?.id) {
      Alert.alert('Producto no seleccionado', 'Primero debe buscar y encontrar un producto valido.');
      return;
    }
    if (!ubicacion.trim()) {
      Alert.alert('Ubicacion requerida', 'Debe seleccionar una ubicacion de la lista.');
      return;
    }

    setSaving(true);
    try {
      const finalLocation = ubicacion.trim().toUpperCase();
      const { error } = await supabase
        .from('productos')
        .update({ ubicacion: finalLocation })
        .eq('id', product.id);

      if (error) throw error;

      Alert.alert('Exito', `La ubicacion se actualizo a ${finalLocation}.`);
      resetForm();
    } catch {
      Alert.alert('Error al guardar', 'No se pudo actualizar la ubicacion del producto.');
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
        <Text className="text-white text-xl font-bold">Actualizar Ubicacion</Text>
      </View>

      <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
        <View className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <View className="items-center mb-6">
            <View className="bg-blue-100 p-4 rounded-full mb-3">
              <MapPin color="#1d4ed8" size={36} />
            </View>
            <Text className="text-2xl font-bold text-gray-900">Actualizar Ubicacion</Text>
            <Text className="text-gray-500 text-center mt-1">
              Escanee o ingrese el codigo del producto y seleccione su nueva ubicacion.
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
            <TouchableOpacity className="p-2" onPress={() => handleProductSearch(codigo)} disabled={loading || saving}>
              {loading ? <ActivityIndicator color="#1d4ed8" /> : <Search color="#1d4ed8" size={21} />}
            </TouchableOpacity>
            <TouchableOpacity className="p-2" onPress={() => requestScanner('product')} disabled={loading || saving}>
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
              <Text className="text-green-700 text-xs mt-1">Ubicacion actual: {product.ubicacion || 'N/A'}</Text>
            </View>
          ) : null}

          <Text className="text-brand font-bold mt-4 mb-2">UBICACION*</Text>
          <View className={`flex-row items-center rounded-xl px-3 mb-2 ${product ? 'bg-gray-100' : 'bg-gray-50 opacity-60'}`}>
            <TextInput
              className="flex-1 text-gray-900 py-3"
              placeholder="Seleccionar ubicacion"
              placeholderTextColor="#9ca3af"
              value={ubicacionSearch}
              onChangeText={(text) => {
                setUbicacionSearch(text);
                setUbicacion(text);
              }}
              editable={!!product && !saving}
              autoCapitalize="characters"
            />
            <TouchableOpacity className="p-2" onPress={() => requestScanner('location')} disabled={!product || saving}>
              <ScanLine color="#6b7280" size={22} />
            </TouchableOpacity>
          </View>

          {product ? (
            <View className="max-h-48 mb-4">
              <ScrollView keyboardShouldPersistTaps="handled">
                {filteredUbicaciones.map((u) => {
                  const active = ubicacion.toUpperCase() === u.nombre.toUpperCase();
                  return (
                    <TouchableOpacity
                      key={u.id}
                      className={`px-3 py-3 border-b border-gray-100 flex-row items-center justify-between ${active ? 'bg-blue-50' : 'bg-white'}`}
                      onPress={() => {
                        setUbicacion(u.nombre);
                        setUbicacionSearch(u.nombre);
                      }}
                    >
                      <View>
                        <Text className={`font-bold ${active ? 'text-brand' : 'text-gray-800'}`}>{u.nombre}</Text>
                        {u.codigo ? <Text className="text-gray-400 text-xs">{u.codigo}</Text> : null}
                      </View>
                      {active ? <CheckCircle2 color="#1d4ed8" size={20} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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

      <Modal visible={scannerField !== null} animationType="fade" onRequestClose={closeScanner}>
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
              <Text className="text-white text-lg font-medium">
                Escanear {scannerField === 'product' ? 'producto' : 'ubicacion'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
