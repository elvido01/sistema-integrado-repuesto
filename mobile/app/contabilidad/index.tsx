// ============================================================
// Mi Contabilidad en el teléfono — ayudante contable, Fase 1 (12/11/2026)
// ------------------------------------------------------------
// Lo mismo que la web (src/pages/MiContabilidadPage.jsx) y con la misma
// RPC contab_resumen_mes: ITBIS estimado del mes, lo que le falta al mes
// y los compromisos con la DGII, que se marcan con un toque.
// Es un ESTIMADO: no sustituye la declaración.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calculator, CheckCircle2, ChevronLeft, ChevronRight, Circle } from 'lucide-react-native';
import { supabase } from '@/src/supabase/client';
import { hoyRD } from '@/src/lib/seguimientos';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (v: any) => `RD$ ${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fdate = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

const MOTIVOS: Record<string, string> = {
  sin_ncf: 'Compras sin NCF',
  ncf_mal: 'NCF mal escrito',
  consumo: 'Facturas de consumo (no dan crédito)',
  tipo: 'Comprobante que no va en el 606',
  rnc: 'Suplidor sin RNC o cédula válido',
  rnc_empresa: 'Falta el RNC de su empresa',
};

export default function ContabilidadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Por defecto el mes pasado: es el que se está declarando.
  const [periodo, setPeriodo] = useState(() => {
    const [y, m] = hoyRD().split('-').map(Number);
    return m === 1 ? { anio: y - 1, mes: 12 } : { anio: y, mes: m - 1 };
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const hoy = hoyRD();

  const cargar = useCallback(async () => {
    const { data: r, error } = await supabase.rpc('contab_resumen_mes', { p_anio: periodo.anio, p_mes: periodo.mes });
    if (error) { Alert.alert('No se pudo cargar', error.message); setData(null); }
    else setData(r);
    setLoading(false);
    setRefrescando(false);
  }, [periodo]);

  useEffect(() => { setLoading(true); cargar(); }, [cargar]);

  const mover = (d: number) => setPeriodo((p) => {
    const n = p.mes + d;
    if (n < 1) return { anio: p.anio - 1, mes: 12 };
    if (n > 12) return { anio: p.anio + 1, mes: 1 };
    return { anio: p.anio, mes: n };
  });

  const marcar = async (c: any) => {
    setOcupado(true);
    const { error } = await supabase.rpc('contab_marcar', { p_clave: c.clave, p_periodo: c.periodo, p_hecho: !c.hecho });
    setOcupado(false);
    if (error) { Alert.alert('No se pudo marcar', error.message); return; }
    cargar();
  };

  const it = data?.itbis;
  const compras = data?.compras;
  const ventas = data?.ventas;
  const gastos = data?.gastos_sin_comprobante;

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2">
          <ArrowLeft color="#111827" size={24} />
        </TouchableOpacity>
        <Calculator color="#1d4ed8" size={22} />
        <Text className="text-lg font-bold text-gray-900 ml-2 flex-1">Mi Contabilidad</Text>
      </View>

      <View className="bg-white flex-row items-center justify-between px-3 py-2 border-b border-gray-200">
        <TouchableOpacity onPress={() => mover(-1)} className="p-2"><ChevronLeft color="#374151" size={22} /></TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">{MESES[periodo.mes - 1]} {periodo.anio}</Text>
        <TouchableOpacity onPress={() => mover(1)} className="p-2"><ChevronRight color="#374151" size={22} /></TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#1d4ed8" /></View>
      ) : !data ? null : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
        >
          {/* ITBIS estimado */}
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <Text className="text-[11px] font-black text-gray-500 uppercase tracking-wider">ITBIS estimado del mes</Text>
            {it.a_pagar > 0 ? (
              <Text className="text-3xl font-black text-red-700 mt-1">{fmt(it.a_pagar)}<Text className="text-sm font-bold"> a pagar</Text></Text>
            ) : (
              <Text className="text-3xl font-black text-emerald-700 mt-1">{fmt(it.saldo_a_favor)}<Text className="text-sm font-bold"> a favor</Text></Text>
            )}
            <View className="mt-3 border-t border-gray-100 pt-2">
              {[
                [`ITBIS de las ventas (${ventas.con_ncf})`, it.ventas],
                [`− ITBIS de compras en el 606 (${compras.en_606})`, it.adelantado],
                ['− ITBIS que le retuvieron', it.retenido_por_clientes],
                ['− Saldo a favor anterior', it.saldo_favor_anterior],
              ].map(([l, v]) => (
                <View key={String(l)} className="flex-row justify-between py-1">
                  <Text className="text-sm text-gray-700 flex-1 pr-2">{l}</Text>
                  <Text className="text-sm font-semibold text-gray-900">{fmt(v)}</Text>
                </View>
              ))}
            </View>
            <Text className="text-[11px] text-gray-500 mt-2">
              {data.cerrado ? 'Mes cerrado.' : 'El mes no ha terminado: el número cambia con cada venta y compra.'} Es un estimado; el saldo a favor se escribe en la página web.
            </Text>
          </View>

          {/* Lo que le falta */}
          {(compras.fuera > 0 || ventas.sin_ncf > 0 || gastos.cantidad > 0) && (
            <View className="bg-white border border-amber-200 rounded-xl p-4 mb-3">
              <Text className="text-[11px] font-black text-amber-700 uppercase tracking-wider mb-1">Lo que le falta al mes</Text>
              {compras.fuera > 0 && (
                <View className="mb-2">
                  <Text className="text-sm font-bold text-red-700">
                    {compras.fuera} compra(s) no entran al 606: se pierden {fmt(compras.itbis_perdido)} de ITBIS.
                  </Text>
                  {(compras.motivos || []).map((m: any) => (
                    <Text key={m.motivo} className="text-xs text-gray-700 mt-0.5">
                      • {MOTIVOS[m.motivo] || m.motivo}: {m.cantidad} · ITBIS {fmt(m.itbis)}
                    </Text>
                  ))}
                </View>
              )}
              {ventas.sin_ncf > 0 && (
                <Text className="text-sm text-gray-800 mb-1">
                  {ventas.sin_ncf} venta(s) sin comprobante por {fmt(ventas.sin_ncf_total)}: no salen en el 607.
                </Text>
              )}
              {gastos.cantidad > 0 && (
                <Text className="text-sm text-gray-800">
                  {gastos.cantidad} gasto(s) por {fmt(gastos.monto)} sin comprobante: no entran al 606.
                </Text>
              )}
            </View>
          )}

          {/* Compromisos */}
          <View className="bg-white border border-gray-200 rounded-xl p-4">
            <Text className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Compromisos con la DGII</Text>
            {(data.compromisos || []).map((c: any) => {
              const vencido = !c.hecho && c.vence < hoy;
              return (
                <TouchableOpacity key={`${c.clave}-${c.periodo}`} disabled={ocupado} onPress={() => marcar(c)}
                  className="flex-row items-start py-2.5 border-t border-gray-100">
                  {c.hecho ? <CheckCircle2 color="#059669" size={22} /> : <Circle color="#d1d5db" size={22} />}
                  <View className="flex-1 ml-2.5">
                    <Text className={`text-sm font-semibold ${c.hecho ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{c.nombre}</Text>
                    <Text className={`text-xs mt-0.5 ${c.hecho ? 'text-gray-400' : vencido ? 'text-red-700 font-bold' : 'text-gray-600'}`}>
                      {c.hecho ? 'Presentado' : `${vencido ? 'VENCIDO · ' : 'Vence el '}${fdate(c.vence)}${c.confirmar ? ' (por confirmar)' : ''}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text className="text-[11px] text-gray-500 mt-2">Toca un compromiso para marcarlo como presentado.</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
