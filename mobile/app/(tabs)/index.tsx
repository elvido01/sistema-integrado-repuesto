import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarClock,
  ReceiptText,
  Target,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import { fetchMobileDashboard, MobileDashboardData } from '@/src/services/dashboardService';

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
  compromisoSemanaCount: 0,
  suplidorSemanaCount: 0,
  hasPreviousMonthHistory: false,
};

type MetricCardProps = {
  title: string;
  value: string;
  subtitle: string;
  tone: 'blue' | 'green' | 'orange' | 'red' | 'slate' | 'amber';
  icon: React.ComponentType<{ color?: string; size?: number }>;
  onPress?: () => void;
};

const toneMap = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: '#1d4ed8' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '#059669' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', icon: '#f97316' },
  red: { bg: 'bg-red-50', text: 'text-red-600', icon: '#ef4444' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', icon: '#475569' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: '#d97706' },
};

function MetricCard({ title, value, subtitle, tone, icon: Icon, onPress }: MetricCardProps) {
  const colors = toneMap[tone];
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      className="w-[48.5%] bg-white border border-gray-200 rounded-xl p-3 mb-3 shadow-sm"
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View className="flex-row items-start">
        <View className={`${colors.bg} w-11 h-11 rounded-full items-center justify-center mr-3`}>
          <Icon color={colors.icon} size={22} />
        </View>
        <View className="flex-1">
          <Text className="text-gray-500 font-black text-[10px] uppercase tracking-wider" numberOfLines={2}>
            {title}
          </Text>
          <Text className={`${colors.text} text-xl font-black mt-0.5`} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text className="text-gray-500 text-[11px] mt-1" numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </View>
    </Wrapper>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { tenantId, empresa, user } = useAuthStore();
  const [data, setData] = useState<MobileDashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (refresh = false) => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const next = await fetchMobileDashboard(tenantId);
      setData(next);
    } catch (error: any) {
      Alert.alert('Dashboard', error?.message || 'No se pudieron cargar las metricas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  const faltanteMeta = Math.max(0, data.meta - data.ventasMes);
  const proyeccionOk = data.proyeccionCierre >= data.meta;
  const compromisosSemana = data.compromisosPagar + data.compromisosSuplidores;
  const cajaVsCompromisos = data.excedente - compromisosSemana;
  const nombre = empresa?.nombre || empresa?.razon_social || user?.email?.split('@')[0] || 'MotoFlow';

  const projectionLabel = useMemo(() => {
    if (data.proyeccionCierre <= 0) return 'Sin historial del mes actual';
    return proyeccionOk ? 'Vas por encima de la meta' : 'Ritmo por debajo de la meta';
  }, [data.proyeccionCierre, proyeccionOk]);

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <ActivityIndicator size="large" color="#1d4ed8" />
        <Text className="text-gray-500 font-semibold mt-3 text-center">Cargando dashboard financiero...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} />}
    >
      <View className="mb-4">
        <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Dashboard</Text>
        <Text className="text-2xl font-black text-gray-950" numberOfLines={1}>{nombre}</Text>
      </View>

      <View className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center flex-1 pr-3">
            <View className="bg-blue-50 w-11 h-11 rounded-xl items-center justify-center mr-3">
              <Target color="#1d4ed8" size={24} />
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
            {proyeccionOk ? <TrendingUp color="#059669" size={15} /> : <AlertTriangle color="#ef4444" size={15} />}
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
          icon={ArrowUpRight}
          onPress={() => router.push('/(tabs)/pos')}
        />
        <MetricCard
          title="Caja actual"
          value={money(data.cajaActual)}
          subtitle="contado + recibos - gastos"
          tone="blue"
          icon={Wallet}
        />
        <MetricCard
          title="Excedente"
          value={money(data.excedente)}
          subtitle={cajaVsCompromisos >= 0 ? 'caja cubre compromisos' : `faltan ${money(Math.abs(cajaVsCompromisos))}`}
          tone={cajaVsCompromisos >= 0 ? 'green' : 'red'}
          icon={BadgeDollarSign}
        />
        <MetricCard
          title="Gastos del dia"
          value={money(data.gastosDia)}
          subtitle="gastos registrados hoy"
          tone={data.gastosDia > 0 ? 'red' : 'slate'}
          icon={ReceiptText}
        />
        <MetricCard
          title="Compromisos a pagar"
          value={money(data.compromisosPagar)}
          subtitle={`${data.compromisoSemanaCount} pendientes al cierre semanal`}
          tone={data.compromisosPagar > 0 ? 'amber' : 'green'}
          icon={CalendarClock}
        />
        <MetricCard
          title="Compromisos suplidores"
          value={money(data.compromisosSuplidores)}
          subtitle={`${data.suplidorSemanaCount} compras a credito vencen`}
          tone={data.compromisosSuplidores > 0 ? 'amber' : 'green'}
          icon={Truck}
        />
      </View>

    </ScrollView>
  );
}
