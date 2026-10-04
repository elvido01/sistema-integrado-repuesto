import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { nombreCanal, emojiCanal } from '@/lib/canalesOrigen';
import { codigoDeRed, fechaCorta, lineaCodigo } from '../../../supabase/functions/_shared/codigoPromo.mjs';
import { Copy, Gift, RefreshCw } from 'lucide-react';

// QUÉ VENDIÓ CADA PROMOCIÓN — el código de descuento y lo que trajo.
//
// (04/10/2026) Cada promoción nace con un número (101, 102...) y cada red lo
// lleva con su letra: T TikTok, I Instagram, F Facebook, Y YouTube, W estado
// de WhatsApp. En caja se teclea donde los códigos de pieza, da 5% en la pieza
// promocionada y deja la factura marcada con la red. Es la única forma de
// saber si las redes venden: hasta hoy todo salía "tienda".
//
// Facebook, Instagram y YouTube llevan el código en el texto (lo pega el
// publicador). TikTok llega a la bandeja SIN texto y el estado de WhatsApp se
// sube a mano: por eso aquí está el botón de copiar.

const dinero = (n) => `RD$${Math.round(Number(n) || 0).toLocaleString('es-DO')}`;
const A_MANO = ['tiktok', 'whatsapp'];

export function CodigosDePromocion() {
  const { toast } = useToast();
  const [promos, setPromos] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    supabase.rpc('equipo_promos_resultados', { p_dias: 60 }).then(({ data, error }) => {
      setCargando(false);
      if (!error) setPromos(Array.isArray(data) ? data : []);
    });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const copiar = async (red, p) => {
    const codigo = codigoDeRed(red, p.numero);
    const texto = lineaCodigo({ codigo, pct: p.pct, vence_at: p.vence_at });
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: `Copiado para ${nombreCanal(red)}`, description: texto });
    } catch {
      toast({ title: `Escríbelo en ${nombreCanal(red)}`, description: texto });
    }
  };

  // Lo que trajo cada red, sumando todas las promociones.
  const porRed = {};
  for (const p of promos) {
    for (const [canal, v] of Object.entries(p.por_canal || {})) {
      porRed[canal] = porRed[canal] || { facturas: 0, vendido: 0, descuento: 0 };
      porRed[canal].facturas += Number(v.facturas) || 0;
      porRed[canal].vendido += Number(v.vendido) || 0;
      porRed[canal].descuento += Number(v.descuento) || 0;
    }
  }
  const redes = Object.entries(porRed).sort((a, b) => b[1].vendido - a[1].vendido);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Gift className="h-4 w-4 text-emerald-600" />
          Qué vendió cada promoción
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Cada promoción trae un código con 5% de descuento por 7 días (T = TikTok, I = Instagram,
          F = Facebook, Y = YouTube, W = estado de WhatsApp). Se teclea en caja donde los códigos de pieza.
        </p>
        <button type="button" onClick={cargar} disabled={cargando}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {redes.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {redes.map(([canal, v]) => (
            <span key={canal} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900"
              title={`Descuento dado: ${dinero(v.descuento)}`}>
              {emojiCanal(canal)} <b>{nombreCanal(canal)}</b>: {v.facturas} {v.facturas === 1 ? 'venta' : 'ventas'} · {dinero(v.vendido)}
            </span>
          ))}
        </div>
      )}

      {!cargando && promos.length === 0 && (
        <p className="py-2 text-center text-[11px] text-slate-400">
          Todavía no hay promociones con código. La próxima que publiques ya lo trae.
        </p>
      )}

      <div>
        {promos.map((p) => {
          const aMano = (p.redes || []).filter((r) => A_MANO.includes(r));
          // El estado de WhatsApp se sube a mano casi siempre: se ofrece aunque
          // la promoción no lo tenga como destino.
          if (p.vigente && !aMano.includes('whatsapp')) aMano.push('whatsapp');
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-1.5 last:border-0">
              <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                p.vigente ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
                title={p.vigente ? `Vale hasta el ${fechaCorta(p.vence_at)}` : `Venció el ${fechaCorta(p.vence_at)}`}>
                {p.numero}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-slate-800" title={p.descripcion}>{p.descripcion}</p>
                <p className="text-[10px] text-slate-500">
                  {(p.redes || []).map((r) => codigoDeRed(r, p.numero)).filter(Boolean).join(' · ')}
                  {' · '}{p.vigente ? `vale hasta el ${fechaCorta(p.vence_at)}` : `venció el ${fechaCorta(p.vence_at)}`}
                </p>
              </div>
              <span className={`text-[11px] font-semibold ${Number(p.facturas) > 0 ? 'text-emerald-700' : 'text-slate-400'}`}
                title={`Descuento dado: ${dinero(p.descuento)}`}>
                {Number(p.facturas) > 0
                  ? `${p.facturas} ${Number(p.facturas) === 1 ? 'venta' : 'ventas'} · ${dinero(p.vendido)}`
                  : 'Sin ventas con código'}
              </span>
              {p.vigente && aMano.map((r) => (
                <button key={r} type="button" onClick={() => copiar(r, p)}
                  title={`Copia el texto del código para ${nombreCanal(r)}`}
                  className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                  <Copy className="h-3 w-3" /> {codigoDeRed(r, p.numero)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
