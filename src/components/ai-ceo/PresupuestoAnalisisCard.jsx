import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Brain, Loader2, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Pause, Shuffle, AlertCircle } from 'lucide-react';

const TIPO_META = {
  incrementar: { icon: TrendingUp, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'INCREMENTAR' },
  reducir:     { icon: TrendingDown, color: 'text-red-700 bg-red-50 border-red-200', label: 'REDUCIR' },
  congelar:    { icon: Pause, color: 'text-amber-700 bg-amber-50 border-amber-200', label: 'CONGELAR' },
  reasignar:   { icon: Shuffle, color: 'text-blue-700 bg-blue-50 border-blue-200', label: 'REASIGNAR' },
  alerta:      { icon: AlertCircle, color: 'text-orange-700 bg-orange-50 border-orange-200', label: 'ALERTA' },
};

const URG_META = {
  alta:  'bg-red-600 text-white',
  media: 'bg-amber-500 text-white',
  baja:  'bg-slate-400 text-white',
};

const SALUD_META = {
  sana:           { color: 'bg-emerald-100 text-emerald-800', label: 'SANA' },
  limite_cerca:   { color: 'bg-amber-100 text-amber-800',     label: 'LIMITE CERCA' },
  agotado:        { color: 'bg-red-100 text-red-800',         label: 'AGOTADO' },
  tension:        { color: 'bg-red-200 text-red-900',         label: 'TENSION CXP' },
  ajustada:       { color: 'bg-amber-200 text-amber-900',     label: 'AJUSTADA' },
  sin_datos:      { color: 'bg-slate-200 text-slate-700',     label: 'SIN DATOS' },
};

export default function PresupuestoAnalisisCard() {
  const { toast } = useToast();
  const [analisis, setAnalisis] = useState(null);
  const [loading, setLoading] = useState(false);

  const correrAnalisis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('motoflow-agent', {
        body: { agent_key: 'analisis_presupuesto', payload: { meses_historico: 6, top_suplidores: 10 } },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.mensaje || data?.error || 'Error desconocido');
      setAnalisis(data.resultado);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-violet-900 flex items-center gap-2">
            <Brain className="h-5 w-5" /> Análisis de Presupuesto (IA)
          </h2>
          <p className="text-xs text-violet-700 mt-1">
            El agente analiza tu presupuesto del mes, histórico, top suplidores y salud de caja. Recomienda incrementar / congelar / reducir / reasignar.
          </p>
        </div>
        <Button
          onClick={correrAnalisis}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-700 text-white shadow-md"
        >
          {loading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando...</>
            : <><RefreshCw className="h-4 w-4 mr-2" /> {analisis ? 'Re-analizar' : 'Correr análisis'}</>}
        </Button>
      </div>

      {!analisis && !loading && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500 text-sm">
          Sin análisis aún. Hacé click en <b>Correr análisis</b> para obtener recomendaciones de Morla AI.
        </div>
      )}

      {analisis && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Salud + Resumen */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-3 py-1 rounded-full text-xs font-black ${(SALUD_META[analisis.salud_general] || SALUD_META.sin_datos).color}`}>
                {(SALUD_META[analisis.salud_general] || SALUD_META.sin_datos).label}
              </span>
              <p className="text-xs text-slate-500">Modo {analisis.estado_actual?.modo || 'desconocido'}</p>
            </div>
            <p className="text-sm text-slate-700 italic">"{analisis.resumen}"</p>
          </div>

          {/* Recomendaciones */}
          {analisis.recomendaciones?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-bold uppercase text-slate-600 mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Recomendaciones
              </p>
              <div className="space-y-2">
                {analisis.recomendaciones.map((r, i) => {
                  const meta = TIPO_META[r.tipo] || TIPO_META.alerta;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className={`border rounded-md p-3 flex items-start gap-3 ${meta.color}`}>
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase">{meta.label}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${URG_META[r.urgencia] || URG_META.baja}`}>
                            {(r.urgencia || 'baja').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs">{r.descripcion}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Señales de riesgo */}
          {analisis.senales_riesgo?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-xs font-bold uppercase text-red-700 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Señales de riesgo
              </p>
              <ul className="list-disc ml-5 space-y-1">
                {analisis.senales_riesgo.map((s, i) => (
                  <li key={i} className="text-xs text-red-800">{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Proyección */}
          {analisis.proyeccion_3meses?.nota && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-blue-700" />
                <p className="text-xs font-bold uppercase text-blue-800">Proyección 3 meses</p>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">
                  Confianza {analisis.proyeccion_3meses.confianza}
                </span>
              </div>
              <p className="text-xs text-blue-800">{analisis.proyeccion_3meses.nota}</p>
            </div>
          )}

          {/* Estado actual del presupuesto (datos crudos) */}
          {analisis.estado_actual && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-bold uppercase text-slate-600 mb-2">Estado actual</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Monto base</p>
                  <p className="text-sm font-mono font-bold">RD$ {Number(analisis.estado_actual.monto_base_mensual).toLocaleString('es-DO', { minimumFractionDigits: 0 })}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Comprado</p>
                  <p className="text-sm font-mono font-bold text-blue-700">RD$ {Number(analisis.estado_actual.comprado_mes).toLocaleString('es-DO', { minimumFractionDigits: 0 })}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Disponible</p>
                  <p className="text-sm font-mono font-bold text-emerald-700">RD$ {Number(analisis.estado_actual.disponible).toLocaleString('es-DO', { minimumFractionDigits: 0 })}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Caja viva</p>
                  <p className="text-sm font-mono font-bold text-violet-700">RD$ {Number(analisis.estado_actual.caja_disponible?.caja_disponible || 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
