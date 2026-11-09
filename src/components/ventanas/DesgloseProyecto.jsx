// Desglose y materiales de un proyecto de ventanas (09/11/2026).
// · Desglose: los cortes de cada ventana; se marcan los que ya se cortaron
//   (vent_medidas.cortes_hechos) hasta "Terminada".
// · Materiales: perfiles por color en pulgadas/pies/metros y cuántas barras
//   (con el plan de corte de cada barra), y los cristales en pie².
import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { desgloseVentana, materialesProyecto, pulgadasTexto } from '@/lib/ventanas';

export function DesgloseVentanas({ medidas, nombreSistema, piezasPorSistema, onMarcar }) {
  if (!medidas.length) return <div className="py-10 text-center text-sm text-gray-400">Primero agrega las medidas.</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {medidas.map((m, i) => {
        const cortes = desgloseVentana(m, piezasPorSistema[m.sistema_id] || []);
        const hechos = new Set(m.cortes_hechos || []);
        const listos = cortes.filter((c) => hechos.has(c.pieza.id)).length;
        const terminada = cortes.length > 0 && listos === cortes.length;
        return (
          <div key={m.id} className={`rounded-lg border p-3 ${terminada ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-bold text-gray-900">Ventana {i + 1}{m.cantidad > 1 ? ` (×${m.cantidad})` : ''} · {pulgadasTexto(m.ancho)}" × {pulgadasTexto(m.alto)}"</div>
                <div className="text-xs text-gray-500">{nombreSistema(m.sistema_id)} · {m.hojas} hojas{m.color ? ` · ${m.color}` : ''}{m.ubicacion ? ` · ${m.ubicacion}` : ''}</div>
              </div>
              {terminada
                ? <span className="text-xs font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Terminada</span>
                : <span className="text-xs text-gray-500">{listos}/{cortes.length}</span>}
            </div>
            {cortes.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {cortes.map((c) => (
                    <tr key={c.pieza.id} className={`border-b last:border-0 ${hechos.has(c.pieza.id) ? 'text-gray-400 line-through' : ''}`}>
                      <td className="py-1 w-6"><input type="checkbox" checked={hechos.has(c.pieza.id)} onChange={() => onMarcar(m, c.pieza.id)} /></td>
                      <td>{c.pieza.nombre}{c.pieza.tipo === 'cristal' ? ' 🔷' : ''}</td>
                      <td className="text-right font-mono whitespace-nowrap"><b>{c.cantidad}</b> × {pulgadasTexto(c.largo)}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="text-xs text-gray-400">Este sistema no tiene piezas: configúralas en Ventanas → Configuración del desglose.</div>}
          </div>
        );
      })}
    </div>
  );
}

const UNIDADES = { pies: { t: 'Pies', f: (p) => `${p.pies.toFixed(2)}'` }, metros: { t: 'Metros', f: (p) => `${p.metros.toFixed(2)} m` }, pulgadas: { t: 'Pulgadas', f: (p) => `${pulgadasTexto(p.pulgadas)}"` } };

export function MaterialesVentanas({ medidas, piezasPorSistema, cfg }) {
  const [unidad, setUnidad] = useState('pies');
  const [abierto, setAbierto] = useState(null);
  const mat = useMemo(() => materialesProyecto(medidas, piezasPorSistema, cfg || {}), [medidas, piezasPorSistema, cfg]);
  if (!medidas.length) return <div className="py-10 text-center text-sm text-gray-400">Primero agrega las medidas.</div>;
  const totalBarras = mat.perfiles.reduce((s, p) => s + p.barras, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-gray-700">Perfiles · {totalBarras} barra(s) de {mat.largoBarra / 12}'</span>
        <div className="ml-auto flex gap-1">
          {Object.entries(UNIDADES).map(([k, u]) => (
            <button key={k} type="button" onClick={() => setUnidad(k)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${unidad === k ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-gray-300'}`}>{u.t}</button>
          ))}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b">
          <th className="py-1.5" /><th>Perfil</th><th>Color</th><th className="text-center">Cortes</th><th className="text-right">Total</th><th className="text-right pr-2">Barras</th>
        </tr></thead>
        <tbody>
          {mat.perfiles.map((p) => {
            const k = `${p.perfil}|${p.color}`;
            return (
              <React.Fragment key={k}>
                <tr className="border-b cursor-pointer hover:bg-gray-50" onClick={() => setAbierto(abierto === k ? null : k)}>
                  <td className="py-1.5 w-6">{abierto === k ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                  <td className="font-semibold">{p.perfil}</td>
                  <td>{p.color || '—'}</td>
                  <td className="text-center">{p.cortes.length}</td>
                  <td className="text-right font-mono">{UNIDADES[unidad].f(p)}</td>
                  <td className="text-right pr-2 font-bold">{p.barras}</td>
                </tr>
                {abierto === k && (
                  <tr className="bg-gray-50"><td /><td colSpan={5} className="py-2">
                    {p.plan.barras.map((b, i) => (
                      <div key={i} className="text-xs font-mono py-0.5">
                        Barra {i + 1}: {b.cortes.map((c) => `${pulgadasTexto(c)}"`).join(' + ')} <span className="text-gray-500">· sobra {pulgadasTexto(b.sobrante)}"</span>
                      </div>
                    ))}
                    {p.plan.sinCaber.length > 0 && <div className="text-xs text-red-600">No caben en una barra: {p.plan.sinCaber.map((c) => `${pulgadasTexto(c)}"`).join(', ')}</div>}
                  </td></tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div>
        <div className="text-sm font-bold text-gray-700 mb-1">Cristales · {mat.totalPie2.toFixed(2)} pie²</div>
        {mat.cristales.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b"><th className="py-1.5">Ventana</th><th>Medida</th><th className="text-center">Cant.</th><th className="text-right pr-2">pie²</th></tr></thead>
            <tbody>
              {mat.cristales.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1">{pulgadasTexto(c.medida.ancho)}" × {pulgadasTexto(c.medida.alto)}"{c.medida.ubicacion ? ` · ${c.medida.ubicacion}` : ''}</td>
                  <td className="font-mono">{pulgadasTexto(c.ancho)}" × {pulgadasTexto(c.alto)}"</td>
                  <td className="text-center">{c.cantidad}</td>
                  <td className="text-right pr-2">{c.pie2.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="text-xs text-gray-400">Sin cristales.</div>}
      </div>
    </div>
  );
}
