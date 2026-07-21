import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  CompanyFinanceSummary,
  fetchMobileDashboard,
  MobileDashboardData,
  SalesFocusProduct,
  SellerDashboardData,
} from '@/src/services/dashboardService';
import { fetchSanDashboard, suscribirSan, SanDashboard, SAN_VACIO } from '@/src/services/sanService';
import { fetchCuentasBanco, totalCuentas, CuentaBanco } from '@/src/services/cuentasService';

const money = (value: number) =>
  `RD$${Number(value || 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const shortMoney = (value: number) =>
  Number(value || 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const initialData: MobileDashboardData = {
  meta: 150000,
  ventasDia: 0,
  ventasMes: 0,
  progresoMeta: 0,
  proyeccionCierre: 0,
  cajaActual: 0,
  excedente: 0,
  gastosDia: 0,
  compromisosPagar: 0,
  compromisosSuplidores: 0,
  financieraExternaRecibosDia: 0,
  financieraExternaNombre: null,
  compromisoSemanaCount: 0,
  suplidorSemanaCount: 0,
  hasPreviousMonthHistory: false,
  finanzasEmpresas: [],
  vendedor: null,
};

const CAMINERO_MOTORS_TENANT = 'b39506c3-27dc-467d-830b-096731b83113';

type MetricCardProps = {
  title: string;
  value: string;
  subtitle: string;
  tone: 'blue' | 'green' | 'orange' | 'red' | 'slate' | 'amber';
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  onDoublePress?: () => void;
};

const toneMap = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: '#1d4ed8' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '#059669' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', icon: '#f97316' },
  red: { bg: 'bg-red-50', text: 'text-red-600', icon: '#ef4444' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', icon: '#475569' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: '#d97706' },
};

function MetricCard({ title, value, subtitle, tone, icon, onPress, onDoublePress }: MetricCardProps) {
  const colors = toneMap[tone];
  const lastTapRef = useRef(0);
  const Wrapper = onPress || onDoublePress ? TouchableOpacity : View;
  const handlePress = () => {
    if (!onDoublePress) {
      onPress?.();
      return;
    }

    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      onDoublePress();
      return;
    }
    lastTapRef.current = now;
  };

  return (
    <Wrapper
      className="w-[48.5%] bg-white border border-gray-200 rounded-xl p-2.5 mb-3 shadow-sm"
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <View className="flex-row items-start">
        <View className={`${colors.bg} w-8 h-8 rounded-full items-center justify-center mr-2`}>
          <Feather name={icon} color={colors.icon} size={17} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-gray-500 font-black text-[9px] uppercase tracking-wider" numberOfLines={2}>
            {title}
          </Text>
          <Text
            className={`${colors.text} text-[19px] font-black mt-0.5`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {value}
          </Text>
          <Text className="text-gray-500 text-[10px] mt-1" numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </View>
    </Wrapper>
  );
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
};

function ProgressBar({ value, tone = 'blue' }: { value: number; tone?: 'blue' | 'green' | 'orange' }) {
  const barColor = tone === 'green' ? 'bg-emerald-600' : tone === 'orange' ? 'bg-orange-500' : 'bg-blue-600';
  return (
    <View className="h-3 bg-slate-100 rounded-full overflow-hidden">
      <View className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </View>
  );
}

function SellerStat({
  icon,
  label,
  value,
  detail,
  tone = 'blue',
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  detail: string;
  tone?: keyof typeof toneMap;
}) {
  const colors = toneMap[tone];
  return (
    <View className="bg-white border border-slate-200 rounded-xl p-3 mb-3 shadow-sm">
      <View className="flex-row items-center">
        <View className={`${colors.bg} w-9 h-9 rounded-full items-center justify-center mr-3`}>
          <Feather name={icon} color={colors.icon} size={18} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-slate-500 text-[10px] font-black uppercase tracking-wider" numberOfLines={1}>
            {label}
          </Text>
          <Text className={`${colors.text} text-xl font-black mt-0.5`} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text className="text-slate-500 text-[11px] mt-1" numberOfLines={2}>
            {detail}
          </Text>
        </View>
      </View>
    </View>
  );
}

function FocusProductCard({
  product,
  icon,
  tone,
}: {
  product: SalesFocusProduct;
  icon: keyof typeof Feather.glyphMap;
  tone: keyof typeof toneMap;
}) {
  const colors = toneMap[tone];
  const sourceLabel = product.source === 'configurado' ? 'Elegido por gerencia' : product.source === 'automatico' ? 'Sugerido por datos' : 'Pendiente';

  return (
    <View className="bg-white border border-slate-200 rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-start">
        <View className={`${colors.bg} w-10 h-10 rounded-xl items-center justify-center mr-3`}>
          <Feather name={icon} color={colors.icon} size={20} />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center justify-between">
            <Text className="text-slate-500 text-[10px] font-black uppercase tracking-wider flex-1" numberOfLines={1}>
              {product.titulo}
            </Text>
            <View className="bg-slate-100 px-2 py-1 rounded-full ml-2">
              <Text className="text-slate-500 text-[9px] font-black">{sourceLabel}</Text>
            </View>
          </View>
          <Text className="text-slate-950 text-lg font-black mt-1" numberOfLines={2}>
            {product.descripcion}
          </Text>
          <Text className="text-slate-500 text-xs mt-1" numberOfLines={3}>
            {product.mensaje}
          </Text>
          <View className="flex-row flex-wrap mt-3">
            <View className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 mr-2 mb-2">
              <Text className="text-slate-400 text-[9px] font-black uppercase">Codigo</Text>
              <Text className="text-slate-800 text-xs font-black">{product.codigo}</Text>
            </View>
            <View className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 mr-2 mb-2">
              <Text className="text-slate-400 text-[9px] font-black uppercase">Precio</Text>
              <Text className="text-slate-800 text-xs font-black">{money(product.precio)}</Text>
            </View>
            <View className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 mr-2 mb-2">
              <Text className="text-slate-400 text-[9px] font-black uppercase">Existencia</Text>
              <Text className="text-slate-800 text-xs font-black">
                {product.existencia === null ? 'N/D' : product.existencia.toLocaleString('es-DO')}
              </Text>
            </View>
            {product.objetivoUnidades ? (
              <View className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 mb-2">
                <Text className="text-slate-400 text-[9px] font-black uppercase">Objetivo</Text>
                <Text className="text-slate-800 text-xs font-black">{product.objetivoUnidades} uds</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function FinanceDetailModal({
  visible,
  mode,
  rows,
  onClose,
}: {
  visible: boolean;
  mode: 'gastos' | 'compromisos';
  rows: CompanyFinanceSummary[];
  onClose: () => void;
}) {
  const isGastos = mode === 'gastos';
  const total = rows.reduce((sum, row) => sum + (isGastos ? row.gastosDia : row.compromisosPagar), 0);
  const count = rows.reduce((sum, row) => sum + (isGastos ? row.gastosCount : row.compromisosCount), 0);
  const tone = isGastos ? toneMap.red : toneMap.amber;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white rounded-t-2xl max-h-[82%] border border-slate-200">
          <View className="px-4 pt-4 pb-3 border-b border-slate-100">
            <View className="flex-row items-start justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className={`${tone.bg} w-10 h-10 rounded-xl items-center justify-center mr-3`}>
                  <Feather name={isGastos ? 'file-text' : 'clock'} color={tone.icon} size={20} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                    {isGastos ? 'Detalle de gastos del dia' : 'Detalle de compromisos a pagar'}
                  </Text>
                  <Text className="text-slate-950 text-2xl font-black" adjustsFontSizeToFit numberOfLines={1}>
                    {money(total)}
                  </Text>
                  <Text className="text-slate-500 text-xs">
                    {rows.length} empresas, {count} registros
                  </Text>
                </View>
              </View>
              <TouchableOpacity className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center" onPress={onClose}>
                <Feather name="x" color="#475569" size={18} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
            {rows.map((row) => {
              const items = isGastos ? row.gastos : row.compromisos;
              const rowTotal = isGastos ? row.gastosDia : row.compromisosPagar;
              const rowCount = isGastos ? row.gastosCount : row.compromisosCount;

              return (
                <View key={row.tenantId || row.nombre} className="mb-4">
                  <View className="flex-row justify-between items-end mb-2">
                    <Text className="text-slate-950 text-sm font-black uppercase flex-1 pr-2" numberOfLines={2}>
                      {row.nombre}
                    </Text>
                    <View className="items-end">
                      <Text className={`${isGastos ? 'text-red-700' : 'text-amber-700'} text-base font-black`}>
                        {money(rowTotal)}
                      </Text>
                      <Text className="text-slate-400 text-[10px]">{rowCount} registros</Text>
                    </View>
                  </View>

                  {items.length === 0 ? (
                    <View className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <Text className="text-slate-400 text-xs font-bold">
                        {isGastos ? 'No hay gastos registrados hoy.' : 'No hay compromisos pendientes.'}
                      </Text>
                    </View>
                  ) : (
                    items.map((item: any) => (
                      <View key={`${row.tenantId}-${item.id}`} className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-2">
                        <View className="flex-row justify-between items-start">
                          <View className="flex-1 min-w-0 pr-3">
                            <Text className="text-slate-900 text-sm font-black" numberOfLines={2}>
                              {isGastos ? item.descripcion || item.tipoGasto : item.nombre}
                            </Text>
                            <Text className="text-slate-500 text-[11px] mt-1" numberOfLines={1}>
                              {isGastos
                                ? `${formatDate(item.fecha)} · ${item.tipoGasto}`
                                : `${formatDate(item.fecha)} · ${item.tipo || 'Compromiso'}${item.recurrente && item.frecuencia ? ` · ${item.frecuencia}` : ''}`}
                            </Text>
                          </View>
                          <Text className={`${isGastos ? 'text-red-700' : 'text-amber-700'} text-sm font-black`}>
                            {money(item.monto)}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SellerDashboard({
  data,
  nombre,
  onRefresh,
  refreshing,
}: {
  data: SellerDashboardData;
  nombre: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const metaLabel = data.metaSource === 'configurada' ? 'Meta de venta de este mes' : 'Meta sugerida de este mes';
  const rankLabel = data.rankingPosicion ? `#${data.rankingPosicion} de ${data.rankingTotal}` : 'Sin ranking aun';

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="mb-4">
        <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider">Inicio vendedor</Text>
        <Text className="text-2xl font-black text-slate-950" numberOfLines={1}>{nombre}</Text>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center flex-1 pr-3">
            <View className="bg-blue-50 w-12 h-12 rounded-xl items-center justify-center mr-3">
              <Feather name="target" color="#1d4ed8" size={25} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-slate-500 text-[10px] font-black uppercase tracking-wider">{metaLabel}</Text>
              <Text className="text-slate-950 text-2xl font-black" adjustsFontSizeToFit numberOfLines={1}>
                {money(data.metaPersonal)}
              </Text>
            </View>
          </View>
          <View className={`${data.progresoPersonal >= 100 ? 'bg-emerald-50' : 'bg-blue-50'} px-2.5 py-1 rounded-full`}>
            <Text className={`${data.progresoPersonal >= 100 ? 'text-emerald-700' : 'text-blue-700'} text-[10px] font-black`}>
              {data.progresoPersonal.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View className="mt-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-slate-700 font-bold">Tu progreso</Text>
            <Text className="text-blue-700 font-black">{money(data.ventasMes)}</Text>
          </View>
          <ProgressBar value={data.progresoPersonal} />
          <View className="flex-row justify-between mt-2">
            <Text className="text-slate-500 text-xs">Hoy: {money(data.ventasDia)}</Text>
            <Text className="text-slate-500 text-xs">Faltan {money(data.faltantePersonal)}</Text>
          </View>
        </View>

        <View className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mt-4">
          <View className="flex-row items-start">
            <Feather name="zap" color="#059669" size={16} />
            <Text className="text-emerald-800 text-xs font-bold ml-2 flex-1">
              {data.mensajeMotivacion}
            </Text>
          </View>
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Meta general de la empresa</Text>
          <Text className="text-slate-900 text-xs font-black">{data.progresoEmpresa.toFixed(1)}%</Text>
        </View>
        <ProgressBar value={data.progresoEmpresa} tone="green" />
        <View className="flex-row justify-between mt-2">
          <Text className="text-slate-500 text-xs">{money(data.ventasEmpresaMes)} vendido</Text>
          <Text className="text-slate-500 text-xs">Tu aporte: {data.aporteEmpresaPct.toFixed(1)}%</Text>
        </View>
      </View>

      <View className="flex-row justify-between">
        <View className="w-[48.5%]">
          <SellerStat icon="trending-up" label="Proyeccion" value={money(data.proyeccionPersonal)} detail="estimado al cierre" tone={data.proyeccionPersonal >= data.metaPersonal ? 'green' : 'orange'} />
        </View>
        <View className="w-[48.5%]">
          <SellerStat icon="award" label="Ranking" value={rankLabel} detail="ventas del mes" tone="blue" />
        </View>
      </View>
      <View className="flex-row justify-between">
        <View className="w-[48.5%]">
          <SellerStat icon="file-text" label="Facturas" value={`${data.facturasMes}`} detail="emitidas este mes" tone="slate" />
        </View>
        <View className="w-[48.5%]">
          <SellerStat icon="shopping-bag" label="Ticket prom." value={money(data.ticketPromedio)} detail="promedio por venta" tone="green" />
        </View>
      </View>

      <Text className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2 mt-1">Prioridades para vender</Text>
      <FocusProductCard product={data.productoSemana} icon="star" tone="blue" />
      <FocusProductCard product={data.productoRotacion} icon="refresh-cw" tone="orange" />
    </ScrollView>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { tenantId, empresa, user, profile } = useAuthStore();
  const [data, setData] = useState<MobileDashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModal, setDetailModal] = useState<'gastos' | 'compromisos' | null>(null);
  const roleText = String(profile?.role || '').toLowerCase();
  const isManagerRole = roleText.includes('admin') || roleText.includes('gerente') || roleText.includes('manager') || roleText.includes('owner') || profile?.is_superadmin;

  const loadDashboard = useCallback(async (refresh = false) => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const next = await fetchMobileDashboard(tenantId, user?.id, { sellerOnly: !!user?.id && !isManagerRole });
      setData(next);
    } catch (error: any) {
      Alert.alert('Dashboard', error?.message || 'No se pudieron cargar las metricas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isManagerRole, tenantId, user?.id]);

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  // ----- SAN (Ahorro Programado) en tiempo real -----
  const [san, setSan] = useState<SanDashboard>(SAN_VACIO);
  const cargarSan = useCallback(async () => {
    if (!tenantId) return;
    try {
      // Un admin de Caminero ve los SAN de la financiera (MotoPréstamos),
      // que vive en otro tenant. Los vendedores no.
      setSan(await fetchSanDashboard(tenantId, { comoAdminFinanciera: !!isManagerRole }));
    } catch {
      /* si falla, la tarjeta simplemente no se muestra */
    }
  }, [tenantId, isManagerRole]);

  useEffect(() => { cargarSan(); }, [cargarSan]);
  useEffect(() => {
    if (!tenantId) return undefined;
    return suscribirSan(tenantId, cargarSan);   // se actualiza al instante con cada pago
  }, [tenantId, cargarSan]);

  // ----- Cuentas bancarias de la empresa (solo gerenciales) -----
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([]);
  const cargarCuentas = useCallback(async () => {
    if (!tenantId || !isManagerRole) { setCuentas([]); return; }
    try {
      setCuentas(await fetchCuentasBanco(tenantId, { comoGerencial: true }));
    } catch {
      /* si falla, la tarjeta simplemente no se muestra */
    }
  }, [tenantId, isManagerRole]);

  useEffect(() => { cargarCuentas(); }, [cargarCuentas]);

  const refrescarTodo = useCallback(() => {
    loadDashboard(true);
    cargarSan();
    cargarCuentas();
  }, [loadDashboard, cargarSan, cargarCuentas]);

  const faltanteMeta = Math.max(0, data.meta - data.ventasMes);
  const proyeccionOk = data.proyeccionCierre >= data.meta;
  const finanzasEmpresas = data.finanzasEmpresas || [];
  const hasFinanceRows = finanzasEmpresas.length > 0;
  const hasCompanyFinanceBreakdown = finanzasEmpresas.length > 1;
  const gastosDiaVisible = hasFinanceRows
    ? finanzasEmpresas.reduce((sum, row) => sum + row.gastosDia, 0)
    : data.gastosDia;
  const compromisosPagarVisible = hasFinanceRows
    ? finanzasEmpresas.reduce((sum, row) => sum + row.compromisosPagar, 0)
    : data.compromisosPagar;
  const gastoCountVisible = hasFinanceRows
    ? finanzasEmpresas.reduce((sum, row) => sum + row.gastosCount, 0)
    : 0;
  const compromisoCountVisible = hasFinanceRows
    ? finanzasEmpresas.reduce((sum, row) => sum + row.compromisosCount, 0)
    : data.compromisoSemanaCount;
  const compromisosSemana = compromisosPagarVisible + data.compromisosSuplidores;
  const cajaVsCompromisos = data.excedente - compromisosSemana;
  const nombre = empresa?.nombre || empresa?.razon_social || user?.email?.split('@')[0] || 'MotoFlow';
  const showFinancieraExterna = tenantId === CAMINERO_MOTORS_TENANT || data.financieraExternaRecibosDia > 0;
  const shouldShowSellerDashboard = Boolean(data.vendedor && !isManagerRole);

  const projectionLabel = useMemo(() => {
    if (data.proyeccionCierre <= 0) return 'Sin historial del mes actual';
    return proyeccionOk ? 'Vas por encima de la meta' : 'Ritmo por debajo de la meta';
  }, [data.proyeccionCierre, proyeccionOk]);

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <ActivityIndicator size="large" color="#1d4ed8" />
        <Text className="text-gray-500 font-semibold mt-3 text-center">Cargando inicio...</Text>
      </View>
    );
  }

  if (shouldShowSellerDashboard && data.vendedor) {
    return (
      <SellerDashboard
        data={data.vendedor}
        nombre={nombre}
        refreshing={refreshing}
        onRefresh={() => loadDashboard(true)}
      />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refrescarTodo} />}
    >
      <View className="mb-4">
        <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Dashboard</Text>
        <Text className="text-2xl font-black text-gray-950" numberOfLines={1}>{nombre}</Text>
      </View>

      <View className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center flex-1 pr-3">
            <View className="bg-blue-50 w-11 h-11 rounded-xl items-center justify-center mr-3">
              <Feather name="target" color="#1d4ed8" size={24} />
            </View>
            <View className="flex-1">
              <Text className="text-gray-500 text-[10px] font-black uppercase tracking-wider">Metas y Proyecciones</Text>
              <Text className="text-gray-950 text-2xl font-black" adjustsFontSizeToFit numberOfLines={1}>
                {money(data.meta)}
              </Text>
            </View>
          </View>
          <View className={`${proyeccionOk ? 'bg-emerald-50' : 'bg-red-50'} px-2.5 py-1 rounded-full`}>
            <Text className={`${proyeccionOk ? 'text-emerald-700' : 'text-red-600'} text-[10px] font-black`}>
              {data.progresoMeta.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View className="mt-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-gray-700 font-bold">Progreso</Text>
            <Text className="text-blue-700 font-black">{data.progresoMeta.toFixed(1)}%</Text>
          </View>
          <View className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <View className="h-full bg-blue-600 rounded-full" style={{ width: `${data.progresoMeta}%` }} />
          </View>
          <View className="flex-row justify-between mt-2">
            <Text className="text-gray-500 text-xs">{money(data.ventasMes)} vendido</Text>
            <Text className="text-gray-500 text-xs">Faltan {money(faltanteMeta)}</Text>
          </View>
        </View>

        <View className="bg-slate-50 border border-slate-100 rounded-xl p-3 mt-4">
          <Text className="text-gray-400 text-[10px] font-black uppercase tracking-widest text-center">
            Resultado estimado al cierre
          </Text>
          <Text className={`${proyeccionOk ? 'text-blue-700' : 'text-red-600'} text-2xl font-black text-center mt-1`} adjustsFontSizeToFit numberOfLines={1}>
            Proyeccion: {money(data.proyeccionCierre)}
          </Text>
          <View className="flex-row items-center justify-center mt-1">
            <Feather name={proyeccionOk ? 'trending-up' : 'alert-triangle'} color={proyeccionOk ? '#059669' : '#ef4444'} size={15} />
            <Text className={`${proyeccionOk ? 'text-emerald-700' : 'text-red-600'} text-xs font-bold ml-1`}>
              {projectionLabel}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row flex-wrap justify-between">
        <MetricCard
          title="Ventas del dia"
          value={shortMoney(data.ventasDia)}
          subtitle="ingresos de hoy"
          tone="orange"
          icon="arrow-up-right"
          onPress={() => router.push('/(tabs)/pos')}
        />
        <MetricCard
          title="Caja actual"
          value={money(data.cajaActual)}
          subtitle={hasCompanyFinanceBreakdown ? 'caja operativa Caminero' : 'contado + recibos - gastos'}
          tone="blue"
          icon="credit-card"
        />
        {showFinancieraExterna ? (
          <MetricCard
            title="Recibos financiera"
            value={money(data.financieraExternaRecibosDia)}
            subtitle={data.financieraExternaNombre || 'Motoprestamos Los Naranjos'}
            tone="green"
            icon="briefcase"
          />
        ) : null}
        <MetricCard
          title="Excedente"
          value={money(data.excedente)}
          subtitle={cajaVsCompromisos >= 0 ? 'caja cubre compromisos' : `faltan ${money(Math.abs(cajaVsCompromisos))}`}
          tone={cajaVsCompromisos >= 0 ? 'green' : 'red'}
          icon="dollar-sign"
        />
        <MetricCard
          title="Gastos del dia"
          value={money(gastosDiaVisible)}
          subtitle={hasCompanyFinanceBreakdown ? `${finanzasEmpresas.length} empresas sumadas` : `${gastoCountVisible} gastos registrados`}
          tone={gastosDiaVisible > 0 ? 'red' : 'slate'}
          icon="file-text"
          onDoublePress={() => setDetailModal('gastos')}
        />
        <MetricCard
          title="Compromisos a pagar"
          value={money(compromisosPagarVisible)}
          subtitle={hasCompanyFinanceBreakdown ? `${finanzasEmpresas.length} empresas sumadas` : `${compromisoCountVisible} pendientes en total`}
          tone={compromisosPagarVisible > 0 ? 'amber' : 'green'}
          icon="clock"
          onDoublePress={() => setDetailModal('compromisos')}
        />
        <MetricCard
          title="Compromisos suplidores"
          value={money(data.compromisosSuplidores)}
          subtitle={`${data.suplidorSemanaCount} compras a credito vencen`}
          tone={data.compromisosSuplidores > 0 ? 'amber' : 'green'}
          icon="truck"
        />
      </View>

      {isManagerRole && cuentas.length > 0 && (
        <View className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mt-4">
          <View className="flex-row items-center mb-1">
            <View className="bg-blue-50 w-11 h-11 rounded-xl items-center justify-center mr-3">
              <Feather name="credit-card" color="#1d4ed8" size={22} />
            </View>
            <View className="flex-1">
              <Text className="text-gray-500 text-[10px] font-black uppercase tracking-wider">
                Cuentas Bancarias
              </Text>
              <Text className="text-gray-950 text-2xl font-black" adjustsFontSizeToFit numberOfLines={1}>
                {money(totalCuentas(cuentas))}
              </Text>
            </View>
          </View>

          {cuentas.map((c) => (
            <View key={c.id} className="flex-row justify-between items-center border-t border-gray-100 pt-3 mt-3">
              <Text className="text-gray-800 font-semibold flex-1 pr-3" numberOfLines={1}>{c.nombre}</Text>
              <Text className={`font-black ${c.saldo < 0 ? 'text-red-600' : 'text-gray-950'}`}>
                {money(c.saldo)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {san.sanes.length > 0 && (
        <View className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mt-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center flex-1 pr-3">
              <View className="bg-emerald-50 w-11 h-11 rounded-xl items-center justify-center mr-3">
                <Feather name="pie-chart" color="#059669" size={22} />
              </View>
              <View className="flex-1">
                <Text className="text-gray-500 text-[10px] font-black uppercase tracking-wider">
                  SAN — Ahorro Programado
                </Text>
                <Text className="text-gray-950 text-2xl font-black" adjustsFontSizeToFit numberOfLines={1}>
                  {money(san.totales.ahorrado)}
                </Text>
                <Text className="text-gray-500 text-xs">
                  de {money(san.totales.comprometido)} · {san.totales.activos} activo(s)
                </Text>
              </View>
            </View>
            <View className="bg-emerald-50 px-2.5 py-1 rounded-full">
              <Text className="text-emerald-700 text-[10px] font-black">{san.totales.porcentaje}%</Text>
            </View>
          </View>

          {san.sanes.map((s) => (
            <View key={s.id} className="border-t border-gray-100 pt-3 mt-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-900 font-bold flex-1 pr-2" numberOfLines={1}>{s.nombre}</Text>
                <Text className="text-emerald-700 font-black">{s.porcentaje}%</Text>
              </View>
              <View className="h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
                <View className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(s.porcentaje, 100)}%` }} />
              </View>
              <View className="flex-row justify-between mt-2">
                <Text className="text-gray-500 text-xs">{money(s.ahorrado)} ahorrado</Text>
                <Text className="text-gray-500 text-xs">Faltan {money(s.restante)}</Text>
              </View>
              {s.diasAtrasados > 0 ? (
                <View className="bg-amber-50 rounded-lg px-3 py-2 mt-2 flex-row items-center">
                  <Feather name="alert-triangle" color="#d97706" size={14} />
                  <Text className="text-amber-700 text-xs font-bold ml-2 flex-1">
                    {s.diasAtrasados} dia(s) atrasado(s) · {money(s.faltaAlDia)} para ponerte al dia
                  </Text>
                </View>
              ) : s.faltaHoy > 0 ? (
                <View className="bg-emerald-50 rounded-lg px-3 py-2 mt-2 flex-row items-center">
                  <Feather name="calendar" color="#059669" size={14} />
                  <Text className="text-emerald-700 text-xs font-bold ml-2 flex-1">
                    Hoy toca {money(s.faltaHoy)} · no rompas la cadena
                  </Text>
                </View>
              ) : (
                <View className="bg-emerald-50 rounded-lg px-3 py-2 mt-2 flex-row items-center">
                  <Feather name="check-circle" color="#059669" size={14} />
                  <Text className="text-emerald-700 text-xs font-bold ml-2 flex-1">Al dia ✔</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <FinanceDetailModal
        visible={detailModal !== null}
        mode={detailModal || 'gastos'}
        rows={finanzasEmpresas}
        onClose={() => setDetailModal(null)}
      />

    </ScrollView>
  );
}
