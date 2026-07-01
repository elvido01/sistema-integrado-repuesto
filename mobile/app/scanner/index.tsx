import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScannerScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
  }, []);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Aquí puedes manejar qué hacer con el código (ej. redirigir a la búsqueda del catálogo)
    // Para este demo, volvemos al catálogo y pasamos el código como parámetro en una app real
    // Aquí simplemente mostraremos una alerta o pasaremos al catálogo (idealmente usando Zustand o params)
    
    // Por simplicidad en este demo, solo hacemos un log o router.back()
    console.log(`Scanned ${type}: ${data}`);
    router.back();
  };

  if (hasPermission === null) {
    return <View className="flex-1 bg-black justify-center items-center"><Text className="text-white">Solicitando permisos de cámara...</Text></View>;
  }
  if (hasPermission === false) {
    return <View className="flex-1 bg-black justify-center items-center"><Text className="text-white">Sin acceso a la cámara</Text></View>;
  }

  return (
    <View className="flex-1 bg-black">
      <View className="absolute left-4 z-10" style={{ top: Math.max(insets.top + 12, 24) }}>
        <TouchableOpacity onPress={() => router.back()} className="bg-black/50 p-2 rounded-full">
          <X color="white" size={32} />
        </TouchableOpacity>
      </View>
      <View className="absolute right-4 z-10" style={{ top: Math.max(insets.top + 12, 24) }}>
        <TouchableOpacity className="bg-black/50 p-2 rounded-full">
          <Zap color="white" size={32} />
        </TouchableOpacity>
      </View>

      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'code128', 'code39'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      
      <View className="absolute top-1/2 left-1/2 -mt-32 -ml-32 w-64 h-64 border-2 border-brand/80 rounded-xl" />
      
      <View className="absolute w-full items-center" style={{ bottom: Math.max(insets.bottom + 24, 48) }}>
        <View className="bg-black/70 px-6 py-3 rounded-full">
          <Text className="text-white text-lg font-medium">Apunta al código de barras</Text>
        </View>
      </View>
    </View>
  );
}
