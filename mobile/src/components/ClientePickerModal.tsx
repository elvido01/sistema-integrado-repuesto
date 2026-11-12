// Buscador de clientes ya creados para el POS móvil (30/10/2026).
// Busca por nombre, RNC/cédula, teléfono o código, igual que la web.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { Search, X, User, UserX, Landmark } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { rncValido } from '@/src/services/ecfService';

export type ClientePOS = {
  id: string;
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  direccion: string | null;
  tipo_ncf: string | null;
  codigo: string | null;
};

const CAMPOS = 'id, nombre, rnc, telefono, direccion, tipo_ncf, codigo';

// (11/11/2026) RNC/cédula como lo escribe la DGII (130-55836-1 / 028-0015556-2),
// solo para mostrar; igual que src/lib/docFiscal.js de la web.
const soloDigitos = (v: string | null | undefined) => String(v || '').replace(/\D/g, '');
export function formatoDocDgii(v: string | null | undefined): string {
  const d = soloDigitos(v);
  if (/^0+$/.test(d)) return String(v ?? '').trim();
  if (d.length === 9) return `${d.slice(0, 3)}-${d.slice(3, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
  return String(v ?? '').trim();
}

// Lupa del RNC (como en la web): escoge el cliente que ya tiene ese RNC o lo
// crea con los datos del registro de la DGII. sql/dgii_contribuyentes.sql
export async function clienteDesdeRnc(doc: string): Promise<{ cliente: ClientePOS; nuevo: boolean; estado: string | null }> {
  const { data, error } = await supabase.rpc('cliente_desde_rnc', { p_doc: doc });
  if (error) throw error;
  if (!data?.ok) {
    const titulo: Record<string, string> = { inactivo: 'Cliente desactivado', sin_empresa: 'Sin empresa' };
    const msg: Record<string, string> = {
      formato: 'Un RNC lleva 9 dígitos y una cédula 11.',
      no_inscrito: 'Ese RNC/cédula no está inscrito como contribuyente en la DGII. Revisa el número.',
      inactivo: `Ese RNC es de ${data?.nombre || 'un cliente'}, que está DESACTIVADO. Actívalo en Clientes si quieres facturarle.`,
      sin_empresa: 'No se pudo saber la empresa activa.',
    };
    const err: any = new Error(msg[data?.motivo] || 'No se pudo buscar el RNC.');
    err.titulo = titulo[data?.motivo] || 'RNC no encontrado';
    throw err;
  }
  const c = data.cliente || {};
  return {
    cliente: { id: c.id, nombre: c.nombre, rnc: c.rnc, telefono: c.telefono, direccion: c.direccion, tipo_ncf: c.tipo_ncf, codigo: c.codigo },
    nuevo: !data.existente,
    estado: data.estado_dgii || null,
  };
}

export async function buscarClientes(term: string): Promise<ClientePOS[]> {
  let q = supabase.from('clientes').select(CAMPOS).eq('activo', true).order('nombre').limit(40);
  // Las comas y paréntesis rompen el filtro .or() de PostgREST.
  const t = term.trim().replace(/[,()]/g, ' ');
  // El RNC se escribe con o sin guiones: también por los dígitos.
  const dig = soloDigitos(t);
  // …y al revés: escrito en dígitos, también como lo guarda quien lo puso con guiones.
  const conGuiones = formatoDocDgii(dig);
  const porDigitos = (dig.length >= 5 && dig !== t.trim() ? `,rnc.ilike.%${dig}%,codigo.ilike.%${dig}%` : '')
    + (conGuiones !== dig && conGuiones !== t.trim() ? `,rnc.ilike.%${conGuiones}%` : '');
  if (t) q = q.or(`nombre.ilike.%${t}%,rnc.ilike.%${t}%,telefono.ilike.%${t}%,codigo.ilike.%${t}%${porDigitos}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ClientePOS[];
}

export async function leerCliente(id: string): Promise<ClientePOS | null> {
  const { data, error } = await supabase.from('clientes').select(CAMPOS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ClientePOS) || null;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (c: ClientePOS | null) => void;
};

export default function ClientePickerModal({ visible, onClose, onSelect }: Props) {
  const [term, setTerm] = useState('');
  const [lista, setLista] = useState<ClientePOS[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [buscandoDgii, setBuscandoDgii] = useState(false);
  const enCurso = useRef(false);       // doble toque: el estado llega tarde
  const [termBuscado, setTermBuscado] = useState('');
  // Cerrado o cambiado el buscador mientras la DGII contesta: ese resultado ya no vale.
  const sesion = useRef(0);
  useEffect(() => { sesion.current += 1; }, [visible, term]);

  // RNC/cédula completo que no es de ningún cliente de la lista YA buscada
  // con ese mismo texto: se ofrece buscarlo en la DGII (y crearlo).
  const ofrecerDgii = rncValido(term) && termBuscado === term
    && !lista.some((c) => soloDigitos(c.rnc) === soloDigitos(term));
  const buscarEnDgii = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setBuscandoDgii(true);
    const mia = sesion.current;
    try {
      const r = await clienteDesdeRnc(term);
      if (mia !== sesion.current) return;
      if (r.estado && r.estado.toUpperCase() !== 'ACTIVO') {
        Alert.alert(`En la DGII figura ${r.estado}`, 'Confirma con el cliente antes de facturarle crédito fiscal.');
      }
      onSelect(r.cliente);
    } catch (e: any) {
      if (mia === sesion.current) Alert.alert(e?.titulo || 'No se pudo buscar el RNC', e?.message || 'Intenta de nuevo.');
    } finally {
      enCurso.current = false;
      setBuscandoDgii(false);
    }
  };

  useEffect(() => {
    if (!visible) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      setError('');
      try {
        const r = await buscarClientes(term);
        if (vivo) { setLista(r); setTermBuscado(term); }
      } catch (e: any) {
        if (vivo) setError(e?.message || 'No se pudieron cargar los clientes');
      } finally {
        if (vivo) setCargando(false);
      }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [term, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50">
        <View className="bg-white px-4 pt-12 pb-3 border-b border-gray-200 flex-row items-center">
          <Text className="flex-1 text-lg font-bold text-gray-900">Elegir cliente</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X color="#6b7280" size={24} />
          </TouchableOpacity>
        </View>
        <View className="px-4 py-3 bg-white border-b border-gray-100">
          <View className="flex-row items-center bg-gray-100 rounded-xl px-3">
            <Search color="#9ca3af" size={18} />
            <TextInput
              className="flex-1 ml-2 text-gray-900"
              style={{ paddingVertical: 10 }}
              placeholder="Nombre, RNC/cédula, teléfono o código"
              placeholderTextColor="#9ca3af"
              value={term}
              onChangeText={setTerm}
              autoFocus
              autoCorrect={false}
            />
          </View>
        </View>

        <TouchableOpacity
          className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200"
          onPress={() => { if (!enCurso.current) onSelect(null); }}
        >
          <UserX color="#6b7280" size={20} />
          <Text className="ml-3 text-gray-700 font-medium">Cliente genérico (consumidor final)</Text>
        </TouchableOpacity>

        {ofrecerDgii && !cargando ? (
          <TouchableOpacity
            className="flex-row items-center px-4 py-3 bg-blue-50 border-b border-blue-100"
            onPress={buscarEnDgii}
            disabled={buscandoDgii}
          >
            {buscandoDgii ? <ActivityIndicator /> : <Landmark color="#1d4ed8" size={20} />}
            <View className="ml-3 flex-1">
              <Text className="text-blue-800 font-bold">Buscar {formatoDocDgii(term)} en la DGII</Text>
              <Text className="text-blue-700 text-xs">Si no es cliente todavía, se crea con su nombre de la DGII</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {cargando ? <ActivityIndicator className="mt-6" /> : null}
        {error ? <Text className="text-red-600 text-center mt-4 px-4">{error}</Text> : null}

        <FlatList
          data={lista}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!cargando && !error ? (
            <Text className="text-gray-400 text-center mt-8">Sin clientes con ese dato</Text>
          ) : null}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100 active:bg-gray-100"
              onPress={() => { if (!enCurso.current) onSelect(item); }}
            >
              <View className="bg-gray-100 p-2 rounded-full mr-3">
                <User color="#6b7280" size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-bold" numberOfLines={1}>{item.nombre}</Text>
                <Text className="text-gray-500 text-xs" numberOfLines={1}>
                  {[item.rnc ? `RNC/Céd: ${formatoDocDgii(item.rnc)}` : null, item.telefono, item.codigo ? `Cód. ${item.codigo}` : null]
                    .filter(Boolean).join(' · ') || 'Sin documento'}
                </Text>
              </View>
              {item.tipo_ncf === '01' ? (
                <Text className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">CRÉDITO FISCAL</Text>
              ) : null}
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}
