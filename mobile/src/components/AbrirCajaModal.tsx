// "Abrir caja" en la app (19/11/2026). Solo en empresas con Modo de Caja =
// "Una caja con apertura": la caja amanece abierta y, después de un cierre,
// el siguiente cajero la abre aquí con su fondo inicial (un solo monto).
// abrir_caja() en sql/apertura_caja.sql valida que de verdad esté cerrada.
// (20/11/2026) Varias cajas: el cajero escoge cuál caja abre (las ocupadas
// salen marcadas); abrir_caja_en() en sql/varias_cajas.sql valida.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/src/supabase/client';

type Caja = { id: string; nombre: string; ocupada: boolean };
type Props = { visible: boolean; turno?: number; estado?: { modo?: string; cajas?: Caja[] } | null; onAbierta: () => void; onCerrar: () => void };

export default function AbrirCajaModal({ visible, turno, estado, onAbierta, onCerrar }: Props) {
  const [fondo, setFondo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const varias = estado?.modo === 'varias';
  const cajas = estado?.cajas || [];
  const [caja, setCaja] = useState('');
  useEffect(() => {
    if (!visible) return;
    setFondo(''); setError('');
    const libres = (estado?.cajas || []).filter((c) => !c.ocupada);
    setCaja(libres.length === 1 ? libres[0].id : '');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = async () => {
    if (guardando) return;
    // Comas de miles fuera; cualquier otra cosa que no sea número es un error,
    // no un fondo de 0 callado.
    const limpio = String(fondo).replace(/,/g, '').trim();
    const monto = limpio === '' ? 0 : Number(limpio);
    if (!Number.isFinite(monto) || monto < 0) { setError('Escribe el fondo en números (0 si no hay).'); return; }
    if (varias && !caja) { setError('Escoge la caja que vas a abrir.'); return; }
    setGuardando(true); setError('');
    const { data, error: err } = varias
      ? await supabase.rpc('abrir_caja_en', { p_caja: caja, p_fondo: monto })
      : await supabase.rpc('abrir_caja', { p_fondo: monto });
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
            {varias
              ? 'Esta empresa trabaja con varias cajas. Escoge la tuya y ábrela con el dinero con que empiezas.'
              : `La caja se cerró (turno ${turno || 1}). Para seguir vendiendo, ábrela con el dinero con que empiezas.`}
          </Text>
          {varias && (
            <View className="mt-3">
              <Text className="text-xs font-bold text-gray-700">Caja</Text>
              {cajas.length === 0 ? (
                <Text className="text-xs text-amber-700 mt-1">No hay cajas creadas. Un administrador las crea en Configuración del Sistema (web).</Text>
              ) : (
                <View className="flex-row flex-wrap mt-1">
                  {cajas.map((c) => (
                    <TouchableOpacity key={c.id} disabled={c.ocupada} onPress={() => setCaja(c.id)}
                      className={`mr-2 mb-2 rounded-xl border px-3 py-2 ${c.ocupada ? 'border-gray-200 bg-gray-50' : caja === c.id ? 'border-emerald-600 bg-emerald-50' : 'border-gray-300'}`}>
                      <Text className={`font-bold ${c.ocupada ? 'text-gray-400' : caja === c.id ? 'text-emerald-800' : 'text-gray-800'}`}>{c.nombre}</Text>
                      <Text className="text-[10px] text-gray-500">{c.ocupada ? 'ocupada' : 'libre'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
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
