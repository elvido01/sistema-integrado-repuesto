// Detalle y ficha del producto (26/11/2026).
// Antes leía precio_venta_1 / precio_venta_2 / existencia, que NO existen en
// productos: al abrir un artículo desde el catálogo el render reventaba y
// quedaba la pantalla en blanco. Ahora: precio de la tabla, existencia por
// get_stock_actual y, con permiso (admin o Mercancías → editar), se edita la
// ficha. Guardar va por app_producto_guardar (producto + presentación
// principal en una transacción, mismas fórmulas que la web). La existencia
// se cambia en "Actualizar Existencia"; el código, en la web.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, TextInput,
  Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/supabase/client';
import { useCartStore } from '@/src/store/useCartStore';
import { ArrowLeft, ShoppingCart, Share2, Package, Pencil, X, Save } from 'lucide-react-native';
import { shareToWhatsApp } from '@/src/utils/whatsapp';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/store/useAuthStore';
import VarianteVenta from '@/src/components/ventanas/VarianteVenta';
import { fetchProductoPorId } from '@/src/services/productService';

const n2 = (x: any) => Number(x || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// '1,950.50', '1950,50' (teclado en español) y '1950' → número; '' → NaN.
function leerNumero(txt: string): number {
  let t = String(txt ?? '').trim().replace(/\s/g, '');
  if (!t) return NaN;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(/,(\d{1,2})$/, '.$1');
  t = t.replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

type Form = {
  descripcion: string; referencia: string; ubicacion: string;
  precio: string; costo: string; itbis: number; min_stock: string; max_stock: string; activo: boolean;
};

export default function ProductoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [producto, setProducto] = useState<any>(null);
  const [existencia, setExistencia] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { addItem } = useCartStore();
  const empresa = useAuthStore((s) => s.empresa);
  // (09/11/2026) Ventanas y aluminio: antes de agregar se escoge color y Unidad/Pies.
  const esAluminio = empresa?.tipo_negocio === 'aluminio';
  const [variante, setVariante] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setError(null);
    const [{ data, error: e }, stock, permiso] = await Promise.all([
      supabase.from('productos').select('*, marca:marcas(nombre)').eq('id', id).maybeSingle(),
      supabase.rpc('get_stock_actual', { producto_uuid: id }),
      supabase.rpc('app_producto_puede_editar'),
    ]);
    if (e) setError(e.message);
    setProducto(data || null);
    setExistencia(stock.error ? null : Number(stock.data || 0));
    setPuedeEditar(!permiso.error && !!permiso.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirEdicion = () => {
    if (!producto) return;
    setForm({
      descripcion: producto.descripcion || '',
      referencia: producto.referencia || '',
      ubicacion: producto.ubicacion || '',
      precio: String(producto.precio ?? ''),
      costo: String(producto.costo ?? ''),
      // Se respeta el que tiene (16% reducido incluido); antes era un sí/no y el 16 pasaba a 18.
      itbis: [0, 0.16, 0.18].includes(Number(producto.itbis_pct)) ? Number(producto.itbis_pct) : 0.18,
      min_stock: String(producto.min_stock ?? 0),
      max_stock: String(producto.max_stock ?? 0),
      activo: producto.activo !== false,
    });
    setEditando(true);
  };

  const guardar = async (confirmadoBajoCosto = false) => {
    if (!form || !producto) return;
    const precio = leerNumero(form.precio);
    const costo = leerNumero(form.costo || '0');
    const min = leerNumero(form.min_stock || '0');
    const max = leerNumero(form.max_stock || '0');
    if (!form.descripcion.trim()) return Alert.alert('Falta la descripción');
    if (!(precio >= 0)) return Alert.alert('Precio', 'Escribe un precio válido.');
    if (!(costo >= 0)) return Alert.alert('Costo', 'Escribe un costo válido.');
    if (!(min >= 0) || !(max >= 0)) return Alert.alert('Mínimo y máximo', 'Escribe números válidos.');
    // Regla del negocio: no se vende bajo costo. Se avisa antes de guardar.
    if (!confirmadoBajoCosto && costo > 0 && precio < costo) {
      return Alert.alert('Precio por debajo del costo',
        `El precio (${n2(precio)}) es menor que el costo (${n2(costo)}). Así no se va a poder facturar. ¿Guardar igual?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Guardar igual', style: 'destructive', onPress: () => guardar(true) }]);
    }
    setGuardando(true);
    const { data, error: e } = await supabase.rpc('app_producto_guardar', {
      p_id: producto.id,
      p_descripcion: form.descripcion,
      p_referencia: form.referencia,
      p_ubicacion: form.ubicacion,
      p_precio: precio,
      p_costo: costo,
      p_itbis_pct: form.itbis,
      p_min_stock: min,
      p_max_stock: max,
      p_activo: form.activo,
    });
    setGuardando(false);
    if (e) return Alert.alert('No se guardó', e.message);
    setProducto((p: any) => ({ ...p, ...(data as any) }));
    if ((data as any)?.existencia != null) setExistencia(Number((data as any).existencia));
    setEditando(false);
    // El catálogo vuelve a pedir la lista al volver a él (precio nuevo incluido).
    Alert.alert('Guardado', 'La ficha del producto quedó actualizada.');
  };

  const handleAddToCart = () => {
    if (esAluminio && !variante) { setVariante(true); return; }
    agregarNormal();
  };
  // El carrito trabaja con el producto "normalizado" (precio_venta_1/2 de la
  // presentación principal); el de esta pantalla viene crudo de la tabla.
  const agregarNormal = async () => {
    if (agregando) return;
    setAgregando(true);
    let listo: any = null;
    try {
      listo = await fetchProductoPorId(producto.id);
    } catch (e: any) {
      setAgregando(false);
      return Alert.alert('No se pudo agregar', e?.message || 'Revisa la conexión y vuelve a intentarlo.');
    }
    setAgregando(false);
    if (!listo) return Alert.alert('No se pudo agregar', 'Vuelve a intentarlo.');
    addItem(listo as any, 1);
    Alert.alert('Éxito', 'Producto agregado al carrito', [
      { text: 'Seguir comprando', style: 'cancel' },
      { text: 'Ir al carrito', onPress: () => router.push('/(tabs)/pos') },
    ]);
  };

  const handleShare = () => {
    const nombre = empresa?.nombre || 'nuestra tienda';
    const msg = `Hola, este producto está disponible en ${nombre}:\n\n${producto.descripcion}\nCódigo: ${producto.codigo}\nPrecio: RD$${n2(producto.precio)}\nDisponibilidad: ${(existencia ?? 0) > 0 ? 'Disponible' : 'Agotado'}\n\nPara más información puede escribirnos por WhatsApp.`;
    shareToWhatsApp({ message: msg });
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  if (!producto) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6" style={{ paddingTop: insets.top }}>
        <Package color="#9ca3af" size={48} />
        <Text className="text-gray-700 font-bold mt-3">Producto no encontrado</Text>
        {error && <Text className="text-gray-500 text-xs mt-1 text-center">{error}</Text>}
        <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-brand px-5 py-2 rounded-lg">
          <Text className="text-white font-bold">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const campo = 'border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-900 bg-white';
  const etiqueta = 'text-[11px] font-bold text-gray-600 mb-1 mt-3';
  const set = (k: keyof Form) => (v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const precioNum = leerNumero(form?.precio ?? '');
  const costoNum = leerNumero(form?.costo || '0');
  const margen = costoNum > 0 && precioNum >= 0 ? ((precioNum / costoNum) - 1) * 100 : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-gray-50">
      <View className="bg-brand pb-4 px-4 flex-row items-center justify-between shadow-sm" style={{ paddingTop: Math.max(insets.top + 10, 20) }}>
        <TouchableOpacity onPress={() => (editando ? setEditando(false) : router.back())} className="p-2 -ml-2">
          {editando ? <X color="white" size={24} /> : <ArrowLeft color="white" size={24} />}
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">{editando ? 'Editar producto' : 'Detalle de Producto'}</Text>
        {editando ? <View style={{ width: 40 }} /> : (
          <View className="flex-row">
            {puedeEditar && (
              <TouchableOpacity onPress={abrirEdicion} className="p-2">
                <Pencil color="white" size={22} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
              <Share2 color="white" size={22} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {editando && form ? (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View className="bg-white rounded-2xl p-4 mt-4 border border-gray-100">
            <Text className="text-brand font-bold">{producto.codigo}</Text>
            <Text className={etiqueta}>DESCRIPCIÓN</Text>
            <TextInput value={form.descripcion} onChangeText={set('descripcion')} className={campo} multiline />
            <Text className={etiqueta}>REFERENCIA</Text>
            <TextInput value={form.referencia} onChangeText={set('referencia')} className={campo} autoCapitalize="characters" />
            <Text className={etiqueta}>UBICACIÓN</Text>
            <TextInput value={form.ubicacion} onChangeText={set('ubicacion')} className={campo} autoCapitalize="characters" />
          </View>

          <View className="bg-white rounded-2xl p-4 mt-3 border border-gray-100">
            <View className="flex-row" style={{ gap: 10 }}>
              <View className="flex-1">
                <Text className={etiqueta}>PRECIO (RD$)</Text>
                <TextInput value={form.precio} onChangeText={set('precio')} keyboardType="decimal-pad" className={`${campo} font-bold`} />
              </View>
              <View className="flex-1">
                <Text className={etiqueta}>COSTO (RD$)</Text>
                <TextInput value={form.costo} onChangeText={set('costo')} keyboardType="decimal-pad" className={campo} />
              </View>
            </View>
            {margen != null && (
              <Text className={`text-xs mt-2 ${margen < 0 ? 'text-red-600 font-bold' : margen < 15 ? 'text-amber-700' : 'text-emerald-700'}`}>
                Margen sobre costo: {margen.toFixed(1)}%{margen < 0 ? ' · por debajo del costo' : ''}
              </Text>
            )}
            <Text className={etiqueta}>ITBIS</Text>
            <View className="flex-row" style={{ gap: 8 }}>
              {[[0, 'Exento'], [0.16, '16% reducido'], [0.18, '18%']].map(([v, t]) => (
                <TouchableOpacity key={String(v)} onPress={() => set('itbis')(v)}
                  className={`px-3 py-2 rounded-lg border ${form.itbis === v ? 'bg-brand border-brand' : 'border-gray-300 bg-white'}`}>
                  <Text className={form.itbis === v ? 'text-white font-bold' : 'text-gray-700'}>{t as string}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-[11px] text-gray-400 mt-1">El precio 2 y 3 automáticos se recalculan solos, como en la web.</Text>
          </View>

          <View className="bg-white rounded-2xl p-4 mt-3 border border-gray-100">
            <View className="flex-row" style={{ gap: 10 }}>
              <View className="flex-1">
                <Text className={etiqueta}>MÍNIMO</Text>
                <TextInput value={form.min_stock} onChangeText={set('min_stock')} keyboardType="decimal-pad" className={campo} />
              </View>
              <View className="flex-1">
                <Text className={etiqueta}>MÁXIMO</Text>
                <TextInput value={form.max_stock} onChangeText={set('max_stock')} keyboardType="decimal-pad" className={campo} />
              </View>
            </View>
            <View className="flex-row items-center justify-between mt-3">
              <Text className="text-gray-800">Activo (sale en catálogo y ventas)</Text>
              <Switch value={form.activo} onValueChange={set('activo')} />
            </View>
            <Text className="text-[11px] text-gray-400 mt-2">La existencia se cambia en «Actualizar Existencia» (deja su ajuste). El código se cambia en la web.</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 16 }}>
          <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
            <View className="bg-gray-100 w-full h-48 rounded-xl items-center justify-center mb-4 overflow-hidden">
              {producto.imagen_url
                ? <Image source={{ uri: producto.imagen_url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                : <Package color="#9ca3af" size={64} />}
            </View>
            <Text className="text-brand font-bold text-xl">{producto.codigo}</Text>
            <Text className="text-gray-900 font-bold text-2xl mt-1 leading-tight">{producto.descripcion}</Text>
            <Text className="text-gray-500 text-base mt-2">{producto.referencia || 'Sin referencia'}</Text>
            {(producto.marca?.nombre || producto.ubicacion) && (
              <Text className="text-gray-500 text-sm mt-1">
                {[producto.marca?.nombre, producto.ubicacion && `Ubicación: ${producto.ubicacion}`].filter(Boolean).join(' · ')}
              </Text>
            )}
            {producto.activo === false && <Text className="text-red-600 font-bold text-xs mt-2">INACTIVO</Text>}
          </View>

          <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
            <Text className="text-gray-900 font-bold text-lg mb-3">Precio</Text>
            <View className="flex-row justify-between py-2 border-b border-gray-50">
              <Text className="text-gray-500">Precio{Number(producto.itbis_pct) > 0 ? ` (con ITBIS ${Math.round(Number(producto.itbis_pct) * 100)}%)` : ' (exento)'}</Text>
              <Text className="text-gray-900 font-bold">RD${n2(producto.precio)}</Text>
            </View>
            {puedeEditar && (
              <View className="flex-row justify-between py-2">
                <Text className="text-gray-500">Costo</Text>
                <Text className="text-gray-900">RD${n2(producto.costo)}</Text>
              </View>
            )}
          </View>

          <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4 flex-row justify-between items-center">
            <Text className="text-gray-900 font-bold text-lg">Existencia</Text>
            <View className={`px-4 py-2 rounded-full ${(existencia ?? 0) > 0 ? 'bg-accent-green/20' : 'bg-accent-red/20'}`}>
              <Text className={`font-bold text-lg ${(existencia ?? 0) > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {existencia == null ? '—' : existencia}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      <View className="bg-white px-4 pt-4 border-t border-gray-200" style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}>
        {editando ? (
          <TouchableOpacity className="bg-emerald-600 py-4 rounded-xl flex-row justify-center items-center" onPress={() => guardar()} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : (<><Save color="white" size={20} /><Text className="text-white font-bold text-lg ml-2">Guardar cambios</Text></>)}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity className="bg-brand py-4 rounded-xl flex-row justify-center items-center shadow-sm" onPress={handleAddToCart} disabled={agregando}>
            {agregando ? <ActivityIndicator color="#fff" /> : (<><ShoppingCart color="white" size={20} />
            <Text className="text-white font-bold text-lg ml-2">Agregar al Carrito</Text></>)}
          </TouchableOpacity>
        )}
      </View>
      {variante && (
        <VarianteVenta producto={producto} onCerrar={() => setVariante(false)}
          onNormal={() => { setVariante(false); agregarNormal(); }} />
      )}
    </KeyboardAvoidingView>
  );
}
