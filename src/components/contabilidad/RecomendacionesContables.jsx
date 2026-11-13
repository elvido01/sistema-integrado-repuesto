// ============================================================
// Pague menos — ayudante contable, Fase 4 (13/11/2026)
// ------------------------------------------------------------
// El asesor del mes: qué puede hacer la empresa para pagar menos impuestos
// dentro de la ley, con el monto de cada cosa. Sale de la RPC
// contab_recomendaciones (sql/ayudante_contable_fase4.sql), que mira las
// compras, gastos y ventas del mes. La app usa la misma.
// No sustituye a un contador: los artículos citados son una referencia.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Loader2, PiggyBank, AlertTriangle, MessageCircleQuestion, ArrowRight } from 'lucide-react';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (v) => `RD$ ${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;

const ESTILO = {
  ahorro: { borde: 'border-emerald-200', icono: PiggyBank, color: 'text-emerald-700', etiqueta: 'Ahorro' },
  riesgo: { borde: 'border-rose-200', icono: AlertTriangle, color: 'text-rose-700', etiqueta: 'Riesgo' },
  evaluar: { borde: 'border-slate-200', icono: MessageCircleQuestion, color: 'text-slate-600', etiqueta: 'Para tener en cuenta' },
};
const BOTON = {
  'reportes-dgii': 'Abrir Reportes DGII', 'comprobantes-gastos': 'Abrir Comprobantes de gastos', 'mi-contabilidad': 'Ver el Resumen',
};

const RecomendacionesContables = ({ periodo, onVerPestana }) => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const pedido = useRef(0); // descarta la respuesta de un mes que ya no se mira

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setLoading(true);
    const { data: r, error } = await supabase.rpc('contab_recomendaciones', { p_anio: periodo.anio, p_mes: periodo.mes });
    if (n !== pedido.current) return;
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudieron cargar las recomendaciones', description: error.message });
      setData(null);
    } else setData(r);
    setLoading(false);
  }, [periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return <div className="bg-white rounded-lg border p-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;
  if (!data) return null;

  const seguro = Number(data.ahorro_seguro) || 0;
  const posible = Number(data.ahorro_posible) || 0;
  const ir = (panel) => (panel === 'mi-contabilidad' ? onVerPestana?.('resumen') : openPanel(panel));

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-xs font-bold uppercase text-slate-500">Lo que puede dejar de pagar en {MESES[periodo.mes - 1]} {periodo.anio}</div>
        {seguro > 0 ? (
          <div className="text-3xl font-black text-emerald-700">{fmt(seguro)} <span className="text-sm font-bold">de ITBIS que ya pagó y no está restando</span></div>
        ) : (
          <div className="text-lg font-extrabold text-slate-700">
            {data.exenta ? 'Sus ingresos son exentos de ITBIS: aquí el ahorro está en la renta, documentando cada gasto.' : 'Este mes está aprovechando todo el ITBIS de sus compras registradas.'}
          </div>
        )}
        <div className="text-xs text-slate-500 mt-1">
          {posible > 0 && <>Y hasta {fmt(posible)} más por confirmar (gastos sin comprobante y saldo a favor). </>}
          {Number(data.anio_perdido) > 0 && !data.exenta && <>En lo que va de {periodo.anio}: <b>{fmt(data.anio_perdido)}</b> de ITBIS pagado en compras que no entraron al 606. </>}
          Todo dentro de la ley: se trata de pedir y guardar bien los comprobantes.
        </div>
      </div>

      {(data.items || []).map((x) => {
        const e = ESTILO[x.tipo] || ESTILO.evaluar;
        const Icono = e.icono;
        return (
          <div key={x.clave} className={`bg-white rounded-lg border ${e.borde} shadow-sm p-4`}>
            <div className="flex flex-wrap items-start gap-3">
              <Icono className={`w-5 h-5 shrink-0 mt-0.5 ${e.color}`} />
              <div className="flex-1 min-w-[220px]">
                <div className={`text-[11px] font-black uppercase ${e.color}`}>{e.etiqueta}</div>
                <div className="text-sm font-extrabold text-slate-800">{x.titulo}</div>
              </div>
              {x.ahorro != null && (
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-700 tabular-nums">{fmt(x.ahorro)}</div>
                  <div className="text-[11px] text-slate-500">{x.estimado ? 'tope estimado' : 'de ITBIS'}</div>
                </div>
              )}
            </div>
            <div className="mt-2 text-sm text-slate-700">{x.detalle}</div>
            <div className="mt-2 text-sm text-slate-800"><b>Qué hacer:</b> {x.que_hacer}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {x.base && <div className="text-[11px] text-slate-500 mr-auto">Base: {x.base}</div>}
              {x.panel && BOTON[x.panel] && (
                <Button size="sm" variant="outline" className="h-7 ml-auto" onClick={() => ir(x.panel)}>
                  {BOTON[x.panel]}<ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              )}
            </div>
          </div>
        );
      })}

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Estas recomendaciones salen de lo registrado en MotoFlow y son una orientación. Los artículos citados son una referencia: antes de una decisión grande, confírmela con un contador.
      </div>
    </div>
  );
};

export default RecomendacionesContables;
