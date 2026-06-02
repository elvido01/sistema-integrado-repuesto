// ============================================================
// configuracion/impresora.tsx — Vincular impresora Bluetooth
// ============================================================
// Flujo:
//   1. Si no hay impresora guardada -> boton "Buscar impresoras"
//   2. Lista de cercanas -> tocar -> conectar -> probar impresion
//   3. Si ya hay -> mostrar "Conectada" + boton "Olvidar"
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Printer, Bluetooth, Trash2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import {
    scanForPrinters,
    connect,
    forgetPrinter,
    getSavedPrinter,
    printTestPage,
    type DiscoveredPrinter,
} from '@/services/bluetoothPrinter';

export default function ImpresoraConfig() {
    const [saved, setSaved] = useState<{ id: string; name: string | null } | null>(null);
    const [scanning, setScanning] = useState(false);
    const [results, setResults] = useState<DiscoveredPrinter[]>([]);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        (async () => {
            const s = await getSavedPrinter();
            setSaved(s);
        })();
    }, []);

    const handleScan = useCallback(async () => {
        setScanning(true);
        setResults([]);
        try {
            const list = await scanForPrinters(6000);
            setResults(list);
            if (!list.length) {
                Alert.alert('Sin resultados', 'No se encontraron impresoras. Asegúrate que esté encendida y cerca.');
            }
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'No se pudo buscar');
        } finally {
            setScanning(false);
        }
    }, []);

    const handleConnect = useCallback(async (printer: DiscoveredPrinter) => {
        setConnecting(printer.id);
        try {
            await connect(printer.id);
            setSaved({ id: printer.id, name: printer.name });
            setResults([]);
            Alert.alert('Conectada', `${printer.name || printer.id} quedó como impresora predeterminada.`);
        } catch (e: any) {
            Alert.alert('No se pudo conectar', e?.message || 'Error desconocido');
        } finally {
            setConnecting(null);
        }
    }, []);

    const handleTest = useCallback(async () => {
        setTesting(true);
        try {
            await printTestPage();
        } catch (e: any) {
            Alert.alert('No se pudo imprimir', e?.message || 'Verifica la conexión');
        } finally {
            setTesting(false);
        }
    }, []);

    const handleForget = useCallback(async () => {
        Alert.alert('Olvidar impresora', `Quitar "${saved?.name || saved?.id}" como predeterminada?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Olvidar',
                style: 'destructive',
                onPress: async () => {
                    await forgetPrinter();
                    setSaved(null);
                },
            },
        ]);
    }, [saved]);

    return (
        <View className="flex-1 bg-slate-50">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-slate-200">
                <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2">
                    <ArrowLeft size={22} color="#0f172a" />
                </TouchableOpacity>
                <Printer size={20} color="#0f172a" />
                <Text className="ml-2 text-base font-bold text-slate-900">Impresora Bluetooth</Text>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
                {/* Estado actual */}
                {saved ? (
                    <View className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                        <View className="flex-row items-center">
                            <CheckCircle2 size={20} color="#059669" />
                            <Text className="ml-2 text-sm font-bold text-emerald-900">Impresora vinculada</Text>
                        </View>
                        <Text className="mt-2 text-base font-semibold text-slate-900">
                            {saved.name || 'Sin nombre'}
                        </Text>
                        <Text className="text-xs text-slate-500 mt-0.5">{saved.id}</Text>

                        <View className="flex-row mt-3 gap-2">
                            <TouchableOpacity
                                onPress={handleTest}
                                disabled={testing}
                                className="flex-1 bg-emerald-600 py-2 rounded-md flex-row items-center justify-center"
                            >
                                {testing
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Printer size={16} color="#fff" />}
                                <Text className="ml-2 text-sm font-bold text-white">Probar impresión</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleForget}
                                className="bg-red-100 px-3 py-2 rounded-md flex-row items-center"
                            >
                                <Trash2 size={16} color="#dc2626" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                        <View className="flex-row items-center">
                            <AlertTriangle size={20} color="#d97706" />
                            <Text className="ml-2 text-sm font-bold text-amber-900">Sin impresora</Text>
                        </View>
                        <Text className="mt-1 text-xs text-amber-800">
                            Vincula una impresora Bluetooth ESC/POS (ej. 2C-P80-C) para imprimir tus facturas.
                        </Text>
                    </View>
                )}

                {/* Buscar */}
                <TouchableOpacity
                    onPress={handleScan}
                    disabled={scanning}
                    className="bg-blue-600 py-3 rounded-md flex-row items-center justify-center"
                >
                    {scanning
                        ? <ActivityIndicator color="#fff" />
                        : <Bluetooth size={18} color="#fff" />}
                    <Text className="ml-2 text-sm font-bold text-white">
                        {scanning ? 'Buscando…' : (saved ? 'Buscar otra impresora' : 'Buscar impresoras')}
                    </Text>
                </TouchableOpacity>

                {scanning && (
                    <Text className="text-xs text-slate-500 mt-2 text-center">
                        Escaneando 6 segundos…
                    </Text>
                )}

                {/* Resultados */}
                {results.length > 0 && (
                    <View className="mt-4">
                        <Text className="text-xs font-bold text-slate-600 mb-2">
                            Cercanas ({results.length}):
                        </Text>
                        {results.map(p => (
                            <TouchableOpacity
                                key={p.id}
                                onPress={() => handleConnect(p)}
                                disabled={connecting !== null}
                                className="bg-white border border-slate-200 rounded-md p-3 mb-2 flex-row items-center"
                            >
                                <Printer size={18} color="#475569" />
                                <View className="ml-3 flex-1">
                                    <Text className="text-sm font-semibold text-slate-900">
                                        {p.name || '(sin nombre)'}
                                    </Text>
                                    <Text className="text-[10px] text-slate-500">
                                        {p.id} · {p.rssi}dBm
                                    </Text>
                                </View>
                                {connecting === p.id
                                    ? <ActivityIndicator size="small" color="#0f172a" />
                                    : <Text className="text-xs text-blue-600 font-semibold">Conectar</Text>}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Tips */}
                <View className="mt-6 p-3 bg-slate-100 rounded-md">
                    <Text className="text-xs font-bold text-slate-700 mb-1">💡 Tips</Text>
                    <Text className="text-[11px] text-slate-600">
                        · Enciende la impresora antes de buscar.{'\n'}
                        · En Android primero acepta los permisos de Bluetooth y Ubicación.{'\n'}
                        · Si tu impresora no aparece, prueba apagarla y encenderla otra vez.{'\n'}
                        · Funciona con impresoras ESC/POS: 2C-P80-C, MTP, XPrinter, GPrinter, etc.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}
