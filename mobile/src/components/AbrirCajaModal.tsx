// "Abrir caja" en la app (19/11/2026). Solo en empresas con Modo de Caja =
// "Una caja con apertura": la caja amanece abierta y, después de un cierre,
// el siguiente cajero la abre aquí con su fondo inicial (un solo monto).
// abrir_caja() en sql/apertura_caja.sql valida que de verdad esté cerrada.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/src/supabase/client';

type Props = { visible: boolean; turno?: number; onAbierta: () => void; onCerrar: () => void };

export default function AbrirCajaModal({ visible, turno, onAbierta, onCerrar }: Props) {
  const [fondo, setFondo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (visible) { setFondo(''); setError(''); } }, [visible]);

  const abrir = async () => {
    if (guardando) return;
    // Comas de miles fuera; cualquier otra cosa que no sea número es un error,
    // no un fondo de 0 callado.
    const limpio = String(fondo).replace(/,/g, '').trim();
    const monto = limpio === '' ? 0 : Number(limpio);
    if (!Number.isFinite(monto) || monto < 0) { setError('Escribe el fondo en números (0 si no hay).'); return; }
    setGuardando(true); setError('');
    const { data, error: err } = await supabase.rpc('abrir_caja', { p_fondo: monto });
    setGuardando(false);
    if (err || !(data as any)?.ok) { setError((data as any)?.error || err?.message || 'No se pudo abrir la caja.'); return; }
    onAbierta();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-white rounded-2xl p-5 w-full">
          <Text className="text-lg font-black text-gray-900">Abrir caja</Text>
          <Text className="text-sm text-gray-600 mt-1">
            La caja se cerró (turno {turno || 1}). Para seguir vendiendo, ábrela con el dinero con que empiezas.
          </Text>
          <Text className="text-xs font-bold text-gray-700 mt-4">Fondo inicial (RD$)</Text>
          <TextInput value={fondo} onChangeText={setFondo} keyboardType="decimal-pad" placeholder="0.00" autoFocus
            className="border border-gray-300 rounded-xl px-3 py-3 mt-1 text-lg font-bold text-gray-900" />
          <Text className="text-[11px] text-gray-500 mt-1">El cambio que hay en la gaveta al empezar. Escribe 0 si no hay.</Text>
          {!!error && <Text className="text-xs text-red-600 mt-2">{error}</Text>}
          <View className="flex-row mt-4">
            <TouchableOpacity onPress={onCerrar} className="flex-1 border border-gray-300 rounded-xl py-3 mr-2 items-center">
              <Text className="font-bold text-gray-700">Ahora no</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={abrir} disabled={guardando} className="flex-1 bg-emerald-600 rounded-xl py-3 items-center">
              {guardando ? <ActivityIndicator color="#fff" /> : <Text className="font-bold text-white">Abrir caja</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
