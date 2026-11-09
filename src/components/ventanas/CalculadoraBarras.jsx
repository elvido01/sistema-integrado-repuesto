// Calculadora de barras sin proyecto (09/11/2026, como "Barras" de Desglo):
// se escriben los cortes (largo en pulgadas con fracción + cantidad) y dice
// cuántas barras hacen falta y cómo cortar cada una. Usa el largo de barra y
// la merma de Configuración del desglose (vent_config).
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Scissors } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { leerPulgadas, pulgadasTexto, planBarras } from '@/lib/ventanas';

const campo = 'h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const filaVacia = () => ({ id: `${Date.now()}-${Math.random()}`, largo: '', cantidad: '1' });

export default function CalculadoraBarras({ tenantId, onClose }) {
  const [cfg, setCfg] = useState({ largo_barra: 240, merma_corte: 0.125 });
  const [filas, setFilas] = useState([filaVacia()]);

  useEffect(() => {
    supabase.from('vent_config').select('largo_barra, merma_corte').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => { if (data) setCfg(data); });
  }, [tenantId]);

  const largoBarra = Number(cfg.largo_barra) || 240;
  const merma = cfg.merma_corte != null ? Number(cfg.merma_corte) : 0.125;
  const cambiar = (id, k, v) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [k]: v } : f)));

  const { cortes, malas } = useMemo(() => {
    const c = []; let m = 0;
    for (const f of filas) {
      if (!f.largo.trim()) continue;
      const l = leerPulgadas(f.largo);
      const n = Math.max(0, parseInt(f.cantidad, 10) || 0);
      if (!(l > 0)) { m += 1; continue; }
      for (let i = 0; i < n; i++) c.push(l);
    }
    return { cortes: c, malas: m };
  }, [filas]);
  const plan = useMemo(() => planBarras(cortes, largoBarra, merma), [cortes, largoBarra, merma]);
  const total = cortes.reduce((s, x) => s + x, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Scissors className="w-5 h-5 text-blue-700" /> Calcular barras</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">
          Barra de {pulgadasTexto(largoBarra)}" ({(largoBarra / 12).toFixed(0)} pies) y {pulgadasTexto(merma)}" que se pierde en cada corte
          (se cambia en Configuración del desglose). Escribe el largo como 40 1 4, 40 1/4 o 40.25.
        </p>
        <div className="space-y-2">
          {filas.map((f) => {
            const mal = f.largo.trim() && !(leerPulgadas(f.largo) > 0);
            return (
              <div key={f.id} className="flex items-center gap-2">
                <input className={`${campo} flex-1 ${mal ? 'border-red-400' : ''}`} placeholder='Largo del corte (pulgadas)' value={f.largo}
                  onChange={(e) => cambiar(f.id, 'largo', e.target.value)} />
                <span className="text-xs text-gray-500">×</span>
                <input className={`${campo} w-20 text-center`} inputMode="numeric" value={f.cantidad}
                  onChange={(e) => cambiar(f.id, 'cantidad', e.target.value.replace(/\D/g, ''))} />
                <Button size="sm" variant="ghost" title="Quitar" onClick={() => setFilas((fs) => (fs.length > 1 ? fs.filter((x) => x.id !== f.id) : [filaVacia()]))}>
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={() => setFilas((fs) => [...fs, filaVacia()])}><Plus className="w-4 h-4 mr-1" /> Otro corte</Button>
        </div>
        {malas > 0 && <div className="text-xs text-red-600">Revise la medida: {malas} corte(s) no se entienden.</div>}

        {cortes.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
            <div className="text-sm">
              <b className="text-lg">{plan.barras.length}</b> barra(s) para {cortes.length} corte(s) ·{' '}
              {(total / 12).toFixed(2)} pies ({(total * 0.0254).toFixed(2)} m)
            </div>
            {plan.sinCaber.length > 0 && (
              <div className="text-xs text-red-600">No caben en una barra: {plan.sinCaber.map((x) => `${pulgadasTexto(x)}"`).join(', ')}</div>
            )}
            <div className="space-y-1">
              {plan.barras.map((b, i) => (
                <div key={i} className="text-xs flex flex-wrap items-center gap-1">
                  <span className="font-bold w-16">Barra {i + 1}:</span>
                  {b.cortes.map((c, j) => <span key={j} className="px-1.5 py-0.5 rounded bg-white border border-gray-200 font-mono">{pulgadasTexto(c)}"</span>)}
                  <span className="text-gray-500 ml-1">sobra {pulgadasTexto(b.sobrante)}"</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>
      </DialogContent>
    </Dialog>
  );
}
