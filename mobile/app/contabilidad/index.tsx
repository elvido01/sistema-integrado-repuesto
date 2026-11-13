// ============================================================
// Mi Contabilidad en el teléfono — ayudante contable, Fase 1 (12/11/2026)
// ------------------------------------------------------------
// Lo mismo que la web (src/pages/MiContabilidadPage.jsx) y con la misma
// RPC contab_resumen_mes: ITBIS estimado del mes, lo que le falta al mes
// y los compromisos con la DGII, que se marcan con un toque.
// Es un ESTIMADO: no sustituye la declaración.
// Fase 3 (13/11/2026): pestañas «IT-1» (hoja casilla por casilla, RPC
// contab_hoja_it1) y «Guía» (paso a paso, RPC contab_guia). El texto de la
// guía viene de la base: es el mismo de la web.
// Fase 4: pestaña «Ahorro» (RPC contab_recomendaciones): cómo pagar menos, legal.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calculator, CheckCircle2, ChevronLeft, ChevronRight, Circle, ExternalLink } from 'lucide-react-native';
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
  repetida: 'Factura repetida (mismo RNC y NCF)',
  nota: 'Notas de crédito/débito: se agregan a mano en la DGII',
  ret_isr: 'Con retención de ISR: se agregan a mano en la DGII',
};

const num = (v: any) => (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Fila = ({ cas, nombre, valor, fuerte, nota }: any) => (
  <View className={`flex-row items-start py-1.5 border-t border-gray-100 ${fuerte ? 'bg-gray-50' : ''}`}>
    <Text className="w-10 text-[11px] text-gray-400 mt-0.5">{cas}</Text>
    <View className="flex-1 pr-2">
      <Text className={`text-sm ${fuerte ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{nombre}</Text>
      {!!nota && <Text className="text-[11px] text-gray-500">{nota}</Text>}
    </View>
    <Text className={`text-sm text-gray-900 ${fuerte ? 'font-bold' : 'font-semibold'}`}>{num(valor)}</Text>
  </View>
);

const Titulo = ({ children }: any) => (
  <Text className="text-[11px] font-black text-gray-500 uppercase tracking-wider mt-3 mb-1">{children}</Text>
);

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
  const [tab, setTab] = useState<'resumen' | 'hoja' | 'ahorro' | 'guia'>('resumen');
  const [extra, setExtra] = useState<any>(null);      // hoja o guía del período
  const [cargandoExtra, setCargandoExtra] = useState(false);
  const hoy = hoyRD();

  const pedido = useRef(0); // descarta la respuesta de un mes que ya no se mira
  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    const { data: r, error } = await supabase.rpc('contab_resumen_mes', { p_anio: periodo.anio, p_mes: periodo.mes });
    if (n !== pedido.current) return;
    if (error) { Alert.alert('No se pudo cargar', error.message); setData(null); }
    else setData(r);
    setLoading(false);
    setRefrescando(false);
  }, [periodo]);

  useEffect(() => { setLoading(true); cargar(); }, [cargar]);

  // Hoja del IT-1 y guía: se piden al abrir su pestaña o cambiar de mes.
  useEffect(() => {
    if (tab === 'resumen') return;
    let vivo = true;
    setExtra(null);
    setCargandoExtra(true);
    supabase.rpc(tab === 'hoja' ? 'contab_hoja_it1' : tab === 'ahorro' ? 'contab_recomendaciones' : 'contab_guia', { p_anio: periodo.anio, p_mes: periodo.mes })
      .then(({ data: r, error }) => {
        if (!vivo) return;
        if (error) Alert.alert('No se pudo cargar', error.message);
        else setExtra({ tab, r });
        setCargandoExtra(false);
      });
    return () => { vivo = false; };
  }, [tab, periodo]);

  const sig = periodo.mes === 12 ? { anio: periodo.anio + 1, mes: 1 } : { anio: periodo.anio, mes: periodo.mes + 1 };
  const guardarSaldoSiguiente = (monto: number) => {
    Alert.alert('Guardar saldo a favor', `${MESES[sig.mes - 1]} ${sig.anio} arrancará con RD$ ${num(monto)} a favor. Hágalo después de declarar.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar', onPress: async () => {
        const { error } = await supabase.rpc('contab_guardar_saldo', { p_anio: sig.anio, p_mes: sig.mes, p_monto: monto });
        if (error) Alert.alert('No se pudo guardar', error.message);
        else { Alert.alert('Guardado', 'Saldo a favor guardado.'); cargar(); }
      } },
    ]);
  };

  const abrirPaso = (p: any) => {
    if (p.panel === 'comprobantes-gastos') router.push('/comprobantes' as any);
    else if (p.panel === 'mi-contabilidad') setTab(/IT-1|IR-17/.test(p.titulo) ? 'hoja' : 'resumen');
  };

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

      <View className="bg-white flex-row px-2 py-1.5 border-b border-gray-200">
        {([['resumen', 'Resumen'], ['hoja', 'IT-1'], ['ahorro', 'Ahorro'], ['guia', 'Guía']] as const).map(([k, t]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)}
            className={`flex-1 mx-0.5 py-2 rounded-lg items-center ${tab === k ? 'bg-blue-700' : 'bg-gray-100'}`}>
            <Text className={`text-sm font-bold ${tab === k ? 'text-white' : 'text-gray-600'}`}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab !== 'resumen' ? (
        cargandoExtra || !extra || extra.tab !== tab ? (
          <View className="flex-1 items-center justify-center">{cargandoExtra && <ActivityIndicator size="large" color="#1d4ed8" />}</View>
        ) : tab === 'hoja' ? (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
            <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
              <Text className="text-xs text-blue-900">
                Hoja de trabajo con las casillas del formulario oficial. La Oficina Virtual llena sola varias con su 606 y su 607: si un número no coincide, no envíe todavía.
                {!extra.r.cerrado ? ' El mes no ha terminado: los números van a cambiar.' : ''}
              </Text>
            </View>

            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-sm font-black text-gray-900">Anexo A · se envía primero</Text>
              <Titulo>II. Ventas por comprobante (sin impuestos)</Titulo>
              {(extra.r.anexo.ncf || []).filter((n: any) => n.cantidad > 0 || n.cas <= 2).map((n: any) => (
                <Fila key={n.cas} cas={n.cas} nombre={`${n.nombre} · ${n.cantidad}`} valor={n.monto} />
              ))}
              <Fila cas="11" nombre="Total de operaciones" valor={extra.r.anexo.c11} fuerte />
              <Titulo>III. Por forma de pago (con impuestos)</Titulo>
              <Fila cas="12" nombre="Efectivo" valor={extra.r.anexo.pago.c12} />
              <Fila cas="13" nombre="Cheque / transferencia" valor={extra.r.anexo.pago.c13} />
              <Fila cas="14" nombre="Tarjeta" valor={extra.r.anexo.pago.c14} />
              <Fila cas="15" nombre="A crédito" valor={extra.r.anexo.pago.c15} />
              {Number(extra.r.anexo.pago.c18) > 0 && <Fila cas="18" nombre="Otras formas" valor={extra.r.anexo.pago.c18} />}
              <Fila cas="19" nombre="Total por tipo de venta" valor={extra.r.anexo.c19} fuerte />
              <Titulo>IV. Por tipo de ingreso</Titulo>
              <Fila cas="20" nombre="Ingresos por operaciones" valor={extra.r.anexo.c20} />
              {Number(extra.r.anexo.retenciones_que_le_hicieron) > 0 && (
                <>
                  <Titulo>V. Retenciones que le hicieron</Titulo>
                  <Fila cas="27-31" nombre="ITBIS que le retuvieron" valor={extra.r.anexo.retenciones_que_le_hicieron}
                    nota="Tarjetas (27), una sociedad (29), el Estado (31)." />
                </>
              )}
              <Titulo>IX. ITBIS pagado deducible (del 606)</Titulo>
              <Fila cas="50" nombre="En compras locales de bienes" valor={extra.r.anexo.c50} />
              <Fila cas="51" nombre="En servicios" valor={extra.r.anexo.c51} />
              <Fila cas="56" nombre="Total ITBIS deducible" valor={extra.r.anexo.c56.total} fuerte />
            </View>

            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-sm font-black text-gray-900">Formulario IT-1</Text>
              <Titulo>II. Ingresos por operaciones</Titulo>
              <Fila cas="1" nombre="Total de operaciones" valor={extra.r.it1.c1} />
              <Fila cas="4" nombre="Ventas exentas" valor={extra.r.it1.c4} />
              <Fila cas="10" nombre="Total operaciones gravadas" valor={extra.r.it1.c10} fuerte />
              <Fila cas="11" nombre="Gravadas al 18 %" valor={extra.r.it1.c11} />
              {Number(extra.r.it1.c12) > 0 && <Fila cas="12" nombre="Gravadas al 16 %" valor={extra.r.it1.c12} />}
              <Titulo>III. Liquidación</Titulo>
              <Fila cas="16" nombre="ITBIS cobrado (18 %)" valor={extra.r.it1.c16} />
              {Number(extra.r.it1.c17) > 0 && <Fila cas="17" nombre="ITBIS cobrado (16 %)" valor={extra.r.it1.c17} />}
              <Fila cas="21" nombre="Total ITBIS cobrado" valor={extra.r.it1.c21} fuerte />
              <Fila cas="22" nombre="ITBIS en compras locales" valor={extra.r.it1.c22} />
              <Fila cas="23" nombre="ITBIS en servicios" valor={extra.r.it1.c23} />
              <Fila cas="24" nombre="ITBIS en importaciones" valor={extra.r.it1.c24} nota="MotoFlow no lo tiene." />
              <Fila cas="25" nombre="Total ITBIS deducible" valor={extra.r.it1.c25} fuerte />
              <Fila cas="26" nombre="Impuesto a pagar" valor={extra.r.it1.c26} />
              <Fila cas="27" nombre="Saldo a favor" valor={extra.r.it1.c27} />
              <Fila cas="29" nombre="Saldo a favor anterior" valor={extra.r.it1.c29} />
              <Fila cas="30" nombre="Pagos por retenciones" valor={extra.r.it1.c30} />
              <Fila cas="33" nombre="Diferencia a pagar" valor={extra.r.it1.c33} fuerte />
              <Fila cas="34" nombre="Nuevo saldo a favor" valor={extra.r.it1.c34} fuerte />
              {Number(extra.r.it1.c60) > 0 && (
                <Fila cas="60" nombre="ITBIS que usted retuvo a suplidores" valor={extra.r.it1.c60} nota="Debe cuadrar con el 606." />
              )}
              <Fila cas="68" nombre="Total general a pagar" valor={extra.r.it1.c68} fuerte nota="Sin recargos: si declara a tiempo." />
              <TouchableOpacity onPress={() => guardarSaldoSiguiente(Number(extra.r.it1.c34) || 0)}
                className="mt-3 border border-emerald-300 bg-emerald-50 rounded-lg py-2.5 px-3">
                <Text className="text-sm font-bold text-emerald-800 text-center">
                  Guardar RD$ {num(extra.r.it1.c34)} a favor para {MESES[sig.mes - 1]}
                </Text>
              </TouchableOpacity>
            </View>

            {(extra.r.ir17?.filas || []).length > 0 && (
              <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                <Text className="text-sm font-black text-gray-900">IR-17 · ISR retenido a suplidores</Text>
                <Text className="text-[11px] text-gray-500 mb-1">Día 10. Primero el Anexo R9C.</Text>
                {extra.r.ir17.filas.map((f: any) => (
                  <Fila key={`${f.rnc}-${f.ncf}`} cas={`${Number(f.pct)}%`} nombre={f.suplidor || f.rnc} nota={`${f.ncf} · sobre ${num(f.base)}`} valor={f.monto} />
                ))}
                <Fila cas="" nombre="Total a pagar en el IR-17" valor={extra.r.ir17.total_isr} fuerte />
              </View>
            )}

            {(extra.r.avisos || []).length > 0 && (
              <View className="bg-white border border-amber-200 rounded-xl p-4">
                <Text className="text-[11px] font-black text-amber-700 uppercase tracking-wider mb-1">Antes de enviar</Text>
                {extra.r.avisos.map((x: string) => <Text key={x} className="text-xs text-gray-700 mb-1.5">• {x}</Text>)}
              </View>
            )}
          </ScrollView>
        ) : tab === 'ahorro' ? (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Lo que puede dejar de pagar</Text>
              {Number(extra.r.ahorro_seguro) > 0 ? (
                <>
                  <Text className="text-3xl font-black text-emerald-700 mt-1">{fmt(extra.r.ahorro_seguro)}</Text>
                  <Text className="text-xs font-bold text-emerald-700">de ITBIS que ya pagó y no está restando</Text>
                </>
              ) : (
                <Text className="text-base font-bold text-gray-800 mt-1">
                  {extra.r.exenta ? 'Sus ingresos son exentos de ITBIS: el ahorro está en la renta, documentando cada gasto.' : 'Este mes está aprovechando todo el ITBIS de sus compras registradas.'}
                </Text>
              )}
              <Text className="text-[11px] text-gray-500 mt-2">
                {Number(extra.r.ahorro_posible) > 0 ? `Y hasta ${fmt(extra.r.ahorro_posible)} más por confirmar. ` : ''}
                {Number(extra.r.anio_perdido) > 0 && !extra.r.exenta ? `En lo que va de ${periodo.anio}: ${fmt(extra.r.anio_perdido)} de ITBIS que no entró al 606. ` : ''}
                Todo dentro de la ley: pedir y guardar bien los comprobantes.
              </Text>
            </View>
            {(extra.r.items || []).map((x: any) => {
              const color = x.tipo === 'ahorro' ? 'text-emerald-700' : x.tipo === 'riesgo' ? 'text-red-700' : 'text-gray-500';
              const borde = x.tipo === 'ahorro' ? 'border-emerald-200' : x.tipo === 'riesgo' ? 'border-red-200' : 'border-gray-200';
              return (
                <View key={x.clave} className={`bg-white border ${borde} rounded-xl p-4 mb-3`}>
                  <Text className={`text-[11px] font-black uppercase tracking-wider ${color}`}>
                    {x.tipo === 'ahorro' ? 'Ahorro' : x.tipo === 'riesgo' ? 'Riesgo' : 'Para tener en cuenta'}
                  </Text>
                  <Text className="text-sm font-bold text-gray-900 mt-0.5">{x.titulo}</Text>
                  {x.ahorro != null && (
                    <Text className="text-lg font-black text-emerald-700 mt-1">
                      {fmt(x.ahorro)}<Text className="text-[11px] font-normal text-gray-500"> {x.estimado ? 'tope estimado' : 'de ITBIS'}</Text>
                    </Text>
                  )}
                  <Text className="text-sm text-gray-700 mt-2">{x.detalle}</Text>
                  <Text className="text-sm text-gray-900 mt-2"><Text className="font-bold">Qué hacer: </Text>{x.que_hacer}</Text>
                  {!!x.base && <Text className="text-[11px] text-gray-500 mt-2">Base: {x.base}</Text>}
                  {(x.panel === 'comprobantes-gastos' || x.panel === 'mi-contabilidad') && (
                    <TouchableOpacity onPress={() => (x.panel === 'comprobantes-gastos' ? router.push('/comprobantes' as any) : setTab('resumen'))}
                      className="mt-3 border border-blue-200 bg-blue-50 rounded-lg py-2">
                      <Text className="text-sm font-bold text-blue-800 text-center">
                        {x.panel === 'comprobantes-gastos' ? 'Abrir Comprobantes de gastos' : 'Ver el Resumen'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            <View className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <Text className="text-xs text-amber-900">
                Salen de lo registrado en MotoFlow y son una orientación. Antes de una decisión grande, confírmela con un contador.
              </Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
            <View className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
              <Text className="text-sm font-black text-gray-900">Qué hacer para estar al día con la DGII</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {extra.r.contribuyente}{extra.r.rnc ? ` · ${extra.r.rnc}` : ''}{extra.r.nomina ? ' · con nómina' : ''}. Fechas del mes escogido.
              </Text>
            </View>
            {(extra.r.pasos || []).map((p: any) => (
              <View key={p.n} className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                <View className="flex-row items-start">
                  <View className="w-7 h-7 rounded-full bg-blue-700 items-center justify-center mr-2.5">
                    <Text className="text-white text-xs font-black">{p.n}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-900">{p.titulo}</Text>
                    <Text className="text-xs font-semibold text-blue-800">{p.cuando}</Text>
                  </View>
                </View>
                {(p.pasos || []).map((x: string, i: number) => (
                  <Text key={x} className="text-sm text-gray-700 mt-2">{i + 1}. {x}</Text>
                ))}
                {(p.panel === 'comprobantes-gastos' || p.panel === 'mi-contabilidad') && (
                  <TouchableOpacity onPress={() => abrirPaso(p)} className="mt-3 border border-blue-200 bg-blue-50 rounded-lg py-2">
                    <Text className="text-sm font-bold text-blue-800 text-center">
                      {p.panel === 'comprobantes-gastos' ? 'Abrir Comprobantes de gastos' : /IT-1|IR-17/.test(p.titulo) ? 'Ver la Hoja del IT-1' : 'Ver el Resumen'}
                    </Text>
                  </TouchableOpacity>
                )}
                {p.panel === 'reportes-dgii' && (
                  <Text className="text-[11px] text-gray-500 mt-2">Los TXT se bajan desde la página web (Reportes DGII).</Text>
                )}
              </View>
            ))}
            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Plantillas y páginas oficiales</Text>
              {(extra.r.plantillas || []).map((l: any) => (
                <TouchableOpacity key={l.url} onPress={() => Linking.openURL(l.url).catch(() => Alert.alert('No se pudo abrir el enlace'))}
                  className="flex-row items-start py-2.5 border-t border-gray-100">
                  <ExternalLink color="#9ca3af" size={16} />
                  <View className="flex-1 ml-2">
                    <Text className="text-sm font-semibold text-blue-800">{l.nombre}</Text>
                    <Text className="text-xs text-gray-500">{l.detalle}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {(extra.r.notas || []).length > 0 && (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                {extra.r.notas.map((x: string) => <Text key={x} className="text-xs text-amber-900 mb-1">• {x}</Text>)}
              </View>
            )}
          </ScrollView>
        )
      ) : loading ? (
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
            {Number(it.retenido_a_suplidores) > 0 && (
              <Text className="text-xs text-amber-800 mt-2">
                En el mismo IT-1 paga además el ITBIS que le retuvo a suplidores: {fmt(it.retenido_a_suplidores)}. Total: {fmt(it.total_a_pagar)}.
              </Text>
            )}
            {Number(compras.isr_retenido_a_suplidores) > 0 && (
              <Text className="text-xs text-amber-800 mt-1">
                Aparte, por el IR-17 (día 10): ISR retenido {fmt(compras.isr_retenido_a_suplidores)}.
              </Text>
            )}
            <Text className="text-[11px] text-gray-500 mt-2">
              {data.cerrado ? 'Mes cerrado.' : 'El mes no ha terminado: el número cambia con cada venta y compra.'} Es un estimado. El detalle casilla por casilla está en la pestaña IT-1.
            </Text>
          </View>

          {/* Lo que le falta */}
          {(compras.fuera > 0 || ventas.sin_ncf > 0 || gastos.cantidad > 0) && (
            <View className="bg-white border border-amber-200 rounded-xl p-4 mb-3">
              <Text className="text-[11px] font-black text-amber-700 uppercase tracking-wider mb-1">Lo que le falta al mes</Text>
              {compras.fuera > 0 && (
                <View className="mb-2">
                  <Text className="text-sm font-bold text-red-700">
                    {compras.fuera} compra(s) no salen en el TXT del 606{Number(compras.itbis_perdido) > 0 ? `: se pierden ${fmt(compras.itbis_perdido)} de ITBIS` : ''}.
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
