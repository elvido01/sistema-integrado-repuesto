// Croquis de vidrios de un proyecto (09/11/2026, como "Croquis" de Desglo):
// cada ventana dibujada con el vidrio de sus hojas y el pedido de vidrio
// (iguales juntos) para mandar a cortar: imprimir/PDF o copiar para WhatsApp.
import React, { useMemo, useState } from 'react';
import { Copy, Printer, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { croquisVidrios, pedidoVidrioTexto, pulgadasTexto } from '@/lib/ventanas';
import { croquisSVG } from '@/lib/printVentanas';

export default function CroquisVidrios({ proyecto, medidas, nombreSistema, piezasPorSistema, empresaNombre, onImprimir, imprimiendo, onAviso }) {
  const [tipoVidrio, setTipoVidrio] = useState('');
  const cq = useMemo(() => croquisVidrios(medidas, piezasPorSistema), [medidas, piezasPorSistema]);
  if (!medidas.length) return <div className="py-10 text-center text-sm text-gray-400">Primero agrega las medidas.</div>;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(pedidoVidrioTexto({ empresa: empresaNombre, proyecto, croquis: cq, tipoVidrio: tipoVidrio.trim() }));
      onAviso?.('Pedido copiado', 'Pégalo en WhatsApp para el que corta el vidrio.');
    } catch {
      onAviso?.('No se pudo copiar', 'Tu navegador no dejó copiar.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="font-bold text-gray-900">Pedido de vidrio · {cq.totalPiezas} pieza(s) · {cq.totalPie2.toFixed(2)} pie²</div>
          <input className="ml-auto h-8 w-56 rounded-md border border-gray-300 px-2 text-sm bg-white" placeholder="Vidrio (ej. claro 5 mm)"
            value={tipoVidrio} onChange={(e) => setTipoVidrio(e.target.value)} />
          <Button size="sm" variant="outline" onClick={copiar} disabled={!cq.pedido.length}><Copy className="w-4 h-4 mr-1" /> Copiar para WhatsApp</Button>
          <Button size="sm" variant="outline" onClick={() => onImprimir(tipoVidrio.trim())} disabled={imprimiendo}>
            {imprimiendo ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />} Imprimir croquis
          </Button>
        </div>
        {cq.pedido.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b"><th className="py-1 text-center">Cant.</th><th>Medida (ancho × alto)</th><th className="text-right">pie²</th><th className="pl-3">Ventanas</th></tr></thead>
            <tbody>
              {cq.pedido.map((g) => (
                <tr key={`${g.ancho}x${g.alto}`} className="border-b border-blue-100">
                  <td className="py-1 text-center font-bold">{g.cantidad}</td>
                  <td className="font-mono font-semibold">{pulgadasTexto(g.ancho)}" × {pulgadasTexto(g.alto)}"</td>
                  <td className="text-right font-mono">{g.pie2.toFixed(2)}</td>
                  <td className="pl-3 text-gray-600">{g.ventanas.map((x) => `V${x}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="text-sm text-gray-500">Los sistemas de estas ventanas no tienen piezas de cristal en Configuración del desglose.</div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cq.ventanas.map(({ n, medida: m, vidrio }) => (
          <div key={m.id || n} className="rounded-lg border border-gray-200 bg-white p-2 text-center">
            <div className="font-bold text-gray-900 text-sm">Ventana {n}{m.cantidad > 1 ? ` (×${m.cantidad})` : ''} · {pulgadasTexto(m.ancho)}" × {pulgadasTexto(m.alto)}"</div>
            <div className="text-[11px] text-gray-500">{nombreSistema(m.sistema_id)} · {m.hojas} hojas{m.ubicacion ? ` · ${m.ubicacion}` : ''}</div>
            {/* SVG armado aquí mismo con números y texto escapado (croquisSVG). */}
            <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: croquisSVG(m, vidrio) }} />
            <div className="text-xs">
              {vidrio ? <><b>{vidrio.cantidad}</b> vidrio(s) de <b>{pulgadasTexto(vidrio.ancho)}" × {pulgadasTexto(vidrio.alto)}"</b></> : <span className="text-gray-400">Sin medida de vidrio</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
