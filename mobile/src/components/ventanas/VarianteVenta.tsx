// Color y Unidad/Pies al agregar al carrito (09/11/2026, como "Nueva Factura"
// de Desglo). SOLO empresas tipo 'aluminio' (el catálogo lo abre). Si el
// producto no tiene colores ni largo de barra, llama onNormal() y sigue el
// modal de cantidad de siempre.
// · Unidad: el color escogido entra al carrito como cualquier producto.
// · Pies: línea aparte con la fracción de barra (5 pies de 20 = 0.25) y
//   "(5 PIES)" en la descripción; descuenta esa fracción del inventario.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import { X, Minus, Plus, Check } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { useCartStore, nuevaLineaId } from '@/src/store/useCartStore';
import { fetchProductoPorId } from '@/src/services/productService';

const fmt = (v: number) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

type Variante = { id: string; codigo: string; descripcion: string; color: string | null; precio: number; largo_pies: number | null; existencia: number | null };

export default function VarianteVenta({ producto, onCerrar, onNormal }: { producto: any; onCerrar: () => void; onNormal: () => void }) {
  const addItem = useCartStore((s) => s.addItem);
  const addLineaServicio = useCartStore((s) => s.addLineaServicio);
  const [cargando, setCargando] = useState(true);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [elegido, setElegido] = useState<Variante | null>(null);
  const [modo, setModo] = useState<'unidad' | 'pies'>('unidad');
  const [cantidad, setCantidad] = useState('1');
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.rpc('vent_variantes', { p_producto: producto.id });
      if (!vivo) return;
      const lista: Variante[] = !error && Array.isArray(data?.variantes) ? data.variantes : [];
      const largoPropio = Number(data?.largo_pies) || 0;
      if (!lista.length && !largoPropio) { onNormal(); return; }
      setVariantes(lista);
      setElegido(lista.find((v) => v.id === producto.id) || (lista.length ? null : {
        id: producto.id, codigo: producto.codigo, descripcion: producto.descripcion, color: null,
        precio: Number(producto.precio_venta_1 ?? producto.precio) || 0, largo_pies: largoPropio, existencia: producto.existencia ?? null,
      }));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [producto]); // eslint-disable-line react-hooks/exhaustive-deps

  const largo = Number(elegido?.largo_pies) || 0;
  const n = Number(cantidad) || 0;
  const fraccion = modo === 'pies' && largo ? r4(n / largo) : n;
  const total = (Number(elegido?.precio) || 0) * fraccion;

  const agregar = async () => {
    if (!elegido || !(n > 0)) return;
    setAgregando(true);
    try {
      const prod = await fetchProductoPorId(elegido.id);
      if (!prod) throw new Error('Producto no encontrado.');
      if (modo === 'pies') {
        addLineaServicio({
          ...prod, lineaId: nuevaLineaId(), naturaleza: 'bien',
          descripcion: `${prod.descripcion} (${n} PIES)`,
          cantidad: fraccion, precioSeleccionado: prod.precio_venta_1, descuento: 0,
        });
      } else {
        addItem(prod, n, 1);
      }
      onCerrar();
    } catch (e: any) {
      Alert.alert('No se pudo agregar', e?.message || 'Intenta otra vez.');
    } finally {
      setAgregando(false);
    }
  };

  if (cargando) return null;

  return (
    <Modal animationType="slide" transparent onRequestClose={onCerrar}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl p-5">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-lg font-bold flex-1 pr-2">{producto.descripcion}</Text>
            <TouchableOpacity onPress={onCerrar}><X color="#6b7280" size={24} /></TouchableOpacity>
          </View>
          <Text className="text-blue-700 font-semibold mb-3">{fmt(Number(elegido?.precio) || 0)} / {largo ? `barra de ${largo}'` : 'unidad'}</Text>

          {largo > 0 && (
            <View className="flex-row bg-gray-100 rounded-xl p-1 mb-3">
              {(['unidad', 'pies'] as const).map((k) => (
                <TouchableOpacity key={k} onPress={() => { setModo(k); setCantidad(k === 'pies' ? String(largo) : '1'); }}
                  className={`flex-1 py-2.5 rounded-lg items-center ${modo === k ? 'bg-blue-700' : ''}`}>
                  <Text className={`font-semibold ${modo === k ? 'text-white' : 'text-gray-600'}`}>{k === 'unidad' ? 'Unidad' : 'Pies'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {variantes.length > 0 && (
            <>
              <Text className="text-xs font-bold text-gray-600 mb-1">Color</Text>
              <View className="flex-row flex-wrap mb-1">
                {variantes.map((v) => {
                  const ex = Number(v.existencia) || 0;
                  const sel = elegido?.id === v.id;
                  return (
                    <TouchableOpacity key={v.id} onPress={() => setElegido(v)}
                      className={`flex-row items-center px-3 py-2 rounded-xl border mr-2 mb-2 ${sel ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'}`}>
                      {sel ? <Check color="#1d4ed8" size={14} /> : null}
                      <Text className="font-bold ml-1">{v.color}</Text>
                      <Text className={`text-[11px] ml-1.5 ${ex > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{ex > 0 ? ex : 'Sin stock'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!elegido ? <Text className="text-xs text-amber-700 mb-2">Escoge el color.</Text> : null}
            </>
          )}

          <Text className="text-xs font-bold text-gray-600 mb-1 mt-1">{modo === 'pies' ? 'Cantidad de pies' : 'Cantidad de unidades'}</Text>
          <View className="flex-row items-center mb-3">
            <TouchableOpacity onPress={() => setCantidad(String(Math.max(0, n - 1)))} className="border border-gray-300 rounded-xl p-3"><Minus color="#374151" size={18} /></TouchableOpacity>
            <TextInput className="border border-gray-300 rounded-xl mx-2 px-3 py-2.5 text-lg font-bold text-center w-24" keyboardType="decimal-pad"
              value={cantidad} onChangeText={(t) => setCantidad(t.replace(/[^\d.]/g, ''))} />
            <TouchableOpacity onPress={() => setCantidad(String(n + 1))} className="border border-gray-300 rounded-xl p-3"><Plus color="#374151" size={18} /></TouchableOpacity>
            {modo === 'pies' && largo > 0 ? <Text className="text-xs text-gray-500 ml-2">= {fraccion} de barra</Text> : null}
          </View>

          <View className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex-row items-center justify-between mb-3">
            <Text className="text-gray-600">Total a agregar{'\n'}<Text className="font-bold text-gray-900">{modo === 'pies' ? `${n} pies` : `${n} unidad(es)`}</Text></Text>
            <Text className="text-xl font-black text-blue-800">{fmt(total)}</Text>
          </View>

          <TouchableOpacity onPress={agregar} disabled={!elegido || !(n > 0) || agregando}
            className={`rounded-xl py-4 items-center ${!elegido || !(n > 0) ? 'bg-gray-300' : 'bg-blue-700'}`}>
            {agregando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">{modo === 'pies' ? 'Agregar pies' : 'Agregar al carrito'}</Text>}
          </TouchableOpacity>
          <View className="h-6" />
        </View>
      </View>
    </Modal>
  );
}
