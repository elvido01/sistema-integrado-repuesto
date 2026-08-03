import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bike, ClipboardList, Edit, FileDown, Plus, RefreshCw, Search, Send, Trash2, X } from 'lucide-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { fetchProductos, Producto } from '@/src/services/productService';

const CAMINERO_MOTORS_TENANT = 'b39506c3-27dc-467d-830b-096731b83113';

type SolicitudCompra = {
  id?: string;
  numero?: number | string | null;
  fecha?: string | null;
  estado?: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  cliente_rnc?: string | null;
  vendedor_id?: string | null;
  producto_id?: string | null;
  chasis?: string | null;
  motor?: string | null;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  anio?: number | string | null;
  condicion?: string | null;
  valor_contado?: number | string | null;
  inicial?: number | string | null;
  financiamiento?: number | string | null;
  adicional?: number | string | null;
  tiempo_meses?: number | string | null;
  tasa_interes?: number | string | null;
  total_pagares?: number | string | null;
  cuota_mensual?: number | string | null;
  cuota_ajustada?: number | string | null;
  fecha_vencimiento?: string | null;
  incluye_placa?: boolean | null;
  incluye_gps?: boolean | null;
  incluye_casco?: boolean | null;
  incluye_seguro?: boolean | null;
  monto_placa?: number | string | null;
  monto_gps?: number | string | null;
  monto_casco?: number | string | null;
  monto_seguro?: number | string | null;
  tipo_financiamiento?: string | null;
  frecuencia?: 'diario' | 'semanal' | 'quincenal' | 'mensual' | string | null;
  notas?: string | null;
};

type Cliente = { id: string; nombre: string; rnc?: string | null; telefono?: string | null; codigo?: string | null };
type Vendedor = { id: string; nombre: string };

const emptyForm: SolicitudCompra = {
  fecha: '',
  estado: 'Pendiente',
  cliente_id: null,
  cliente_nombre: '',
  cliente_rnc: '',
  vendedor_id: null,
  producto_id: null,
  chasis: '',
  motor: '',
  marca: '',
  modelo: '',
  color: '',
  anio: '',
  condicion: 'NUEVA',
  valor_contado: 0,
  inicial: 0,
  financiamiento: 0,
  adicional: 0,
  tiempo_meses: 12,
  tasa_interes: 3,
  total_pagares: 0,
  cuota_mensual: 0,
  cuota_ajustada: '',
  fecha_vencimiento: '',
  incluye_placa: false,
  incluye_gps: false,
  incluye_casco: false,
  incluye_seguro: false,
  monto_placa: 0,
  monto_gps: 0,
  monto_casco: 0,
  monto_seguro: 0,
  tipo_financiamiento: 'simple',
  frecuencia: 'mensual',
  notas: '',
};

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const n = (value: unknown) => Number(String(value || 0).replace(/,/g, '')) || 0;
const money = (value: unknown) =>
  `RD$ ${n(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cleanMoneyInput = (value: string) => {
  let raw = String(value).replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  const [integer, decimals] = raw.split('.');
  return decimals !== undefined ? `${integer}.${decimals.slice(0, 2)}` : integer;
};

const formatMoneyInput = (value: unknown) => {
  const raw = cleanMoneyInput(String(value ?? ''));
  if (!raw) return '';
  const [integer, decimals] = raw.split('.');
  const formattedInteger = integer ? Number(integer).toLocaleString('en-US') : '0';
  return decimals !== undefined ? `${formattedInteger}.${decimals}` : formattedInteger;
};

const formatDate = (value?: string | null) => {
  if (!value) return '--/--/----';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};

// Días que dura cada cuota según la frecuencia. Es lo que convierte "número
// de cuotas" en "meses de plazo": 365 cuotas diarias son 12 meses, no 365.
// Igual que en la web (src/pages/SolicitudesComprasPage.jsx): las dos
// pantallas crean el mismo préstamo, así que tienen que dar el mismo número.
const DIAS_POR_PERIODO: Record<string, number> = { diario: 1, semanal: 7, quincenal: 15, mensual: 30 };

const addPeriod = (dateValue?: string | null, frecuencia?: string | null) => {
  const [y, m, d] = String(dateValue || todayISO()).slice(0, 10).split('-').map(Number);
  const base = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
    ? new Date(y, m - 1, d)
    : new Date();

  switch (frecuencia) {
    case 'diario':
      base.setDate(base.getDate() + 1);
      break;
    case 'semanal':
      base.setDate(base.getDate() + 7);
      break;
    case 'quincenal':
      base.setDate(base.getDate() + 15);
      break;
    default:
      base.setMonth(base.getMonth() + 1);
      break;
  }

  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const frecuenciaLabel = (value?: string | null) => {
  if (value === 'diario') return 'Diaria';
  if (value === 'semanal') return 'Semanal';
  if (value === 'quincenal') return 'Quincenal';
  return 'Mensual';
};

const getTotals = (form: SolicitudCompra) => {
  const addons =
    (form.incluye_placa ? n(form.monto_placa) : 0) +
    (form.incluye_gps ? n(form.monto_gps) : 0) +
    (form.incluye_casco ? n(form.monto_casco) : 0) +
    (form.incluye_seguro ? n(form.monto_seguro) : 0);
  // El ADICIONAL es un completivo del inicial: el cliente lo paga aparte, así
  // que NO se financia. Aquí se estaba SUMANDO al capital, lo contrario de lo
  // que hace la web: con un adicional de 10,000 la app financiaba 20,000 de más.
  const capital = n(form.valor_contado) + addons - n(form.inicial) - n(form.adicional);
  // tiempo_meses guarda el NÚMERO DE CUOTAS, no meses.
  const nCuotas = Math.max(0, Math.trunc(n(form.tiempo_meses)));
  const tasa = n(form.tasa_interes);
  const diasPorPeriodo = DIAS_POR_PERIODO[String(form.frecuencia || 'mensual')] || 30;
  const plazoMeses = nCuotas * diasPorPeriodo / 30;
  // La tasa que se teclea es MENSUAL: para otra frecuencia se lleva a la tasa
  // del período. Aplicarla tal cual cobraba 3% DIARIO en un préstamo diario.
  const tasaPeriodo = (tasa / 100) * diasPorPeriodo / 30;
  let totalPagares = 0;
  let cuotaBase = 0;

  if (capital > 0 && nCuotas > 0) {
    if (tasa > 0 && form.tipo_financiamiento === 'frances') {
      cuotaBase = capital * tasaPeriodo / (1 - Math.pow(1 + tasaPeriodo, -nCuotas));
    } else if (tasa > 0) {
      const interesTotal = capital * (tasa / 100) * plazoMeses;
      cuotaBase = (capital + interesTotal) / nCuotas;
    } else {
      cuotaBase = capital / nCuotas;
    }
  }

  const cuotaAjustada = n(form.cuota_ajustada);
  const cuotaFinal = cuotaAjustada > 0 ? cuotaAjustada : cuotaBase;
  totalPagares = nCuotas > 0 ? cuotaFinal * nCuotas : 0;
  const cuotaBaseRounded = Math.round(cuotaBase * 100) / 100;
  const cuotaFinalRounded = Math.round(cuotaFinal * 100) / 100;

  return {
    financiamiento: Math.round(capital * 100) / 100,
    cuota_base: cuotaBaseRounded,
    mas_ajustes: cuotaAjustada > 0 ? Math.round((cuotaAjustada - cuotaBaseRounded) * 100) / 100 : 0,
    total_pagares: Math.round(totalPagares * 100) / 100,
    cuota_mensual: cuotaFinalRounded,
  };
};

const Field = ({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  placeholder?: string;
}) => (
  <View className="mb-3">
    <Text className="text-[11px] font-bold text-slate-500 uppercase mb-1">{label}</Text>
    <TextInput
      className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
    />
  </View>
);

export default function SolicitudesCompraMobileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tenantId, empresa } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientsLoading, setClientsLoading] = useState(false);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selected, setSelected] = useState<SolicitudCompra | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSolicitud, setShareSolicitud] = useState<SolicitudCompra | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<Producto[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [form, setForm] = useState<SolicitudCompra>({ ...emptyForm, fecha: todayISO() });
  const [addonPrices, setAddonPrices] = useState({ placa: 0, gps: 0, casco: 0, seguro: 0 });
  const shareRef = useRef<ViewShot>(null);
  const productSearchRequestRef = useRef(0);
  const clientSearchRequestRef = useRef(0);

  const isCaminero = tenantId === CAMINERO_MOTORS_TENANT;
  const visibleSolicitudes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return solicitudes;
    return solicitudes.filter((s) =>
      String(s.numero || '').includes(term) ||
      String(s.cliente_nombre || '').toLowerCase().includes(term) ||
      String(s.marca || '').toLowerCase().includes(term) ||
      String(s.modelo || '').toLowerCase().includes(term) ||
      String(s.chasis || '').toLowerCase().includes(term)
    );
  }, [search, solicitudes]);

  const formTotals = useMemo(() => getTotals(form), [form]);
  const previewSolicitud = shareSolicitud || selected;

  useEffect(() => {
    if (!formOpen) return;
    const nextVencimiento = addPeriod(form.fecha, form.frecuencia);
    setForm((prev) => (
      prev.fecha_vencimiento === nextVencimiento
        ? prev
        : { ...prev, fecha_vencimiento: nextVencimiento }
    ));
  }, [formOpen, form.fecha, form.frecuencia]);

  const loadData = useCallback(async () => {
    if (!tenantId || tenantId !== CAMINERO_MOTORS_TENANT) return;
    setLoading(true);
    try {
      const [solRes, cliRes, venRes, cfgRes] = await Promise.all([
        supabase
          .from('solicitudes_compras')
          .select('*')
          .in('estado', ['Pendiente', 'C/RUTA'])
          .order('fecha', { ascending: false }),
        supabase.from('clientes').select('id, nombre, rnc, telefono, codigo').eq('activo', true).order('nombre').limit(30),
        supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'),
        supabase
          .from('config_empresa')
          .select('precio_placa, precio_gps, precio_casco, precio_seguro')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      ]);
      if (solRes.error) throw solRes.error;
      if (cliRes.error) throw cliRes.error;
      if (venRes.error) throw venRes.error;

      setSolicitudes((solRes.data || []) as SolicitudCompra[]);
      setClientes((cliRes.data || []) as Cliente[]);
      setVendedores((venRes.data || []) as Vendedor[]);
      setAddonPrices({
        placa: n(cfgRes.data?.precio_placa),
        gps: n(cfgRes.data?.precio_gps),
        casco: n(cfgRes.data?.precio_casco),
        seguro: n(cfgRes.data?.precio_seguro),
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setField = (key: keyof SolicitudCompra, value: any) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'incluye_placa') next.monto_placa = value ? n(prev.monto_placa) || addonPrices.placa : 0;
      if (key === 'incluye_gps') next.monto_gps = value ? n(prev.monto_gps) || addonPrices.gps : 0;
      if (key === 'incluye_casco') next.monto_casco = value ? n(prev.monto_casco) || addonPrices.casco : 0;
      if (key === 'incluye_seguro') next.monto_seguro = value ? n(prev.monto_seguro) || addonPrices.seguro : 0;
      return next;
    });
  };

  const redondearCuota = (multiplo: number) => {
    const cuotaBase = formTotals.cuota_base;
    if (!(cuotaBase > 0)) return;
    setField('cuota_ajustada', String(Math.ceil(cuotaBase / multiplo) * multiplo));
  };

  const setManualClienteNombre = (value: string) => {
    setForm((prev) => ({
      ...prev,
      cliente_id: null,
      cliente_nombre: value,
    }));
  };

  const setManualClienteRnc = (value: string) => {
    setForm((prev) => ({
      ...prev,
      cliente_id: null,
      cliente_rnc: value,
    }));
  };

  const loadClientes = useCallback(async (searchText = clientSearch) => {
    const requestId = clientSearchRequestRef.current + 1;
    clientSearchRequestRef.current = requestId;
    setClientsLoading(true);
    try {
      let query = supabase
        .from('clientes')
        .select('id, nombre, rnc, telefono, codigo')
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .limit(40);

      const term = searchText.trim().replace(/,/g, ' ');
      if (term) {
        query = query.or(`nombre.ilike.%${term}%,rnc.ilike.%${term}%,telefono.ilike.%${term}%,codigo.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (requestId === clientSearchRequestRef.current) {
        setClientes((data || []) as Cliente[]);
      }
    } catch (error: any) {
      if (requestId === clientSearchRequestRef.current) {
        Alert.alert('Error', error.message || 'No se pudieron buscar clientes.');
      }
    } finally {
      if (requestId === clientSearchRequestRef.current) {
        setClientsLoading(false);
      }
    }
  }, [clientSearch]);

  useEffect(() => {
    if (!clientOpen) return;
    const timer = setTimeout(() => {
      loadClientes(clientSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [clientOpen, clientSearch, loadClientes]);

  const selectCliente = (cliente: Cliente) => {
    setForm((prev) => ({
      ...prev,
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre || '',
      cliente_rnc: cliente.rnc || '',
    }));
    setClientOpen(false);
  };

  const openNew = () => {
    setSelected(null);
    setForm({
      ...emptyForm,
      fecha: todayISO(),
      vendedor_id: vendedores[0]?.id || null,
      frecuencia: 'mensual',
      monto_placa: 0,
      monto_gps: 0,
      monto_casco: 0,
      monto_seguro: 0,
    });
    setFormOpen(true);
  };

  const openEdit = (row: SolicitudCompra) => {
    setShareOpen(false);
    setSelected(row);
    setForm({ ...emptyForm, ...row, fecha: row.fecha || todayISO(), fecha_vencimiento: row.fecha_vencimiento || '' });
    setFormOpen(true);
  };

  const openSharePreview = (row: SolicitudCompra) => {
    setShareSolicitud(row);
    setSelected(row);
    setShareOpen(true);
  };

  const loadProducts = useCallback(async (searchText = productSearch) => {
    const requestId = productSearchRequestRef.current + 1;
    productSearchRequestRef.current = requestId;
    setProductsLoading(true);
    try {
      const result = await fetchProductos(1, 50, searchText.trim(), '', '');
      if (requestId === productSearchRequestRef.current) {
        setProducts(result.productos);
      }
    } catch (error: any) {
      if (requestId === productSearchRequestRef.current) {
        Alert.alert('Error', error.message || 'No se pudo cargar el inventario.');
      }
    } finally {
      if (requestId === productSearchRequestRef.current) {
        setProductsLoading(false);
      }
    }
  }, [productSearch]);

  useEffect(() => {
    if (!productOpen) return;
    const timer = setTimeout(() => {
      loadProducts(productSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadProducts, productOpen, productSearch]);

  const selectProduct = async (product: Producto) => {
    let full: any = null;
    const { data } = await supabase
      .from('productos')
      .select('id, codigo, referencia, marca_id, modelos_ids, chasis, motor, color, anio, condicion, precio')
      .eq('id', product.id)
      .maybeSingle();
    full = data || {};
    setForm((prev) => ({
      ...prev,
      producto_id: product.id,
      chasis: full.chasis || product.codigo || '',
      motor: full.motor || product.referencia || '',
      marca: product.marca_nombre || '',
      modelo: product.modelo_nombre || '',
      color: full.color || '',
      anio: full.anio ? String(full.anio) : '',
      condicion: full.condicion || 'NUEVA',
      valor_contado: n(full.precio || product.precio_venta_1),
    }));
    setProductOpen(false);
  };

  const saveSolicitud = async () => {
    if (!tenantId) return;
    if (!form.cliente_nombre?.trim() && !form.cliente_id) {
      Alert.alert('Datos incompletos', 'Seleccione un cliente o escriba el nombre manual.');
      return;
    }
    if (!form.producto_id) {
      Alert.alert('Datos incompletos', 'Seleccione un vehiculo del inventario.');
      return;
    }
    if (!form.vendedor_id) {
      Alert.alert('Datos incompletos', 'Seleccione un vendedor.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        cliente_id: form.cliente_id || null,
        cliente_nombre: form.cliente_nombre || clientes.find(c => c.id === form.cliente_id)?.nombre || '',
        cliente_rnc: form.cliente_rnc || null,
        vendedor_id: form.vendedor_id,
        fecha: form.fecha || todayISO(),
        producto_id: form.producto_id,
        chasis: form.chasis || '',
        motor: form.motor || '',
        marca: form.marca || '',
        modelo: form.modelo || '',
        color: form.color || '',
        anio: form.anio ? Math.trunc(n(form.anio)) : null,
        condicion: form.condicion || 'NUEVA',
        valor_contado: n(form.valor_contado),
        inicial: n(form.inicial),
        financiamiento: formTotals.financiamiento,
        adicional: n(form.adicional),
        tiempo_meses: Math.trunc(n(form.tiempo_meses)),
        tasa_interes: n(form.tasa_interes),
        total_pagares: formTotals.total_pagares,
        cuota_mensual: formTotals.cuota_mensual,
        cuota_ajustada: n(form.cuota_ajustada) > 0 ? n(form.cuota_ajustada) : null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        incluye_placa: !!form.incluye_placa,
        incluye_gps: !!form.incluye_gps,
        incluye_casco: !!form.incluye_casco,
        incluye_seguro: !!form.incluye_seguro,
        monto_placa: n(form.monto_placa),
        monto_gps: n(form.monto_gps),
        monto_casco: n(form.monto_casco),
        monto_seguro: n(form.monto_seguro),
        tipo_financiamiento: form.tipo_financiamiento || 'simple',
        frecuencia: form.frecuencia || 'mensual',
        notas: form.notas || '',
      };

      const saveRes = form.id
        ? await supabase.from('solicitudes_compras').update(payload).eq('id', form.id).select('*').single()
        : await supabase.from('solicitudes_compras').insert(payload).select('*').single();
      const error = saveRes.error;
      if (error) throw error;

      const saved = (saveRes.data || { ...form, ...payload }) as SolicitudCompra;
      setSelected(saved);
      setShareSolicitud(saved);
      setFormOpen(false);
      setShareOpen(true);
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const anularSolicitud = (row: SolicitudCompra) => {
    Alert.alert('Anular solicitud', `Desea anular la solicitud #${row.numero || ''}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Anular',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('solicitudes_compras').update({ estado: 'Anulada' }).eq('id', row.id);
          if (error) Alert.alert('Error', error.message);
          else {
            setSelected(null);
            loadData();
          }
        },
      },
    ]);
  };

  const compartirSolicitud = async () => {
    if (!previewSolicitud || !shareRef.current) return;
    try {
      const uri = await captureRef(shareRef.current, { format: 'jpg', quality: 0.95, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('No disponible', 'Compartir no esta disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Solicitud ${previewSolicitud.numero || ''}`,
        UTI: 'public.jpeg',
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo compartir.');
    }
  };

  if (!isCaminero) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="bg-brand px-4 pb-4 flex-row items-center" style={{ paddingTop: Math.max(insets.top + 12, 24) }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft color="white" size={22} />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg">Solicitudes de Compra</Text>
        </View>
        <View className="flex-1 items-center justify-center p-8">
          <ClipboardList color="#94a3b8" size={48} />
          <Text className="text-slate-800 font-bold text-lg mt-4 text-center">Modulo no disponible</Text>
          <Text className="text-slate-500 text-center mt-2">Este modulo solo aparece para usuarios de Caminero Motors.</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-brand px-4 pb-4 flex-row items-center" style={{ paddingTop: Math.max(insets.top + 12, 24) }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ArrowLeft color="white" size={22} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg flex-1">Solicitudes de Compra</Text>
        <TouchableOpacity onPress={loadData} className="p-2">
          <RefreshCw color="white" size={20} />
        </TouchableOpacity>
      </View>

      <View className="bg-white px-4 py-3 border-b border-slate-200">
        <View className="flex-row items-center bg-slate-100 rounded-xl px-3">
          <Search color="#64748b" size={18} />
          <TextInput
            className="flex-1 px-2 py-2 text-slate-900"
            placeholder="Buscar #, cliente, marca, chasis..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1d4ed8" />
        </View>
      ) : (
        <FlatList
          data={visibleSolicitudes}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: Math.max(insets.bottom + 190, 190) }}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <ClipboardList color="#cbd5e1" size={48} />
              <Text className="text-slate-400 mt-3">No hay solicitudes pendientes</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className={`bg-white rounded-xl border p-3 mb-3 ${selected?.id === item.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
              onPress={() => setSelected(item)}
              onLongPress={() => openEdit(item)}
            >
              <View className="flex-row justify-between mb-1">
                <Text className="font-bold text-blue-800">#{item.numero || '---'}</Text>
                <Text className="text-xs font-bold text-slate-500">{item.estado || 'Pendiente'}</Text>
              </View>
              <Text className="font-bold text-slate-900">{item.cliente_nombre || 'Cliente'}</Text>
              <Text className="text-slate-600 mt-1">{[item.marca, item.modelo, item.anio].filter(Boolean).join(' ')}</Text>
              <Text className="text-xs font-mono text-slate-500 mt-1">Chasis: {item.chasis || '---'}</Text>
              <View className="flex-row justify-between mt-2">
                <Text className="text-xs text-slate-500">{formatDate(item.fecha)}</Text>
                <Text className="font-bold text-emerald-700">{money(item.valor_contado)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {selected ? (
        <View className="bg-white border-t border-slate-200 px-3 pt-3" style={{ paddingBottom: Math.max(insets.bottom + 12, 24) }}>
          <Text className="text-xs text-slate-500 mb-2">Seleccionada #{selected.numero}</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity className="bg-slate-700 rounded-xl px-3 py-3 flex-1 flex-row justify-center items-center" onPress={() => openEdit(selected)}>
              <Edit color="white" size={18} />
              <Text className="text-white font-bold ml-2">Modificar</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-red-500 rounded-xl px-3 py-3 flex-1 flex-row justify-center items-center" onPress={() => anularSolicitud(selected)}>
              <Trash2 color="white" size={18} />
              <Text className="text-white font-bold ml-2">Anular</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-white border border-slate-200 rounded-xl px-3 py-3" onPress={() => openSharePreview(selected)}>
              <FileDown color="#475569" size={20} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <TouchableOpacity className="absolute right-5 bg-brand rounded-full w-14 h-14 items-center justify-center shadow-lg" style={{ bottom: Math.max(insets.bottom + 92, 104) }} onPress={openNew}>
        <Plus color="white" size={28} />
      </TouchableOpacity>

      <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
        <View className="flex-1 bg-black/55 items-center justify-center px-4 py-8">
          <View className="bg-white rounded-2xl overflow-hidden w-full max-w-[430px]" style={{ height: '90%' }}>
            <View className="flex-1 bg-slate-100 p-3">
              <ViewShot ref={shareRef} options={{ format: 'jpg', quality: 0.95 }} style={{ flex: 1, backgroundColor: 'white', borderRadius: 18, overflow: 'hidden' }}>
                <View className="flex-1 bg-white px-6 py-7">
                  <View className="border-b border-blue-100 pb-4 mb-5">
                    <Text className="text-blue-900 text-xs font-black uppercase tracking-[2px]">Solicitud de compra</Text>
                    <Text className="text-slate-900 text-2xl font-black mt-1">{empresa?.razon_social || empresa?.nombre || 'CAMINERO MOTORS'}</Text>
                    <Text className="text-slate-500 text-xs mt-1">Fecha {formatDate(previewSolicitud?.fecha)}</Text>
                  </View>

                  <View className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
                    <Text className="text-slate-400 text-[11px] font-black uppercase">Nombre del cliente</Text>
                    <Text className="text-slate-900 text-xl font-black mt-1">{previewSolicitud?.cliente_nombre || 'Cliente'}</Text>
                    <Text className="text-slate-400 text-[11px] font-black uppercase mt-4">Cedula / RNC</Text>
                    <Text className="text-slate-800 text-lg font-bold mt-1">{previewSolicitud?.cliente_rnc || 'N/A'}</Text>
                  </View>

                  <View className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
                    <Text className="text-blue-700 text-[11px] font-black uppercase">Valor al contado</Text>
                    <Text className="text-blue-950 text-3xl font-black mt-1">{money(previewSolicitud?.valor_contado)}</Text>
                  </View>

                  <View className="bg-green-50 border border-green-100 rounded-2xl p-4">
                    <Text className="text-green-800 text-[11px] font-black uppercase mb-4">Financiamiento solicitado</Text>
                    <View className="flex-row justify-between items-center border-b border-green-100 pb-3 mb-3">
                      <Text className="text-slate-600 font-bold">Inicial</Text>
                      <Text className="text-slate-950 font-black">{money(previewSolicitud?.inicial)}</Text>
                    </View>
                    <View className="flex-row justify-between items-center border-b border-green-100 pb-3 mb-3">
                      <Text className="text-slate-600 font-bold">Monto solicitado</Text>
                      <Text className="text-slate-950 font-black">{money(previewSolicitud?.financiamiento)}</Text>
                    </View>
                    {n(previewSolicitud?.adicional) > 0 ? (
                      <View className="flex-row justify-between items-center border-b border-green-100 pb-3 mb-3">
                        <Text className="text-slate-600 font-bold">Adicional</Text>
                        <Text className="text-slate-950 font-black">{money(previewSolicitud?.adicional)}</Text>
                      </View>
                    ) : null}
                    <View className="pt-1">
                      <Text className="text-green-800 text-lg font-black text-center">
                        {`${previewSolicitud?.tiempo_meses || 0} cuotas ${frecuenciaLabel(previewSolicitud?.frecuencia).toLowerCase()} de ${money(previewSolicitud?.cuota_mensual)}`.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-auto pt-5">
                    <Text className="text-center text-slate-400 text-xs">Documento generado para compartir datos generales de la solicitud.</Text>
                  </View>
                </View>
              </ViewShot>
            </View>
            <View className="bg-white border-t border-slate-200 p-3 flex-row gap-2">
              <TouchableOpacity className="bg-slate-100 rounded-xl py-3 flex-1 items-center" onPress={() => setShareOpen(false)}>
                <Text className="font-bold text-slate-700">Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity className="bg-slate-700 rounded-xl py-3 flex-1 items-center" onPress={() => previewSolicitud && openEdit(previewSolicitud)}>
                <Text className="font-bold text-white">Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity className="bg-blue-800 rounded-xl py-3 flex-1 items-center" onPress={compartirSolicitud}>
                <Text className="font-bold text-white">Compartir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView
          className="flex-1 bg-slate-50"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View className="bg-[#a3c2f0] px-4 py-3 flex-row items-center">
            <ClipboardList color="#1e293b" size={22} />
            <Text className="text-slate-800 font-black text-lg flex-1 ml-2">SOLICITUD DE COMPRA</Text>
            <TouchableOpacity onPress={() => setFormOpen(false)}>
              <X color="#1e293b" size={24} />
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{ padding: 14, paddingBottom: Math.max(260, insets.bottom + 240) }}
          >
            <Text className="text-[11px] font-black text-blue-800 uppercase mb-2">Datos del cliente</Text>
            <View className="bg-white border border-slate-200 rounded-xl p-3 mb-4">
              <TouchableOpacity
                className="bg-blue-50 border border-blue-200 rounded-xl py-3 mb-3 flex-row justify-center items-center"
                onPress={() => { setClientSearch(''); setClientOpen(true); loadClientes(''); }}
              >
                <Search color="#1d4ed8" size={18} />
                <Text className="text-blue-800 font-bold ml-2">Buscar cliente registrado</Text>
              </TouchableOpacity>
              <Field label="Nombre manual" value={String(form.cliente_nombre || '')} onChangeText={setManualClienteNombre} placeholder="Nombre del cliente" />
              <Field label="RNC / Cedula" value={String(form.cliente_rnc || '')} onChangeText={setManualClienteRnc} placeholder="000-0000000-0" />
              {form.cliente_id ? (
                <Text className="text-[11px] text-emerald-700 font-bold -mt-1 mb-3">Cliente registrado seleccionado</Text>
              ) : null}
              <Text className="text-[11px] font-bold text-slate-500 uppercase mb-1">Vendedor</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {vendedores.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    className={`px-3 py-2 rounded-full mr-2 border ${form.vendedor_id === v.id ? 'bg-blue-700 border-blue-700' : 'bg-white border-slate-200'}`}
                    onPress={() => setField('vendedor_id', v.id)}
                  >
                    <Text className={form.vendedor_id === v.id ? 'text-white font-bold' : 'text-slate-700'}>{v.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text className="text-[11px] font-black text-amber-800 uppercase mb-2">Datos del vehiculo</Text>
            <View className="bg-white border border-amber-200 rounded-xl p-3 mb-4">
              <TouchableOpacity className="bg-amber-50 border border-amber-200 rounded-xl py-3 mb-3 flex-row justify-center items-center" onPress={() => { setProductSearch(''); setProducts([]); setProductOpen(true); }}>
                <Bike color="#b45309" size={18} />
                <Text className="text-amber-700 font-bold ml-2">Buscar vehiculo</Text>
              </TouchableOpacity>
              <Field label="Chasis" value={String(form.chasis || '')} onChangeText={(v) => setField('chasis', v.toUpperCase())} />
              <Field label="Motor" value={String(form.motor || '')} onChangeText={(v) => setField('motor', v.toUpperCase())} />
              <View className="flex-row gap-2">
                <View className="flex-1"><Field label="Marca" value={String(form.marca || '')} onChangeText={(v) => setField('marca', v)} /></View>
                <View className="flex-1"><Field label="Modelo" value={String(form.modelo || '')} onChangeText={(v) => setField('modelo', v)} /></View>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1"><Field label="Color" value={String(form.color || '')} onChangeText={(v) => setField('color', v)} /></View>
                <View className="w-24"><Field label="Ano" value={String(form.anio || '')} onChangeText={(v) => setField('anio', v.replace(/[^0-9]/g, ''))} keyboardType="numeric" /></View>
              </View>
              <View className="flex-row gap-2">
                {['NUEVA', 'USADA'].map((value) => (
                  <TouchableOpacity key={value} className={`flex-1 rounded-xl py-2 border ${form.condicion === value ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-200'}`} onPress={() => setField('condicion', value)}>
                    <Text className={`text-center font-bold ${form.condicion === value ? 'text-white' : 'text-slate-700'}`}>{value}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text className="text-[11px] font-black text-green-800 uppercase mb-2">Opciones de prestamos</Text>
            <View className="bg-white border border-green-200 rounded-xl p-3 mb-4">
              <View className="flex-row gap-2">
                <View className="flex-1"><Field label="Valor contado RD$" value={formatMoneyInput(form.valor_contado)} onChangeText={(v) => setField('valor_contado', cleanMoneyInput(v))} keyboardType="decimal-pad" /></View>
                <View className="flex-1"><Field label="Inicial RD$" value={formatMoneyInput(form.inicial)} onChangeText={(v) => setField('inicial', cleanMoneyInput(v))} keyboardType="decimal-pad" /></View>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1"><Field label="Adicional RD$" value={formatMoneyInput(form.adicional)} onChangeText={(v) => setField('adicional', cleanMoneyInput(v))} keyboardType="decimal-pad" /></View>
                <View className="flex-1"><Field label="N° de cuotas" value={String(form.tiempo_meses || '')} onChangeText={(v) => setField('tiempo_meses', v.replace(/[^0-9]/g, ''))} keyboardType="numeric" /></View>
              </View>
              <Text className="text-[11px] font-bold text-slate-500 uppercase mb-2">Frecuencia</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {[
                  ['diario', 'Diario'],
                  ['semanal', 'Semanal'],
                  ['quincenal', 'Quincenal'],
                  ['mensual', 'Mensual'],
                ].map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    className={`rounded-xl px-3 py-2 border ${form.frecuencia === value ? 'bg-blue-700 border-blue-700' : 'bg-white border-slate-200'}`}
                    onPress={() => setField('frecuencia', value)}
                  >
                    <Text className={`font-bold ${form.frecuencia === value ? 'text-white' : 'text-slate-700'}`}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1"><Field label="Tasa de interés % (mensual)" value={String(form.tasa_interes || '')} onChangeText={(v) => setField('tasa_interes', v)} keyboardType="decimal-pad" /></View>
                <View className="flex-1"><Field label="Vence 1ra cuota" value={String(form.fecha_vencimiento || '')} onChangeText={(v) => setField('fecha_vencimiento', v)} placeholder="yyyy-mm-dd" /></View>
              </View>

              <Text className="text-[11px] font-bold text-slate-500 uppercase mb-2">Tipo de financiamiento</Text>
              <View className="flex-row gap-2 mb-3">
                <TouchableOpacity className={`flex-1 rounded-xl py-2 border ${form.tipo_financiamiento === 'simple' ? 'bg-green-600 border-green-600' : 'bg-white border-slate-200'}`} onPress={() => setField('tipo_financiamiento', 'simple')}>
                  <Text className={`text-center font-bold ${form.tipo_financiamiento === 'simple' ? 'text-white' : 'text-slate-700'}`}>Simple</Text>
                </TouchableOpacity>
                <TouchableOpacity className={`flex-1 rounded-xl py-2 border ${form.tipo_financiamiento === 'frances' ? 'bg-green-600 border-green-600' : 'bg-white border-slate-200'}`} onPress={() => setField('tipo_financiamiento', 'frances')}>
                  <Text className={`text-center font-bold ${form.tipo_financiamiento === 'frances' ? 'text-white' : 'text-slate-700'}`}>Frances</Text>
                </TouchableOpacity>
              </View>

              {[
                ['incluye_placa', 'PLACA', addonPrices.placa],
                ['incluye_gps', 'GPS', addonPrices.gps],
                ['incluye_casco', 'CASCO', addonPrices.casco],
                ['incluye_seguro', 'SEGURO', addonPrices.seguro],
              ].map(([key, label, price]) => {
                const active = !!form[key as keyof SolicitudCompra];
                return (
                  <TouchableOpacity key={String(key)} className={`border rounded-xl px-3 py-3 mb-2 flex-row justify-between ${active ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200'}`} onPress={() => setField(key as keyof SolicitudCompra, !active)}>
                    <Text className="font-bold text-slate-700">{String(label)}</Text>
                    <Text className="text-slate-500">{active ? 'Incluido' : money(price)}</Text>
                  </TouchableOpacity>
                );
              })}

              <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-2 mb-3">
                <Text className="text-[10px] font-black text-emerald-700 uppercase tracking-[1.5px] mb-3">Resultado</Text>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold text-slate-500 mb-1">Monto de cuotas</Text>
                    <View className="bg-white border border-slate-200 rounded-xl px-2 py-2.5">
                      <Text className="font-black text-slate-800 text-xs">{money(formTotals.cuota_base)}</Text>
                    </View>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold text-slate-500 mb-1">Mas ajustes</Text>
                    <View className="bg-white border border-slate-200 rounded-xl px-2 py-2.5">
                      <Text className={`font-black text-xs ${formTotals.mas_ajustes < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {money(formTotals.mas_ajustes)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View className="mt-2">
                  <Text className="text-[10px] font-black text-emerald-800 mb-1">Cuota ajustada</Text>
                  <TextInput
                    className="bg-white border border-emerald-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
                    value={String(form.cuota_ajustada || '')}
                    onChangeText={(v) => setField('cuota_ajustada', cleanMoneyInput(v))}
                    keyboardType="decimal-pad"
                    placeholder={formTotals.cuota_base ? formTotals.cuota_base.toFixed(2) : '0.00'}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View className="flex-row flex-wrap items-center gap-2 mt-3">
                  <Text className="text-[10px] text-slate-500 font-bold">Redondear a:</Text>
                  {[1, 5, 10, 50, 100].map((multiplo) => (
                    <TouchableOpacity key={multiplo} className="bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5" onPress={() => redondearCuota(multiplo)}>
                      <Text className="text-[11px] font-bold text-slate-700">{multiplo}</Text>
                    </TouchableOpacity>
                  ))}
                  {n(form.cuota_ajustada) > 0 ? (
                    <TouchableOpacity className="px-2 py-1.5" onPress={() => setField('cuota_ajustada', '')}>
                      <Text className="text-[11px] font-bold text-slate-500">Quitar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <View className="bg-green-50 border border-green-100 rounded-xl p-3 mt-2">
                <View className="flex-row justify-between mb-2"><Text className="text-slate-600">Financiamiento</Text><Text className="font-bold">{money(formTotals.financiamiento)}</Text></View>
                <View className="flex-row justify-between mb-2"><Text className="text-slate-600">Total de pagares</Text><Text className="font-bold">{money(formTotals.total_pagares)}</Text></View>
                <View className="flex-row justify-between"><Text className="text-slate-600 font-bold">Cuota {frecuenciaLabel(form.frecuencia)}</Text><Text className="font-black text-green-700">{money(formTotals.cuota_mensual)}</Text></View>
              </View>
            </View>

            <View className="bg-white border border-slate-200 rounded-xl p-3">
              <Field label="Notas y observaciones" value={String(form.notas || '')} onChangeText={(v) => setField('notas', v)} placeholder="Notas adicionales..." />
            </View>
          </ScrollView>
          <View
            className="bg-white border-t border-slate-200 px-3 pt-3 flex-row gap-2"
            style={{ paddingBottom: Math.max(insets.bottom + 18, 34) }}
          >
            <TouchableOpacity className="bg-slate-100 rounded-xl py-3 flex-1 items-center" onPress={() => setFormOpen(false)}>
              <Text className="font-bold text-slate-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity className={`bg-blue-800 rounded-xl py-3 flex-[1.4] flex-row justify-center items-center ${saving ? 'opacity-60' : ''}`} onPress={saveSolicitud} disabled={saving}>
              {saving ? <ActivityIndicator color="white" /> : <Send color="white" size={18} />}
              <Text className="font-bold text-white ml-2">Guardar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={productOpen} animationType="slide" onRequestClose={() => setProductOpen(false)}>
        <View className="flex-1 bg-gray-50">
          <View className="bg-brand px-4 pb-4 flex-row items-center" style={{ paddingTop: Math.max(insets.top + 12, 24) }}>
            <Text className="text-white font-bold text-lg flex-1">Buscar vehiculo</Text>
            <TouchableOpacity onPress={() => setProductOpen(false)}><X color="white" size={24} /></TouchableOpacity>
          </View>
          <View className="bg-white p-3 border-b border-slate-200">
            <View className="flex-row gap-2">
              <TextInput
                className="bg-slate-100 rounded-xl px-3 py-2 flex-1"
                value={productSearch}
                onChangeText={setProductSearch}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Codigo, chasis, marca..."
                placeholderTextColor="#94a3b8"
                returnKeyType="search"
                onSubmitEditing={() => loadProducts(productSearch)}
              />
              <TouchableOpacity className="bg-brand rounded-xl px-4 justify-center" onPress={() => loadProducts(productSearch)}>
                <Search color="white" size={20} />
              </TouchableOpacity>
            </View>
          </View>
          {productsLoading ? (
            <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1d4ed8" /></View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity className="bg-white border border-slate-200 rounded-xl p-3 mb-2" onPress={() => selectProduct(item)}>
                  <Text className="font-bold text-slate-900">{item.descripcion}</Text>
                  <Text className="text-xs text-slate-500 mt-1">{item.codigo} {item.referencia ? `| ${item.referencia}` : ''}</Text>
                  <Text className="text-emerald-700 font-bold mt-1">{money(item.precio_venta_1)}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <Modal visible={clientOpen} animationType="slide" onRequestClose={() => setClientOpen(false)}>
        <View className="flex-1 bg-gray-50">
          <View className="bg-brand px-4 pb-4 flex-row items-center" style={{ paddingTop: Math.max(insets.top + 12, 24) }}>
            <Text className="text-white font-bold text-lg flex-1">Buscar cliente</Text>
            <TouchableOpacity onPress={() => setClientOpen(false)}><X color="white" size={24} /></TouchableOpacity>
          </View>
          <View className="bg-white p-3 border-b border-slate-200">
            <View className="flex-row gap-2">
              <TextInput
                className="bg-slate-100 rounded-xl px-3 py-2 flex-1"
                value={clientSearch}
                onChangeText={setClientSearch}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Nombre, RNC, telefono o codigo..."
                placeholderTextColor="#94a3b8"
                returnKeyType="search"
                onSubmitEditing={() => loadClientes(clientSearch)}
              />
              <TouchableOpacity className="bg-brand rounded-xl px-4 justify-center" onPress={() => loadClientes(clientSearch)}>
                <Search color="white" size={20} />
              </TouchableOpacity>
            </View>
          </View>
          {clientsLoading ? (
            <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1d4ed8" /></View>
          ) : (
            <FlatList
              data={clientes}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 12, paddingBottom: Math.max(insets.bottom + 24, 48) }}
              ListEmptyComponent={
                <View className="items-center justify-center py-16">
                  <Search color="#cbd5e1" size={42} />
                  <Text className="text-slate-400 mt-3">No se encontraron clientes</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity className="bg-white border border-slate-200 rounded-xl p-3 mb-2" onPress={() => selectCliente(item)}>
                  <View className="flex-row justify-between gap-3">
                    <Text className="font-bold text-slate-900 flex-1">{item.nombre}</Text>
                    {item.codigo ? <Text className="text-xs font-mono text-blue-800">{item.codigo}</Text> : null}
                  </View>
                  <Text className="text-xs text-slate-500 mt-1">{item.rnc || item.telefono || 'Sin RNC/Cedula'}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
