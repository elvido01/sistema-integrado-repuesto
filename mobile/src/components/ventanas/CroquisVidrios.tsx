// Croquis de vidrios en la app (09/11/2026): pedido de vidrio (iguales
// juntos) para compartir por WhatsApp y cada ventana dibujada con el vidrio
// de sus hojas. Misma lógica que la web (lib/ventanas croquisVidrios).
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Share, Alert } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { Share2 } from 'lucide-react-native';
import { croquisVidrios, pedidoVidrioTexto, pulgadasTexto } from '@/src/lib/ventanas';

function Dibujo({ m, vidrio }: { m: any; vidrio: any }) {
  const ancho = 280; const alto = 180; const pad = 24;
  const W = Number(m.ancho) || 1; const H = Number(m.alto) || 1;
  const k = Math.min((ancho - pad * 2) / W, (alto - pad * 2) / H);
  const w = W * k; const h = H * k;
  const x0 = (ancho - w) / 2 + 6; const y0 = (alto - h) / 2 + 6;
  const hojas = Math.max(1, Number(m.hojas) || 1);
  const ah = w / hojas;
  const mg = Math.min(7, ah * 0.12, h * 0.1);
  const fs = Math.max(8, Math.min(12, ah / 7));
  return (
    <Svg width="100%" height={alto + 12} viewBox={`0 0 ${ancho + 12} ${alto + 12}`}>
      <Rect x={x0} y={y0} width={w} height={h} fill="#fff" stroke="#16325c" strokeWidth={3} />
      {Array.from({ length: hojas }).map((_, i) => {
        const hx = x0 + i * ah;
        return (
          <React.Fragment key={i}>
            <Rect x={hx + mg} y={y0 + mg} width={ah - mg * 2} height={h - mg * 2} fill="#dbeafe" stroke="#60a5fa" strokeWidth={1} />
            {i > 0 ? <Line x1={hx} y1={y0} x2={hx} y2={y0 + h} stroke="#16325c" strokeWidth={2} /> : null}
            {vidrio ? (
              <>
                <SvgText x={hx + ah / 2} y={y0 + h / 2 - 2} fontSize={fs} fontWeight="bold" fill="#1e3a8a" textAnchor="middle">{`${pulgadasTexto(vidrio.ancho)}"`}</SvgText>
                <SvgText x={hx + ah / 2} y={y0 + h / 2 + fs} fontSize={fs} fill="#1e3a8a" textAnchor="middle">{`× ${pulgadasTexto(vidrio.alto)}"`}</SvgText>
              </>
            ) : null}
          </React.Fragment>
        );
      })}
      <SvgText x={x0 + w / 2} y={y0 - 7} fontSize={11} fill="#374151" textAnchor="middle">{`${pulgadasTexto(W)}"`}</SvgText>
      <SvgText x={x0 - 7} y={y0 + h / 2} fontSize={11} fill="#374151" textAnchor="middle" rotation={-90} originX={x0 - 7} originY={y0 + h / 2}>{`${pulgadasTexto(H)}"`}</SvgText>
    </Svg>
  );
}

export default function CroquisVidrios({ proyecto, medidas, piezasPorSistema, nombreSistema, empresaNombre }: {
  proyecto: any; medidas: any[]; piezasPorSistema: Record<string, any[]>; nombreSistema: (id: string) => string; empresaNombre?: string;
}) {
  const [tipoVidrio, setTipoVidrio] = useState('');
  const cq = useMemo(() => croquisVidrios(medidas, piezasPorSistema), [medidas, piezasPorSistema]);
  if (!medidas.length) return <Text className="text-center text-gray-400 py-10">Primero agrega las medidas.</Text>;

  const compartir = async () => {
    try {
      await Share.share({ message: pedidoVidrioTexto({ empresa: empresaNombre, proyecto, croquis: cq, tipoVidrio: tipoVidrio.trim() }) });
    } catch (e: any) {
      Alert.alert('No se pudo compartir', e?.message || '');
    }
  };

  return (
    <View>
      <View className="bg-blue-50 border border-blue-200 rounded-2xl p-3 mb-3">
        <Text className="font-bold text-gray-900">Pedido de vidrio · {cq.totalPiezas} pieza(s) · {cq.totalPie2.toFixed(2)} pie²</Text>
        {cq.pedido.length ? cq.pedido.map((g: any) => (
          <View key={`${g.ancho}x${g.alto}`} className="flex-row items-center border-b border-blue-100 py-1.5">
            <Text className="font-black w-8 text-center">{g.cantidad}</Text>
            <Text className="flex-1 font-semibold">{pulgadasTexto(g.ancho)}" × {pulgadasTexto(g.alto)}"</Text>
            <Text className="text-xs text-gray-500">{g.pie2.toFixed(2)} pie² · {g.ventanas.map((x: number) => `V${x}`).join(', ')}</Text>
          </View>
        )) : <Text className="text-sm text-gray-500 mt-1">Estos sistemas no tienen piezas de cristal en el desglose.</Text>}
        <TextInput className="border border-gray-300 rounded-xl px-3 py-2.5 bg-white mt-3" placeholder="Vidrio (ej. claro 5 mm)" value={tipoVidrio} onChangeText={setTipoVidrio} />
        <TouchableOpacity onPress={compartir} disabled={!cq.pedido.length}
          className={`flex-row items-center justify-center rounded-xl py-3 mt-2 ${cq.pedido.length ? 'bg-emerald-600' : 'bg-gray-300'}`}>
          <Share2 color="#fff" size={18} /><Text className="text-white font-bold ml-2">Compartir pedido (WhatsApp)</Text>
        </TouchableOpacity>
      </View>

      {cq.ventanas.map(({ n, medida: m, vidrio }: any) => (
        <View key={m.id || n} className="bg-white border border-gray-200 rounded-2xl p-3 mb-3 items-center">
          <Text className="font-bold text-gray-900">Ventana {n}{m.cantidad > 1 ? ` (×${m.cantidad})` : ''} · {pulgadasTexto(m.ancho)}" × {pulgadasTexto(m.alto)}"</Text>
          <Text className="text-xs text-gray-500">{nombreSistema(m.sistema_id)} · {m.hojas} hojas{m.ubicacion ? ` · ${m.ubicacion}` : ''}</Text>
          <Dibujo m={m} vidrio={vidrio} />
          <Text className="text-xs">{vidrio ? `${vidrio.cantidad} vidrio(s) de ${pulgadasTexto(vidrio.ancho)}" × ${pulgadasTexto(vidrio.alto)}"` : 'Sin medida de vidrio'}</Text>
        </View>
      ))}
    </View>
  );
}
