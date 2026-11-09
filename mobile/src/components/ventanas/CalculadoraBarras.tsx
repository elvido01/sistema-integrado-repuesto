// Calculadora de barras sin proyecto (09/11/2026, como "Barras" de Desglo).
// Largo del corte (pulgada entera + fracción tocada) × cantidad → cuántas
// barras y cómo cortar cada una. Barra y merma de vent_config (como la web).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';
import { X, Plus, Trash2 } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { pulgadasTexto, planBarras } from '@/src/lib/ventanas';

const FRACCIONES: [string, number][] = [['0', 0], ['⅛', 1 / 8], ['¼', 1 / 4], ['⅜', 3 / 8], ['½', 1 / 2], ['⅝', 5 / 8], ['¾', 3 / 4], ['⅞', 7 / 8]];
type Fila = { id: string; entero: string; fraccion: number; cantidad: string };
const filaVacia = (): Fila => ({ id: `${Date.now()}-${Math.random()}`, entero: '', fraccion: 0, cantidad: '1' });

export default function CalculadoraBarras({ tenantId, onClose }: { tenantId: string | null; onClose: () => void }) {
  const [cfg, setCfg] = useState<{ largo_barra: number; merma_corte: number }>({ largo_barra: 240, merma_corte: 0.125 });
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('vent_config').select('largo_barra, merma_corte').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => { if (data) setCfg(data as any); });
  }, [tenantId]);

  const largoBarra = Number(cfg.largo_barra) || 240;
  const merma = cfg.merma_corte != null ? Number(cfg.merma_corte) : 0.125;
  const cambiar = (id: string, k: keyof Fila, v: any) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [k]: v } : f)));

  const cortes = useMemo(() => {
    const c: number[] = [];
    for (const f of filas) {
      const l = (parseInt(f.entero, 10) || 0) + f.fraccion;
      const n = Math.max(0, parseInt(f.cantidad, 10) || 0);
      if (l > 0) for (let i = 0; i < n; i++) c.push(l);
    }
    return c;
  }, [filas]);
  const plan = useMemo(() => planBarras(cortes, largoBarra, merma), [cortes, largoBarra, merma]);
  const total = cortes.reduce((s, x) => s + x, 0);

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <ScrollView className="bg-white rounded-t-3xl max-h-[92%]" contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-lg font-bold">Calcular barras</Text>
            <TouchableOpacity onPress={onClose}><X color="#6b7280" size={24} /></TouchableOpacity>
          </View>
          <Text className="text-xs text-gray-500 mb-3">
            Barra de {(largoBarra / 12).toFixed(0)} pies y {pulgadasTexto(merma)}" por corte (se cambia en la web, Configuración del desglose).
          </Text>
          {filas.map((f) => (
            <View key={f.id} className="border border-gray-200 rounded-xl p-3 mb-2">
              <View className="flex-row items-center">
                <TextInput className="border border-gray-300 rounded-lg px-3 py-2 text-base w-20 text-center" keyboardType="number-pad"
                  placeholder='pulg.' value={f.entero} onChangeText={(t) => cambiar(f.id, 'entero', t.replace(/\D/g, ''))} />
                <Text className="mx-2 text-gray-500">×</Text>
                <TextInput className="border border-gray-300 rounded-lg px-3 py-2 text-base w-16 text-center" keyboardType="number-pad"
                  value={f.cantidad} onChangeText={(t) => cambiar(f.id, 'cantidad', t.replace(/\D/g, ''))} />
                <Text className="ml-2 text-gray-500 flex-1">cortes</Text>
                <TouchableOpacity onPress={() => setFilas((fs) => (fs.length > 1 ? fs.filter((x) => x.id !== f.id) : [filaVacia()]))}>
                  <Trash2 color="#dc2626" size={20} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                {FRACCIONES.map(([t, v]) => (
                  <TouchableOpacity key={t} onPress={() => cambiar(f.id, 'fraccion', v)}
                    className={`px-3 py-1.5 rounded-lg border mr-1.5 ${f.fraccion === v ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}>
                    <Text className={`font-semibold ${f.fraccion === v ? 'text-white' : 'text-gray-700'}`}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          <TouchableOpacity onPress={() => setFilas((fs) => [...fs, filaVacia()])} className="flex-row items-center justify-center border border-gray-300 rounded-xl py-3">
            <Plus color="#1d4ed8" size={18} /><Text className="text-blue-700 font-semibold ml-1">Otro corte</Text>
          </TouchableOpacity>

          {cortes.length > 0 && (
            <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-4">
              <Text className="text-base"><Text className="font-black text-xl">{plan.barras.length}</Text> barra(s) · {cortes.length} corte(s) · {(total / 12).toFixed(2)} pies</Text>
              {plan.sinCaber.length > 0 && (
                <Text className="text-xs text-red-600 mt-1">No caben en una barra: {plan.sinCaber.map((x: number) => `${pulgadasTexto(x)}"`).join(', ')}</Text>
              )}
              {plan.barras.map((b: { cortes: number[]; sobrante: number }, i: number) => (
                <Text key={i} className="text-xs mt-1.5">
                  <Text className="font-bold">Barra {i + 1}: </Text>{b.cortes.map((c) => `${pulgadasTexto(c)}"`).join(' · ')}
                  <Text className="text-gray-500">  (sobra {pulgadasTexto(b.sobrante)}")</Text>
                </Text>
              ))}
            </View>
          )}
          <View className="h-10" />
        </ScrollView>
      </View>
    </Modal>
  );
}
