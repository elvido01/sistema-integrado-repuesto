// ============================================================
// Guía paso a paso — ayudante contable, Fase 3 (13/11/2026)
// ------------------------------------------------------------
// Qué hacer cada mes para tener la empresa al día en la DGII, en orden y
// con la fecha de cada paso. El texto viene de la RPC contab_guia
// (sql/ayudante_contable_fase3.sql), que lo arma según la empresa; la app
// usa la misma, así que un cambio allá llega a los dos lados.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Download, ArrowRight } from 'lucide-react';

const GuiaContable = ({ periodo, onVerPestana }) => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const pedido = useRef(0); // descarta la respuesta de un mes que ya no se mira

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setLoading(true);
    const { data: r, error } = await supabase.rpc('contab_guia', { p_anio: periodo.anio, p_mes: periodo.mes });
    if (n !== pedido.current) return;
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la guía', description: error.message });
      setData(null);
    } else setData(r);
    setLoading(false);
  }, [periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return <div className="bg-white rounded-lg border p-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;
  if (!data) return null;

  // Dónde se hace cada paso dentro de MotoFlow.
  const boton = (p) => {
    if (!p.panel) return null;
    if (p.panel === 'mi-contabilidad') {
      const hoja = /IT-1|IR-17/.test(p.titulo);
      return { texto: hoja ? 'Ver la Hoja del IT-1' : 'Ver el Resumen', ir: () => onVerPestana?.(hoja ? 'hoja' : 'resumen') };
    }
    const nombres = { 'comprobantes-gastos': 'Abrir Comprobantes de gastos', 'reportes-dgii': 'Abrir Reportes DGII', nomina: 'Abrir Nómina' };
    return { texto: nombres[p.panel] || 'Abrir', ir: () => openPanel(p.panel) };
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-sm font-extrabold text-slate-800">Qué hacer para estar al día con la DGII</div>
        <div className="text-xs text-slate-500">
          Armada para su empresa: <b>{data.contribuyente}</b>{data.rnc ? ` · ${data.rnc}` : ''}{data.nomina ? ' · con nómina' : ''}.
          Las fechas son las del mes escogido arriba.
        </div>
      </div>

      {(data.pasos || []).map((p) => {
        const b = boton(p);
        return (
          <div key={p.n} className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="w-8 h-8 shrink-0 rounded-full bg-blue-700 text-white text-sm font-black flex items-center justify-center">{p.n}</div>
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm font-extrabold text-slate-800">{p.titulo}</div>
                <div className="text-xs font-semibold text-blue-800">{p.cuando}</div>
              </div>
              {b && (
                <Button size="sm" variant="outline" className="h-8" onClick={b.ir}>
                  {b.texto}<ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              )}
            </div>
            <ol className="mt-2 ml-11 list-decimal pl-4 space-y-1 text-sm text-slate-700">
              {(p.pasos || []).map((x) => <li key={x}>{x}</li>)}
            </ol>
          </div>
        );
      })}

      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-4 h-4 text-blue-700" />
          <div className="text-sm font-extrabold text-slate-800">Plantillas y páginas oficiales de la DGII</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {(data.plantillas || []).map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                <span className="block text-sm font-semibold text-blue-800">{l.nombre}</span>
                <span className="block text-xs text-slate-500">{l.detalle}</span>
              </span>
            </a>
          ))}
        </div>
        <div className="text-[11px] text-slate-500 mt-2">
          Los enlaces abren la página de la DGII. El TXT que baja de Reportes DGII ya sale con el formato de esas herramientas: no hace falta pasarlo por el Excel.
        </div>
      </div>

      {data.notas?.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ul className="list-disc pl-4 space-y-0.5">{data.notas.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  );
};

export default GuiaContable;
