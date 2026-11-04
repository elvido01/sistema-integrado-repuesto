// =====================================================================
// Línea de servicio para el POS móvil (04/11/2026)
// ---------------------------------------------------------------------
// Las empresas de servicios e inmobiliarias no venden piezas con código y
// existencia: facturan una comisión, un trabajo, un alquiler. Igual que en la
// web (src/components/ventas/LineasServicios.jsx), cada línea cuelga de un
// producto (el SERVICIO GENERAL de la empresa, o un servicio/inmueble del
// catálogo) pero lleva su propia descripción y su propio monto. Así los
// totales, el NCF/e-CF, la impresión y las retenciones funcionan como en
// cualquier venta.
//
// La referencia viaja dentro de la descripción ("… — PAGO DE 5%"), igual que
// en la web, para que salga en todos los formatos de impresión.
// =====================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ScrollView, ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { nuevaLineaId, type CartItem } from '@/src/store/useCartStore';
import { useAuthStore } from '@/src/store/useAuthStore';

type ProductoServicio = {
  id: string;
  codigo: string;
  descripcion: string;
  precio?: number | null;
  costo?: number | null;
  itbis_pct?: number | null;
  naturaleza?: 'servicio' | 'inmueble' | null;
  servicio_tipo?: string | null;
};

const SEP = ' — ';
const n = (v: unknown) => Number(v || 0) || 0;
const pct = (v: unknown) => { const x = n(v); return x > 1 ? x / 100 : x; };
const round2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ServicioLineaModal({
  visible, onClose, onAgregar,
}: {
  visible: boolean;
  onClose: () => void;
  onAgregar: (linea: CartItem) => void;
}) {
  const tenantId = useAuthStore((s) => s.tenantId);
  const [cargando, setCargando] = useState(false);
  const [general, setGeneral] = useState<ProductoServicio | null>(null);
  const [catalogo, setCatalogo] = useState<ProductoServicio[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [ref, setRef] = useState('');
  const [monto, setMonto] = useState('');
  const [conItbis, setConItbis] = useState(true);

  // Se carga cada vez que se abre (la empresa pudo cambiar, o crearse un
  // servicio nuevo en la web): el SERVICIO GENERAL (se crea si la empresa no
  // lo tiene) y los servicios e inmuebles del catálogo.
  useEffect(() => {
    if (!visible) return undefined;
    let vivo = true;
    setDesc(''); setRef(''); setMonto(''); setConItbis(true);
    setGeneral(null); setCatalogo([]); setElegido(null);
    setCargando(true);
    (async () => {
      const [{ data: gen, error: eGen }, { data: prods, error: eProds }] = await Promise.all([
        supabase.rpc('asegurar_servicio_general'),
        supabase.from('productos')
          .select('id, codigo, descripcion, precio, costo, itbis_pct, naturaleza, servicio_tipo')
          .eq('tenant_id', tenantId as string)
          .eq('activo', true).in('naturaleza', ['servicio', 'inmueble'])
          .order('descripcion').limit(300),
      ]);
      if (!vivo) return;
      setCargando(false);
      if (eGen || !gen) {
        Alert.alert('Falta el servicio general', eGen?.message || 'No se pudo preparar el SERVICIO GENERAL de la empresa.');
        onClose();
        return;
      }
      if (eProds) {
        Alert.alert('Catálogo sin cargar', `No se pudieron leer los servicios e inmuebles (${eProds.message}). Solo queda el servicio general; cierra y vuelve a abrir para reintentar.`);
      }
      setGeneral(gen as ProductoServicio);
      setElegido((gen as ProductoServicio).id);
      setCatalogo(((prods || []) as ProductoServicio[]).filter((p) => p.codigo !== 'SERV-GENERAL'));
    })();
    return () => { vivo = false; };
  }, [visible, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = useMemo(() => [...(general ? [general] : []), ...catalogo], [general, catalogo]);
  const prod = opciones.find((p) => p.id === elegido) || general;
  const esInmueble = prod?.naturaleza === 'inmueble';
  const itbisPct = esInmueble ? 0 : pct(prod?.itbis_pct ?? 0.18);
  const montoNum = n(monto.replace(/,/g, ''));
  // El sistema guarda el precio CON ITBIS.
  const precio = round2(conItbis ? montoNum : montoNum * (1 + itbisPct));
  const itbis = round2(precio - precio / (1 + itbisPct));

  // Al cambiar de servicio, la descripción y el monto que puso el anterior se
  // reemplazan por los del nuevo; lo que el usuario escribió a mano se respeta.
  const elegir = (p: ProductoServicio) => {
    const ant = prod && prod.codigo !== 'SERV-GENERAL' ? prod : null;
    const descDelAnterior = !desc.trim() || (ant && desc.trim().toUpperCase() === String(ant.descripcion || '').trim().toUpperCase());
    const montoDelAnterior = !montoNum || (ant && montoNum === n(ant.precio));
    setElegido(p.id);
    const esGeneral = p.codigo === 'SERV-GENERAL';
    if (descDelAnterior) setDesc(esGeneral ? '' : p.descripcion);
    if (montoDelAnterior) {
      setMonto(!esGeneral && n(p.precio) > 0 ? String(n(p.precio)) : '');
      setConItbis(true);
    }
  };

  const agregar = () => {
    if (!prod) return;
    const d = desc.trim().toUpperCase();
    const r = ref.trim().toUpperCase();
    if (!d) { Alert.alert('Falta la descripción', 'Escribe qué servicio se está facturando.'); return; }
    if (!(precio > 0)) { Alert.alert('Falta el monto', 'Escribe el monto del servicio.'); return; }
    onAgregar({
      id: prod.id,
      producto_id: prod.id,
      lineaId: nuevaLineaId(),
      naturaleza: prod.naturaleza || 'servicio',
      codigo: prod.codigo,
      descripcion: d + (r ? SEP + r : ''),
      referencia: null,
      existencia: 0,
      precio_venta_1: precio,
      precio_venta_2: precio,
      costo: n(prod.costo),
      itbis_pct: itbisPct,
      cantidad: 1,
      precioSeleccionado: precio,
      descuento: 0,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-2xl" style={{ maxHeight: '92%' }}>
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center">
              <Text className="text-base font-bold text-gray-900">Agregar servicio</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            {cargando ? (
              <View className="p-10 items-center"><ActivityIndicator /></View>
            ) : (
              <ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
                <Text className="text-gray-600 text-xs font-bold uppercase mt-3 mb-1">Servicio</Text>
                <View className="flex-row flex-wrap">
                  {opciones.map((p) => {
                    const activo = p.id === elegido;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => elegir(p)}
                        className={`px-3 py-2 rounded-full mr-2 mb-2 border ${activo ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                      >
                        <Text className={activo ? 'text-white text-xs font-bold' : 'text-gray-700 text-xs'} numberOfLines={1}>
                          {p.codigo === 'SERV-GENERAL' ? 'Servicio general' : p.descripcion}
                          {p.naturaleza === 'inmueble' ? ' (inmueble)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text className="text-gray-600 text-xs font-bold uppercase mt-3 mb-1">Descripción</Text>
                <TextInput
                  className="bg-gray-100 rounded-lg px-3 py-2 text-gray-900"
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                  multiline
                  autoCapitalize="characters"
                  placeholder="Ej. MANO DE OBRA REPARACIÓN DE MOTOR"
                  placeholderTextColor="#9ca3af"
                  value={desc}
                  onChangeText={setDesc}
                />

                <Text className="text-gray-600 text-xs font-bold uppercase mt-3 mb-1">Referencia (opcional)</Text>
                <TextInput
                  className="bg-gray-100 rounded-lg px-3 py-2 text-gray-900"
                  autoCapitalize="characters"
                  placeholder="Ej. PAGO DE 5%"
                  placeholderTextColor="#9ca3af"
                  value={ref}
                  onChangeText={setRef}
                />

                <Text className="text-gray-600 text-xs font-bold uppercase mt-3 mb-1">Monto RD$</Text>
                <TextInput
                  className="bg-gray-100 rounded-lg px-3 py-2 text-gray-900 text-right text-lg font-bold"
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                  value={monto}
                  onChangeText={(t) => setMonto(t.replace(/[^0-9.]/g, ''))}
                  selectTextOnFocus
                />

                {esInmueble ? (
                  <Text className="text-gray-500 text-xs mt-2">El inmueble no lleva ITBIS.</Text>
                ) : (
                  <View className="flex-row items-center justify-between mt-2">
                    <Text className="text-gray-700 text-sm flex-1">El monto que escribo ya incluye el ITBIS</Text>
                    <Switch value={conItbis} onValueChange={setConItbis} />
                  </View>
                )}

                <View className="bg-gray-50 rounded-lg p-3 mt-3">
                  <View className="flex-row justify-between"><Text className="text-gray-500">Subtotal</Text><Text className="text-gray-900">{money(precio - itbis)}</Text></View>
                  <View className="flex-row justify-between"><Text className="text-gray-500">ITBIS</Text><Text className="text-gray-900">{money(itbis)}</Text></View>
                  <View className="flex-row justify-between mt-1"><Text className="text-gray-900 font-bold">Total línea</Text><Text className="text-brand font-bold">RD${money(precio)}</Text></View>
                </View>

                <TouchableOpacity className="bg-brand rounded-xl py-4 mt-4 items-center" onPress={agregar}>
                  <Text className="text-white font-bold text-base">Agregar a la factura</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
